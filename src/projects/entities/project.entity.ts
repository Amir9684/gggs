import { Entity, Column, ManyToOne, OneToMany } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { SoilModel } from '../../soil/entities/soil-model.entity';
import { Grid } from '../../grids/entities/grid.entity';
import { User } from 'src/users/entities/user.entity';

@Entity('projects')
export class Project extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  substationName: string;

  @Column()
  voltageLevel: string;

  @Column()
  standard: string;

  @ManyToOne(() => User, (u) => u.projects)
  owner: User;

  @OneToMany(() => SoilModel, (s) => s.project)
  soilModels: SoilModel[];

  @OneToMany(() => Grid, (g) => g.project)
  grids: Grid[];
}
