import { Entity, Column, ManyToOne, Index } from 'typeorm';
import type { Geometry } from 'geojson';

import { BaseEntity } from 'src/common/entities/base.entity';

import { Grid } from './grid.entity';
import { GridElementType, SpatialReferenceID } from '../enum';

@Entity('grid_elements')
@Index('idx_grid_geometry', ['geometry'], { spatial: true })
export class GridElement extends BaseEntity {
  @ManyToOne(() => Grid, (grid) => grid.elements, {
    onDelete: 'CASCADE',
  })
  grid: Grid;

  @Column({
    type: 'enum',
    enum: GridElementType,
  })
  type: GridElementType;

  @Column({
    type: 'geometry',
    srid: SpatialReferenceID.WebMercator,
  })
  geometry: Geometry;

  @Column({
    type: 'jsonb',
    default: {},
  })
  properties: Record<string, any>;
}
