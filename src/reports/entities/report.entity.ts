import { Entity, Column, ManyToOne } from 'typeorm';

import { CalculationResult } from 'src/calculations/entities/calculation-result.entity';
import { BaseEntity } from 'src/common/entities/base.entity';
import { Project } from 'src/projects/entities/project.entity';

@Entity('reports')
export class Report extends BaseEntity {
  @ManyToOne(() => Project)
  project: Project;

  @ManyToOne(() => CalculationResult)
  result: CalculationResult;

  @Column()
  name: string;

  @Column()
  filePath: string;
}
