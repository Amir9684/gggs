import { Entity, Column, OneToMany, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';
import { Project } from 'src/projects/entities/project.entity';
import { GridElement } from './grid-element.entity';

@Entity('grids')
export class Grid extends BaseEntity {
  @Column()
  name: string;

  @Column('decimal', { transformer: decimalTransformer })
  length: number;

  @Column('decimal', { transformer: decimalTransformer })
  width: number;

  @Column('decimal', { transformer: decimalTransformer })
  burialDepth: number;

  @ManyToOne(() => Project)
  project: Project;

  @OneToMany(() => GridElement, (e) => e.grid, { cascade: true })
  elements: GridElement[];
}
