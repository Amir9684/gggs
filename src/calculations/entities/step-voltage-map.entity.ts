import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { CalculationResult } from './calculation-result.entity';

@Entity('step_voltage_maps')
export class StepVoltageMap extends BaseEntity {
  @ManyToOne(() => CalculationResult)
  result: CalculationResult;

  @Column('decimal')
  x: number;

  @Column('decimal')
  y: number;

  @Column('decimal')
  value: number;
}
