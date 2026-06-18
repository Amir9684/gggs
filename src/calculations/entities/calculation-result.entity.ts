import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { CalculationCase } from './calculation-case.entity';

@Entity('calculation_results')
export class CalculationResult extends BaseEntity {
  @ManyToOne(() => CalculationCase)
  calculationCase: CalculationCase;

  @Column('decimal')
  gridResistance: number;

  @Column('decimal')
  gpr: number;

  @Column('decimal')
  meshVoltage: number;

  @Column('decimal')
  touchVoltage: number;

  @Column('decimal')
  stepVoltage: number;

  @Column('decimal')
  permissibleTouchVoltage: number;

  @Column('decimal')
  permissibleStepVoltage: number;

  @Column()
  safe: boolean;
}
