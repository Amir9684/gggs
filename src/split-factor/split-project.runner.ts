import type { Complex } from './engine/complex';
import { abs } from './engine/complex';
import {
  computeIeee80SplitFactor,
  type Ieee80Input,
} from './engine/ieee80-split-factor.engine';
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

/** Soni results worth keeping and printing next to the split factor. */
export type SoniRunDetails = {
  gridCurrent: ComplexValue;
  totalFaultCurrent: ComplexValue;
  terminals: Array<{
    name: string | null;
    /** Zgw actually used, typed in or computed from the catalog wire (ohm/km). */
    groundWireImpedance: ComplexValue;
    equivalentImpedance: ComplexValue;
    earthCurrent: ComplexValue;
  }>;
};

export type Ieee80RunDetails = { clamped: 'LOW' | 'HIGH' | null };

export interface SplitRunOutcome {
  /** Percent of the fault current that flows into the grid. */
  splitFactor: number;
  /** Things to check although a number was produced (Persian). */
  warnings: string[];
  /** Method-specific numbers worth keeping next to the split factor. */
  details: SoniRunDetails | Ieee80RunDetails;
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
  const warnings: string[] = [];

  if (project.method === 'IEEE80') {
    const result = computeIeee80SplitFactor(project.input);
    if (result.clamped) {
      warnings.push(
        `مقاومت شبکه خارج از بازهٔ منحنی‌ها (۰٫۱ تا ۲۵ Ω) است؛ مقدار نزدیک‌ترین نقطهٔ منحنی (${
          result.clamped === 'LOW' ? '۰٫۱' : '۲۵'
        } Ω) به کار رفته است.`,
      );
    }
    return {
      splitFactor: result.splitFactor,
      warnings,
      details: { clamped: result.clamped },
    };
  }

  const soniInput = buildSoniInput(project.input, wires);
  const result = computeSoniSplitFactor(soniInput);

  // Windows tests `SplitFactor > 100 And SplitFactor < 0`, which can never
  // be true, so it never warned. A split factor above 100 % (more current
  // into the grid than the fault supplies) points at wrong input.
  if (result.splitFactor > 100) {
    warnings.push(
      'ضریب تقسیم بیشتر از ۱۰۰٪ شد؛ این یعنی جریان واردشده به شبکه از جریان خطا بیشتر است. مقدار امپدانس متقابل و امپدانس سیم گارد را بررسی کنید.',
    );
  }

  return {
    splitFactor: result.splitFactor,
    warnings,
    details: {
      gridCurrent: polar(result.gridCurrent),
      totalFaultCurrent: polar(result.totalFaultCurrent),
      terminals: project.input.terminals.map((terminal, i) => ({
        name: terminal.name ?? null,
        groundWireImpedance: polar(soniInput.terminals[i].groundWireImpedance),
        equivalentImpedance: polar(result.equivalentImpedances[i]),
        earthCurrent: polar(result.terminalEarthCurrents[i]),
      })),
    },
  };
}

export type { SplitMethod };
