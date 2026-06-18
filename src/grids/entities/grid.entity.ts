import { Entity, Column, OneToMany, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { Project } from 'src/projects/entities/project.entity';
import { GridElement } from './grid-element.entity';

@Entity('grids')
export class Grid extends BaseEntity {
  @Column()
  name: string;

  @Column('decimal')
  length: number;

  @Column('decimal')
  width: number;

  @Column('decimal')
  burialDepth: number;

  @ManyToOne(() => Project)
  project: Project;

  @OneToMany(() => GridElement, (e) => e.grid, { cascade: true })
  elements: GridElement[];
}
