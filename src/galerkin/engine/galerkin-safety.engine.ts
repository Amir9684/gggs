import {
  computeSurfacePotential,
  solveGalerkin,
  type GalerkinInput,
} from './galerkin.engine';
import { computeSurgeImpedance, meshFactor } from './surge-impedance.engine';

export interface GalerkinSamplePoint {
  x: number;
  y: number;
  value: number;
}

export interface GalerkinSafetyResult {
  gridResistance: number;
  gpr: number;
  /** Worst touch (= mesh) voltage over the grid area, GPR minus the surface potential (V). */
  touchVoltage: number;
  /** Worst step voltage over the grid area and a margin around it, for a 1 m step (V). */
  stepVoltage: number;
  safe: boolean;
  samples: {
    touchVoltageMap: GalerkinSamplePoint[];
    stepVoltageMap: GalerkinSamplePoint[];
    voltageProfile: GalerkinSamplePoint[];
  };
  details: {
    segmentCount: number;
    rodCount: number;
    wellCount: number;
    /** Surge impedance (ohm); `null` when the grid has fewer than 4 or more than 64 meshes. */
    surgeImpedance: number | null;
    meshCount: number;
  };
}

/** Sample points per axis for the worst-case search and for the maps. */
const SEARCH_POINTS = 50;
const MAP_POINTS = 20;
const STEP_DISTANCE = 1; // m
/** Margin around the grid in which the step voltage is searched (m). */
const STEP_MARGIN = 3;
/** Diagonal offset of the Windows corner step: 0.7 m in x and y, about 1 m. */
const CORNER_OFFSET = 0.7;

function distinctCount(values: number[]): number {
  return new Set(values.map((value) => Math.round(value * 1e6))).size;
}

function linspace(from: number, to: number, count: number): number[] {
  if (count <= 1) return [from];
  return Array.from(
    { length: count },
    (_, i) => from + ((to - from) * i) / (count - 1),
  );
}

/**
 * Solves the grid and derives what the rest of the app stores for a
 * result: Rg, GPR, the worst touch and step voltages and their maps.
 *
 * Touch voltage at a point is GPR minus the surface potential there; the
 * worst value is searched on a regular lattice over the grid area. The
 * step voltage is the largest potential difference over a 1 m step (in x
 * and y) on a lattice that extends `STEP_MARGIN` beyond the grid, plus the
 * Windows corner step. These are sampled maxima, not exact: a finer
 * lattice can find slightly worse values.
 */
export function evaluateGalerkinGrid(
  input: GalerkinInput,
  permissible: { touch: number; step: number },
): GalerkinSafetyResult {
  const solution = solveGalerkin(input);
  const { gpr } = solution;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const segment of input.horizontalSegments) {
    minX = Math.min(minX, segment.x1, segment.x2);
    maxX = Math.max(maxX, segment.x1, segment.x2);
    minY = Math.min(minY, segment.y1, segment.y2);
    maxY = Math.max(maxY, segment.y1, segment.y2);
  }

  const potential = (x: number, y: number) =>
    computeSurfacePotential(solution, x, y);

  // Touch voltage: worst over the grid area.
  let touchVoltage = 0;
  for (const y of linspace(minY, maxY, SEARCH_POINTS)) {
    for (const x of linspace(minX, maxX, SEARCH_POINTS)) {
      touchVoltage = Math.max(touchVoltage, gpr - potential(x, y));
    }
  }

  // Step voltage: worst 1 m step over the grid plus a margin.
  let stepVoltage = 0;
  for (const y of linspace(
    minY - STEP_MARGIN,
    maxY + STEP_MARGIN,
    SEARCH_POINTS,
  )) {
    for (const x of linspace(
      minX - STEP_MARGIN,
      maxX + STEP_MARGIN,
      SEARCH_POINTS,
    )) {
      const here = potential(x, y);
      stepVoltage = Math.max(
        stepVoltage,
        Math.abs(here - potential(x + STEP_DISTANCE, y)),
        Math.abs(here - potential(x, y + STEP_DISTANCE)),
      );
    }
  }
  for (const [cx, cy, sx, sy] of [
    [minX, minY, -1, -1],
    [maxX, minY, 1, -1],
    [minX, maxY, -1, 1],
    [maxX, maxY, 1, 1],
  ]) {
    stepVoltage = Math.max(
      stepVoltage,
      Math.abs(
        potential(cx, cy) -
          potential(cx + sx * CORNER_OFFSET, cy + sy * CORNER_OFFSET),
      ),
    );
  }

  // Maps for the viewer: touch and step voltage on a coarse lattice.
  const touchVoltageMap: GalerkinSamplePoint[] = [];
  const stepVoltageMap: GalerkinSamplePoint[] = [];
  for (const x of linspace(minX, maxX, MAP_POINTS)) {
    for (const y of linspace(minY, maxY, MAP_POINTS)) {
      const here = potential(x, y);
      touchVoltageMap.push({ x, y, value: Number((gpr - here).toFixed(3)) });
      stepVoltageMap.push({
        x,
        y,
        value: Number(
          Math.max(
            Math.abs(here - potential(x + STEP_DISTANCE, y)),
            Math.abs(here - potential(x, y + STEP_DISTANCE)),
          ).toFixed(3),
        ),
      });
    }
  }

  // Surface potential along the grid diagonal.
  const voltageProfile = linspace(0, 1, MAP_POINTS).map((t) => {
    const x = minX + t * (maxX - minX);
    const y = minY + t * (maxY - minY);
    return { x, y, value: Number(potential(x, y).toFixed(3)) };
  });

  // Surge impedance needs a mesh count between 4 and 64.
  const xLines = distinctCount(
    input.horizontalSegments.filter((s) => s.x1 === s.x2).map((s) => s.x1),
  );
  const yLines = distinctCount(
    input.horizontalSegments.filter((s) => s.y1 === s.y2).map((s) => s.y1),
  );
  const meshCount = Math.max(0, xLines - 1) * Math.max(0, yLines - 1);

  let surgeImpedance: number | null = null;
  try {
    meshFactor(meshCount);
    const meanLength =
      input.horizontalSegments.reduce(
        (sum, s) => sum + Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1),
        0,
      ) / input.horizontalSegments.length;
    surgeImpedance = computeSurgeImpedance({
      gridResistance: solution.gridResistance,
      soilResistivity: input.soilResistivity,
      meshCount,
      meanSegmentLength: meanLength,
      conductorRadius: input.conductorRadius,
    });
  } catch {
    surgeImpedance = null;
  }

  return {
    gridResistance: solution.gridResistance,
    gpr,
    touchVoltage,
    stepVoltage,
    safe: touchVoltage <= permissible.touch && stepVoltage <= permissible.step,
    samples: { touchVoltageMap, stepVoltageMap, voltageProfile },
    details: {
      segmentCount: solution.counts.horizontal,
      rodCount: solution.counts.rods,
      wellCount: solution.counts.wells,
      surgeImpedance,
      meshCount,
    },
  };
}
