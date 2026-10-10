import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';
import { CalculationCase } from './calculation-case.entity';

@Entity('case_settings')
export class CaseSetting extends BaseEntity {
  @ManyToOne(() => CalculationCase)
  calculationCase: CalculationCase;

  @Column('decimal', { transformer: decimalTransformer })
  surfaceLayerResistivity: number;

  @Column('decimal', { transformer: decimalTransformer })
  surfaceLayerThickness: number;

  @Column()
  bodyWeight: number;

  @Column()
  frequency: number;
}
