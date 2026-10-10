import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';
import { CalculationCase } from './calculation-case.entity';

@Entity('calculation_results')
export class CalculationResult extends BaseEntity {
  @ManyToOne(() => CalculationCase)
  calculationCase: CalculationCase;

  @Column('decimal', { transformer: decimalTransformer })
  gridResistance: number;

  @Column('decimal', { transformer: decimalTransformer })
  gpr: number;

  @Column('decimal', { transformer: decimalTransformer })
  meshVoltage: number;

  @Column('decimal', { transformer: decimalTransformer })
  touchVoltage: number;

  @Column('decimal', { transformer: decimalTransformer })
  stepVoltage: number;

  @Column('decimal', { transformer: decimalTransformer })
  permissibleTouchVoltage: number;

  @Column('decimal', { transformer: decimalTransformer })
  permissibleStepVoltage: number;

  @Column()
  safe: boolean;
}
