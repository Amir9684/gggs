import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { CalculationCase } from './calculation-case.entity';

@Entity('case_settings')
export class CaseSetting extends BaseEntity {
  @ManyToOne(() => CalculationCase)
  calculationCase: CalculationCase;

  @Column('decimal')
  surfaceLayerResistivity: number;

  @Column('decimal')
  surfaceLayerThickness: number;

  @Column()
  bodyWeight: number;

  @Column()
  frequency: number;
}
