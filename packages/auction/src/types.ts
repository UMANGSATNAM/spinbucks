// ---------------------------------------------------------------------------
// Money handling
// ---------------------------------------------------------------------------
// Two integer units, never floats, to avoid rounding loss:
//   - "paise"  : user-facing money (bids, budgets). 1 rupee = 100 paise.
//   - "micros" : internal accrual unit. 1 paisa = 10,000 micros.
//
// Why micros? Per-impression cost is a tiny fraction of a paisa. If you round
// each impression to whole paise you'd charge 0 and earn nothing. So we accrue
// revenue in micros and only settle to whole paise at payout time. This is the
// same trick Google Ads uses ("micros").
export type Paise = number; // integer
export type Micros = number; // integer

export const MICROS_PER_PAISA = 10_000;

export interface Campaign {
  id: string;
  advertiserId: string;
  adLine: string; // 3-60 chars, the line shown in the spinner
  destinationUrl: string;
  brandName?: string;
  brandIconUrl?: string;

  bidCpm: Paise; // advertiser's max bid per 1,000 impressions
  dailyBudget: Paise; // per-day spend cap
  spentToday: Paise; // spent so far today (pacing input)

  historicalCtr: number; // 0..1, smoothed click-through rate
  qualityScore: number; // 0..1, relevance / spam penalty multiplier
  status: "active" | "paused";
  targetGeo?: string[]; // ISO country codes; undefined = serve globally
}

export interface SlotContext {
  geo?: string; // viewer's country (ISO code)
  surface: "spinner" | "panel" | "statusbar";
  reserveCpm: Paise; // price floor — min CPM allowed to serve (e.g. ₹1.00 = 100)
  clickMultiplier: number; // clicks bill at N× the impression rate (Kickbacks: 50)
  now: number; // epoch ms (for pacing / time-based logic later)
}

export interface AuctionResult {
  served: boolean;
  campaign?: Campaign;
  clearingCpm?: Paise; // what the WINNER actually pays per 1k imps (2nd-price)
  reason?: string; // debug reason when nothing served
  ranking?: Array<{ campaignId: string; effectiveCpm: number }>;
}
