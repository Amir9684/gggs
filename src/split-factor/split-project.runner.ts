import type { Complex } from './engine/complex';
import { abs } from './engine/complex';
import {
  computeIeee80SplitFactor,
  type Ieee80Input,
} from './engine/ieee80-split-factor.engine';
import { computeRamezaniSplitFactor } from './engine/ramezani.engine';
import { computeSoniSplitFactor } from './engine/soni.engine';
import type { RamezaniCalculateInput } from './dto/ramezani-calculate.dto';
import type { SoniCalculateInput } from './dto/soni-calculate.dto';
import { buildRamezaniInput, ramezaniWireIds } from './ramezani-input.builder';
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
  | { method: 'IEEE80'; input: Ieee80Input }
  | { method: 'RAMEZANI'; input: RamezaniCalculateInput };

/** Shown when a computed split factor is above 100 %. */
const SPLIT_FACTOR_ABOVE_100 =
  'ضریب تقسیم بیشتر از ۱۰۰٪ شد؛ این یعنی جریان واردشده به شبکه از جریان خطا بیشتر است. مقدار امپدانس متقابل و امپدانس سیم گارد را بررسی کنید.';

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

/** Ramezani results worth keeping and printing next to the split factor. */
export type RamezaniRunDetails = {
  gridCurrent: ComplexValue;
  totalFaultCurrent: ComplexValue;
  terminals: Array<{
    name: string | null;
    groundWireImpedance: ComplexValue;
    equivalentImpedance: ComplexValue;
    voltageCoefficient: ComplexValue;
    mutualFactor: ComplexValue;
    earthCurrent: ComplexValue;
    spanCount: number;
    /** Total line length (km). */
    lineLength: number;
  }>;
};

export interface SplitRunOutcome {
  /** Percent of the fault current that flows into the grid. */
  splitFactor: number;
  /** Things to check although a number was produced (Persian). */
  warnings: string[];
  /** Method-specific numbers worth keeping next to the split factor. */
  details: SoniRunDetails | Ieee80RunDetails | RamezaniRunDetails;
}

/** Catalog wire ids a project needs (none for the IEEE 80 curves method). */
export function wireIdsOf(project: SplitProjectInput): string[] {
  if (project.method === 'SONI') return requestedWireIds(project.input);
  if (project.method === 'RAMEZANI') return ramezaniWireIds(project.input);
  return [];
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

  if (project.method === 'RAMEZANI') {
    const ramezaniInput = buildRamezaniInput(project.input, wires);
    const result = computeRamezaniSplitFactor(ramezaniInput);

    if (result.splitFactor > 100) {
      warnings.push(SPLIT_FACTOR_ABOVE_100);
    }

    return {
      splitFactor: result.splitFactor,
      warnings,
      details: {
        gridCurrent: polar(result.gridCurrent),
        totalFaultCurrent: polar(result.totalFaultCurrent),
        terminals: project.input.terminals.map((terminal, i) => ({
          name: terminal.name ?? null,
          groundWireImpedance: polar(
            ramezaniInput.terminals[i].groundWireImpedance,
          ),
          equivalentImpedance: polar(result.equivalentImpedances[i]),
          voltageCoefficient: polar(result.voltageCoefficients[i]),
          mutualFactor: polar(result.mutualFactors[i]),
          earthCurrent: polar(result.terminalEarthCurrents[i]),
          spanCount: terminal.spans.length,
          lineLength:
            terminal.spans.reduce((sum, span) => sum + span.length, 0) / 1000,
        })),
      },
    };
  }

  const soniInput = buildSoniInput(project.input, wires);
  const result = computeSoniSplitFactor(soniInput);

  // Windows tests `SplitFactor > 100 And SplitFactor < 0`, which can never
  // be true, so it never warned. A split factor above 100 % (more current
  // into the grid than the fault supplies) points at wrong input.
  if (result.splitFactor > 100) {
    warnings.push(SPLIT_FACTOR_ABOVE_100);
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
