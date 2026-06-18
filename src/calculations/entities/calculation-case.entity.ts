import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { Grid } from 'src/grids/entities/grid.entity';
import { Project } from 'src/projects/entities/project.entity';
import { SoilModel } from 'src/soil/entities/soil-model.entity';

@Entity('calculation_cases')
export class CalculationCase extends BaseEntity {
  @Column()
  name: string;

  @Column()
  description: string;

  @ManyToOne(() => Project)
  project: Project;

  @ManyToOne(() => Grid)
  grid: Grid;

  @ManyToOne(() => SoilModel)
  soilModel: SoilModel;
}
