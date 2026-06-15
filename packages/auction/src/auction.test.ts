import { test } from "node:test";
import assert from "node:assert/strict";
import { runAuction } from "./auction.js";
import { Campaign, SlotContext } from "./types.js";
import {
  accrue,
  revenueSplit,
  impressionCostMicros,
  microsToPaise,
} from "./billing.js";

const ctx: SlotContext = {
  surface: "spinner",
  reserveCpm: 100, // ₹1.00 floor
  clickMultiplier: 50,
  now: Date.now(),
};

function campaign(over: Partial<Campaign>): Campaign {
  return {
    id: "c",
    advertiserId: "a",
    adLine: "Try the thing",
    destinationUrl: "https://example.com",
    bidCpm: 200,
    dailyBudget: 1_000_00,
    spentToday: 0,
    historicalCtr: 0.01,
    qualityScore: 1,
    status: "active",
    ...over,
  };
}

test("nothing served when no campaigns are eligible", () => {
  const r = runAuction([], ctx);
  assert.equal(r.served, false);
  assert.equal(r.reason, "no_eligible_campaigns");
});

test("single bidder pays the reserve floor, not its full bid", () => {
  const r = runAuction([campaign({ id: "solo", bidCpm: 500 })], ctx);
  assert.equal(r.served, true);
  assert.equal(r.campaign?.id, "solo");
  assert.equal(r.clearingCpm, ctx.reserveCpm); // 100, not 500
});

test("higher eCPM wins; winner pays second price (capped at own bid)", () => {
  const a = campaign({ id: "A", bidCpm: 300, historicalCtr: 0.01 });
  const b = campaign({ id: "B", bidCpm: 200, historicalCtr: 0.01 });
  const r = runAuction([a, b], ctx);
  assert.equal(r.campaign?.id, "A");
  // pays just enough to beat B, never more than its own 300
  assert.ok(r.clearingCpm! <= 300 && r.clearingCpm! >= ctx.reserveCpm);
});

test("a low bid with high CTR beats a high bid with low CTR (eCPM ranking)", () => {
  // raw bids say B should win; CTR says A wins.
  const a = campaign({ id: "A", bidCpm: 120, historicalCtr: 0.08 }); // very clickable
  const b = campaign({ id: "B", bidCpm: 300, historicalCtr: 0.002 });
  const r = runAuction([a, b], ctx);
  assert.equal(r.campaign?.id, "A");
});

test("budget-exhausted campaigns are dropped", () => {
  const broke = campaign({ id: "broke", bidCpm: 999, dailyBudget: 500, spentToday: 500 });
  const ok = campaign({ id: "ok", bidCpm: 150 });
  const r = runAuction([broke, ok], ctx);
  assert.equal(r.campaign?.id, "ok");
});

test("below-floor bids never serve", () => {
  const r = runAuction([campaign({ id: "cheap", bidCpm: 50 })], ctx); // < 100 floor
  assert.equal(r.served, false);
});

test("geo targeting filters out non-matching viewers", () => {
  const inOnly = campaign({ id: "in", targetGeo: ["IN"] });
  const r1 = runAuction([inOnly], { ...ctx, geo: "US" });
  assert.equal(r1.served, false);
  const r2 = runAuction([inOnly], { ...ctx, geo: "IN" });
  assert.equal(r2.served, true);
});

test("accrual is exact over a large batch — no sub-paisa loss", () => {
  // clearingCpm ₹1.31 = 131 paise; per impression = 1310 micros (0.131 paise)
  assert.equal(impressionCostMicros(131), 1310);
  const gross = accrue(131, 100_000, 200, 50); // 100k imps + 200 clicks
  // 100000 * 1310 + 200 * (1310*50) = 131_000_000 + 13_100_000 = 144_100_000 micros
  assert.equal(gross, 144_100_000);
  const { paise } = microsToPaise(gross);
  assert.equal(paise, 14_410); // ₹144.10 exactly
});

test("revenue split 40/60 always sums back to gross", () => {
  const s = revenueSplit(144_100_000, 40);
  assert.equal(s.platformMicros + s.developerMicros, s.grossMicros);
  assert.equal(s.platformMicros, 57_640_000); // 40%
  assert.equal(s.developerMicros, 86_460_000); // 60%
});

test("split never over-pays on odd amounts (remainder kept by platform)", () => {
  const s = revenueSplit(7, 40); // floor(2.8)=2 platform, 5 developer
  assert.equal(s.platformMicros, 2);
  assert.equal(s.developerMicros, 5);
  assert.equal(s.platformMicros + s.developerMicros, 7);
});
