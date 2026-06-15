import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.js";
import { Db } from "./db.js";
import { signDevice } from "./security.js";
import { MICROS_PER_PAISA } from "../../auction/dist/types.js";

const SERVER_SECRET = "test-server-secret";

function setup() {
  const db = new Db(":memory:");
  const adv = db.createAdvertiser("a@x.com", "Acme", 1000); // ₹1000 balance
  db.createCampaign({
    id: "camp1", advertiserId: adv, adLine: "Try Acme", destinationUrl: "https://acme.com",
    brandName: "Acme", bidCpm: 300, dailyBudget: 100000, historicalCtr: 0.02, qualityScore: 1, status: "active",
  });
  // a weaker second bidder so there's a real second price
  db.createCampaign({
    id: "camp2", advertiserId: adv, adLine: "Try Beta", destinationUrl: "https://beta.com",
    bidCpm: 150, dailyBudget: 100000, historicalCtr: 0.01, qualityScore: 1, status: "active",
  });
  const app = buildApp({ db, serverSecret: SERVER_SECRET });
  return { db, app, adv };
}

async function register(app: any, db: Db, deviceId: string) {
  const r = await app.inject({ method: "POST", url: "/v1/register", payload: { deviceId } });
  return JSON.parse(r.body).secret as string;
}

function signed(secret: string, deviceId: string, extra: object = {}) {
  const ts = Date.now();
  return { deviceId, ts, sig: signDevice(secret, deviceId, ts), ...extra };
}

test("health check", async () => {
  const { app } = setup();
  const r = await app.inject({ method: "GET", url: "/v1/health" });
  assert.equal(JSON.parse(r.body).ok, true);
});

test("full loop: serve → impression → click moves money correctly", async () => {
  const { app, db, adv } = setup();
  const dev = "machine-A";
  const secret = await register(app, db, dev);

  const serveRes = await app.inject({ method: "POST", url: "/v1/serve", payload: signed(secret, dev, { geo: "IN" }) });
  assert.equal(serveRes.statusCode, 200);
  const { serveToken, ad } = JSON.parse(serveRes.body);
  assert.equal(ad.brandName, "Acme"); // higher eCPM bidder won

  const imp = await app.inject({ method: "POST", url: "/v1/event", payload: signed(secret, dev, { serveToken, type: "impression" }) });
  assert.equal(imp.statusCode, 200);

  const clk = await app.inject({ method: "POST", url: "/v1/event", payload: signed(secret, dev, { serveToken, type: "click" }) });
  assert.equal(clk.statusCode, 200);

  // Developer must have earned 60% of (1 impression + 1 click) gross.
  const devEarn = db.developerEarnings(dev);
  const platRev = db.platformRevenue();
  assert.ok(devEarn > 0 && platRev > 0);
  // 60/40 relationship holds (developer ≈ 1.5× platform, within rounding)
  assert.ok(Math.abs(devEarn / platRev - 1.5) < 0.01);
  // advertiser balance dropped by exactly gross
  assert.equal(db.advertiserBalance(adv), 1000 * MICROS_PER_PAISA - (devEarn + platRev));
});

test("rejects forged device signature", async () => {
  const { app, db } = setup();
  const dev = "machine-B";
  await register(app, db, dev);
  const bad = { deviceId: dev, ts: Date.now(), sig: "garbage", geo: "IN" };
  const r = await app.inject({ method: "POST", url: "/v1/serve", payload: bad });
  assert.equal(r.statusCode, 401);
});

test("rejects fabricated serve token", async () => {
  const { app, db } = setup();
  const dev = "machine-C";
  const secret = await register(app, db, dev);
  const r = await app.inject({
    method: "POST", url: "/v1/event",
    payload: signed(secret, dev, { serveToken: "fake.token", type: "impression" }),
  });
  assert.equal(r.statusCode, 401);
});

test("blocks duplicate impression (replay)", async () => {
  const { app, db } = setup();
  const dev = "machine-D";
  const secret = await register(app, db, dev);
  const { serveToken } = JSON.parse((await app.inject({ method: "POST", url: "/v1/serve", payload: signed(secret, dev) })).body);
  await app.inject({ method: "POST", url: "/v1/event", payload: signed(secret, dev, { serveToken, type: "impression" }) });
  const dup = await app.inject({ method: "POST", url: "/v1/event", payload: signed(secret, dev, { serveToken, type: "impression" }) });
  assert.equal(dup.statusCode, 409);
});

test("blocks click before impression", async () => {
  const { app, db } = setup();
  const dev = "machine-E";
  const secret = await register(app, db, dev);
  const { serveToken } = JSON.parse((await app.inject({ method: "POST", url: "/v1/serve", payload: signed(secret, dev) })).body);
  const clk = await app.inject({ method: "POST", url: "/v1/event", payload: signed(secret, dev, { serveToken, type: "click" }) });
  assert.equal(clk.statusCode, 409);
});

test("rate limits a flooding device", async () => {
  const { db } = setup();
  const app = buildApp({ db, serverSecret: SERVER_SECRET, rateMaxEvents: 3 });
  const dev = "flooder";
  const secret = await register(app, db, dev);
  // burn 3 allowed events across separate serves
  for (let i = 0; i < 3; i++) {
    const { serveToken } = JSON.parse((await app.inject({ method: "POST", url: "/v1/serve", payload: signed(secret, dev) })).body);
    await app.inject({ method: "POST", url: "/v1/event", payload: signed(secret, dev, { serveToken, type: "impression" }) });
  }
  const { serveToken } = JSON.parse((await app.inject({ method: "POST", url: "/v1/serve", payload: signed(secret, dev) })).body);
  const blocked = await app.inject({ method: "POST", url: "/v1/event", payload: signed(secret, dev, { serveToken, type: "impression" }) });
  assert.equal(blocked.statusCode, 429);
});
