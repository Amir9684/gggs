import { Entity, Column, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { decimalTransformer } from 'src/common/transformers/decimal.transformer';
import { SoilModel } from './soil-model.entity';

@Entity('soil_layers')
export class SoilLayer extends BaseEntity {
  @ManyToOne(() => SoilModel, (model) => model.layers, { onDelete: 'CASCADE' })
  soilModel: SoilModel;

  @Column()
  layerOrder: number;

  @Column('decimal', { transformer: decimalTransformer })
  resistivity: number;

  @Column('decimal', { transformer: decimalTransformer })
  thickness: number;
}
