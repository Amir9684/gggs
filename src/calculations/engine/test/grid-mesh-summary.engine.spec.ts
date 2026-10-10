import { summarizeGridMeshes } from '../grid-mesh-summary.engine';

const base = {
  averageSpacing: 7,
  totalConductorLength: 1540,
  rodCount: 0,
  totalRodLength: 0,
};

describe('summarizeGridMeshes', () => {
  it('counts (a - 1) * (b - 1) meshes', () => {
    const s = summarizeGridMeshes({
      ...base,
      conductorCountAlongLength: 11,
      conductorCountAlongWidth: 11,
    });
    expect(s.meshCount).toBe(100);
  });

  it('handles rectangular grids', () => {
    const s = summarizeGridMeshes({
      ...base,
      conductorCountAlongLength: 6,
      conductorCountAlongWidth: 4,
    });
    expect(s.meshCount).toBe(15);
  });

  it('never returns a negative mesh count', () => {
    const s = summarizeGridMeshes({
      ...base,
      conductorCountAlongLength: 0,
      conductorCountAlongWidth: 5,
    });
    expect(s.meshCount).toBe(0);
  });

  it('passes the counts and totals through unchanged', () => {
    const s = summarizeGridMeshes({
      ...base,
      rodCount: 8,
      totalRodLength: 24,
      conductorCountAlongLength: 3,
      conductorCountAlongWidth: 3,
    });
    expect(s).toMatchObject({
      conductorCountAlongLength: 3,
      conductorCountAlongWidth: 3,
      averageSpacing: 7,
      totalConductorLength: 1540,
      rodCount: 8,
      totalRodLength: 24,
    });
  });
});
