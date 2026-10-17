import { GridElementSnapshot } from '../types';

export function isGridElementSnapshotArray(
  value: unknown,
): value is GridElementSnapshot[] {
  return (
    Array.isArray(value) &&
    value.every(
      (element: unknown) =>
        typeof element === 'object' &&
        element !== null &&
        'type' in element &&
        'geometry' in element,
    )
  );
}
