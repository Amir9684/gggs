import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';
import { CalculationCase } from './calculation-case.entity';
import type { GalerkinSolverDetails } from 'src/galerkin/galerkin-solver-details';
import type { SafetyEvaluationResult } from '../engine/types';

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

  /**
   * Intermediate engine values (Cs, geometric factors, 50/70 kg limits,
   * validity warnings, mesh counts), kept so a result reloaded later has
   * the same details as the response from `run`. Nullable because rows
   * saved before this column existed have none.
   */
  @Column('jsonb', { nullable: true })
  details: SafetyEvaluationResult['details'] | null;

  /**
   * Solver notes of a Galerkin result (segment count, surge impedance...).
   * `null` for IEEE results, whose values are in `details`.
   */
  @Column('jsonb', { nullable: true })
  solverDetails: GalerkinSolverDetails | null;
}
