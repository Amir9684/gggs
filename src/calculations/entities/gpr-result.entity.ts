import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';
import { CalculationResult } from './calculation-result.entity';

@Entity('gpr_results')
export class GprResult extends BaseEntity {
  @ManyToOne(() => CalculationResult)
  result: CalculationResult;

  @Column()
  pointName: string;

  @Column('decimal', { transformer: decimalTransformer })
  gprValue: number;
}
