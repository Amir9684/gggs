/**
 * Reduces a multi-layer soil model to a single "apparent resistivity" (ρ)
 * for use in the grid resistance, GPR, mesh- and step-voltage formulas.
 *
 * IEEE Std 80-2013 itself is written for a UNIFORM soil model — the
 * Sverak/Schwarz formulas all take one ρ. Real sites are layered, so a
 * full treatment requires either Sunde's two-layer curves or a numerical
 * (finite-element) solution, neither of which this module attempts.
 *
 * What this DOES do: a thickness-weighted average of layer resistivities,
 * which is a common simplified approximation, not a substitute for the
 * standard's two-layer reduction charts. Flagged here and surfaced to
 * callers as a documented simplification — see `safety-evaluation.engine.ts`.
 */

export interface SoilLayerLike {
  resistivity: number;
  thickness: number;
  layerOrder: number;
}

export function computeApparentResistivity(layers: SoilLayerLike[]): number {
  if (layers.length === 0) {
    throw new Error('At least one soil layer is required.');
  }

  if (layers.length === 1) {
    return layers[0].resistivity;
  }

  const totalThickness = layers.reduce((sum, l) => sum + l.thickness, 0);
  if (totalThickness <= 0) {
    throw new Error('Total soil layer thickness must be positive.');
  }

  const weightedSum = layers.reduce(
    (sum, l) => sum + l.resistivity * l.thickness,
    0,
  );

  return weightedSum / totalThickness;
}
