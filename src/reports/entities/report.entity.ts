import { Entity, Column, ManyToOne } from 'typeorm';

import { CalculationResult } from 'src/calculations/entities/calculation-result.entity';
import { BaseEntity } from 'src/common/entities/base.entity';
import { Project } from 'src/projects/entities/project.entity';

import type { ReportOptions } from '../pdf/report-pdf.types';
import type { ConcreteReportTemplate } from '../report-template';

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

  /**
   * The template the file was generated with. Nullable because reports
   * generated before the per-method templates have none.
   */
  @Column({ type: 'varchar', nullable: true })
  template: ConcreteReportTemplate | null;

  /** The options the file was generated with; `null` on older reports. */
  @Column('jsonb', { nullable: true })
  options: ReportOptions | null;
}
