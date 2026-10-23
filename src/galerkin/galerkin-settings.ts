/**
 * Inputs of the Galerkin solver that don't come from the drawn grid or the
 * IEEE case settings (Windows "Galerkin" dialog: segment length, rod
 * radius, well diameter and length, Kro). Stored on the case as JSON;
 * a case without them uses the defaults.
 */
export interface GalerkinSettings {
  /** Conductors are cut into segments of about this length (m). */
  segmentLength: number;
  /** Ground rod radius (m). */
  rodRadius: number;
  /** Ring well diameter (m). */
  wellDiameter: number;
  /** Ring well length (m). */
  wellLength: number;
  /** Hole factor Kro of the wells. */
  kro: number;
}

export const DEFAULT_GALERKIN_SETTINGS: GalerkinSettings = {
  segmentLength: 5,
  rodRadius: 0.0125,
  wellDiameter: 0.3,
  wellLength: 3,
  kro: 1,
};

export function resolveGalerkinSettings(
  stored: Partial<GalerkinSettings> | null | undefined,
): GalerkinSettings {
  return { ...DEFAULT_GALERKIN_SETTINGS, ...(stored ?? {}) };
}
