import type { GridGeometrySummary, GridMeshSummary } from './types';

/**
 * Conductor and mesh counts of the drawn grid, shown by the Windows GGGS
 * design forms ("number of conductors in each direction" and "number of
 * meshes").
 *
 * `n` parallel conductors in one direction enclose `n - 1` strips, so a
 * grid with `a` conductors one way and `b` the other has
 * `(a - 1) · (b - 1)` meshes.
 */
export function summarizeGridMeshes(
  geometry: Pick<
    GridGeometrySummary,
    | 'conductorCountAlongLength'
    | 'conductorCountAlongWidth'
    | 'averageSpacing'
    | 'totalConductorLength'
    | 'rodCount'
    | 'totalRodLength'
  >,
): GridMeshSummary {
  const along = geometry.conductorCountAlongLength;
  const across = geometry.conductorCountAlongWidth;

  return {
    conductorCountAlongLength: along,
    conductorCountAlongWidth: across,
    meshCount: Math.max(along - 1, 0) * Math.max(across - 1, 0),
    averageSpacing: geometry.averageSpacing,
    totalConductorLength: geometry.totalConductorLength,
    rodCount: geometry.rodCount,
    totalRodLength: geometry.totalRodLength,
  };
}
