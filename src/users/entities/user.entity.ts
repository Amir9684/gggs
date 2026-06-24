import { Entity, Column, OneToMany } from 'typeorm';

import { Project } from 'src/projects/entities/project.entity';
import { BaseEntity } from 'src/common/entities/base.entity';

import UserRole from '../enum';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  username: string;

  @Column({ select: false })
  password: string;

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
