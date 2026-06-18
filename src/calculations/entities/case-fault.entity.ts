import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { CalculationCase } from './calculation-case.entity';

@Entity('case_faults')
export class CaseFault extends BaseEntity {
  @ManyToOne(() => CalculationCase)
  calculationCase: CalculationCase;

  @Column('decimal')
  faultCurrent: number;

  @Column('decimal')
  faultDuration: number;

  @Column('decimal')
  splitFactor: number;

  @Column('decimal')
  decrementFactor: number;

  @Column('decimal')
  shockDuration: number;
}
