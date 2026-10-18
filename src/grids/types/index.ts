import { GridElement } from '../entities/grid-element.entity';

export type GridElementSnapshot = Pick<GridElement, 'type' | 'geometry'> &
  Partial<Pick<GridElement, 'properties'>>;
