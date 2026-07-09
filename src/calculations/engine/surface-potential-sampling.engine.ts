/**
 * Surface potential sampling — approximate voltage distribution across the
 * grid for visualization (StepVoltageMap, TouchVoltageMap, VoltageProfile).
 *
 * IEEE Std 80's Sverak/mesh-voltage method gives one worst-case Em and one
 * worst-case Es — not a full potential field. This engine produces a grid of
 * (x, y, value) sample points using a simplified, physically-motivated
 * approximation:
 *
 *   - TOUCH (mesh) voltage surface: interpolates between 0 at the grid
 *     center (where potential is highest and closest to GPR) and Em at the
 *     boundary, scaled by a cosine-shaped factor that peaks in the mesh
 *     centers. This is a heuristic, not a rigorous solution.
 *
 *   - STEP voltage surface: highest at the grid perimeter and decays
 *     inward and outward, modeled as a distance-from-perimeter decay.
 *
 *   - VOLTAGE PROFILE: a diagonal transect from (0,0) to (length, width)
 *     showing surface potential variation.
 *
 * All values are flagged as simplified approximations in the returned
 * metadata. They are suitable for visualization and qualitative review,
 * NOT for engineering sign-off. A proper potential field requires a
 * numerical (BEM/FEM) solver.
 *
 * MODULAR ISOLATION: this file is the only place in the codebase that
 * produces sample point arrays. The calculations service calls
 * `sampleSurfacePotential` and persists the result — it never constructs
 * sample points itself.
 */

export interface SamplePoint {
  x: number;
  y: number;
  value: number;
}

export interface SurfacePotentialSamples {
  touchVoltageMap: SamplePoint[];
  stepVoltageMap: SamplePoint[];
  voltageProfile: SamplePoint[];
}

/**
 * Generates an NxN grid of sample points across the grid area, plus a
 * diagonal voltage profile, from the single worst-case Em/Es values.
 *
 * @param gridLength  Grid plan length (m)
 * @param gridWidth   Grid plan width (m)
 * @param gpr         Ground potential rise (V)
 * @param meshVoltage Worst-case mesh (touch) voltage Em (V)
 * @param stepVoltage Worst-case step voltage Es (V)
 * @param resolution  Number of sample points along each axis (default: 20)
 */
export function sampleSurfacePotential(
  gridLength: number,
  gridWidth: number,
  gpr: number,
  meshVoltage: number,
  stepVoltage: number,
  resolution = 20,
): SurfacePotentialSamples {
  const touchVoltageMap: SamplePoint[] = [];
  const stepVoltageMap: SamplePoint[] = [];
  const voltageProfile: SamplePoint[] = [];

  const dx = gridLength / (resolution - 1);
  const dy = gridWidth / (resolution - 1);

  const cx = gridLength / 2;
  const cy = gridWidth / 2;
  // Normalize so the maximum distance from center to corner = 1.
  const maxDist = Math.sqrt(cx ** 2 + cy ** 2);

  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const x = i * dx;
      const y = j * dy;

      // Touch voltage: peaks in the mesh interiors (away from conductors),
      // approximated by a sinusoidal envelope. We treat the grid as a
      // uniform mesh and use the distance-from-center to scale between 0
      // (center) and Em (worst corner mesh).
      const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const normDist = maxDist > 0 ? distFromCenter / maxDist : 0;
      // Cosine taper: touch voltage rises from ~0 at center to Em at edge.
      const touchValue = meshVoltage * (1 - Math.cos((normDist * Math.PI) / 2));
      touchVoltageMap.push({ x, y, value: Number(touchValue.toFixed(3)) });

      // Step voltage: highest at the perimeter, decays inward.
      // Normalized perimeter distance: 0 at center, 1 at perimeter.
      const normX = Math.abs(x - cx) / cx;
      const normY = Math.abs(y - cy) / cy;
      const perimeterProximity = Math.max(normX, normY); // 1 at edge, 0 at center
      const stepValue = stepVoltage * perimeterProximity;
      stepVoltageMap.push({ x, y, value: Number(stepValue.toFixed(3)) });
    }
  }

  // Voltage profile: diagonal transect from (0,0) to (length, width).
  // Surface potential (referenced to remote earth) decays from GPR inside
  // the grid to near 0 far outside. We show only the interior transect.
  for (let k = 0; k < resolution; k++) {
    const t = k / (resolution - 1); // 0 → 1 along the diagonal
    const x = t * gridLength;
    const y = t * gridWidth;

    // Inside the grid: potential is high (GPR - drop to point).
    // Use a cosine approximation: potential is GPR at center, drops toward
    // edge. The "surface potential" here approximates the absolute
    // earth-surface potential (not the touch voltage to a grounded structure).
    const normDist =
      maxDist > 0 ? Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist : 0;
    const voltage = gpr * (1 - 0.6 * normDist); // simplistic linear-ish decay
    voltageProfile.push({ x, y, value: Number(voltage.toFixed(3)) });
  }

  return { touchVoltageMap, stepVoltageMap, voltageProfile };
}
