import { Column, Entity, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { CalculationResult } from './calculation-result.entity';

@Entity('voltage_profiles')
export class VoltageProfile extends BaseEntity {
  @ManyToOne(() => CalculationResult)
  result: CalculationResult;

  @Column('decimal')
  x: number;

  @Column('decimal')
  y: number;

  @Column('decimal')
  voltage: number;
}
