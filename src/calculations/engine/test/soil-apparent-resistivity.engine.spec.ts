import { computeApparentResistivity } from '../soil-apparent-resistivity.engine';

describe('computeApparentResistivity', () => {
  it('returns the single layer resistivity unchanged for a uniform soil model', () => {
    const result = computeApparentResistivity([
      { resistivity: 150, thickness: 10, layerOrder: 1 },
    ]);
    expect(result).toBe(150);
  });

  it('computes a thickness-weighted average for a multi-layer model', () => {
    // 2m of 100 Ω·m + 2m of 300 Ω·m → simple average since thicknesses are equal
    const result = computeApparentResistivity([
      { resistivity: 100, thickness: 2, layerOrder: 1 },
      { resistivity: 300, thickness: 2, layerOrder: 2 },
    ]);
    expect(result).toBeCloseTo(200, 6);
  });

  it('weights thicker layers more heavily', () => {
    const result = computeApparentResistivity([
      { resistivity: 100, thickness: 9, layerOrder: 1 },
      { resistivity: 1000, thickness: 1, layerOrder: 2 },
    ]);
    // (100*9 + 1000*1) / 10 = 190
    expect(result).toBeCloseTo(190, 6);
  });

  it('throws if no layers are provided', () => {
    expect(() => computeApparentResistivity([])).toThrow();
  });

  it('throws if total thickness is zero', () => {
    expect(() =>
      computeApparentResistivity([
        { resistivity: 100, thickness: 0, layerOrder: 1 },
        { resistivity: 200, thickness: 0, layerOrder: 2 },
      ]),
    ).toThrow();
  });
});
