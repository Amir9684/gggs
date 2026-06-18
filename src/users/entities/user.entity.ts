import { Entity, Column, OneToMany } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import UserRole from '../enum';
import { Project } from 'src/projects/entities/project.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  username: string;

  @Column()
  passwordHash: string;

  @Column()
  email: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.ENGINEER,
  })
  role: UserRole;

  @OneToMany(() => Project, (p) => p.owner)
  projects: Project[];
}
