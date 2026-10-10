import {
  evaluateDesignValidity,
  isSafeForEveryPoint,
} from '../design-validity.engine';

describe('evaluateDesignValidity', () => {
  it('returns no warnings inside the validity limits', () => {
    expect(
      evaluateDesignValidity({ burialDepth: 0.5, conductorDiameter: 0.01 }),
    ).toEqual([]);
  });

  it('accepts depths exactly on the 0.25 m and 2.5 m limits', () => {
    expect(
      evaluateDesignValidity({ burialDepth: 0.25, conductorDiameter: 0.01 }),
    ).toEqual([]);
    expect(
      evaluateDesignValidity({ burialDepth: 2.5, conductorDiameter: 0.01 }),
    ).toEqual([]);
  });

  it('warns when the burial depth is too shallow or too deep', () => {
    const shallow = evaluateDesignValidity({
      burialDepth: 0.2,
      conductorDiameter: 0.01,
    });
    expect(shallow.map((w) => w.code)).toEqual(['BURIAL_DEPTH_OUT_OF_RANGE']);
    expect(shallow[0].limit).toBe(0.25);

    const deep = evaluateDesignValidity({
      burialDepth: 3,
      conductorDiameter: 0.01,
    });
    expect(deep.map((w) => w.code)).toEqual(['BURIAL_DEPTH_OUT_OF_RANGE']);
    expect(deep[0].limit).toBe(2.5);
  });

  it('warns when the conductor diameter is not below 0.25 * depth', () => {
    const w = evaluateDesignValidity({
      burialDepth: 0.4,
      conductorDiameter: 0.1,
    });
    expect(w.map((x) => x.code)).toEqual(['CONDUCTOR_DIAMETER_TOO_LARGE']);
    expect(w[0].limit).toBeCloseTo(0.1, 12);
  });

  it('can return both warnings at once', () => {
    const w = evaluateDesignValidity({
      burialDepth: 0.2,
      conductorDiameter: 0.06,
    });
    expect(w.map((x) => x.code).sort()).toEqual([
      'BURIAL_DEPTH_OUT_OF_RANGE',
      'CONDUCTOR_DIAMETER_TOO_LARGE',
    ]);
  });
});

describe('isSafeForEveryPoint', () => {
  it('is true when GPR is at or below the permissible touch voltage', () => {
    expect(isSafeForEveryPoint(500, 800)).toBe(true);
    expect(isSafeForEveryPoint(800, 800)).toBe(true);
  });

  it('is false when GPR exceeds the permissible touch voltage', () => {
    expect(isSafeForEveryPoint(801, 800)).toBe(false);
  });
});
