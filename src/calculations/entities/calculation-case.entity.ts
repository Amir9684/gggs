import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { Grid } from 'src/grids/entities/grid.entity';
import { Project } from 'src/projects/entities/project.entity';
import { SoilModel } from 'src/soil/entities/soil-model.entity';

import { DesignMethod, SoilLayeringMethod } from '../enum';

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

  @Column({
    type: 'enum',
    enum: DesignMethod,
    default: DesignMethod.IEEE_80_2000,
  })
  designMethod: DesignMethod;

  /** Only set when `designMethod === DesignMethod.IEEE_80_2000`. */
  @Column({
    type: 'enum',
    enum: SoilLayeringMethod,
    nullable: true,
  })
  soilLayering: SoilLayeringMethod | null;
}
