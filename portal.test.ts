import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.js";
import { Db } from "./db.js";
import { signDevice } from "./security.js";

const SERVER_SECRET = "test-secret";

function setup() {
  const db = new Db(":memory:");
  const app = buildApp({ db, serverSecret: SERVER_SECRET });
  return { db, app };
}
const j = (r: any) => JSON.parse(r.body);

test("advertiser self-serve: create account → get API key", async () => {
  const { app } = setup();
  const r = await app.inject({ method: "POST", url: "/v1/advertisers", payload: { email: "a@x.com", name: "Acme" } });
  assert.equal(r.statusCode, 200);
  assert.ok(j(r).apiKey && j(r).id);
});

test("campaign create requires a valid advertiser key", async () => {
  const { app } = setup();
  const noKey = await app.inject({ method: "POST", url: "/v1/campaigns", payload: { adLine: "x", destinationUrl: "https://x.com", bidCpm: 150, dailyBudget: 1000 } });
  assert.equal(noKey.statusCode, 401);
});

test("created campaign appears on the live leaderboard", async () => {
  const { app } = setup();
  const key = j(await app.inject({ method: "POST", url: "/v1/advertisers", payload: { email: "a@x.com", name: "Acme" } })).apiKey;
  await app.inject({
    method: "POST", url: "/v1/campaigns", headers: { "x-advertiser-key": key },
    payload: { adLine: "Try Acme", destinationUrl: "https://acme.com", brandName: "Acme", bidCpm: 250, dailyBudget: 50000 },
  });
  const board = j(await app.inject({ method: "GET", url: "/v1/leaderboard" }));
  assert.equal(board.length, 1);
  assert.equal(board[0].brand_name, "Acme");
  assert.equal(board[0].bid_cpm, 250);
  assert.equal(board[0].impressions, 0);
});

test("top-up returns 'not configured' gracefully when no payment keys are set", async () => {
  const { app } = setup();
  const key = j(await app.inject({ method: "POST", url: "/v1/advertisers", payload: { email: "a@x.com", name: "Acme" } })).apiKey;
  const r = await app.inject({ method: "POST", url: "/v1/advertiser/topup", headers: { "x-advertiser-key": key }, payload: { amountInr: 1000, provider: "stripe" } });
  assert.equal(r.statusCode, 200);
  assert.equal(j(r).configured, false); // server stays up without keys
});

test("developer dashboard shows earnings, then payout moves them to pending", async () => {
  const { db, app } = setup();
  // advertiser + campaign
  const key = j(await app.inject({ method: "POST", url: "/v1/advertisers", payload: { email: "a@x.com", name: "Acme" } })).apiKey;
  await app.inject({ method: "POST", url: "/v1/campaigns", headers: { "x-advertiser-key": key },
    payload: { adLine: "Try Acme", destinationUrl: "https://acme.com", brandName: "Acme", bidCpm: 300, dailyBudget: 50000 } });
  db.creditAdvertiser(db.advertiserIdByKey(key)!, 100000);

  // developer earns from one impression
  const dev = "dash-dev";
  const secret = j(await app.inject({ method: "POST", url: "/v1/register", payload: { deviceId: dev } })).secret;
  const ts = Date.now();
  const served = j(await app.inject({ method: "POST", url: "/v1/serve", payload: { deviceId: dev, ts, sig: signDevice(secret, dev, ts) } }));
  const ts2 = Date.now();
  await app.inject({ method: "POST", url: "/v1/event", payload: { deviceId: dev, ts: ts2, sig: signDevice(secret, dev, ts2), serveToken: served.serveToken, type: "impression" } });

  const earn = j(await app.inject({ method: "GET", url: "/v1/developer/earnings?deviceId=" + dev }));
  assert.ok(earn.earningsMicros > 0);
  assert.equal(earn.payouts.length, 0);

  const po = j(await app.inject({ method: "POST", url: "/v1/developer/payout", payload: { deviceId: dev } }));
  assert.equal(po.ok, true);
  assert.ok(po.amountMicros > 0);

  // earnings now zero, one pending payout recorded
  const after = j(await app.inject({ method: "GET", url: "/v1/developer/earnings?deviceId=" + dev }));
  assert.equal(after.earningsMicros, 0);
  assert.equal(after.payouts.length, 1);
  assert.equal(after.payouts[0].status, "pending");
});

test("portal pages render", async () => {
  const { app } = setup();
  const adv = await app.inject({ method: "GET", url: "/portal/advertiser" });
  const dev = await app.inject({ method: "GET", url: "/portal/developer" });
  assert.match(adv.body, /SpinBucks — Advertisers/);
  assert.match(dev.body, /Developer Earnings/);
});
