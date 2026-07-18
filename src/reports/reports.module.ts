import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProjectsModule } from 'src/projects/projects.module';
import { CalculationResult } from 'src/calculations/entities/calculation-result.entity';
import { CaseFault } from 'src/calculations/entities/case-fault.entity';
import { CaseSetting } from 'src/calculations/entities/case-setting.entity';

import { Report } from './entities/report.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { BoldReportsClient } from './bold-reports.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      // Read-only access to the calculation data a report is generated
      // from — these entities live in `CalculationsModule`, but
      // `ReportsService` reads them directly for the same reason
      // `CalculationsService` reads `GridElement`/`SoilLayer` directly:
      // it needs raw rows to build the Bold Reports data source, not the
      // wrapped `IResponse` shape `CalculationsService` returns.
      CalculationResult,
      CaseFault,
      CaseSetting,
    ]),
    ProjectsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, BoldReportsClient],
  exports: [ReportsService],
})
export class ReportsModule {}
