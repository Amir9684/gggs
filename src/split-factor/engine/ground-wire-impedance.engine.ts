import { complex, type Complex } from './complex';

/** Frequency the Windows split factor programs hard-code (`f = 50`). */
export const DEFAULT_FREQUENCY_HZ = 50;

/**
 * How the ground wire's resistance is taken (Windows `R_Type`: AC = 0,
 * DC = 1) and how its reactance is taken (`X_Type`: GMR = 0, REACTANCE = 1).
 */
export type ResistanceSource = 'AC' | 'DC';
export type ReactanceSource = 'GMR' | 'REACTANCE';

export interface GroundWireData {
  /** AC resistance, Rac (ohm/km). */
  acResistance: number;
  /** DC resistance, Rdc (ohm/km). */
  dcResistance: number;
  /** Geometric mean radius, GMR (m). */
  gmr: number;
  /** Internal reactance (ohm/km), used when `reactanceSource` is REACTANCE. */
  reactance: number;
  resistanceSource: ResistanceSource;
  reactanceSource: ReactanceSource;
}

/**
 * Equivalent depth of the earth return path, De (m), Carson's
 * approximation: De = 658.4 · sqrt(rho / f).
 */
export function equivalentEarthDepth(
  earthResistivity: number,
  frequency = DEFAULT_FREQUENCY_HZ,
): number {
  if (!(earthResistivity > 0)) {
    throw new Error('Earth resistivity must be positive.');
  }
  if (!(frequency > 0)) {
    throw new Error('Frequency must be positive.');
  }
  return 658.4 * Math.sqrt(earthResistivity / frequency);
}

const EARTH_RETURN_RESISTANCE = 0.000000987; // ohm/m per Hz
const EARTH_RETURN_REACTANCE = 0.000002894; // ohm/m per Hz

/**
 * Ground wire impedance per kilometre, Zgw (ohm/km), computed from the
 * wire data exactly as the Windows `Soni`/`Ramezani`/`Dawalibi` programs
 * do when the circuit is entered as wire data ("indirect" entry):
 *
 *   R = Rac + 0.000000987 · f · 1000          (AC)     or  R = Rdc   (DC)
 *   X = 0.000002894 · f · log10(De / GMR) · 1000       (from GMR)
 *   X = 0.000002894 · f · log10(De) · 1000 + Xint      (from reactance)
 */
export function computeGroundWireImpedance(
  wire: GroundWireData,
  earthResistivity: number,
  frequency = DEFAULT_FREQUENCY_HZ,
): Complex {
  const depth = equivalentEarthDepth(earthResistivity, frequency);

  const resistance =
    wire.resistanceSource === 'AC'
      ? wire.acResistance + EARTH_RETURN_RESISTANCE * frequency * 1000
      : wire.dcResistance;

  let reactance: number;
  if (wire.reactanceSource === 'GMR') {
    if (!(wire.gmr > 0)) {
      throw new Error('Ground wire GMR must be positive.');
    }
    reactance =
      EARTH_RETURN_REACTANCE * frequency * Math.log10(depth / wire.gmr) * 1000;
  } else {
    reactance =
      EARTH_RETURN_REACTANCE * frequency * Math.log10(depth) * 1000 +
      wire.reactance;
  }

  return complex(resistance, reactance);
}
