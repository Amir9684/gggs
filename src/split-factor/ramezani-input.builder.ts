import type { RamezaniCalculateInput } from './dto/ramezani-calculate.dto';
import { Complex } from './engine/complex';
import { computeGroundWireImpedance } from './engine/ground-wire-impedance.engine';
import type { RamezaniInput } from './engine/ramezani.engine';
import type { CatalogWire } from './soni-input.builder';

/**
 * Turns the API request into the engine input. Like the Soni builder,
 * catalog terminals get their ground wire impedance computed from the
 * stored wire and the earth resistivity; direct terminals keep theirs.
 */
export function buildRamezaniInput(
  request: RamezaniCalculateInput,
  wires: ReadonlyMap<string, CatalogWire>,
): RamezaniInput {
  return {
    gridResistance: request.gridResistance,
    groundFaultCurrent: request.groundFaultCurrent,
    terminals: request.terminals.map((terminal) => {
      const source = terminal.groundWire;
      let groundWireImpedance: Complex;

      if (source.source === 'DIRECT') {
        groundWireImpedance = source.impedance;
      } else {
        const wire = wires.get(source.groundWireId);
        if (!wire) {
          throw new Error(`Ground wire ${source.groundWireId} was not found.`);
        }
        groundWireImpedance = computeGroundWireImpedance(
          {
            acResistance: wire.acResistance,
            dcResistance: wire.dcResistance,
            gmr: wire.gmr,
            reactance: wire.reactance,
            resistanceSource: source.resistanceSource,
            reactanceSource: source.reactanceSource,
          },
          source.earthResistivity,
          request.frequency,
        );
      }

      return {
        faultCurrent: terminal.faultCurrent,
        groundWireImpedance,
        mutualImpedance: terminal.mutualImpedance,
        spans: terminal.spans,
        groundWireFraction: terminal.groundWireFraction,
      };
    }),
  };
}

/** Catalog wire ids a request refers to, without duplicates. */
export function ramezaniWireIds(request: RamezaniCalculateInput): string[] {
  const ids = new Set<string>();
  for (const terminal of request.terminals) {
    if (terminal.groundWire.source === 'CATALOG') {
      ids.add(terminal.groundWire.groundWireId);
    }
  }
  return [...ids];
}
