/**
 * Shared input/output contracts for the IEEE Std 80-2013 ("Guide for
 * Safety in AC Substation Grounding") calculation engine.
 *
 * IMPORTANT: every file in `src/calculations/engine/` is pure, framework-
 * free TypeScript — no NestJS, no TypeORM, no I/O. They take plain numbers
 * in, return plain numbers/objects out. This is deliberate: it's what
 * makes each formula independently unit-testable against the worked
 * examples in the standard, and lets a fix to one formula (e.g. mesh
 * voltage) never require touching the grid resistance code, the geometric
 * factor code, or the persistence/service layer.
 *
 * Units follow IEEE 80 convention: lengths in meters, resistivity in
 * ohm-meters (Ω·m), current in amperes, time in seconds, voltage in volts,
 * resistance in ohms — unless otherwise noted.
 */

/** Geometry summary extracted from a grid's drawn `GridElement`s. */
export interface GridGeometrySummary {
  /** Grid plan area, A = length × width (m²). */
  area: number;
  /** Grid length (m), longer plan dimension. */
  length: number;
  /** Grid width (m), shorter plan dimension. */
  width: number;
  /** Burial depth of the grid conductors, h (m). */
  burialDepth: number;
  /** Total length of all horizontal grid conductors, Lc (m). */
  totalConductorLength: number;
  /** Conductor diameter, d (m) — averaged across CONDUCTOR elements. */
  conductorDiameter: number;
  /** Number of conductors counted running parallel to the grid's length axis. */
  conductorCountAlongLength: number;
  /** Number of conductors counted running parallel to the grid's width axis. */
  conductorCountAlongWidth: number;
  /**
   * Average spacing between parallel conductors (m), derived from actual
   * drawn positions along each axis (simplification: real grids may have
   * non-uniform spacing; this is a single representative average per the
   * standard's uniform-spacing assumption behind Km/Ks).
   */
  averageSpacing: number;
  /** Number of ground rods, Nr. */
  rodCount: number;
  /** Total length of all ground rods, Lr (m). */
  totalRodLength: number;
  /** True if any ground rods are located along the grid perimeter. */
  hasPerimeterRods: boolean;
}

/** Soil model summary (from `SoilModel`/`SoilLayer`). */
export interface SoilSummary {
  /** Surface layer resistivity, ρs (Ω·m) — crushed rock/gravel layer. */
  surfaceResistivity: number;
  /**
   * Effective/apparent resistivity of the earth beneath the grid, ρ
   * (Ω·m), used in the resistance and GPR formulas. For a uniform single
   * layer this is just that layer's resistivity; for multi-layer models
   * this is a simplified weighted-average approximation (see
   * `soil-apparent-resistivity.engine.ts`), not a full Sunde/finite-
   * element multilayer solution.
   */
  apparentResistivity: number;
}

/** Fault/case inputs (from `CaseFault`). */
export interface FaultParameters {
  /** Symmetrical grid fault current, IG before split/decrement (A). */
  faultCurrent: number;
  /** Fault duration, tf (s). */
  faultDuration: number;
  /** Current division (split) factor, Sf (0–1), fraction of fault current that flows through the grid. */
  splitFactor: number;
  /** Decrement factor, Df (≥1), accounts for sub-transient DC offset. */
  decrementFactor: number;
  /** Shock duration, ts (s), used in permissible touch/step voltage formulas. */
  shockDuration: number;
}

/** Settings inputs (from `CaseSetting`). */
export interface CaseSettings {
  surfaceLayerResistivity: number;
  surfaceLayerThickness: number;
  /** Body weight of a typical person, kg (IEEE 80 tabulates 50 kg and 70 kg). */
  bodyWeight: number;
  /** System frequency, Hz. */
  frequency: number;
}

/** Full input bundle for a single safety evaluation run. */
export interface SafetyEvaluationInput {
  geometry: GridGeometrySummary;
  soil: SoilSummary;
  fault: FaultParameters;
  settings: CaseSettings;
}

/** Output of the grid resistance engine. */
export interface GridResistanceResult {
  /** Grid resistance, Rg (Ω) — Sverak's equation. */
  gridResistance: number;
}

/** Output of the GPR engine. */
export interface GprResult {
  /** Effective grid fault current, IG = If × Sf × Df (A). */
  effectiveGridCurrent: number;
  /** Ground potential rise, GPR = IG × Rg (V). */
  gpr: number;
}

/** Geometric correction factors shared by mesh and step voltage formulas. */
export interface GeometricFactors {
  /** Geometric spacing factor for mesh voltage, Km. */
  km: number;
  /** Irregularity factor, Ki. */
  ki: number;
  /** Corrosion/depth correction factor used inside Km, Kii or Kh (per Sverak). */
  kii: number;
  /** Grid depth correction factor, Kh. */
  kh: number;
  /** Geometric spacing factor for step voltage, Ks. */
  ks: number;
  /** Effective number of parallel conductors, n. */
  n: number;
}

/** Output of the surface-layer derating engine. */
export interface SurfaceDeratingResult {
  /** Surface layer derating factor, Cs (dimensionless, 0–1). */
  cs: number;
}

/** Output of the mesh-voltage / touch-safety engine. */
export interface MeshVoltageResult {
  /** Mesh voltage, Em (V) — the worst-case touch voltage within the grid. */
  meshVoltage: number;
  /** Permissible touch voltage, Etouch (V), for the given body weight & shock duration. */
  permissibleTouchVoltage: number;
  /** True if meshVoltage <= permissibleTouchVoltage. */
  isSafe: boolean;
}

/** Output of the step-voltage / step-safety engine. */
export interface StepVoltageResult {
  /** Step voltage, Es (V) — the worst-case step voltage at the grid perimeter. */
  stepVoltage: number;
  /** Permissible step voltage, Estep (V), for the given body weight & shock duration. */
  permissibleStepVoltage: number;
  /** True if stepVoltage <= permissibleStepVoltage. */
  isSafe: boolean;
}

/** Full output of a single safety evaluation run — maps 1:1 onto `CalculationResult`. */
export interface SafetyEvaluationResult {
  gridResistance: number;
  gpr: number;
  meshVoltage: number;
  touchVoltage: number;
  stepVoltage: number;
  permissibleTouchVoltage: number;
  permissibleStepVoltage: number;
  safe: boolean;
  /** Intermediate values kept for transparency/debugging, not persisted on `CalculationResult` directly. */
  details: {
    effectiveGridCurrent: number;
    cs: number;
    geometricFactors: GeometricFactors;
  };
}
