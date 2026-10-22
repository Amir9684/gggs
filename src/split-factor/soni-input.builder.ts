import { computeGroundWireImpedance } from './engine/ground-wire-impedance.engine';
import type { SoniInput } from './engine/soni.engine';
import type { SoniCalculateInput } from './dto/soni-calculate.dto';
import { Complex } from './engine/complex';

/** The catalog fields the impedance computation needs. */
export interface CatalogWire {
  acResistance: number;
  dcResistance: number;
  gmr: number;
  reactance: number;
}

/**
 * Turns the API request into the engine input: catalog terminals get
 * their ground wire impedance computed from the stored wire and the
 * earth resistivity (what the Windows "indirect" entry does), direct
 * terminals keep the impedance as typed. `wires` is keyed by wire id.
 */
export function buildSoniInput(
  request: SoniCalculateInput,
  wires: ReadonlyMap<string, CatalogWire>,
): SoniInput {
  return {
    gridResistance: request.gridResistance,
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
        spanLength: terminal.spanLength,
        towerFootingResistance: terminal.towerFootingResistance,
        groundWireImpedance,
        mutualImpedance: terminal.mutualImpedance,
      };
    }),
  };
}

/** Catalog wire ids a request refers to, without duplicates. */
export function requestedWireIds(request: SoniCalculateInput): string[] {
  const ids = new Set<string>();
  for (const terminal of request.terminals) {
    if (terminal.groundWire.source === 'CATALOG') {
      ids.add(terminal.groundWire.groundWireId);
    }
  }
  return [...ids];
}
