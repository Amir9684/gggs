import type { Geometry, LineString, Point, Position } from 'geojson';

import type { GridGeometrySummary } from './types';

/**
 * Minimal shape this module needs from a `GridElement` — kept decoupled
 * from the TypeORM entity so this stays a pure function of plain data.
 */
export interface GridElementLike {
  type: number;
  geometry: Geometry;
  properties: Record<string, any> | null | undefined;
}

/** Mirrors `GridElementType` from `src/grids/enum`, duplicated here so the engine has zero dependency on the grids module. */
const GRID_ELEMENT_TYPE = {
  CONDUCTOR: 0,
  ROD: 1,
} as const;

const DEFAULT_CONDUCTOR_DIAMETER_M = 0.01; // 10 mm, a typical bare copper grounding conductor — used only if no element specifies one.
const PARALLEL_ANGLE_TOLERANCE_DEG = 5; // conductors within this many degrees of an axis are treated as running along that axis.

function distance(a: Position, b: Position): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function lineLength(line: Position[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += distance(line[i - 1], line[i]);
  }
  return total;
}

/** Angle of a line's overall direction, in degrees, normalized to [0, 180). */
function lineAngleDeg(line: Position[]): number {
  const [x0, y0] = line[0];
  const [x1, y1] = line[line.length - 1];
  const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  return ((angle % 180) + 180) % 180;
}

function isCloseToAngle(angleDeg: number, targetDeg: number): boolean {
  const diff = Math.abs(angleDeg - targetDeg);
  return (
    diff <= PARALLEL_ANGLE_TOLERANCE_DEG ||
    diff >= 180 - PARALLEL_ANGLE_TOLERANCE_DEG
  );
}

/**
 * Groups parallel conductors running along one axis by their perpendicular
 * offset, then returns the average spacing between adjacent groups.
 * Returns 0 if fewer than two distinct positions are found (caller should
 * fall back to a sane default in that case).
 */
function averageAxisSpacing(
  conductors: Position[][],
  axis: 'length' | 'width',
): number {
  if (conductors.length < 2) return 0;

  // For a conductor running along the length (x) axis, its perpendicular
  // offset is its average y; for one running along width (y), it's the
  // average x.
  const offsets = conductors
    .map((line) => {
      const coords =
        axis === 'length' ? line.map((p) => p[1]) : line.map((p) => p[0]);
      return coords.reduce((sum, v) => sum + v, 0) / coords.length;
    })
    .sort((a, b) => a - b);

  const gaps: number[] = [];
  for (let i = 1; i < offsets.length; i++) {
    const gap = offsets[i] - offsets[i - 1];
    if (gap > 1e-6) gaps.push(gap); // ignore near-duplicate/overlapping lines
  }

  if (gaps.length === 0) return 0;
  return gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
}

/**
 * Builds a `GridGeometrySummary` from a grid's stored dimensions plus its
 * drawn `GridElement`s.
 *
 * Known simplification: spacing is the *average* gap between parallel
 * conductors detected along each axis, not a true per-cell spacing — see
 * `GridGeometrySummary.averageSpacing` doc. This matches IEEE 80's own
 * formulas, which assume a uniformly-spaced mesh; a grid drawn with very
 * irregular spacing will get a representative average rather than an
 * exact per-mesh figure.
 */
export function extractGridGeometry(
  grid: { length: number; width: number; burialDepth: number },
  elements: GridElementLike[],
): GridGeometrySummary {
  const conductorElements = elements.filter(
    (e) =>
      e.type === GRID_ELEMENT_TYPE.CONDUCTOR &&
      e.geometry.type === 'LineString',
  );
  const rodElements = elements.filter(
    (e) => e.type === GRID_ELEMENT_TYPE.ROD && e.geometry.type === 'Point',
  );

  const conductorLines = conductorElements.map(
    (e) => (e.geometry as LineString).coordinates,
  );

  const totalConductorLength = conductorLines.reduce(
    (sum, line) => sum + lineLength(line),
    0,
  );

  const diameters = conductorElements
    .map((e) => Number(e.properties?.diameter))
    .filter((d) => Number.isFinite(d) && d > 0);
  const conductorDiameter =
    diameters.length > 0
      ? diameters.reduce((sum, d) => sum + d, 0) / diameters.length
      : DEFAULT_CONDUCTOR_DIAMETER_M;

  // Classify each conductor as running along the length axis (~0°/180°)
  // or the width axis (~90°), by comparing its direction angle to the
  // grid's own length/width axes (assumed axis-aligned: length along x,
  // width along y — true for the vast majority of substation grids,
  // which are drawn as rectangles aligned to the plan).
  const alongLength: Position[][] = [];
  const alongWidth: Position[][] = [];
  for (const line of conductorLines) {
    const angle = lineAngleDeg(line);
    if (isCloseToAngle(angle, 0)) {
      alongLength.push(line);
    } else if (isCloseToAngle(angle, 90)) {
      alongWidth.push(line);
    }
    // Conductors at other angles (diagonal bracing, etc.) are counted in
    // totalConductorLength but not classified into either axis count.
  }

  const spacingLength = averageAxisSpacing(alongLength, 'length');
  const spacingWidth = averageAxisSpacing(alongWidth, 'width');
  const spacingSamples = [spacingLength, spacingWidth].filter((s) => s > 0);
  const averageSpacing =
    spacingSamples.length > 0
      ? spacingSamples.reduce((sum, s) => sum + s, 0) / spacingSamples.length
      : Math.sqrt(grid.length * grid.width || 1) / 10; // fallback: a rough 10x10 mesh guess if no conductors are classified.

  const totalRodLength = rodElements.reduce((sum, e) => {
    const rodLength = Number(e.properties?.length);
    return sum + (Number.isFinite(rodLength) && rodLength > 0 ? rodLength : 0);
  }, 0);

  const perimeterToleranceM = Math.min(grid.length, grid.width) * 0.05;
  const hasPerimeterRods = rodElements.some((e) => {
    const [x, y] = (e.geometry as Point).coordinates;
    return (
      x <= perimeterToleranceM ||
      y <= perimeterToleranceM ||
      x >= grid.length - perimeterToleranceM ||
      y >= grid.width - perimeterToleranceM
    );
  });

  return {
    area: grid.length * grid.width,
    length: grid.length,
    width: grid.width,
    burialDepth: grid.burialDepth,
    totalConductorLength,
    conductorDiameter,
    conductorCountAlongLength: alongLength.length,
    conductorCountAlongWidth: alongWidth.length,
    averageSpacing,
    rodCount: rodElements.length,
    totalRodLength,
    hasPerimeterRods,
  };
}
