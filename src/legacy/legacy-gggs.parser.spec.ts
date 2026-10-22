/* eslint-disable @typescript-eslint/no-unsafe-assignment -- fixtures assert on loosely typed geometry */
import type { Geometry, Position } from 'geojson';

import { ConductorMaterial } from '../calculations/enum';
import {
  LegacyGgggsError,
  RECORD_SIZE,
  conductorsFromNodes,
  parseLegacyGggs,
} from './legacy-gggs.parser';

/**
 * A writer that does what VB6 does for `Open f For Random As #1` +
 * `Put #1, , value`: one zero-padded 128-byte record per value. The
 * fixtures below follow the save routines of the Windows forms
 * (Graph195n / Graph295n `SAVEMENU_Click`, Graph3 `Saveitem`), so these
 * tests check the parser against the documented layout — they do not
 * replace trying it on a real file from the Windows program.
 */
class VbRandomWriter {
  private readonly records: Buffer[] = [];

  private record(bytes: Buffer): this {
    const record = Buffer.alloc(RECORD_SIZE);
    bytes.copy(record);
    this.records.push(record);
    return this;
  }

  single(value: number): this {
    const bytes = Buffer.alloc(4);
    bytes.writeFloatLE(value);
    return this.record(bytes);
  }

  integer(value: number): this {
    const bytes = Buffer.alloc(2);
    bytes.writeInt16LE(value);
    return this.record(bytes);
  }

  boolean(value: boolean): this {
    return this.integer(value ? -1 : 0);
  }

  string(value: string): this {
    const text = Buffer.from(value, 'latin1');
    const bytes = Buffer.alloc(2 + text.length);
    bytes.writeUInt16LE(text.length);
    text.copy(bytes, 2);
    return this.record(bytes);
  }

  pair(x: number, y: number): this {
    return this.single(x).single(y);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.records);
  }
}

type Pt = [number, number];

interface FullFileOptions {
  nodes: Pt[];
  rods?: Pt[];
  wells?: Pt[];
  nodeCapacity?: number;
  rodCapacity?: number;
  conductorName?: string;
  durationFlags?: [string, string, string, string];
  twoDepth?: { nodes: Pt[]; capacity?: number };
}

const padTo = (points: Pt[], size: number): Pt[] => [
  ...points,
  ...Array.from({ length: size - points.length }, (): Pt => [0, 0]),
];

function fullFile(options: FullFileOptions): Buffer {
  const nodeCapacity = options.nodeCapacity ?? 30;
  const rodCapacity = options.rodCapacity ?? 10;
  const wellCapacity = 20;
  const nodes = padTo(options.nodes, nodeCapacity);
  const rods = padTo(options.rods ?? [], rodCapacity);
  const wells = padTo(options.wells ?? [], wellCapacity);
  const flags = options.durationFlags ?? ['False', 'False', 'False', 'True'];

  const w = new VbRandomWriter();
  // soil, fault, conductor input form (A1..A11)
  w.single(150) //   ro
    .single(2500) // ros
    .single(0.1) //  hs
    .single(3180) // ief
    .single(0.5) //  ts
    .single(48.2) // conar
    .single(70) //   cona
    .single(1) // Etch50
    .single(2) // Estp50
    .single(3) // Etch70
    .single(4); // Estp70
  flags.forEach((flag) => w.string(flag)); // tf(0..3)
  w.string('Conductor').string('True').string('x').string('y'); // A16..A19
  w.single(5000); // form height
  w.string(options.conductorName ?? 'Standard Annealed Soft Copper Wire ');
  w.single(40); // ta
  w.boolean(options.twoDepth !== undefined);
  w.integer(0); // Gph3

  // UBound(Xnode2), Xnode, Ynode, XRod, Ynode2, HoleX — in file order
  w.integer(nodeCapacity)
    .integer(nodeCapacity)
    .integer(nodeCapacity)
    .integer(rodCapacity)
    .integer(nodeCapacity)
    .integer(wellCapacity);
  w.integer(nodeCapacity).integer(rodCapacity); // Ttd, TRod
  w.integer(options.nodes.length).integer((options.rods ?? []).length); // NodNum, RodNum
  w.integer(options.nodes.length).integer(options.nodes.length); // Xnum, Ynum

  nodes.forEach(() => w.pair(0, 0)); // Xnode2 / Ynode2 (previous state)
  nodes.forEach(([x, y]) => w.pair(x, y)); // Xnode / Ynode
  nodes.forEach(([x, y]) => w.pair(x, y)); // XYnode
  rods.forEach(([x, y]) => w.pair(x, y));
  wells.forEach(([x, y]) => w.pair(x, y));

  if (options.twoDepth) {
    const t2 = padTo(options.twoDepth.nodes, options.twoDepth.capacity ?? 12);
    w.integer(t2.length).integer(t2.length); // UBound(XnodeT2), YnodeT2
    w.integer(options.nodes.length).integer(options.nodes.length); // Gph1, Gph2
    nodes.forEach(() => w.single(0)); // Xnode2
    nodes.forEach(() => w.single(0)); // Ynode2
    w.boolean(true).boolean(false); // Gph6, Gph7
    t2.forEach(([x]) => w.single(x));
    t2.forEach(([, y]) => w.single(y));
    w.boolean(false).boolean(false); // Gph8, Gph9
    nodes.forEach(([x]) => w.single(x));
    nodes.forEach(([, y]) => w.single(y));
    w.integer(options.nodes.length); // Gph4
    t2.forEach(([x]) => w.single(x));
    t2.forEach(([, y]) => w.single(y));
    w.integer(options.twoDepth.nodes.length); // Gph5
  }

  return w.toBuffer();
}

function gridOnlyFile(options: {
  nodes: Pt[];
  rods?: Pt[];
  wells?: Pt[];
  nodeCapacity?: number;
  rodCapacity?: number;
  segment?: string;
}): Buffer {
  const nodeCapacity = options.nodeCapacity ?? 16;
  const rodCapacity = options.rodCapacity ?? 6;
  const nodes = padTo(options.nodes, nodeCapacity);
  const rods = padTo(options.rods ?? [], rodCapacity);
  const wells = padTo(options.wells ?? [], 20);

  const w = new VbRandomWriter();
  w.integer(nodeCapacity)
    .integer(rodCapacity)
    .string(options.segment ?? '2.5')
    .integer(options.nodes.length)
    .integer((options.rods ?? []).length)
    .integer(options.nodes.length)
    .integer(options.nodes.length);
  nodes.forEach(() => w.pair(0, 0));
  nodes.forEach(([x, y]) => w.pair(x, y));
  nodes.forEach(([x, y]) => w.pair(x, y));
  rods.forEach(([x, y]) => w.pair(x, y));
  wells.forEach(([x, y]) => w.pair(x, y));
  return w.toBuffer();
}

/** A 3 x 3 node grid, 10 m apart, drawn from (1, 1) like the Windows canvas. */
const square: Pt[] = [];
for (const y of [1, 11, 21]) {
  for (const x of [1, 11, 21]) square.push([x, y]);
}

const lengthOf = (line: Position[]) =>
  Math.hypot(line[1][0] - line[0][0], line[1][1] - line[0][1]);

/** The vertices of a conductor; fails the test if it is not a line. */
const lineOf = (geometry: Geometry): Position[] => {
  if (geometry.type !== 'LineString') {
    throw new Error(`Expected a LineString, got ${geometry.type}`);
  }
  return geometry.coordinates;
};

describe('parseLegacyGggs — full format', () => {
  const result = parseLegacyGggs(
    fullFile({
      nodes: square,
      rods: [
        [1, 1],
        [21, 21],
      ],
      wells: [[11, 11]],
    }),
  );

  it('reads the input-form values', () => {
    expect(result.format).toBe('full');
    expect(result.soil).toEqual({
      resistivity: 150,
      surfaceLayerResistivity: 2500,
      surfaceLayerThickness: expect.closeTo(0.1, 5),
    });
    expect(result.fault).toEqual({
      faultCurrent: 3180,
      shockDuration: 0.5,
      faultDuration: 0.5,
    });
    expect(result.conductor).toEqual({
      name: 'Standard Annealed Soft Copper Wire',
      material: ConductorMaterial.COPPER_ANNEALED_SOFT_DRAWN,
      ambientTemperature: 40,
      crossSectionMm2: 70,
    });
  });

  it('builds one conductor per row and per column of nodes', () => {
    const conductors = result.elements.filter((e) => e.type === 0);
    expect(conductors).toHaveLength(6);
    for (const conductor of conductors) {
      expect(conductor.geometry.type).toBe('LineString');
      expect(lengthOf(lineOf(conductor.geometry))).toBeCloseTo(20, 6);
    }
  });

  it('moves the layout so its lower-left corner is (0, 0)', () => {
    expect(result.grid.length).toBe(20);
    expect(result.grid.width).toBe(20);

    const points = result.elements.flatMap((e) =>
      e.geometry.type === 'Point'
        ? [e.geometry.coordinates]
        : e.geometry.coordinates,
    );
    expect(Math.min(...points.map((p) => p[0]))).toBe(0);
    expect(Math.min(...points.map((p) => p[1]))).toBe(0);
  });

  it('imports rods and wells at the shifted positions', () => {
    const rods = result.elements.filter((e) => e.type === 1);
    const wells = result.elements.filter((e) => e.type === 2);
    expect(rods.map((r) => r.geometry.coordinates)).toEqual([
      [0, 0],
      [20, 20],
    ]);
    expect(wells.map((w) => w.geometry.coordinates)).toEqual([[10, 10]]);
    expect(result.grid).toMatchObject({
      nodeCount: 9,
      conductorCount: 6,
      rodCount: 2,
      wellCount: 1,
    });
  });

  it('warns about what the file cannot tell', () => {
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { code: 'RODS_WITHOUT_LENGTH' },
        { code: 'WELLS_WITHOUT_DEPTH' },
        { code: 'BURIAL_DEPTH_MISSING' },
      ]),
    );
  });
});

describe('parseLegacyGggs — details', () => {
  it('maps the selected fault-duration option button', () => {
    const pick = (flags: [string, string, string, string]) =>
      parseLegacyGggs(fullFile({ nodes: square, durationFlags: flags })).fault
        ?.faultDuration;

    expect(pick(['True', 'False', 'False', 'False'])).toBe(0.008);
    expect(pick(['False', 'True', 'False', 'False'])).toBe(0.1);
    expect(pick(['False', 'False', 'True', 'False'])).toBe(0.25);
    expect(pick(['False', 'False', 'False', 'True'])).toBe(0.5);
    expect(pick(['False', 'False', 'False', 'False'])).toBeNull();
  });

  it('keeps an unknown conductor name and warns', () => {
    const result = parseLegacyGggs(
      fullFile({ nodes: square, conductorName: 'Mystery wire' }),
    );
    expect(result.conductor?.material).toBeNull();
    expect(result.conductor?.name).toBe('Mystery wire');
    expect(result.warnings).toContainEqual({
      code: 'UNKNOWN_MATERIAL',
      name: 'Mystery wire',
    });
  });

  it('joins nodes of an L-shaped grid with one conductor per row and column', () => {
    const lShape: Pt[] = [
      [1, 1],
      [11, 1],
      [21, 1],
      [1, 11],
      [11, 11],
      [1, 21],
    ];
    const result = parseLegacyGggs(fullFile({ nodes: lShape }));
    const spans = result.elements
      .filter((e) => e.type === 0)
      .map((e) => lengthOf(lineOf(e.geometry)))
      .sort((a, b) => a - b);
    // rows: 20, 10 (y = 1, 11); columns: 20, 10 (x = 1, 11)
    expect(spans).toEqual([10, 10, 20, 20]);
    expect(result.grid.length).toBe(20);
    expect(result.grid.width).toBe(20);
  });

  it('ignores empty (0, 0) slots and repeated nodes', () => {
    const result = parseLegacyGggs(
      fullFile({ nodes: [...square, [11, 11], [11, 11]], nodeCapacity: 40 }),
    );
    expect(result.grid.nodeCount).toBe(9);
  });
});

describe('parseLegacyGggs — two depths', () => {
  it('imports the main grid and reports the second one', () => {
    const result = parseLegacyGggs(
      fullFile({
        nodes: square,
        twoDepth: {
          nodes: [
            [1, 1],
            [21, 1],
            [1, 21],
            [21, 21],
          ],
        },
      }),
    );
    expect(result.format).toBe('full-two-depth');
    expect(result.secondDepthNodeCount).toBe(4);
    expect(result.grid.nodeCount).toBe(9);
    expect(result.warnings).toContainEqual({
      code: 'SECOND_DEPTH_IGNORED',
      nodeCount: 4,
    });
  });
});

describe('parseLegacyGggs — grid only', () => {
  it('reads the grid layout and the segment length', () => {
    const result = parseLegacyGggs(
      gridOnlyFile({ nodes: square, rods: [[1, 1]], segment: '2.5' }),
    );
    expect(result.format).toBe('grid-only');
    expect(result.soil).toBeNull();
    expect(result.fault).toBeNull();
    expect(result.conductor).toBeNull();
    expect(result.segmentLengthM).toBe(2.5);
    expect(result.warnings).toContainEqual({ code: 'GRID_ONLY_FILE' });
    expect(result.grid).toMatchObject({
      length: 20,
      width: 20,
      conductorCount: 6,
      rodCount: 1,
    });
  });
});

describe('parseLegacyGggs — bad files', () => {
  const code = (buffer: Buffer) => {
    try {
      parseLegacyGggs(buffer);
    } catch (error) {
      return error instanceof LegacyGgggsError ? error.code : 'other';
    }
    return 'none';
  };

  it('rejects an empty file', () => {
    expect(code(Buffer.alloc(0))).toBe('EMPTY');
  });

  it('rejects arbitrary bytes', () => {
    expect(code(Buffer.from('this is not a gggs file at all'))).toBe(
      'UNKNOWN_FORMAT',
    );
    expect(code(Buffer.alloc(5000, 0xff))).toBe('UNKNOWN_FORMAT');
  });

  it('rejects a truncated file', () => {
    const file = fullFile({ nodes: square });
    expect(code(file.subarray(0, file.length - 3 * RECORD_SIZE))).toBe(
      'UNKNOWN_FORMAT',
    );
  });

  it('rejects a file with extra records after the data', () => {
    const file = fullFile({ nodes: square });
    expect(code(Buffer.concat([file, Buffer.alloc(RECORD_SIZE)]))).toBe(
      'UNKNOWN_FORMAT',
    );
  });

  it('rejects a file without any nodes or rods', () => {
    expect(code(fullFile({ nodes: [] }))).toBe('NO_GEOMETRY');
  });

  it('rejects a grid whose nodes all lie on one line', () => {
    expect(
      code(
        fullFile({
          nodes: [
            [1, 1],
            [11, 1],
            [21, 1],
          ],
        }),
      ),
    ).toBe('INVALID_GEOMETRY');
  });
});

describe('conductorsFromNodes', () => {
  it('skips rows and columns with a single node', () => {
    expect(conductorsFromNodes([{ x: 1, y: 1 }])).toEqual([]);
  });
});
