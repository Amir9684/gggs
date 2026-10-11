import type {
  GridGeometrySummary,
  SoilSummary,
  TwoLayerSoilCorrection,
  TwoLayerSoilLayers,
} from './types';

/**
 * Two-layer soil correction of the mesh and step voltages, ported from the
 * Windows GGGS two-layer design form (`Towlay2000.frm`, `Runbutton_Click`).
 * The Windows two-layer IEEE 80-86 report forms (`frmieee86Trep1`) use the
 * very same Xhor / Yhor expressions, so both IEEE methods share this file.
 *
 *   Cm = (ρ2 / ρ1)^Xhor      mesh (touch) voltage correction
 *   Cs = (ρ2 / ρ1)^Yhor      step voltage correction
 *
 *   Em = Cm · ρ1 · Km · Ki · IG / Lm
 *   Es = Cs · ρ1 · Ks · Ki · IG / Ls
 *
 * where ρ1 / hs are the resistivity / thickness of the UPPER layer, ρ2 is
 * the resistivity of the LOWER layer, A the grid area, h the burial depth,
 * Lc the total horizontal conductor length and M the number of meshes.
 *
 * Xhor, grid WITHOUT rods:   hs < √A ? 0.075 · log10(√A / hs)²      : 0
 * Xhor, grid WITH rods:      ρ2 < ρ1 ? 0.33 · log10(10 · hs)
 *                                    : 0.16 · log10(√A · hs) − 0.1
 * Yhor, grid WITHOUT rods:   hs < √A ? (2h / hs)^(1/3) · (0.3 · log10(Lc / √A) + 0.1) : 0
 * Yhor, grid WITH rods:      ρ2 < ρ1 ? 0.475 · log10(140 · √M / √A) + 0.14 · log10(hs)
 *                                    : 0.032 · log10(2850 · M) · log10(2810 / hs)
 *
 * Note: the Cs returned here is the SOIL step correction. It is unrelated to
 * the surface-layer (crushed rock) derating factor of the same name used by
 * the permissible-voltage formulas — that one lives in
 * `surface-derating*.engine.ts`. This file calls it `stepCorrection` to keep
 * the two apart.
 *
 * The Windows form does not compute Rg or GPR for two-layer soil (it reuses
 * the single main-form resistivity). The web engine keeps using
 * `soil.apparentResistivity` for Rg / GPR; only Em and Es are corrected.
 */

type TwoLayerGeometry = Pick<
  GridGeometrySummary,
  'area' | 'burialDepth' | 'totalConductorLength' | 'totalRodLength'
> & { meshCount: number };

const log10 = (value: number): number => Math.log(value) / Math.LN10;

export function computeTwoLayerCorrection(
  layers: TwoLayerSoilLayers,
  geometry: TwoLayerGeometry,
): TwoLayerSoilCorrection {
  const { upperResistivity, lowerResistivity, upperThickness } = layers;
  const { area, burialDepth, totalConductorLength, totalRodLength, meshCount } =
    geometry;

  if (upperResistivity <= 0 || lowerResistivity <= 0) {
    throw new Error('Both soil layer resistivities must be positive.');
  }
  if (upperThickness <= 0) {
    throw new Error('Upper soil layer thickness must be positive.');
  }
  if (area <= 0) {
    throw new Error('Grid area must be positive.');
  }
  if (burialDepth <= 0) {
    throw new Error('Burial depth must be positive.');
  }

  const sqrtArea = Math.sqrt(area);
  const hasRods = totalRodLength > 0;
  const lowerIsLessResistive = lowerResistivity < upperResistivity;

  let xhor: number;
  let yhor: number;

  if (!hasRods) {
    if (upperThickness < sqrtArea) {
      xhor = 0.075 * log10(sqrtArea / upperThickness) ** 2;
      if (totalConductorLength <= 0) {
        throw new Error('Total conductor length must be positive.');
      }
      yhor =
        ((2 * burialDepth) / upperThickness) ** (1 / 3) *
        (0.3 * log10(totalConductorLength / sqrtArea) + 0.1);
    } else {
      xhor = 0;
      yhor = 0;
    }
  } else {
    if (meshCount <= 0) {
      throw new Error(
        'The grid needs at least one mesh for the two-layer soil correction.',
      );
    }
    if (lowerIsLessResistive) {
      xhor = 0.33 * log10(10 * upperThickness);
      yhor =
        0.475 * log10((140 * Math.sqrt(meshCount)) / sqrtArea) +
        0.14 * log10(upperThickness);
    } else {
      xhor = 0.16 * log10(sqrtArea * upperThickness) - 0.1;
      yhor = 0.032 * log10(2850 * meshCount) * log10(2810 / upperThickness);
    }
  }

  const ratio = lowerResistivity / upperResistivity;

  return {
    upperResistivity,
    lowerResistivity,
    upperThickness,
    xhor,
    yhor,
    meshCorrection: ratio ** xhor,
    stepCorrection: ratio ** yhor,
  };
}

/** Soil resistivities the mesh, step and surface-layer formulas work with. */
export interface ResolvedSoilResistivities {
  /** ρ used in Em = ρ · Km · Ki · IG / Lm. */
  meshResistivity: number;
  /** ρ used in Es = ρ · Ks · Ki · IG / Ls. */
  stepResistivity: number;
  /** Resistivity of the earth directly under the surface layer, for Cs. */
  underSurfaceResistivity: number;
  /** Present only for two-layer soil. */
  twoLayer: TwoLayerSoilCorrection | null;
}

/**
 * Picks the resistivities for the mesh / step / surface-derating formulas.
 * Uniform soil: all three are the apparent resistivity. Two-layer soil:
 * ρ1 scaled by Cm (mesh) and Cs (step), and ρ1 under the surface layer.
 */
export function resolveSoilResistivities(
  soil: SoilSummary,
  geometry: TwoLayerGeometry,
): ResolvedSoilResistivities {
  if (!soil.twoLayer) {
    return {
      meshResistivity: soil.apparentResistivity,
      stepResistivity: soil.apparentResistivity,
      underSurfaceResistivity: soil.apparentResistivity,
      twoLayer: null,
    };
  }

  const correction = computeTwoLayerCorrection(soil.twoLayer, geometry);

  return {
    meshResistivity: correction.meshCorrection * correction.upperResistivity,
    stepResistivity: correction.stepCorrection * correction.upperResistivity,
    underSurfaceResistivity: correction.upperResistivity,
    twoLayer: correction,
  };
}
