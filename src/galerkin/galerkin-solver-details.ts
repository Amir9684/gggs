/**
 * Solver notes stored with a Galerkin result (`CalculationResult.solverDetails`).
 * IEEE results keep their intermediate values in `details` instead; a
 * Galerkin result has none of those factors (it solves the field).
 */
export interface GalerkinSolverDetails {
  method: 'GALERKIN';
  /** Segment length the conductors were cut to (m). */
  segmentLength: number;
  segmentCount: number;
  rodCount: number;
  wellCount: number;
  /** Mesh count of the drawn grid, used for the surge impedance. */
  meshCount: number;
  /** Surge impedance (ohm); `null` unless the grid has 4 to 64 meshes. */
  surgeImpedance: number | null;
  /** Soil resistivity the solver used (ohm·m). Absent on results saved before reports. */
  soilResistivity?: number;
  /** Current injected into the grid, IG = If · Sf · Df (A). Absent likewise. */
  groundCurrent?: number;
}
