import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';
import { CalculationCase } from './calculation-case.entity';

@Entity('case_faults')
export class CaseFault extends BaseEntity {
  @ManyToOne(() => CalculationCase)
  calculationCase: CalculationCase;

  @Column('decimal', { transformer: decimalTransformer })
  faultCurrent: number;

  @Column('decimal', { transformer: decimalTransformer })
  faultDuration: number;

  @Column('decimal', { transformer: decimalTransformer })
  splitFactor: number;

  @Column('decimal', { transformer: decimalTransformer })
  decrementFactor: number;

  @Column('decimal', { transformer: decimalTransformer })
  shockDuration: number;
}
