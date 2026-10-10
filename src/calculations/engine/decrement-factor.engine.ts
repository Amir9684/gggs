/**
 * Decrement factor, Df, derived from the fault duration.
 *
 * The Windows GGGS app (grounding.frm / ieee2000.frm) does not ask for Df:
 * the user picks one of four fault durations and Df follows from it:
 *
 *   0.008 s  -> 1.65
 *   0.1   s  -> 1.25
 *   0.25  s  -> 1.1
 *   0.5 s or more -> 1.0
 *
 * The Windows app only offers those four discrete choices. Durations in
 * between are rounded DOWN to the nearest listed duration, which gives the
 * larger (more conservative) Df, e.g. 0.3 s uses the 0.25 s row (1.1) and
 * 0.05 s uses the 0.008 s row (1.65).
 */
const DECREMENT_FACTOR_TABLE: ReadonlyArray<{
  fromSeconds: number;
  factor: number;
}> = [
  { fromSeconds: 0.5, factor: 1.0 },
  { fromSeconds: 0.25, factor: 1.1 },
  { fromSeconds: 0.1, factor: 1.25 },
  { fromSeconds: 0, factor: 1.65 },
];

export function deriveDecrementFactor(faultDuration: number): number {
  if (!Number.isFinite(faultDuration) || faultDuration <= 0) {
    throw new Error('Fault duration must be positive.');
  }

  const row = DECREMENT_FACTOR_TABLE.find(
    (entry) => faultDuration >= entry.fromSeconds,
  );

  // The last row starts at 0, so any positive duration always matches.
  return row!.factor;
}
