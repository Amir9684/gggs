import { Column, Entity, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';
import { CalculationResult } from './calculation-result.entity';

@Entity('voltage_profiles')
export class VoltageProfile extends BaseEntity {
  @ManyToOne(() => CalculationResult)
  result: CalculationResult;

  @Column('decimal', { transformer: decimalTransformer })
  x: number;

  @Column('decimal', { transformer: decimalTransformer })
  y: number;

  @Column('decimal', { transformer: decimalTransformer })
  voltage: number;
}
