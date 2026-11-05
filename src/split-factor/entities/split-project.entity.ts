import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { User } from 'src/users/entities/user.entity';

import type { SplitMethod } from '../split-method';

/** Result stored by the last "calculate" of a project. */
export interface SplitProjectResult {
  splitFactor: number;
  /** ISO time of the calculation. */
  computedAt: string;
  details: Record<string, unknown>;
}

/**
 * A saved split factor study. The method's whole input is kept as one
 * validated JSON document (substation resistance, terminals, spans...)
 * instead of one table per part: the Windows app saves one file per
 * study too, and the inputs differ by method.
 */
@Entity('split_projects')
export class SplitProject extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: 'varchar' })
  method: SplitMethod;

  @Column('jsonb')
  input: Record<string, unknown>;

  /** `null` until calculated, and again after the input changes. */
  @Column('jsonb', { nullable: true })
  lastResult: SplitProjectResult | null;

  @ManyToOne(() => User)
  owner: User;
}
