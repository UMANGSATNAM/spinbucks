import Fastify, { FastifyInstance } from "fastify";
import { runAuction } from "../../auction/dist/auction.js";
import type { SlotContext } from "../../auction/dist/types.js";
import { accrue, revenueSplit } from "../../auction/dist/billing.js";
import { Db } from "./db.js";
import { verifyDevice, issueServeToken, verifyServeToken, newId } from "./security.js";
import {
  paymentsEnv, createStripeTopup, createRazorpayOrder, handleStripeWebhook,
} from "./payments.js";
import { advertiserHtml, developerHtml } from "./portals.js";

export interface AppOpts {
  db: Db;
  serverSecret: string;
  reserveCpm?: number; // price floor, paise (default ₹1.00)
  clickMultiplier?: number; // default 50
  platformPct?: number; // default 40
  rateWindowMs?: number; // default 60s
  rateMaxEvents?: number; // default 120 events / window / device
}

export function buildApp(opts: AppOpts): FastifyInstance {
  const {
    db,
    serverSecret,
    reserveCpm = 100,
    clickMultiplier = 50,
    platformPct = 40,
    rateWindowMs = 60_000,
    rateMaxEvents = 120,
  } = opts;

  const app = Fastify({ logger: false });

  // Keep the raw bytes around (Stripe webhook signature needs the exact body)
  // while still exposing parsed JSON to every other route.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    (req as any).rawBody = body;
    try {
      done(null, (body as Buffer).length ? JSON.parse((body as Buffer).toString()) : {});
    } catch (e) {
      done(e as Error, undefined);
    }
  });

  app.get("/", async () => ({ ok: true, service: "spinads-api" }));
  app.get("/v1/health", async () => ({ ok: true }));

  // Device registration → hand out a per-device secret used to sign future calls.
  app.post("/v1/register", async (req, reply) => {
    const { deviceId } = (req.body ?? {}) as { deviceId?: string };
    if (!deviceId) return reply.code(400).send({ error: "deviceId required" });
    return db.registerDevice(deviceId);
  });

  // Run an auction and (if a winner exists) return the ad + a signed serveToken.
  app.post("/v1/serve", async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const { deviceId, ts, sig, geo, surface } = b;
    const secret = deviceId && db.deviceSecret(deviceId);
    if (!secret || !verifyDevice(secret, deviceId, ts, sig)) {
      return reply.code(401).send({ error: "bad_signature" });
    }

    const ctx: SlotContext = {
      geo,
      surface: surface ?? "spinner",
      reserveCpm,
      clickMultiplier,
      now: Date.now(),
    };
    const result = runAuction(db.activeCampaigns(), ctx);
    if (!result.served || !result.campaign) {
      return reply.code(204).send();
    }

    const token = issueServeToken(serverSecret, {
      c: result.campaign.id,
      d: deviceId,
      p: result.clearingCpm!,
    });
    db.recordServe(token, result.campaign.id, deviceId, result.clearingCpm!);

    return {
      serveToken: token,
      ad: {
        adLine: result.campaign.adLine,
        destinationUrl: result.campaign.destinationUrl,
        brandName: result.campaign.brandName,
        brandIconUrl: result.campaign.brandIconUrl,
      },
    };
  });

  // Record a billable event. Impressions and clicks are both validated against
  // the serveToken the server issued, are replay-protected, and are rate-limited.
  app.post("/v1/event", async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const { deviceId, ts, sig, serveToken, type } = b;

    const secret = deviceId && db.deviceSecret(deviceId);
    if (!secret || !verifyDevice(secret, deviceId, ts, sig)) {
      return reply.code(401).send({ error: "bad_signature" });
    }
    if (type !== "impression" && type !== "click") {
      return reply.code(400).send({ error: "bad_type" });
    }

    // Rate limit: a real session can't generate hundreds of events a minute.
    if (db.countRecentEvents(deviceId, Date.now() - rateWindowMs) >= rateMaxEvents) {
      return reply.code(429).send({ error: "rate_limited" });
    }

    const payload = verifyServeToken(serverSecret, serveToken);
    if (!payload || payload.d !== deviceId) {
      return reply.code(401).send({ error: "bad_token" });
    }
    const serve = db.getServe(serveToken);
    if (!serve) return reply.code(404).send({ error: "unknown_serve" });

    // Replay / ordering guards.
    if (type === "impression" && serve.impression_done) {
      return reply.code(409).send({ error: "duplicate_impression" });
    }
    if (type === "click") {
      if (!serve.impression_done) return reply.code(409).send({ error: "click_before_impression" });
      if (serve.click_done) return reply.code(409).send({ error: "duplicate_click" });
    }

    // Accrue and split.
    const impressions = type === "impression" ? 1 : 0;
    const clicks = type === "click" ? 1 : 0;
    const gross = accrue(payload.p, impressions, clicks, clickMultiplier);
    const split = revenueSplit(gross, platformPct);

    db.settle(payload.c, deviceId, gross, split.platformMicros, split.developerMicros);
    db.markServe(serveToken, type === "impression" ? "impression_done" : "click_done");
    db.logEvent(serveToken, type, deviceId, Date.now());

    return { ok: true, grossMicros: gross, developerMicros: split.developerMicros };
  });

  // === #4 Advertiser portal ===================================================

  app.post("/v1/advertisers", async (req, reply) => {
    const { email, name } = (req.body ?? {}) as any;
    if (!email || !name) return reply.code(400).send({ error: "email and name required" });
    return db.createAdvertiserWithKey(email, name, 0);
  });

  app.post("/v1/campaigns", async (req, reply) => {
    const advId = db.advertiserIdByKey(String(req.headers["x-advertiser-key"] ?? ""));
    if (!advId) return reply.code(401).send({ error: "bad_advertiser_key" });
    const b = (req.body ?? {}) as any;
    if (!b.adLine || !b.destinationUrl || !b.bidCpm || !b.dailyBudget) {
      return reply.code(400).send({ error: "adLine, destinationUrl, bidCpm, dailyBudget required" });
    }
    const id = newId("camp");
    db.createCampaign({
      id, advertiserId: advId, adLine: String(b.adLine).slice(0, 60), destinationUrl: b.destinationUrl,
      brandName: b.brandName, bidCpm: Number(b.bidCpm), dailyBudget: Number(b.dailyBudget),
      historicalCtr: 0.01, qualityScore: 1, status: "active", targetGeo: b.targetGeo,
    });
    return { id, status: "active" };
  });

  app.get("/v1/leaderboard", async () => db.leaderboard());

  // === #6 Payments — advertiser top-up + webhook =============================

  app.post("/v1/advertiser/topup", async (req, reply) => {
    const advId = db.advertiserIdByKey(String(req.headers["x-advertiser-key"] ?? ""));
    if (!advId) return reply.code(401).send({ error: "bad_advertiser_key" });
    const { amountInr, provider } = (req.body ?? {}) as any;
    if (!amountInr || amountInr < 1) return reply.code(400).send({ error: "amountInr required" });
    const env = paymentsEnv();
    const out = provider === "razorpay"
      ? await createRazorpayOrder(env, advId, Number(amountInr))
      : await createStripeTopup(env, advId, Number(amountInr));
    return out;
  });

  app.post("/v1/webhooks/stripe", async (req, reply) => {
    const sig = String(req.headers["stripe-signature"] ?? "");
    const raw = (req as any).rawBody as Buffer;
    const credit = await handleStripeWebhook(paymentsEnv(), raw, sig);
    if (!credit) return reply.code(400).send({ error: "ignored" });
    db.creditAdvertiser(credit.advId, credit.paise);
    return { ok: true };
  });

  // === #5 Developer dashboard ================================================

  app.get("/v1/developer/earnings", async (req, reply) => {
    const deviceId = String((req.query as any)?.deviceId ?? "");
    const dev = db.developerByDevice(deviceId);
    if (!dev) return reply.code(404).send({ error: "unknown_device" });
    return { earningsMicros: dev.earnings_micros, payouts: db.payoutsFor(deviceId) };
  });

  app.post("/v1/developer/payout", async (req, reply) => {
    const { deviceId } = (req.body ?? {}) as any;
    if (!deviceId) return reply.code(400).send({ error: "deviceId required" });
    // NOTE: production should require a device-signed request here, and only
    // settle once the developer has connected a Stripe Connect / RazorpayX
    // payout method. For now this records a pending payout.
    return db.requestPayout(deviceId);
  });

  // === Served portal pages ====================================================

  app.get("/portal/advertiser", async (_req, reply) => reply.type("text/html").send(advertiserHtml()));
  app.get("/portal/developer", async (_req, reply) => reply.type("text/html").send(developerHtml()));

  return app;
}
