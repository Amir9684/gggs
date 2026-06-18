import { Entity, Column, ManyToOne, OneToMany } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { Project } from 'src/projects/entities/project.entity';
import { SoilLayer } from './soil-layer.entity';

@Entity('soil_models')
export class SoilModel extends BaseEntity {
  @Column()
  name: string;

  @Column('decimal', {
    precision: 12,
    scale: 2,
  })
  surfaceResistivity: number;

  @ManyToOne(() => Project)
  project: Project;

  @OneToMany(() => SoilLayer, (layer) => layer.soilModel, { cascade: true })
  layers: SoilLayer[];
}
