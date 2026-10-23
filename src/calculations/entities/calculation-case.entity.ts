import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { Grid } from 'src/grids/entities/grid.entity';
import { Project } from 'src/projects/entities/project.entity';
import { SoilModel } from 'src/soil/entities/soil-model.entity';

import type { GalerkinSettings } from 'src/galerkin/galerkin-settings';

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

  /** Set for the IEEE methods (80-86 defaults to ONE_LAYER); null for Galerkin. */
  @Column({
    type: 'enum',
    enum: SoilLayeringMethod,
    nullable: true,
  })
  soilLayering: SoilLayeringMethod | null;

  /**
   * Galerkin solver inputs (segment length, rod radius, well data, Kro).
   * `null` until the user edits them; the defaults apply then. Only used
   * by Galerkin cases.
   */
  @Column('jsonb', { nullable: true })
  galerkinSettings: Partial<GalerkinSettings> | null;
}
