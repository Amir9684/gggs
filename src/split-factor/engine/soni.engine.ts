import {
  abs,
  add,
  complex,
  div,
  mul,
  scale,
  solveLinearSystem,
  type Complex,
} from './complex';

/**
 * One terminal (transmission or distribution line leaving the substation)
 * of the Soni / "Approximate" split factor method.
 */
export interface SoniTerminal {
  /** Fault current contribution of this terminal, Ir (A, complex). */
  faultCurrent: Complex;
  /** Span length (m); the line is an endless chain of equal spans. */
  spanLength: number;
  /** Tower footing resistance, Rft (ohm). */
  towerFootingResistance: number;
  /** Ground wire impedance, Zgw (ohm/km, complex). */
  groundWireImpedance: Complex;
  /** Mutual impedance ground wire - phase conductors, Zgm (ohm/m, complex). */
  mutualImpedance: Complex;
}

export interface SoniInput {
  /** Ground grid resistance of the substation, Rg (ohm). */
  gridResistance: number;
  terminals: readonly SoniTerminal[];
}

export interface SoniResult {
  /** Fraction of the total fault current that flows into the grid, in percent. */
  splitFactor: number;
  /** Current into the grid, Ig = sum(Ir) - sum(Ie) (A, complex). */
  gridCurrent: Complex;
  /** Sum of the terminal fault currents, sum(Ir) (A, complex). */
  totalFaultCurrent: Complex;
  /** Current returning through each terminal's ground wire, Ie (A). */
  terminalEarthCurrents: Complex[];
  /** Equivalent ladder impedance of each terminal's ground wire, Ze (ohm). */
  equivalentImpedances: Complex[];
}

/**
 * Equivalent impedance of an endless ground-wire / tower chain seen from
 * the substation, in the approximate form of the Windows `Soni` routine:
 *
 *   zs = span length · Zgw / 1000          (series impedance of one span)
 *   Ze = zs / 2 + sqrt(zs · Rft)           (principal complex root)
 *
 * (the exact ladder has sqrt(zs·Rft + zs²/4); Soni drops the zs²/4 term).
 */
export function approximateLadderImpedance(
  spanLength: number,
  groundWireImpedance: Complex,
  towerFootingResistance: number,
): Complex {
  if (!(spanLength > 0)) {
    throw new Error('Span length must be positive.');
  }
  if (!(towerFootingResistance > 0)) {
    throw new Error('Tower footing resistance must be positive.');
  }
  if (!(groundWireImpedance.re > 0)) {
    throw new Error('Ground wire resistance must be positive.');
  }

  const spanImpedance = scale(groundWireImpedance, spanLength / 1000);
  const argument = Math.atan(spanImpedance.im / spanImpedance.re);
  const magnitude = Math.sqrt(abs(spanImpedance) * towerFootingResistance);

  return {
    re: spanImpedance.re / 2 + magnitude * Math.cos(argument / 2),
    im: spanImpedance.im / 2 + magnitude * Math.sin(argument / 2),
  };
}

/**
 * Soni split factor (Windows `SoniProgram.bas`, `soni`).
 *
 * Each terminal i returns Ie(i) through its ground wire. With
 *   A(i,i) = Rg + Ze(i),  A(i,j) = Rg (i <> j),
 *   B(j)   = Rg · sum(Ir) + Zm(j) · Ir(j),   Zm(j) = (Zgm(j)/1000) · Ze(j) / Zgw(j)
 * the earth currents solve A · Ie = B, the grid current is
 * Ig = sum(Ir) - sum(Ie) and the split factor is |Ig / sum(Ir)| · 100.
 *
 * Unit note: Zgm is per metre and Zgw per kilometre, hence the 1/1000 in
 * Zm. The Windows `Ramezani` routine multiplies without that factor; the
 * two are not consistent in the Windows source (see the phase 6 notes).
 */
export function computeSoniSplitFactor(input: SoniInput): SoniResult {
  const { gridResistance, terminals } = input;

  if (!(gridResistance > 0)) {
    throw new Error('Grid resistance must be positive.');
  }
  if (terminals.length === 0) {
    throw new Error('At least one terminal is required.');
  }

  const equivalentImpedances = terminals.map((terminal) =>
    approximateLadderImpedance(
      terminal.spanLength,
      terminal.groundWireImpedance,
      terminal.towerFootingResistance,
    ),
  );

  const totalFaultCurrent = terminals.reduce(
    (sum, terminal) => add(sum, terminal.faultCurrent),
    complex(0),
  );
  if (abs(totalFaultCurrent) === 0) {
    throw new Error('The total fault current must not be zero.');
  }

  const mutual = terminals.map((terminal, i) =>
    div(
      mul(scale(terminal.mutualImpedance, 1 / 1000), equivalentImpedances[i]),
      terminal.groundWireImpedance,
    ),
  );

  const matrix = terminals.map((_, i) =>
    terminals.map((__, j) =>
      i === j
        ? add(complex(gridResistance), equivalentImpedances[i])
        : complex(gridResistance),
    ),
  );

  const rhs = terminals.map((terminal, j) =>
    add(
      scale(totalFaultCurrent, gridResistance),
      mul(mutual[j], terminal.faultCurrent),
    ),
  );

  const earthCurrents = solveLinearSystem(matrix, rhs);

  const totalEarthCurrent = earthCurrents.reduce(
    (sum, current) => add(sum, current),
    complex(0),
  );
  const gridCurrent = {
    re: totalFaultCurrent.re - totalEarthCurrent.re,
    im: totalFaultCurrent.im - totalEarthCurrent.im,
  };

  return {
    splitFactor: (abs(gridCurrent) / abs(totalFaultCurrent)) * 100,
    gridCurrent,
    totalFaultCurrent,
    terminalEarthCurrents: earthCurrents,
    equivalentImpedances,
  };
}
