import { IEEE80_CURVES } from './ieee80-curves.data';

/** Grid resistances (ohm) the curves are tabulated at (Windows `X(1..21)`). */
export const CURVE_GRID_RESISTANCES: readonly number[] = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  20, 25,
];

/** Tabulated numbers of transmission / distribution lines (Windows `T_N` / `D_N`). */
export const CURVE_LINE_COUNTS: readonly number[] = [0, 1, 2, 4, 8, 12, 18];

export const MAX_LINES = 18;

/** Share of the fault current that comes from remote sources: 1 = 100 %, 2 = 75 %, 3 = 50 %, 4 = 25 %. */
export type Ieee80FaultType = 1 | 2 | 3 | 4;

/** Tower footing resistances: 1 = 15 / 25 ohm (transmission / distribution), 2 = 100 / 200 ohm. */
export type Ieee80FootingSet = 1 | 2;

export interface Ieee80Input {
  faultType: Ieee80FaultType;
  footingSet: Ieee80FootingSet;
  /** Transmission lines connected to the substation (0 to 18). */
  transmissionLines: number;
  /** Distribution lines connected to the substation (0 to 18). */
  distributionLines: number;
  /** Ground resistance of the substation, Rg (ohm). */
  gridResistance: number;
}

export interface Ieee80Result {
  /** Percent of the fault current that flows into the grid. */
  splitFactor: number;
  /** Set when Rg is outside 0.1 to 25 ohm and the nearest tabulated value was used. */
  clamped: 'LOW' | 'HIGH' | null;
}

const curveKey = (
  faultType: number,
  footingSet: number,
  transmission: number,
  distribution: number,
) => `${faultType}:${footingSet}:${transmission}:${distribution}`;

/**
 * Split factor of one curve at `rg`: linear in log(Rg) and log(Sf)
 * between the tabulated points (Windows `Interpol1`). Outside 0.1 to 25
 * ohm the end value is used. (Windows returns the 25 ohm value for an Rg
 * below 0.1 ohm, which is the wrong end of the curve; here it is clamped
 * to the 0.1 ohm value.)
 */
export function interpolateCurve(
  curve: readonly number[],
  rg: number,
): { value: number; clamped: 'LOW' | 'HIGH' | null } {
  const grid = CURVE_GRID_RESISTANCES;
  const last = grid.length - 1;

  if (rg < grid[0]) return { value: curve[0], clamped: 'LOW' };
  if (rg >= grid[last]) {
    return { value: curve[last], clamped: rg > grid[last] ? 'HIGH' : null };
  }

  let k = 0;
  while (!(rg >= grid[k] && rg < grid[k + 1])) k += 1;

  const slope =
    (Math.log(curve[k + 1]) - Math.log(curve[k])) /
    (Math.log(grid[k + 1]) - Math.log(grid[k]));
  const exponent =
    slope * (Math.log10(rg) - Math.log10(grid[k])) + Math.log10(curve[k]);

  return { value: 10 ** exponent, clamped: null };
}

/**
 * Lower bracketing grid count of `count` and the weight of the next one:
 * the count 5 lies between 4 and 8, a quarter of the way up (weight 0.25).
 * An exact grid count, and 18, have weight 0 (no next curve is needed).
 */
function bracket(count: number): {
  lower: number;
  upper: number;
  weight: number;
} {
  let lowerIndex = 0;
  for (let i = 0; i < CURVE_LINE_COUNTS.length; i += 1) {
    if (CURVE_LINE_COUNTS[i] <= count) lowerIndex = i;
  }

  const lower = CURVE_LINE_COUNTS[lowerIndex];
  if (lower === count || lowerIndex === CURVE_LINE_COUNTS.length - 1) {
    return { lower, upper: lower, weight: 0 };
  }

  const upper = CURVE_LINE_COUNTS[lowerIndex + 1];
  return { lower, upper, weight: (count - lower) / (upper - lower) };
}

function curveValue(
  input: Ieee80Input,
  transmission: number,
  distribution: number,
) {
  const curve =
    IEEE80_CURVES[
      curveKey(input.faultType, input.footingSet, transmission, distribution)
    ];
  if (!curve) {
    throw new Error(
      `No standard curve exists for ${transmission} transmission and ${distribution} distribution lines with this fault type.`,
    );
  }
  return interpolateCurve(curve, input.gridResistance);
}

/**
 * IEEE Std 80 split factor from the Annex C curves (Windows `frmIEEE80`
 * with `Interpol1` / `Interpol2`): log-log interpolation along Rg, then
 * linear interpolation between the tabulated numbers of transmission and
 * distribution lines.
 *
 * Only the curves needed are read: a count that sits on a tabulated value
 * does not look at the next curve (Windows reads it anyway and would fail
 * on a missing one).
 */
export function computeIeee80SplitFactor(input: Ieee80Input): Ieee80Result {
  const {
    faultType,
    footingSet,
    transmissionLines,
    distributionLines,
    gridResistance,
  } = input;

  if (![1, 2, 3, 4].includes(faultType)) {
    throw new Error('The fault type must be 1, 2, 3 or 4.');
  }
  if (![1, 2].includes(footingSet)) {
    throw new Error('The tower footing set must be 1 or 2.');
  }
  for (const [label, count] of [
    ['transmission', transmissionLines],
    ['distribution', distributionLines],
  ] as const) {
    if (!Number.isInteger(count) || count < 0 || count > MAX_LINES) {
      throw new Error(
        `The number of ${label} lines must be a whole number from 0 to ${MAX_LINES}.`,
      );
    }
  }
  if (!(gridResistance > 0) || !Number.isFinite(gridResistance)) {
    throw new Error('The ground resistance must be a positive number.');
  }

  const t = bracket(transmissionLines);
  const d = bracket(distributionLines);

  let clamped: Ieee80Result['clamped'] = null;
  const at = (transmission: number, distribution: number) => {
    const { value, clamped: how } = curveValue(
      input,
      transmission,
      distribution,
    );
    clamped = how ?? clamped;
    return value;
  };

  // Interpolate along the transmission count at one distribution count.
  const alongTransmission = (distribution: number) => {
    const low = at(t.lower, distribution);
    return t.weight === 0
      ? low
      : low + t.weight * (at(t.upper, distribution) - low);
  };

  const lowRow = alongTransmission(d.lower);
  const splitFactor =
    d.weight === 0
      ? lowRow
      : lowRow + d.weight * (alongTransmission(d.upper) - lowRow);

  return { splitFactor, clamped };
}
