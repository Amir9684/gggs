import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProjectsModule } from 'src/projects/projects.module';
import { CalculationResult } from 'src/calculations/entities/calculation-result.entity';
import { CaseFault } from 'src/calculations/entities/case-fault.entity';
import { CaseSetting } from 'src/calculations/entities/case-setting.entity';
import { TouchVoltageMap } from 'src/calculations/entities/touch-voltage-map.entity';
import { StepVoltageMap } from 'src/calculations/entities/step-voltage-map.entity';
import { VoltageProfile } from 'src/calculations/entities/voltage-profile.entity';

import { Report } from './entities/report.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      // Read-only access to the calculation data a report is generated
      // from — these entities live in `CalculationsModule`, but
      // `ReportsService` reads them directly for the same reason
      // `CalculationsService` reads `GridElement`/`SoilLayer` directly:
      // it needs raw rows to build the PDF's data source, not the
      // wrapped `IResponse` shape `CalculationsService` returns.
      CalculationResult,
      CaseFault,
      CaseSetting,
      TouchVoltageMap,
      StepVoltageMap,
      VoltageProfile,
    ]),
    ProjectsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
