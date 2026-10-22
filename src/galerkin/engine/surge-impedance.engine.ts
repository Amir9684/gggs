/**
 * Surge (impulse) impedance of the grid, Windows `khandnewn.frm`
 * (end of `okbutton_Click`, "Lightning, formula 9 page 72").
 */
export interface SurgeImpedanceInput {
  /** Grid resistance, Rg (ohm). */
  gridResistance: number;
  /** Soil resistivity (ohm·m). */
  soilResistivity: number;
  /** Number of meshes (4 to 64). */
  meshCount: number;
  /** Mean horizontal segment length (m). */
  meanSegmentLength: number;
  /** Conductor radius (m). */
  conductorRadius: number;
}

const RELATIVE_PERMITTIVITY = 9; // kr
const VACUUM_PERMITTIVITY = 0.00000000000885; // ezero (F/m)
const FRONT_TIME = 0.0000012; // tf (s)

/** Mesh-count factor kpp, linear between the tabulated 4, 16, 36 and 64 mesh values. */
export function meshFactor(meshCount: number): number {
  if (!(meshCount >= 4 && meshCount <= 64)) {
    throw new Error('The surge impedance is defined for 4 to 64 meshes.');
  }
  if (meshCount <= 16) return 3.75 - (1.71 / 12) * (16 - meshCount);
  if (meshCount <= 36) return 5.28 - (1.53 / 20) * (36 - meshCount);
  return 7.15 - (1.87 / 28) * (64 - meshCount);
}

/**
 * Zsurge = Rg + Leff / (3·tf) + Rg · RC / tf · (exp(−tf/RC) − 1)
 * with Leff = kpp · 2 · l · ln(4·l / a) · 1e-7 and RC = rho · e0 · kr.
 *
 * Windows quirks not carried over: the 64-mesh case is written
 * `nmesh = 64 And nmesh > 64` and so never matches, and fewer than 4 or
 * more than 64 meshes silently use kpp = 0. Here those are an error or
 * the intended 64-mesh value.
 */
export function computeSurgeImpedance(input: SurgeImpedanceInput): number {
  const {
    gridResistance,
    soilResistivity,
    meshCount,
    meanSegmentLength,
    conductorRadius,
  } = input;
  if (
    !(gridResistance > 0) ||
    !(soilResistivity > 0) ||
    !(meanSegmentLength > 0) ||
    !(conductorRadius > 0)
  ) {
    throw new Error(
      'Grid resistance, soil resistivity, segment length and radius must be positive.',
    );
  }

  const kpp = meshFactor(meshCount);
  const effectiveInductance =
    kpp *
    2 *
    meanSegmentLength *
    Math.log((4 * meanSegmentLength) / conductorRadius) *
    0.0000001;
  const timeConstant =
    soilResistivity * VACUUM_PERMITTIVITY * RELATIVE_PERMITTIVITY;

  return (
    gridResistance +
    effectiveInductance / (3 * FRONT_TIME) +
    ((gridResistance * timeConstant) / FRONT_TIME) *
      (Math.exp(-FRONT_TIME / timeConstant) - 1)
  );
}
