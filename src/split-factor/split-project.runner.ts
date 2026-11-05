import type { Complex } from './engine/complex';
import { abs } from './engine/complex';
import { computeIeee80SplitFactor, type Ieee80Input } from './engine/ieee80-split-factor.engine';
import { computeSoniSplitFactor } from './engine/soni.engine';
import type { SoniCalculateInput } from './dto/soni-calculate.dto';
import {
  buildSoniInput,
  requestedWireIds,
  type CatalogWire,
} from './soni-input.builder';
import type { SplitMethod } from './split-method';

/** A complex quantity in rectangular and polar form, as the API returns it. */
export interface ComplexValue {
  re: number;
  im: number;
  magnitude: number;
  angleDegrees: number;
}

const polar = (value: Complex): ComplexValue => ({
  re: value.re,
  im: value.im,
  magnitude: abs(value),
  angleDegrees: (Math.atan2(value.im, value.re) * 180) / Math.PI,
});

/** The validated input of a saved project, tagged by its method. */
export type SplitProjectInput =
  | { method: 'SONI'; input: SoniCalculateInput }
  | { method: 'IEEE80'; input: Ieee80Input };

export interface SplitRunOutcome {
  /** Percent of the fault current that flows into the grid. */
  splitFactor: number;
  /** Method-specific numbers worth keeping next to the split factor. */
  details: Record<string, unknown>;
}

/** Catalog wire ids a project needs (none for the IEEE 80 curves method). */
export function wireIdsOf(project: SplitProjectInput): string[] {
  return project.method === 'SONI' ? requestedWireIds(project.input) : [];
}

/**
 * Runs a saved project's method. Engine errors (zero resistance, a
 * singular system, a combination with no curve...) are thrown as `Error`
 * for the caller to turn into a message.
 */
export function runSplitProject(
  project: SplitProjectInput,
  wires: ReadonlyMap<string, CatalogWire>,
): SplitRunOutcome {
  if (project.method === 'IEEE80') {
    const result = computeIeee80SplitFactor(project.input);
    return { splitFactor: result.splitFactor, details: { clamped: result.clamped } };
  }

  const result = computeSoniSplitFactor(buildSoniInput(project.input, wires));
  return {
    splitFactor: result.splitFactor,
    details: {
      gridCurrent: polar(result.gridCurrent),
      totalFaultCurrent: polar(result.totalFaultCurrent),
      terminals: project.input.terminals.map((terminal, i) => ({
        name: terminal.name ?? null,
        equivalentImpedance: polar(result.equivalentImpedances[i]),
        earthCurrent: polar(result.terminalEarthCurrents[i]),
      })),
    },
  };
}

export type { SplitMethod };
