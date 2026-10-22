import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from 'src/common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';
import { User } from 'src/users/entities/user.entity';

/**
 * A ground (shield) wire type of the split factor module — the Windows
 * app keeps these in an editable Data-control table ("conductor.frm").
 * Each user keeps their own catalog; admins see all of them.
 */
@Entity('ground_wires')
export class GroundWire extends BaseEntity {
  @Column()
  name: string;

  /** AC resistance, Rac (ohm/km). */
  @Column('decimal', { transformer: decimalTransformer })
  acResistance: number;

  /** DC resistance, Rdc (ohm/km). */
  @Column('decimal', { transformer: decimalTransformer })
  dcResistance: number;

  /** Geometric mean radius, GMR (m). */
  @Column('decimal', {
    precision: 12,
    scale: 6,
    transformer: decimalTransformer,
  })
  gmr: number;

  /** Internal reactance (ohm/km), used when the reactance is not taken from the GMR. */
  @Column('decimal', { transformer: decimalTransformer, default: 0 })
  reactance: number;

  @ManyToOne(() => User)
  owner: User;
}
