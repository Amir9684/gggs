import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { SoilModel } from './soil-model.entity';

@Entity('soil_layers')
export class SoilLayer extends BaseEntity {
  @ManyToOne(() => SoilModel, (model) => model.layers, { onDelete: 'CASCADE' })
  soilModel: SoilModel;

  @Column()
  layerOrder: number;

  @Column('decimal')
  resistivity: number;

  @Column('decimal')
  thickness: number;
}
