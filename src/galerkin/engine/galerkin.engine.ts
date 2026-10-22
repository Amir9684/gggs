import {
  GAUSS_NODES,
  GAUSS_WEIGHTS,
  collinearIntegral,
  parallelIntegral,
  straightElementTerm,
  verticalPairTerm,
  wellRodTerm,
} from './galerkin-kernels';
import { solveRealSystem } from './real-linear-system';

/**
 * A horizontal conductor segment, parallel to the X or the Y axis.
 * Coordinates are in metres; `depth` is the burial depth (positive down).
 * The Windows solver cuts conductors into segments of a chosen length
 * (`LenSeg`) before solving; that cutting happens before this engine.
 */
export interface HorizontalSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;
}

export interface VerticalPosition {
  x: number;
  y: number;
}

export interface GalerkinRods {
  positions: readonly VerticalPosition[];
  /** Rod length (m). */
  length: number;
  /** Rod radius (m). */
  radius: number;
}

export interface GalerkinWells {
  positions: readonly VerticalPosition[];
  /** Well length (m). */
  length: number;
  /** Well diameter (m). */
  diameter: number;
  /** Hole factor Kro. */
  kro: number;
}

export interface GalerkinInput {
  /** Uniform soil resistivity (ohm·m). */
  soilResistivity: number;
  /** Horizontal conductor radius a (m). */
  conductorRadius: number;
  /** Current injected into the grid, IG (A). */
  groundCurrent: number;
  horizontalSegments: readonly HorizontalSegment[];
  rods?: GalerkinRods;
  wells?: GalerkinWells;
  /**
   * Burial depth of the rod and well tops, hh1 (m). Defaults to the depth
   * of the first horizontal segment.
   */
  topDepth?: number;
}

type Direction = 'X' | 'Y';

interface HorizontalElement {
  direction: Direction;
  /** Segment ends, shortened by the conductor radius (see `buildHorizontals`). */
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  /** Nominal length, before the shortening. */
  length: number;
  /** Elevation z (negative below ground). */
  z: number;
}

export interface GalerkinSolution {
  /** Ground potential rise, V (Windows `GPR`). */
  gpr: number;
  /** Grid resistance, GPR / IG (ohm). */
  gridResistance: number;
  /** Leakage current of each element: horizontals, then rods, then wells (A). */
  currents: number[];
  /** Number of horizontal segments, rods and wells, in `currents` order. */
  counts: { horizontal: number; rods: number; wells: number };
  /** The input, kept for surface potential evaluation. */
  input: GalerkinInput;
  /** @internal */
  horizontals: HorizontalElement[];
  /** @internal */
  topDepth: number;
}

const COINCIDENT = 1e-9;

function requirePositive(value: number, name: string): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new Error(`${name} must be a positive number.`);
  }
}

/**
 * Normalises the segments the way the Windows code does: each segment's
 * two ends are pulled in by the conductor radius along its own axis
 * ("rafhe ebham", it removes the log singularity of the self term).
 */
function buildHorizontals(input: GalerkinInput): HorizontalElement[] {
  const a = input.conductorRadius;

  return input.horizontalSegments.map((segment, index) => {
    requirePositive(segment.depth, `Segment ${index + 1} depth`);

    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const alongX = Math.abs(dy) < COINCIDENT && Math.abs(dx) > COINCIDENT;
    const alongY = Math.abs(dx) < COINCIDENT && Math.abs(dy) > COINCIDENT;
    if (!alongX && !alongY) {
      throw new Error(
        `Segment ${index + 1} must be parallel to the X or the Y axis and have a length.`,
      );
    }

    const length = alongX ? Math.abs(dx) : Math.abs(dy);
    if (length <= 2 * a) {
      throw new Error(
        `Segment ${index + 1} is shorter than twice the conductor radius.`,
      );
    }

    const [x1, x2] =
      segment.x1 <= segment.x2
        ? [segment.x1, segment.x2]
        : [segment.x2, segment.x1];
    const [y1, y2] =
      segment.y1 <= segment.y2
        ? [segment.y1, segment.y2]
        : [segment.y2, segment.y1];

    return alongX
      ? {
          direction: 'X',
          x1: x1 + a,
          x2: x2 - a,
          y1,
          y2,
          length,
          z: -segment.depth,
        }
      : {
          direction: 'Y',
          x1,
          x2,
          y1: y1 + a,
          y2: y2 - a,
          length,
          z: -segment.depth,
        };
  });
}

/** Mutual term of two horizontal segments, i before j (Windows `Res(i, j)`). */
function horizontalMutual(
  rho: number,
  i: HorizontalElement,
  j: HorizontalElement,
): number {
  const factor = rho / (4 * Math.PI * j.length * i.length);

  if (i.direction === 'Y' && j.direction === 'Y') {
    const zr = Math.hypot(i.x1 - j.x1, i.z - j.z);
    // The Windows image distance also carries (zi − zj)² through `zr`; it
    // only differs from the exact image distance for segments at two
    // different depths. Kept as is for parity.
    const zpr = Math.sqrt(zr * zr + (-i.z - j.z) ** 2);

    const direct =
      Math.abs(i.x1 - j.x1) < COINCIDENT && Math.abs(i.z - j.z) < COINCIDENT
        ? collinearIntegral(
            factor,
            j.y2 - i.y2,
            j.y2 - i.y1,
            j.y1 - i.y2,
            j.y1 - i.y1,
          )
        : parallelIntegral(
            factor,
            zr,
            j.y2 - i.y2,
            j.y2 - i.y1,
            j.y1 - i.y2,
            j.y1 - i.y1,
          );
    const image = parallelIntegral(
      factor,
      zpr,
      j.y2 - i.y2,
      j.y2 - i.y1,
      j.y1 - i.y2,
      j.y1 - i.y1,
    );
    return direct + image;
  }

  if (i.direction === 'X' && j.direction === 'X') {
    const zr = Math.hypot(i.y1 - j.y1, i.z - j.z);
    const zpr = Math.sqrt(zr * zr + (-i.z - j.z) ** 2);

    const direct =
      Math.abs(i.y1 - j.y1) < COINCIDENT && Math.abs(i.z - j.z) < COINCIDENT
        ? collinearIntegral(
            factor,
            j.x2 - i.x2,
            j.x2 - i.x1,
            j.x1 - i.x2,
            j.x1 - i.x1,
          )
        : parallelIntegral(
            factor,
            zr,
            j.x2 - i.x2,
            j.x2 - i.x1,
            j.x1 - i.x2,
            j.x1 - i.x1,
          );
    const image = parallelIntegral(
      factor,
      zpr,
      j.x2 - i.x2,
      j.x2 - i.x1,
      j.x1 - i.x2,
      j.x1 - i.x1,
    );
    return direct + image;
  }

  // Perpendicular segments: 10-point Gauss quadrature along j.
  let sum = 0;
  if (i.direction === 'X') {
    const centre = (j.y1 + j.y2) / 2;
    for (let k = 0; k < GAUSS_NODES.length; k += 1) {
      const mp = centre + (GAUSS_NODES[k] * j.length) / 2;
      const direct2 =
        Math.hypot(i.x2 - j.x1, i.y2 - mp, i.z - j.z) + (i.x2 - j.x1);
      const direct1 =
        Math.hypot(i.x1 - j.x1, i.y1 - mp, i.z - j.z) + (i.x1 - j.x1);
      const image2 =
        Math.hypot(i.x2 - j.x1, i.y2 - mp, -i.z - j.z) + (i.x2 - j.x1);
      const image1 =
        Math.hypot(i.x1 - j.x1, i.y1 - mp, -i.z - j.z) + (i.x1 - j.x1);
      sum +=
        0.5 *
        j.length *
        GAUSS_WEIGHTS[k] *
        Math.log((direct2 * image2) / (direct1 * image1));
    }
  } else {
    const centre = (j.x1 + j.x2) / 2;
    for (let k = 0; k < GAUSS_NODES.length; k += 1) {
      const np = centre + (GAUSS_NODES[k] * j.length) / 2;
      const direct2 =
        Math.hypot(i.y2 - j.y1, i.x2 - np, i.z - j.z) + (i.y2 - j.y1);
      const direct1 =
        Math.hypot(i.y1 - j.y1, i.x1 - np, i.z - j.z) + (i.y1 - j.y1);
      const image2 =
        Math.hypot(i.y2 - j.y1, i.x2 - np, -i.z - j.z) + (i.y2 - j.y1);
      const image1 =
        Math.hypot(i.y1 - j.y1, i.x1 - np, -i.z - j.z) + (i.y1 - j.y1);
      sum +=
        0.5 *
        j.length *
        GAUSS_WEIGHTS[k] *
        Math.log((direct2 * image2) / (direct1 * image1));
    }
  }
  return factor * sum;
}

/** Mutual term of a horizontal segment and a vertical element of length `length` at (x, y). */
function horizontalVerticalMutual(
  rho: number,
  i: HorizontalElement,
  x: number,
  y: number,
  length: number,
  topDepth: number,
): number {
  const factor = rho / (4 * Math.PI * i.length * length);
  const zp = -length - 2 * topDepth;

  let sum = 0;
  for (let k = 0; k < GAUSS_NODES.length; k += 1) {
    const p = (GAUSS_NODES[k] * length + zp) / 2;
    let direct2: number;
    let direct1: number;
    let image2: number;
    let image1: number;
    if (i.direction === 'Y') {
      direct2 = Math.hypot(i.x2 - x, i.y2 - y, i.z - p) + (i.y2 - y);
      direct1 = Math.hypot(i.x1 - x, i.y1 - y, i.z - p) + (i.y1 - y);
      image2 = Math.hypot(i.x2 - x, i.y2 - y, -i.z - p) + (i.y2 - y);
      image1 = Math.hypot(i.x1 - x, i.y1 - y, -i.z - p) + (i.y1 - y);
    } else {
      direct2 = Math.hypot(i.y2 - y, i.x2 - x, i.z - p) + (i.x2 - x);
      direct1 = Math.hypot(i.y1 - y, i.x1 - x, i.z - p) + (i.x1 - x);
      image2 = Math.hypot(i.y2 - y, i.x2 - x, -i.z - p) + (i.x2 - x);
      image1 = Math.hypot(i.y1 - y, i.x1 - x, -i.z - p) + (i.x1 - x);
    }
    sum +=
      0.5 *
      length *
      GAUSS_WEIGHTS[k] *
      Math.log((direct2 * image2) / (direct1 * image1));
  }
  return factor * sum;
}

function assertDistinctPositions(
  positions: readonly VerticalPosition[],
  label: string,
): void {
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      if (
        Math.hypot(
          positions[i].x - positions[j].x,
          positions[i].y - positions[j].y,
        ) < COINCIDENT
      ) {
        throw new Error(`Two ${label} share the same position.`);
      }
    }
  }
}

/**
 * Solves the grid for the leakage current of every element and the
 * ground potential rise (Windows `khandnewn.frm`, `okbutton_Click`).
 *
 * The matrix R is symmetric with R(i, j) the potential at element i per
 * unit leakage current of element j. All elements sit at the same
 * potential V and the leakage currents add up to IG, so
 *   R · x = 1,   V = IG / sum(x),   I = V · x,   Rg = V / IG.
 * The Windows code solves the same equations after eliminating the first
 * element and inverting the reduced matrix.
 */
export function solveGalerkin(input: GalerkinInput): GalerkinSolution {
  requirePositive(input.soilResistivity, 'Soil resistivity');
  requirePositive(input.conductorRadius, 'Conductor radius');
  requirePositive(input.groundCurrent, 'Ground current');
  if (input.horizontalSegments.length === 0) {
    throw new Error('At least one horizontal segment is required.');
  }

  const rho = input.soilResistivity;
  const a = input.conductorRadius;
  const horizontals = buildHorizontals(input);
  const topDepth = input.topDepth ?? input.horizontalSegments[0].depth;
  requirePositive(topDepth, 'Top depth');

  const rods =
    input.rods && input.rods.positions.length > 0 ? input.rods : undefined;
  const wells =
    input.wells && input.wells.positions.length > 0 ? input.wells : undefined;
  if (rods) {
    requirePositive(rods.length, 'Rod length');
    requirePositive(rods.radius, 'Rod radius');
    assertDistinctPositions(rods.positions, 'rods');
  }
  if (wells) {
    requirePositive(wells.length, 'Well length');
    requirePositive(wells.diameter, 'Well diameter');
    requirePositive(wells.kro, 'Kro');
    assertDistinctPositions(wells.positions, 'wells');
    // Wells reuse the rod radius in their self term.
    if (!rods) {
      throw new Error(
        'Wells need the rod radius: define rods (or a rod radius) as well.',
      );
    }
  }

  const nh = horizontals.length;
  const nr = rods ? rods.positions.length : 0;
  const nw = wells ? wells.positions.length : 0;
  const size = nh + nr + nw;
  const matrix: number[][] = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  );

  // Horizontal segments: self and mutual terms.
  for (let i = 0; i < nh; i += 1) {
    const element = horizontals[i];
    const factor = rho / (4 * Math.PI * element.length ** 2);
    const imageRadius = Math.sqrt(4 * element.z ** 2 + a * a);
    matrix[i][i] =
      straightElementTerm(factor, element.length, a) +
      straightElementTerm(factor, element.length, imageRadius);

    for (let j = i + 1; j < nh; j += 1) {
      const value = horizontalMutual(rho, element, horizontals[j]);
      matrix[i][j] = value;
      matrix[j][i] = value;
    }
  }

  // Rods.
  if (rods) {
    const rodFactor = rho / (4 * Math.PI * rods.length ** 2);
    for (let r = 0; r < nr; r += 1) {
      const i = nh + r;
      matrix[i][i] =
        straightElementTerm(rodFactor, rods.length, rods.radius) +
        rodFactor *
          rods.radius *
          (fxImage((2 * rods.length + 2 * topDepth) / rods.radius) -
            2 * fxImage((2 * topDepth + rods.length) / rods.radius) +
            fxImage((2 * topDepth) / rods.radius));

      for (let s = r + 1; s < nr; s += 1) {
        const distance = Math.hypot(
          rods.positions[r].x - rods.positions[s].x,
          rods.positions[r].y - rods.positions[s].y,
        );
        const value = verticalPairTerm(
          rodFactor,
          distance,
          rods.length,
          topDepth,
        );
        matrix[i][nh + s] = value;
        matrix[nh + s][i] = value;
      }
    }

    // Horizontal - rod.
    for (let i = 0; i < nh; i += 1) {
      for (let r = 0; r < nr; r += 1) {
        const value = horizontalVerticalMutual(
          rho,
          horizontals[i],
          rods.positions[r].x,
          rods.positions[r].y,
          rods.length,
          topDepth,
        );
        matrix[i][nh + r] = value;
        matrix[nh + r][i] = value;
      }
    }
  }

  // Wells.
  if (wells && rods) {
    const wellFactor = (wells.kro * rho) / (2 * Math.PI ** 2 * wells.diameter);
    for (let w = 0; w < nw; w += 1) {
      const i = nh + nr + w;
      matrix[i][i] =
        wellFactor *
        (Math.log((8 * wells.diameter) / rods.radius) +
          Math.log((2 * wells.diameter) / wells.length));

      // Well - well. The Windows code reuses the well self factor here
      // (it has no 1/L² normalisation, unlike the rod factor).
      for (let v = w + 1; v < nw; v += 1) {
        const distance = Math.hypot(
          wells.positions[w].x - wells.positions[v].x,
          wells.positions[w].y - wells.positions[v].y,
        );
        const value = verticalPairTerm(
          wellFactor,
          distance,
          wells.length,
          topDepth,
        );
        matrix[i][nh + nr + v] = value;
        matrix[nh + nr + v][i] = value;
      }

      // Well - rod.
      for (let r = 0; r < nr; r += 1) {
        const distance = Math.hypot(
          wells.positions[w].x - rods.positions[r].x,
          wells.positions[w].y - rods.positions[r].y,
        );
        const value = wellRodTerm(
          rho / (4 * Math.PI * wells.length * rods.length),
          distance,
          wells.length,
          rods.length,
          topDepth,
        );
        matrix[i][nh + r] = value;
        matrix[nh + r][i] = value;
      }
    }

    // Horizontal - well.
    for (let i = 0; i < nh; i += 1) {
      for (let w = 0; w < nw; w += 1) {
        const value = horizontalVerticalMutual(
          rho,
          horizontals[i],
          wells.positions[w].x,
          wells.positions[w].y,
          wells.length,
          topDepth,
        );
        matrix[i][nh + nr + w] = value;
        matrix[nh + nr + w][i] = value;
      }
    }
  }

  for (const row of matrix) {
    for (const value of row) {
      if (!Number.isFinite(value)) {
        throw new Error(
          'The impedance matrix has a non-finite entry; check the geometry for coincident elements.',
        );
      }
    }
  }

  const unit = solveRealSystem(matrix, new Array<number>(size).fill(1));
  const total = unit.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) {
    throw new Error(
      'The grid current sums to zero or less; the system is ill-conditioned.',
    );
  }

  const gpr = input.groundCurrent / total;
  return {
    gpr,
    gridResistance: gpr / input.groundCurrent,
    currents: unit.map((value) => value * gpr),
    counts: { horizontal: nh, rods: nr, wells: nw },
    input,
    horizontals,
    topDepth,
  };
}

/** fx used by the rod image terms; same function, named apart for readability. */
function fxImage(x: number): number {
  return x * Math.asinh(x) - Math.sqrt(1 + x * x);
}

/**
 * Potential (V) at the earth surface point (x, y), z = 0 by default
 * (Windows `fnfp3`): the sum of the potentials of all line sources with
 * the free-surface image, ρ·I / (2π·L) · ln((r2 + d2) / (r1 + d1)).
 */
export function computeSurfacePotential(
  solution: GalerkinSolution,
  x: number,
  y: number,
  z = 0,
): number {
  const { input, horizontals, counts, currents, topDepth } = solution;
  const rho = input.soilResistivity;
  let potential = 0;

  for (let i = 0; i < counts.horizontal; i += 1) {
    const element = horizontals[i];
    const scale = (rho * currents[i]) / (2 * Math.PI * element.length);
    if (element.direction === 'Y') {
      const far = Math.hypot(element.y2 - y, element.x2 - x, element.z - z);
      const near = Math.hypot(element.y1 - y, element.x1 - x, element.z - z);
      potential +=
        scale * Math.log((far + (element.y2 - y)) / (near + (element.y1 - y)));
    } else {
      const far = Math.hypot(element.x2 - x, element.y2 - y, element.z - z);
      const near = Math.hypot(element.x1 - x, element.y1 - y, element.z - z);
      potential +=
        scale * Math.log((far + (element.x2 - x)) / (near + (element.x1 - x)));
    }
  }

  const verticals: Array<{
    positions: readonly VerticalPosition[];
    length: number;
    offset: number;
  }> = [];
  if (input.rods && counts.rods > 0) {
    verticals.push({
      positions: input.rods.positions,
      length: input.rods.length,
      offset: counts.horizontal,
    });
  }
  if (input.wells && counts.wells > 0) {
    verticals.push({
      positions: input.wells.positions,
      length: input.wells.length,
      offset: counts.horizontal + counts.rods,
    });
  }

  for (const group of verticals) {
    group.positions.forEach((position, index) => {
      const scale =
        (rho * currents[group.offset + index]) / (2 * Math.PI * group.length);
      if (
        Math.abs(position.x - x) < COINCIDENT &&
        Math.abs(position.y - y) < COINCIDENT
      ) {
        potential += scale * Math.log(group.length / topDepth + 1);
        return;
      }
      const zTop = -topDepth - input.conductorRadius;
      const zBottom = -topDepth - group.length;
      const bottom = Math.hypot(zBottom - z, position.x - x, position.y - y);
      const top = Math.hypot(zTop - z, position.x - x, position.y - y);
      potential +=
        scale * Math.log((top + (zTop - z)) / (bottom + (zBottom - z)));
    });
  }

  return potential;
}
