import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';

import { ConductorMaterial } from '../enum';
import { CalculationCase } from './calculation-case.entity';

/**
 * The conductor chosen for a calculation case, together with the sizing
 * that was computed for it when the case was created (`CaseFault` is not
 * editable afterwards, so the snapshot stays valid). Optional per case:
 * cases created before this existed simply have no row.
 */
@Entity('case_conductors')
export class CaseConductor extends BaseEntity {
  @ManyToOne(() => CalculationCase)
  calculationCase: CalculationCase;

  @Column({ type: 'enum', enum: ConductorMaterial })
  material: ConductorMaterial;

  /** Ambient temperature Ta, °C. */
  @Column('decimal', { transformer: decimalTransformer })
  ambientTemperature: number;

  /** Allowable conductor temperature Tm actually used, °C. */
  @Column('decimal', { transformer: decimalTransformer })
  allowableTemperature: number;

  /** Conduction time tc used for the sizing, s. */
  @Column('decimal', { transformer: decimalTransformer })
  sizingDuration: number;

  /** Minimum area from the fusing equation, mm². */
  @Column('decimal', { transformer: decimalTransformer })
  minimumAreaMm2: number;

  @Column('decimal', { transformer: decimalTransformer })
  minimumAreaKcmil: number;

  /** Next standard size (16 to 300 mm²); null when above 300 mm². */
  @Column('decimal', { nullable: true, transformer: decimalTransformer })
  standardSizeMm2: number | null;

  /** Cross-section the user entered instead of a standard size, mm². */
  @Column('decimal', { nullable: true, transformer: decimalTransformer })
  crossSectionMm2: number | null;
}
