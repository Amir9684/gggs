import {
  abs,
  add,
  complex,
  div,
  mul,
  scale,
  solveLinearSystem,
  sub,
  type Complex,
} from './complex';

/** One span of a ground wire line and the footing of the tower at its far end. */
export interface RamezaniSpan {
  /** Span length (m). */
  length: number;
  /** Footing resistance of the tower at the end of this span (ohm). */
  towerFootingResistance: number;
}

/** One terminal (line leaving the substation) of the Ramezani / "Analytical" method. */
export interface RamezaniTerminal {
  /** Fault current contribution of this terminal, Ir (A, complex). */
  faultCurrent: Complex;
  /** Ground wire impedance, Zgw (ohm/km, complex). */
  groundWireImpedance: Complex;
  /**
   * Mutual impedance ground wire - phase conductors, Zgm. It is divided
   * by Zgw as is (Windows `Zm = Zgm · Ze / Zgw`), so give it in the same
   * unit as Zgw, ohm/km.
   */
  mutualImpedance: Complex;
  /** Spans from the substation outward; the last tower's footing ends the line. */
  spans: readonly RamezaniSpan[];
  /**
   * Fraction of the line that has a ground wire, Lt: 1 for a continuous
   * wire (default), less than 1 when the wire stops part way.
   */
  groundWireFraction?: number;
}

export interface RamezaniInput {
  /** Ground grid resistance of the substation, Rg (ohm). */
  gridResistance: number;
  terminals: readonly RamezaniTerminal[];
  /**
   * Total fault current IG for a fault in the vicinity of the substation
   * (Windows "in the vicinity"). Omit, or give zero, for a fault inside
   * the substation.
   */
  groundFaultCurrent?: Complex;
}

export interface RamezaniResult {
  /** Percent of the fault current that flows into the grid. */
  splitFactor: number;
  /** Current into the grid, Ig = IG − (sum(Ir) − sum(Ie)) (A, complex). */
  gridCurrent: Complex;
  totalFaultCurrent: Complex;
  /** Current returning through each terminal's ground wire, Ie (A). */
  terminalEarthCurrents: Complex[];
  /** Equivalent impedance of each terminal's ground wire ladder, Ze (ohm). */
  equivalentImpedances: Complex[];
  /** Voltage coefficient of the remote end of each line, Ke. */
  voltageCoefficients: Complex[];
  /** Mutual factor of each terminal, Zm = Zgm · Ze / Zgw. */
  mutualFactors: Complex[];
}

type Matrix2 = [[Complex, Complex], [Complex, Complex]];

const ONE = complex(1);
const ZERO = complex(0);

function multiply2(a: Matrix2, b: Matrix2): Matrix2 {
  const cell = (row: 0 | 1, column: 0 | 1) =>
    add(mul(a[row][0], b[0][column]), mul(a[row][1], b[1][column]));
  return [
    [cell(0, 0), cell(0, 1)],
    [cell(1, 0), cell(1, 1)],
  ];
}

/**
 * Equivalent impedance Ze and remote-end voltage coefficient Ke of one
 * ground wire line (Windows `T`, `Ze`, `Ke`).
 *
 * Each span is a series impedance Zg = Zgw · length / 1000 followed by
 * the footing resistance R of the tower it ends at, as the transfer
 * matrix [[1 + Zg/R, Zg], [1/R, 1]]. The chain of all spans but the last
 * is multiplied out (matrix `tm`); the last span ends the line with the
 * load Zg_last + R_last, so
 *
 *   Ze = (tm11·Zl + tm12) / (tm21·Zl + tm22)
 *   Ke = −R_last / (tm21·Zl + tm22)
 *
 * With a single span `tm` is the identity (the Windows code uses the
 * first span's matrix there, which counts that span twice).
 */
export function ladderImpedance(
  spans: readonly RamezaniSpan[],
  groundWireImpedance: Complex,
): { ze: Complex; ke: Complex } {
  if (spans.length === 0) {
    throw new Error('Each terminal needs at least one span.');
  }
  if (!(groundWireImpedance.re > 0)) {
    throw new Error('Ground wire resistance must be positive.');
  }
  for (const span of spans) {
    if (!(span.length > 0)) throw new Error('Span length must be positive.');
    if (!(span.towerFootingResistance > 0)) {
      throw new Error('Tower footing resistance must be positive.');
    }
  }

  const seriesImpedance = (span: RamezaniSpan) =>
    scale(groundWireImpedance, span.length / 1000);

  let chain: Matrix2 = [
    [ONE, ZERO],
    [ZERO, ONE],
  ];
  for (const span of spans.slice(0, -1)) {
    const zg = seriesImpedance(span);
    const r = span.towerFootingResistance;
    chain = multiply2(chain, [
      [add(ONE, scale(zg, 1 / r)), zg],
      [complex(1 / r), ONE],
    ]);
  }

  const last = spans[spans.length - 1];
  const load = add(seriesImpedance(last), complex(last.towerFootingResistance));
  const currentGain = add(mul(chain[1][0], load), chain[1][1]);

  return {
    ze: div(add(mul(chain[0][0], load), chain[0][1]), currentGain),
    ke: div(complex(-last.towerFootingResistance), currentGain),
  };
}

/**
 * Ramezani split factor (Windows `RamezaniProgram.bas`, `Ramezani`), for
 * a fault inside the substation or in its vicinity. With
 *   A(i,i) = Rg + Ze(i),  A(i,j) = Rg (i <> j),
 *   B(j)   = Rg · (sum(Ir) − IG) + K(j) · Ir(j),
 *   K(j)   = Zm(j) − Ke(j)   (continuous ground wire, Lt = 1)
 *          = Lt(j) · Zm(j)   (ground wire on part of the line)
 * the earth currents solve A · Ie = B, the grid current is
 * Ig = IG − (sum(Ir) − sum(Ie)) and the split factor is |Ig / IG| · 100,
 * or |Ig / sum(Ir)| · 100 when IG is zero.
 *
 * Not ported: a fault on a tower (the Windows branch mixes two meanings of
 * `Fault_Tower` and cannot be checked without Windows results), double
 * circuit lines (the Windows routine sets one circuit per terminal) and
 * a fault location along the line (`Lf`).
 */
export function computeRamezaniSplitFactor(
  input: RamezaniInput,
): RamezaniResult {
  const { gridResistance, terminals } = input;

  if (!(gridResistance > 0)) {
    throw new Error('Grid resistance must be positive.');
  }
  if (terminals.length === 0) {
    throw new Error('At least one terminal is required.');
  }

  const groundFault = input.groundFaultCurrent ?? ZERO;

  const ladders = terminals.map((terminal) =>
    ladderImpedance(terminal.spans, terminal.groundWireImpedance),
  );

  const mutualFactors = terminals.map((terminal, i) =>
    div(
      mul(terminal.mutualImpedance, ladders[i].ze),
      terminal.groundWireImpedance,
    ),
  );

  const totalFaultCurrent = terminals.reduce(
    (sum, terminal) => add(sum, terminal.faultCurrent),
    ZERO,
  );
  const reference = abs(groundFault) !== 0 ? groundFault : totalFaultCurrent;
  if (abs(reference) === 0) {
    throw new Error('The total fault current must not be zero.');
  }

  const matrix = terminals.map((_, i) =>
    terminals.map((__, j) =>
      i === j
        ? add(complex(gridResistance), ladders[i].ze)
        : complex(gridResistance),
    ),
  );

  const sharedTerm = scale(sub(totalFaultCurrent, groundFault), gridResistance);
  const rhs = terminals.map((terminal, j) => {
    const fraction = terminal.groundWireFraction ?? 1;
    if (!(fraction > 0 && fraction <= 1)) {
      throw new Error(
        'The line fraction with ground wire must be above 0 and at most 1.',
      );
    }

    const coefficient =
      fraction === 1
        ? sub(mutualFactors[j], ladders[j].ke)
        : scale(mutualFactors[j], fraction);

    return add(sharedTerm, mul(coefficient, terminal.faultCurrent));
  });

  const earthCurrents = solveLinearSystem(matrix, rhs);
  const totalEarthCurrent = earthCurrents.reduce(
    (sum, current) => add(sum, current),
    ZERO,
  );

  const gridCurrent = add(
    groundFault,
    sub(totalEarthCurrent, totalFaultCurrent),
  );

  return {
    splitFactor: (abs(gridCurrent) / abs(reference)) * 100,
    gridCurrent,
    totalFaultCurrent,
    terminalEarthCurrents: earthCurrents,
    equivalentImpedances: ladders.map((ladder) => ladder.ze),
    voltageCoefficients: ladders.map((ladder) => ladder.ke),
    mutualFactors,
  };
}
