import { Campaign, SlotContext, AuctionResult, Paise } from "./types.js";

/**
 * A campaign is eligible only if it's active, hasn't blown its daily budget,
 * meets the price floor, and (if it targets geos) matches the viewer's geo.
 */
function isEligible(c: Campaign, ctx: SlotContext): boolean {
  if (c.status !== "active") return false;
  if (c.spentToday >= c.dailyBudget) return false; // budget exhausted → drop
  if (c.bidCpm < ctx.reserveCpm) return false; // below floor → drop
  if (c.targetGeo && ctx.geo && !c.targetGeo.includes(ctx.geo)) return false;
  return true;
}

/**
 * Click-uplift multiplier: a campaign's expected value per impression isn't just
 * its bid — it's the bid PLUS the extra revenue clicks bring in. A higher-CTR ad
 * is worth more even at a lower bid. quality also scales the score.
 *
 *   uplift = (1 + ctr * clickMultiplier) * qualityScore
 */
function uplift(c: Campaign, ctx: SlotContext): number {
  return (1 + c.historicalCtr * ctx.clickMultiplier) * c.qualityScore;
}

/** Expected revenue per 1,000 impressions — the number we actually rank by. */
function effectiveCpm(c: Campaign, ctx: SlotContext): number {
  return c.bidCpm * uplift(c, ctx);
}

/**
 * Run one auction for one ad slot.
 *
 * Ranking : by effectiveCpm (eCPM), not raw bid → squeezes more revenue from
 *           the same traffic and rewards relevant, clickable ads.
 * Pricing : Generalized Second-Price (GSP). The winner pays the *minimum* CPM
 *           that would still keep it in 1st place given the runner-up — never
 *           its full bid. This makes advertisers comfortable bidding their true
 *           value, which lifts average bids over time.
 */
export function runAuction(campaigns: Campaign[], ctx: SlotContext): AuctionResult {
  const eligible = campaigns.filter((c) => isEligible(c, ctx));
  if (eligible.length === 0) {
    return { served: false, reason: "no_eligible_campaigns" };
  }

  const ranked = eligible
    .map((c) => ({ c, score: effectiveCpm(c, ctx) }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0].c;
  const winnerUplift = uplift(winner, ctx);

  // GSP clearing price:
  //   runnerUp.score = clearingCpm * winnerUplift  ⇒  clearingCpm = runnerUp.score / winnerUplift
  // With no runner-up, fall back to the reserve floor (single bidder pays floor).
  const runnerUpScore = ranked[1]?.score ?? ctx.reserveCpm * winnerUplift;

  let clearingCpm: Paise = Math.ceil(runnerUpScore / winnerUplift);
  clearingCpm = Math.max(clearingCpm, ctx.reserveCpm); // never below floor
  clearingCpm = Math.min(clearingCpm, winner.bidCpm); // never above own bid

  return {
    served: true,
    campaign: winner,
    clearingCpm,
    ranking: ranked.map((r) => ({
      campaignId: r.c.id,
      effectiveCpm: Math.round(r.score),
    })),
  };
}
