import type { Geometry } from 'geojson';

import type { GridElementLike } from './grid-geometry.extractor';

/**
 * Parametric grid generator — the web counterpart of the Windows GGGS
 * `Autoform` tool: given the plan dimensions, the number of conductor lines
 * in each direction and a rod arrangement, it lays out a regular rectangular
 * (or square) grid as `GridElement`-shaped data.
 *
 * Coordinates are metres in the grid's local plane, x along the length and
 * y along the width, origin at one corner — the convention
 * `extractGridGeometry` expects.
 *
 * Only rectangular grids are generated. The Windows forms also offer an
 * L-shaped grid; the web engine has no L-shape area / `nc` handling yet, so
 * generating one would give wrong results.
 */

export type RodArrangement = 'NONE' | 'CORNERS' | 'PERIMETER' | 'INTERIOR';

export interface GridGeneratorParams {
  /** Grid length along x (m). */
  length: number;
  /** Grid width along y (m). */
  width: number;
  /** Burial depth, h (m). Not part of the elements; returned for convenience. */
  burialDepth: number;
  /** Conductor diameter (m). */
  conductorDiameter: number;
  /**
   * Number of conductor lines in each direction (>= 2). `alongLength` lines
   * run parallel to the length axis (Windows `nll`), `alongWidth` lines run
   * parallel to the width axis (Windows `nlw`).
   */
  lineCounts: { alongLength: number; alongWidth: number };
  rods: {
    arrangement: RodArrangement;
    /** Number of rods; ignored for `NONE` (0) and `CORNERS` (4). */
    count: number;
    /** Length of one rod (m). */
    length: number;
  };
}

export interface GeneratedGridElement extends GridElementLike {
  type: number;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface GeneratedGrid {
  elements: GeneratedGridElement[];
  summary: {
    conductorCount: number;
    rodCount: number;
    /** Gap between neighbouring lines parallel to the length axis (m). */
    spacingAlongLength: number;
    /** Gap between neighbouring lines parallel to the width axis (m). */
    spacingAlongWidth: number;
    totalConductorLength: number;
    totalRodLength: number;
  };
}

/**
 * Generated elements carry the same `properties` the grid editor writes
 * (`material` + `crossSectionMm2` for conductors, `lengthM` + `diameterMm`
 * for rods), so they open in the editor's properties panel unchanged and
 * `extractGridGeometry` reads them like any drawn element.
 */
const CONDUCTOR_MATERIAL = 'COPPER_ANNEALED_SOFT_DRAWN';
const ROD_DIAMETER_MM = 16;

/** Cross-section (mm2) of a round conductor of the given diameter (m). */
const crossSectionMm2 = (diameterM: number): number =>
  (Math.PI * (diameterM * 1000) ** 2) / 4;

/** Mirrors `GridElementType` (src/grids/enum), duplicated to keep the engine standalone. */
const ELEMENT_TYPE = { CONDUCTOR: 0, ROD: 1 } as const;

export const MAX_LINES_PER_DIRECTION = 200;

/**
 * Line counts for a target spacing: the nearest whole number of equal gaps
 * that fits the dimension (at least two lines, so the actual spacing can
 * differ slightly from the requested one).
 */
export function lineCountsFromSpacing(
  length: number,
  width: number,
  spacing: number,
): { alongLength: number; alongWidth: number } {
  if (!(spacing > 0)) {
    throw new Error('Conductor spacing must be positive.');
  }
  return {
    // lines parallel to the length axis are spread across the width
    alongLength: Math.max(2, Math.round(width / spacing) + 1),
    // lines parallel to the width axis are spread across the length
    alongWidth: Math.max(2, Math.round(length / spacing) + 1),
  };
}

/** `count` indices spread as evenly as possible over `0..total-1`. */
function evenlySpread(total: number, count: number): number[] {
  return Array.from({ length: count }, (_, k) =>
    Math.min(total - 1, Math.floor(((k + 0.5) * total) / count)),
  );
}

type Node = { x: number; y: number };

export function generateRectangularGrid(
  params: GridGeneratorParams,
): GeneratedGrid {
  const { length, width, conductorDiameter, lineCounts, rods } = params;
  const { alongLength, alongWidth } = lineCounts;

  if (!(length > 0) || !(width > 0)) {
    throw new Error('Grid length and width must be positive.');
  }
  if (!(conductorDiameter > 0)) {
    throw new Error('Conductor diameter must be positive.');
  }
  if (
    !Number.isInteger(alongLength) ||
    !Number.isInteger(alongWidth) ||
    alongLength < 2 ||
    alongWidth < 2
  ) {
    throw new Error('Each direction needs at least two whole conductor lines.');
  }
  if (
    alongLength > MAX_LINES_PER_DIRECTION ||
    alongWidth > MAX_LINES_PER_DIRECTION
  ) {
    throw new Error(
      `At most ${MAX_LINES_PER_DIRECTION} conductor lines per direction are supported.`,
    );
  }

  // y positions of the lines parallel to the length axis, x positions of
  // the lines parallel to the width axis
  const ys = Array.from(
    { length: alongLength },
    (_, j) => (j * width) / (alongLength - 1),
  );
  const xs = Array.from(
    { length: alongWidth },
    (_, i) => (i * length) / (alongWidth - 1),
  );

  const conductorProperties = {
    material: CONDUCTOR_MATERIAL,
    crossSectionMm2: crossSectionMm2(conductorDiameter),
  };
  const elements: GeneratedGridElement[] = [];

  for (const y of ys) {
    elements.push({
      type: ELEMENT_TYPE.CONDUCTOR,
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, y],
          [length, y],
        ],
      },
      properties: conductorProperties,
    });
  }
  for (const x of xs) {
    elements.push({
      type: ELEMENT_TYPE.CONDUCTOR,
      geometry: {
        type: 'LineString',
        coordinates: [
          [x, 0],
          [x, width],
        ],
      },
      properties: conductorProperties,
    });
  }

  const rodNodes = pickRodNodes(xs, ys, rods);
  for (const node of rodNodes) {
    elements.push({
      type: ELEMENT_TYPE.ROD,
      geometry: { type: 'Point', coordinates: [node.x, node.y] },
      properties: { lengthM: rods.length, diameterMm: ROD_DIAMETER_MM },
    });
  }

  return {
    elements,
    summary: {
      conductorCount: alongLength + alongWidth,
      rodCount: rodNodes.length,
      spacingAlongLength: width / (alongLength - 1),
      spacingAlongWidth: length / (alongWidth - 1),
      totalConductorLength: alongLength * length + alongWidth * width,
      totalRodLength: rodNodes.length * (rods.length > 0 ? rods.length : 0),
    },
  };
}

function pickRodNodes(
  xs: number[],
  ys: number[],
  rods: GridGeneratorParams['rods'],
): Node[] {
  if (rods.arrangement === 'NONE') {
    return [];
  }
  if (!(rods.length > 0)) {
    throw new Error('Rod length must be positive.');
  }

  const lastX = xs.length - 1;
  const lastY = ys.length - 1;
  const corners: Node[] = [
    { x: xs[0], y: ys[0] },
    { x: xs[lastX], y: ys[0] },
    { x: xs[lastX], y: ys[lastY] },
    { x: xs[0], y: ys[lastY] },
  ];

  if (rods.arrangement === 'CORNERS') {
    return corners;
  }

  if (!Number.isInteger(rods.count) || rods.count < 1) {
    throw new Error('The rod count must be a positive whole number.');
  }

  if (rods.arrangement === 'PERIMETER') {
    // Perimeter nodes that are not corners, walked around the grid.
    const edgeNodes: Node[] = [];
    for (let i = 1; i < lastX; i += 1) edgeNodes.push({ x: xs[i], y: ys[0] });
    for (let j = 1; j < lastY; j += 1)
      edgeNodes.push({ x: xs[lastX], y: ys[j] });
    for (let i = lastX - 1; i >= 1; i -= 1)
      edgeNodes.push({ x: xs[i], y: ys[lastY] });
    for (let j = lastY - 1; j >= 1; j -= 1)
      edgeNodes.push({ x: xs[0], y: ys[j] });

    const capacity = 4 + edgeNodes.length;
    if (rods.count > capacity) {
      throw new Error(
        `The grid has only ${capacity} perimeter nodes for ${rods.count} rods.`,
      );
    }
    if (rods.count <= 4) {
      return corners.slice(0, rods.count);
    }
    return [
      ...corners,
      ...evenlySpread(edgeNodes.length, rods.count - 4).map(
        (index) => edgeNodes[index],
      ),
    ];
  }

  // INTERIOR: nodes that are not on the perimeter, spread evenly.
  const interior: Node[] = [];
  for (let j = 1; j < lastY; j += 1) {
    for (let i = 1; i < lastX; i += 1) interior.push({ x: xs[i], y: ys[j] });
  }
  if (rods.count > interior.length) {
    throw new Error(
      `The grid has only ${interior.length} interior nodes for ${rods.count} rods.`,
    );
  }
  return evenlySpread(interior.length, rods.count).map(
    (index) => interior[index],
  );
}
