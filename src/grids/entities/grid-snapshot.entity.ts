import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { Grid } from './grid.entity';

@Entity('grid_snapshots')
export class GridSnapshot extends BaseEntity {
  @ManyToOne(() => Grid)
  grid: Grid;

  @Column()
  version: number;

  @Column({
    type: 'text',
  })
  snapshotData: string;
}
