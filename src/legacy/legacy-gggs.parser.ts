import { ConductorMaterial } from '../calculations/enum';
import { CONDUCTOR_MATERIALS } from '../calculations/engine/conductor-material.catalog';

/**
 * Reader for the binary `.gggs` files written by the Windows GGGS
 * (Visual Basic 6) program.
 *
 * ## File format
 *
 * The Windows program saves with `Open file For Random As #1` and no
 * `Len =`, so the file is a sequence of **128-byte records** and every
 * `Put #1, , value` writes one record:
 *
 *  - Single   → 4 bytes, IEEE-754 float, little-endian
 *  - Integer  → 2 bytes, signed, little-endian
 *  - Boolean  → 2 bytes, 0 or -1
 *  - String   → 2-byte length, then that many ANSI characters
 *
 * the rest of the record is padding. There are no field names or version
 * numbers, so the layout below is read straight from the save routines
 * (`SAVEMENU_Click` in Graph195n/Graph295n, `Saveitem` in Graph3):
 *
 *  - **full** (`Graph195n`, `Graph295n`): the input-data form (soil, fault
 *    current, conductor) followed by the node / rod / well arrays.
 *  - **full, two depths** (`Graph295n` with `TwoDepth`): the same, plus a
 *    second node set for the deeper grid.
 *  - **grid only** (`Graph3`): just the grid — capacity counters, segment
 *    length and the arrays. Array sizes are not stored there; they are the
 *    fixed `ReDim`s of that form (nodes: `Ttd`, rods: `TRod`, wells: 20).
 *
 * Because nothing identifies the variant, it is detected by checking that
 * the sizes read from the header add up to exactly the length of the file.
 *
 * ## Geometry
 *
 * A node is a point the user clicked on the grid (coordinates are whole
 * metres; `0` marks an empty slot). The program derives conductors from
 * the nodes in `Okbtn_Click`: all nodes with the same Y are joined by one
 * straight conductor from the smallest to the largest X, and all nodes
 * with the same X by one from the smallest to the largest Y. This reader
 * does the same.
 */

const RECORD_SIZE = 128;

/** Capacity of the well (`HoleX`) array in the grid-only form. */
const GRID_ONLY_WELL_CAPACITY = 20;

/** The Windows fault-duration choices, in the order of the `tf(0..3)` option buttons. */
const FAULT_DURATIONS_S = [0.008, 0.1, 0.25, 0.5] as const;

/** Sanity limit for any array size read from the file. */
const MAX_ARRAY_SIZE = 5000;

type LegacyErrorCode =
  | 'EMPTY'
  | 'UNKNOWN_FORMAT'
  | 'NO_GEOMETRY'
  | 'INVALID_GEOMETRY';

class LegacyGgggsError extends Error {
  constructor(
    readonly code: LegacyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LegacyGgggsError';
  }
}

type LegacyFormat = 'full' | 'full-two-depth' | 'grid-only';

/**
 * Things the file cannot tell, or that were left out. Reported as codes
 * (not sentences) so each client can show them in its own language.
 */
type LegacyWarning =
  | { code: 'RODS_WITHOUT_LENGTH' }
  | { code: 'WELLS_WITHOUT_DEPTH' }
  | { code: 'GRID_ONLY_FILE' }
  | { code: 'BURIAL_DEPTH_MISSING' }
  | { code: 'SECOND_DEPTH_IGNORED'; nodeCount: number }
  | { code: 'UNKNOWN_MATERIAL'; name: string };

interface LegacyPoint {
  x: number;
  y: number;
}

interface LegacyElement {
  /** Mirrors `GridElementType`: 0 conductor, 1 rod, 2 well. */
  type: 0 | 1 | 2;
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

interface LegacyGgggsImport {
  format: LegacyFormat;

  /** Soil inputs of the Windows input form (full formats only). */
  soil: {
    resistivity: number;
    surfaceLayerResistivity: number;
    surfaceLayerThickness: number;
  } | null;

  /** Fault inputs of the Windows input form (full formats only). */
  fault: {
    faultCurrent: number;
    shockDuration: number;
    /** One of the four Windows choices; `null` if the file does not say. */
    faultDuration: number | null;
  } | null;

  /** Conductor choice of the Windows input form (full formats only). */
  conductor: {
    name: string;
    /** The matching catalog material, `null` for an unknown name. */
    material: ConductorMaterial | null;
    ambientTemperature: number;
    crossSectionMm2: number;
  } | null;

  /** Segment length of the Galerkin grid form (grid-only format). */
  segmentLengthM: number | null;

  grid: {
    /** Plan extents (m), after moving the layout's lower-left corner to (0, 0). */
    length: number;
    width: number;
    nodeCount: number;
    conductorCount: number;
    rodCount: number;
    wellCount: number;
  };

  elements: LegacyElement[];

  /** Number of nodes of the second-depth grid, which is not imported. */
  secondDepthNodeCount: number;

  warnings: LegacyWarning[];
}

/** Sequential reader over the 128-byte records. */
class RecordReader {
  private position = 0;

  constructor(private readonly buffer: Buffer) {}

  get recordsRead(): number {
    return this.position / RECORD_SIZE;
  }

  get recordsLeft(): number {
    return Math.max(
      0,
      Math.ceil((this.buffer.length - this.position) / RECORD_SIZE),
    );
  }

  private take(bytes: number): number {
    const offset = this.position;
    if (offset + bytes > this.buffer.length) {
      throw new LegacyGgggsError(
        'UNKNOWN_FORMAT',
        'The file ends before the expected data.',
      );
    }
    this.position += RECORD_SIZE;
    return offset;
  }

  single(): number {
    return this.buffer.readFloatLE(this.take(4));
  }

  integer(): number {
    return this.buffer.readInt16LE(this.take(2));
  }

  boolean(): boolean {
    return this.integer() !== 0;
  }

  string(): string {
    const offset = this.take(2);
    const length = this.buffer.readUInt16LE(offset);
    if (length > RECORD_SIZE - 2 || offset + 2 + length > this.buffer.length) {
      throw new LegacyGgggsError(
        'UNKNOWN_FORMAT',
        'A text field has an impossible length.',
      );
    }
    return this.buffer.toString('latin1', offset + 2, offset + 2 + length);
  }

  singles(count: number): number[] {
    return Array.from({ length: count }, () => this.single());
  }

  integers(count: number): number[] {
    return Array.from({ length: count }, () => this.integer());
  }
}

function pairs(reader: RecordReader, count: number): LegacyPoint[] {
  return Array.from({ length: count }, () => {
    const x = reader.single();
    const y = reader.single();
    return { x, y };
  });
}

function checkSize(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_ARRAY_SIZE) {
    throw new LegacyGgggsError(
      'UNKNOWN_FORMAT',
      `Array size ${value} is out of range.`,
    );
  }
  return value;
}

function isUsed(point: LegacyPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x !== 0 &&
    point.y !== 0
  );
}

function distinct(points: LegacyPoint[]): LegacyPoint[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x}|${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface RawGrid {
  nodes: LegacyPoint[];
  rods: LegacyPoint[];
  wells: LegacyPoint[];
}

/** Sizes from the full format's header, in the order the file stores them. */
function readFullHeader(reader: RecordReader) {
  const soil = {
    resistivity: reader.single(), //             A1  ro
    surfaceLayerResistivity: reader.single(), // A2  ros
    surfaceLayerThickness: reader.single(), //   A3  hs
  };
  const faultCurrent = reader.single(); //       A4  ief
  const shockDuration = reader.single(); //      A5  ts
  reader.single(); //                            A6  conar (minimum conductor area)
  const crossSectionMm2 = reader.single(); //    A7  cona
  reader.singles(4); //                          A8-A11 permissible voltages
  const durationFlags = [
    reader.string(), // A12 tf(0)
    reader.string(), // A13 tf(1)
    reader.string(), // A14 tf(2)
    reader.string(), // A15 tf(3)
  ];
  reader.string(); //                            A16 label caption
  reader.string(); //                            A17 frame visibility
  reader.string(); //                            A18 label caption
  reader.string(); //                            A19 label caption
  reader.single(); //                            A20 form height
  const conductorName = reader.string(); //      A21
  const ambientTemperature = reader.single(); // A22
  const twoDepth = reader.boolean(); //          TwoDepthA
  reader.integer(); //                           Gph3

  return {
    soil,
    faultCurrent,
    shockDuration,
    crossSectionMm2,
    durationFlags,
    conductorName,
    ambientTemperature,
    twoDepth,
  };
}

function parseFull(buffer: Buffer): {
  header: ReturnType<typeof readFullHeader>;
  raw: RawGrid;
  secondDepthNodeCount: number;
  trailingRecords: number;
} {
  const reader = new RecordReader(buffer);
  const header = readFullHeader(reader);

  // The file stores the sizes in this order: Xnode2, Xnode, Ynode, XRod,
  // Ynode2, HoleX (the save routine writes UboundA6 before UboundA5).
  const sizeNodes2 = checkSize(reader.integer());
  const sizeNodes = checkSize(reader.integer());
  checkSize(reader.integer()); // UBound(Ynode), equal to Xnode's
  const sizeRods = checkSize(reader.integer());
  checkSize(reader.integer()); // UBound(Ynode2)
  const sizeWells = checkSize(reader.integer());
  reader.integers(6); // Ttd, TRod, NodNum, RodNum, Xnum, Ynum

  pairs(reader, sizeNodes2); // Xnode2/Ynode2: the previous drawing state
  const nodes = pairs(reader, sizeNodes);
  pairs(reader, sizeNodes); // XYnode: a copy of the nodes
  const rods = pairs(reader, sizeRods);
  const wells = pairs(reader, sizeWells);

  let secondDepthNodeCount = 0;
  if (header.twoDepth) {
    const sizeT2x = checkSize(reader.integer());
    const sizeT2y = checkSize(reader.integer());
    reader.integers(2); // Gph1, Gph2
    reader.singles(sizeNodes2); // Xnode2
    reader.singles(sizeNodes2); // Ynode2
    reader.boolean(); // Gph6
    reader.boolean(); // Gph7
    const t2x = reader.singles(sizeT2x);
    const t2y = reader.singles(sizeT2y);
    secondDepthNodeCount = distinct(
      t2x.map((x, i) => ({ x, y: t2y[i] ?? 0 })),
    ).filter(isUsed).length;
    reader.boolean(); // Gph8
    reader.boolean(); // Gph9
    reader.singles(sizeNodes); // Xnode
    reader.singles(sizeNodes); // Ynode
    reader.integer(); // Gph4
    reader.singles(sizeT2x); // XYnodeT2(i, 1)
    reader.singles(sizeT2x); // XYnodeT2(i, 2)
    reader.integer(); // Gph5
  }

  return {
    header,
    raw: { nodes, rods, wells },
    secondDepthNodeCount,
    trailingRecords: reader.recordsLeft,
  };
}

function parseGridOnly(buffer: Buffer): {
  raw: RawGrid;
  segmentLengthM: number | null;
  trailingRecords: number;
} {
  const reader = new RecordReader(buffer);
  const nodeCapacity = checkSize(reader.integer()); // Ttd
  const rodCapacity = checkSize(reader.integer()); // TRod
  const segmentText = reader.string(); //              LenSeg
  reader.integers(4); // NodNum, RodNum, Xnum, Ynum

  pairs(reader, nodeCapacity); // Xnode2/Ynode2
  const nodes = pairs(reader, nodeCapacity);
  pairs(reader, nodeCapacity); // XYnode
  const rods = pairs(reader, rodCapacity);
  const wells = pairs(reader, GRID_ONLY_WELL_CAPACITY);

  const segment = Number(segmentText.trim());
  return {
    raw: { nodes, rods, wells },
    segmentLengthM: Number.isFinite(segment) && segment > 0 ? segment : null,
    trailingRecords: reader.recordsLeft,
  };
}

/**
 * Parses the file as the full variant, or returns `null` if it does not
 * fit exactly: every record must be accounted for and the header values
 * must be real numbers. The exact-size rule is what tells the variants
 * apart, so a grid-only file can never be mistaken for a full one.
 */
function tryParseFull(buffer: Buffer): ReturnType<typeof parseFull> | null {
  try {
    const parsed = parseFull(buffer);
    const { soil, faultCurrent, shockDuration } = parsed.header;
    const plausible = [
      soil.resistivity,
      soil.surfaceLayerResistivity,
      soil.surfaceLayerThickness,
      faultCurrent,
      shockDuration,
    ].every(Number.isFinite);
    return plausible && parsed.trailingRecords === 0 ? parsed : null;
  } catch (error) {
    if (error instanceof LegacyGgggsError && error.code === 'UNKNOWN_FORMAT') {
      return null;
    }
    throw error;
  }
}

function matchMaterial(name: string): ConductorMaterial | null {
  const wanted = name.trim().toLowerCase();
  return (
    CONDUCTOR_MATERIALS.find(
      (material) => material.name.trim().toLowerCase() === wanted,
    )?.id ?? null
  );
}

function selectedFaultDuration(flags: string[]): number | null {
  const chosen = flags
    .map((flag, index) => ({ flag: flag.trim().toLowerCase(), index }))
    .filter(({ flag }) => flag === 'true' || flag === '-1' || flag === '1');
  return chosen.length === 1 ? FAULT_DURATIONS_S[chosen[0].index] : null;
}

/**
 * Some VB6 versions save the IEEE-2000 calculation form rather than a grid.
 * That variant has the same A1..A22 header as the graph format, then stores
 * calculation-form values and a short "Safe" status string; it has no node,
 * rod, or well arrays. Do not let those values be interpreted as array sizes.
 */
function isIeee2000CalculationFile(buffer: Buffer): boolean {
  const record = (index: number) => index * RECORD_SIZE;
  const readString = (index: number): string | null => {
    const offset = record(index);
    if (offset + 2 > buffer.length) return null;

    const length = buffer.readUInt16LE(offset);
    if (length > RECORD_SIZE - 2 || offset + 2 + length > buffer.length) {
      return null;
    }
    return buffer.toString('latin1', offset + 2, offset + 2 + length);
  };

  // VB6 writes the final variable-length string without padding the file to
  // the next 128-byte boundary, so inspect the record containing the last byte.
  const footerRecord = Math.floor((buffer.length - 1) / RECORD_SIZE);
  const footerOffset = record(footerRecord);
  const footer = readString(footerRecord);
  if (footer !== 'Safe' && footer !== 'Not Safe') return false;

  const label17 = readString(17)?.trim().toLowerCase();
  const label18 = readString(18)?.trim().toLowerCase();
  const conductor = readString(20);

  if (
    label17 !== 'permissible conductor size' ||
    label18 !== 'cross sectional area of grid conductors' ||
    !conductor
  ) {
    return false;
  }

  // Confirm the electrical input header is numeric before classifying it.
  for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 19, 21]) {
    const offset = record(index);
    if (
      offset + 4 > buffer.length ||
      !Number.isFinite(buffer.readFloatLE(offset))
    ) {
      return false;
    }
  }

  return footerOffset < buffer.length && footerRecord >= 22;
}

/** Conductors from nodes, the way `Okbtn_Click` builds them. */
function conductorsFromNodes(nodes: LegacyPoint[]): LegacyPoint[][] {
  const lines: LegacyPoint[][] = [];

  const byY = new Map<number, number[]>();
  const byX = new Map<number, number[]>();
  for (const { x, y } of nodes) {
    byY.set(y, [...(byY.get(y) ?? []), x]);
    byX.set(x, [...(byX.get(x) ?? []), y]);
  }

  for (const [y, xs] of [...byY].sort((a, b) => a[0] - b[0])) {
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    if (min !== max) {
      lines.push([
        { x: min, y },
        { x: max, y },
      ]);
    }
  }
  for (const [x, ys] of [...byX].sort((a, b) => a[0] - b[0])) {
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    if (min !== max) {
      lines.push([
        { x, y: min },
        { x, y: max },
      ]);
    }
  }
  return lines;
}

function buildImport(
  format: LegacyFormat,
  raw: RawGrid,
  warnings: LegacyWarning[],
): Pick<LegacyGgggsImport, 'grid' | 'elements'> {
  const nodes = distinct(raw.nodes.filter(isUsed));
  const rods = distinct(raw.rods.filter(isUsed));
  const wells = distinct(raw.wells.filter(isUsed));

  if (nodes.length === 0 && rods.length === 0) {
    throw new LegacyGgggsError(
      'NO_GEOMETRY',
      'The file contains no grid nodes or rods.',
    );
  }

  const lines = conductorsFromNodes(nodes);

  // The Windows layout starts at 1, not 0. Move the lower-left corner of
  // everything that was drawn to (0, 0) so it sits inside the web grid.
  const all = [...nodes, ...rods, ...wells];
  const originX = Math.min(...all.map((p) => p.x));
  const originY = Math.min(...all.map((p) => p.y));
  const shift = (p: LegacyPoint): [number, number] => [
    p.x - originX,
    p.y - originY,
  ];

  const elements: LegacyElement[] = [
    ...lines.map(
      (line): LegacyElement => ({
        type: 0,
        geometry: { type: 'LineString', coordinates: line.map(shift) },
        properties: {},
      }),
    ),
    ...rods.map(
      (rod): LegacyElement => ({
        type: 1,
        geometry: { type: 'Point', coordinates: shift(rod) },
        properties: {},
      }),
    ),
    ...wells.map(
      (well): LegacyElement => ({
        type: 2,
        geometry: { type: 'Point', coordinates: shift(well) },
        properties: {},
      }),
    ),
  ];

  const extentPoints = (nodes.length > 0 ? nodes : all).map(shift);
  const length = Math.max(...extentPoints.map(([x]) => x));
  const width = Math.max(...extentPoints.map(([, y]) => y));

  if (!(length > 0) || !(width > 0)) {
    throw new LegacyGgggsError(
      'INVALID_GEOMETRY',
      'The grid has no area (all nodes lie on one line).',
    );
  }

  if (rods.length > 0) {
    warnings.push({ code: 'RODS_WITHOUT_LENGTH' });
  }
  if (wells.length > 0) {
    warnings.push({ code: 'WELLS_WITHOUT_DEPTH' });
  }
  if (format === 'grid-only') {
    warnings.push({ code: 'GRID_ONLY_FILE' });
  }
  warnings.push({ code: 'BURIAL_DEPTH_MISSING' });

  return {
    grid: {
      length,
      width,
      nodeCount: nodes.length,
      conductorCount: lines.length,
      rodCount: rods.length,
      wellCount: wells.length,
    },
    elements,
  };
}

function parseLegacyGggs(buffer: Buffer): LegacyGgggsImport {
  if (buffer.length === 0) {
    throw new LegacyGgggsError('EMPTY', 'The file is empty.');
  }

  if (isIeee2000CalculationFile(buffer)) {
    throw new LegacyGgggsError(
      'NO_GEOMETRY',
      'This file contains IEEE-2000 calculation inputs, but no saved grid layout. Save the layout from the Windows graph/grid form and import that .gggs file instead.',
    );
  }

  const warnings: LegacyWarning[] = [];
  const records = Math.ceil(buffer.length / RECORD_SIZE);

  const full = tryParseFull(buffer);

  if (full) {
    const { header, raw, secondDepthNodeCount } = full;

    if (secondDepthNodeCount > 0) {
      warnings.push({
        code: 'SECOND_DEPTH_IGNORED',
        nodeCount: secondDepthNodeCount,
      });
    }

    const built = buildImport(
      header.twoDepth ? 'full-two-depth' : 'full',
      raw,
      warnings,
    );

    const material = matchMaterial(header.conductorName);
    const faultDuration = selectedFaultDuration(header.durationFlags);
    if (header.conductorName.trim() !== '' && material === null) {
      warnings.push({
        code: 'UNKNOWN_MATERIAL',
        name: header.conductorName.trim(),
      });
    }

    return {
      format: header.twoDepth ? 'full-two-depth' : 'full',
      soil: {
        resistivity: header.soil.resistivity,
        surfaceLayerResistivity: header.soil.surfaceLayerResistivity,
        surfaceLayerThickness: header.soil.surfaceLayerThickness,
      },
      fault: {
        faultCurrent: header.faultCurrent,
        shockDuration: header.shockDuration,
        faultDuration,
      },
      conductor: {
        name: header.conductorName.trim(),
        material,
        ambientTemperature: header.ambientTemperature,
        crossSectionMm2: header.crossSectionMm2,
      },
      segmentLengthM: null,
      secondDepthNodeCount,
      warnings,
      ...built,
    };
  }

  // Grid-only variant: size is fully determined by its two counters.
  try {
    const { raw, segmentLengthM, trailingRecords } = parseGridOnly(buffer);
    const nodeCapacity = buffer.readInt16LE(0);
    const rodCapacity = buffer.readInt16LE(RECORD_SIZE);
    const expected =
      7 + 6 * nodeCapacity + 2 * rodCapacity + 2 * GRID_ONLY_WELL_CAPACITY;
    if (records !== expected || trailingRecords !== 0) {
      throw new LegacyGgggsError('UNKNOWN_FORMAT', 'Size mismatch.');
    }

    const built = buildImport('grid-only', raw, warnings);
    return {
      format: 'grid-only',
      soil: null,
      fault: null,
      conductor: null,
      segmentLengthM,
      secondDepthNodeCount: 0,
      warnings,
      ...built,
    };
  } catch (error) {
    if (error instanceof LegacyGgggsError && error.code !== 'UNKNOWN_FORMAT') {
      throw error;
    }
    throw new LegacyGgggsError(
      'UNKNOWN_FORMAT',
      'This is not a GGGS data file the importer recognises.',
    );
  }
}

export {
  RECORD_SIZE,
  FAULT_DURATIONS_S,
  LegacyGgggsError,
  parseLegacyGggs,
  conductorsFromNodes,
};
export type {
  LegacyElement,
  LegacyErrorCode,
  LegacyFormat,
  LegacyGgggsImport,
  LegacyPoint,
  LegacyWarning,
};
