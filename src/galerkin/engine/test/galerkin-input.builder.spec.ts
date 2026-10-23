import { DEFAULT_GALERKIN_SETTINGS } from '../../galerkin-settings';
import {
  GalerkinInputError,
  MAX_GALERKIN_SEGMENTS,
  buildGalerkinInput,
  type GalerkinElementLike,
} from '../galerkin-input.builder';

const conductor = (
  coordinates: number[][],
  properties = {},
): GalerkinElementLike => ({
  type: 0,
  geometry: { type: 'LineString', coordinates },
  properties,
});

const point = (
  type: number,
  x: number,
  y: number,
  properties = {},
): GalerkinElementLike => ({
  type,
  geometry: { type: 'Point', coordinates: [x, y] },
  properties,
});

/** lines x lines grid of 70 m conductors. */
function gridElements(lines: number): GalerkinElementLike[] {
  const elements: GalerkinElementLike[] = [];
  for (let i = 0; i < lines; i += 1) {
    const offset = (70 / (lines - 1)) * i;
    elements.push(
      conductor([
        [0, offset],
        [70, offset],
      ]),
    );
    elements.push(
      conductor([
        [offset, 0],
        [offset, 70],
      ]),
    );
  }
  return elements;
}

function build(
  elements: GalerkinElementLike[],
  settings = DEFAULT_GALERKIN_SETTINGS,
) {
  return buildGalerkinInput({
    elements,
    burialDepth: 0.5,
    conductorRadius: 0.005,
    soilResistivity: 400,
    groundCurrent: 1000,
    settings,
  });
}

describe('buildGalerkinInput', () => {
  it('cuts each conductor into segments of about the segment length', () => {
    const { input, summary } = build(gridElements(11));

    // 22 conductors of 70 m, 14 segments of 5 m each.
    expect(summary).toEqual({
      conductorCount: 22,
      segmentCount: 308,
      rodCount: 0,
      wellCount: 0,
    });
    expect(input.horizontalSegments).toHaveLength(308);
    expect(input.horizontalSegments[0]).toEqual({
      x1: 0,
      y1: 0,
      x2: 5,
      y2: 0,
      depth: 0.5,
    });
    expect(input.soilResistivity).toBe(400);
    expect(input.groundCurrent).toBe(1000);
    expect(input.topDepth).toBe(0.5);
  });

  it('follows every vertex of a polyline', () => {
    const { input } = build(
      [
        conductor([
          [0, 0],
          [10, 0],
          [10, 10],
        ]),
      ],
      {
        ...DEFAULT_GALERKIN_SETTINGS,
        segmentLength: 5,
      },
    );

    expect(input.horizontalSegments).toHaveLength(4);
    expect(input.horizontalSegments[2]).toEqual({
      x1: 10,
      y1: 0,
      x2: 10,
      y2: 5,
      depth: 0.5,
    });
  });

  it('snaps a conductor that is only slightly off an axis', () => {
    const { input } = build([
      conductor([
        [0, 0],
        [20, 0.1],
      ]),
    ]);

    expect(
      input.horizontalSegments.every((s) => s.y1 === 0 && s.y2 === 0),
    ).toBe(true);
  });

  it('rejects a diagonal conductor with a clear message', () => {
    expect(() =>
      build([
        conductor([
          [0, 0],
          [10, 10],
        ]),
      ]),
    ).toThrow(GalerkinInputError);
  });

  it('uses a conductor depth property over the burial depth', () => {
    const { input } = build([
      conductor(
        [
          [0, 0],
          [10, 0],
        ],
        { depth: 1.2 },
      ),
      conductor([
        [0, 5],
        [10, 5],
      ]),
    ]);

    expect(input.horizontalSegments[0].depth).toBe(1.2);
    expect(
      input.horizontalSegments[input.horizontalSegments.length - 1].depth,
    ).toBe(0.5);
  });

  it('needs at least one conductor and stays under the segment limit', () => {
    expect(() => build([point(1, 0, 0, { lengthM: 3 })])).toThrow(
      GalerkinInputError,
    );

    const many = Array.from({ length: 30 }, (_, i) =>
      conductor([
        [0, i],
        [3000, i],
      ]),
    );
    expect(() =>
      build(many, { ...DEFAULT_GALERKIN_SETTINGS, segmentLength: 1 }),
    ).toThrow(new RegExp(String(MAX_GALERKIN_SEGMENTS)));
  });

  it('collects rods with their length and the settings radius', () => {
    const { input, summary } = build([
      ...gridElements(3),
      point(1, 0, 0, { lengthM: 3 }),
      point(1, 70, 70, { length: 3 }),
    ]);

    expect(summary.rodCount).toBe(2);
    expect(input.rods).toEqual({
      positions: [
        { x: 0, y: 0 },
        { x: 70, y: 70 },
      ],
      length: 3,
      radius: DEFAULT_GALERKIN_SETTINGS.rodRadius,
    });
  });

  it('rejects rods of different lengths and rods without a length', () => {
    expect(() =>
      build([
        ...gridElements(3),
        point(1, 0, 0, { lengthM: 3 }),
        point(1, 70, 0, { lengthM: 4 }),
      ]),
    ).toThrow(GalerkinInputError);
    expect(() => build([...gridElements(3), point(1, 0, 0)])).toThrow(
      GalerkinInputError,
    );
  });

  it('collects wells with the well settings, with or without rods', () => {
    const { input, summary } = build([...gridElements(3), point(2, 35, 35)]);

    expect(summary.wellCount).toBe(1);
    expect(input.wells).toEqual({
      positions: [{ x: 35, y: 35 }],
      length: DEFAULT_GALERKIN_SETTINGS.wellLength,
      diameter: DEFAULT_GALERKIN_SETTINGS.wellDiameter,
      kro: DEFAULT_GALERKIN_SETTINGS.kro,
    });
    // The rod radius must be there for the well self term.
    expect(input.rods?.radius).toBe(DEFAULT_GALERKIN_SETTINGS.rodRadius);
    expect(input.rods?.positions).toEqual([]);
  });

  it('ignores elements that are not conductors, rods or wells', () => {
    const { summary } = build([
      ...gridElements(3),
      point(3, 5, 5),
      {
        type: 6,
        geometry: { type: 'Point', coordinates: [1, 1] },
        properties: {},
      },
    ]);

    expect(summary.rodCount + summary.wellCount).toBe(0);
  });

  it('needs a positive burial depth', () => {
    expect(() =>
      buildGalerkinInput({
        elements: gridElements(3),
        burialDepth: 0,
        conductorRadius: 0.005,
        soilResistivity: 400,
        groundCurrent: 1000,
        settings: DEFAULT_GALERKIN_SETTINGS,
      }),
    ).toThrow(GalerkinInputError);
  });
});
