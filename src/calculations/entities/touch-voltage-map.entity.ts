import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';
import { CalculationResult } from './calculation-result.entity';

@Entity('touch_voltage_maps')
export class TouchVoltageMap extends BaseEntity {
  @ManyToOne(() => CalculationResult)
  result: CalculationResult;

  @Column('decimal', { transformer: decimalTransformer })
  x: number;

  @Column('decimal', { transformer: decimalTransformer })
  y: number;

  @Column('decimal', { transformer: decimalTransformer })
  value: number;
}
