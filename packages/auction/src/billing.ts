import { Paise, Micros, MICROS_PER_PAISA } from "./types.js";

/**
 * Cost of a SINGLE impression, in micros.
 *   per-impression paise = clearingCpm / 1000
 *   in micros            = (clearingCpm / 1000) * 10_000 = clearingCpm * 10
 * This is an exact integer — no rounding loss, even for sub-paisa amounts.
 */
export function impressionCostMicros(clearingCpm: Paise): Micros {
  return clearingCpm * (MICROS_PER_PAISA / 1000); // clearingCpm * 10
}

/** Cost of a single click = impression cost × click multiplier. */
export function clickCostMicros(clearingCpm: Paise, clickMultiplier: number): Micros {
  return impressionCostMicros(clearingCpm) * clickMultiplier;
}

/**
 * Total gross revenue (micros) accrued from a batch of events at one clearing
 * price. Batch settlement — you never charge per single impression.
 */
export function accrue(
  clearingCpm: Paise,
  impressions: number,
  clicks: number,
  clickMultiplier: number,
): Micros {
  return (
    impressionCostMicros(clearingCpm) * impressions +
    clickCostMicros(clearingCpm, clickMultiplier) * clicks
  );
}

export interface Split {
  grossMicros: Micros;
  platformMicros: Micros; // your cut
  developerMicros: Micros; // the dev whose machine showed the ad
}

/**
 * Split gross revenue between platform and developer.
 * Default 40/60 (platform/developer). Integer math; any rounding remainder
 * goes to the platform so we never pay out more than we collected.
 */
export function revenueSplit(grossMicros: Micros, platformPct = 40): Split {
  const platformMicros = Math.floor((grossMicros * platformPct) / 100);
  const developerMicros = grossMicros - platformMicros;
  return { grossMicros, platformMicros, developerMicros };
}

/** Convert micros → whole paise for payout (floor; carry the remainder forward). */
export function microsToPaise(micros: Micros): { paise: Paise; remainder: Micros } {
  return {
    paise: Math.floor(micros / MICROS_PER_PAISA),
    remainder: micros % MICROS_PER_PAISA,
  };
}
