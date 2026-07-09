import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProjectsModule } from 'src/projects/projects.module';
import { GridsModule } from 'src/grids/grids.module';
import { SoilModule } from 'src/soil/soil.module';
import { GridElement } from 'src/grids/entities/grid-element.entity';
import { SoilLayer } from 'src/soil/entities/soil-layer.entity';

import { CalculationCase } from './entities/calculation-case.entity';
import { CaseFault } from './entities/case-fault.entity';
import { CaseSetting } from './entities/case-setting.entity';
import { CalculationResult } from './entities/calculation-result.entity';
import { StepVoltageMap } from './entities/step-voltage-map.entity';
import { TouchVoltageMap } from './entities/touch-voltage-map.entity';
import { VoltageProfile } from './entities/voltage-profile.entity';
import { GprResult } from './entities/gpr-result.entity';

import { CalculationsService } from './calculations.service';
import { CalculationsController } from './calculations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CalculationCase,
      CaseFault,
      CaseSetting,
      CalculationResult,
      StepVoltageMap,
      TouchVoltageMap,
      VoltageProfile,
      GprResult,
      // Read-only access to the grid/soil layer data a case's `run()`
      // needs — these entities live in `GridsModule`/`SoilModule`, but
      // `CalculationsService` reads them directly rather than through
      // `GridElementsService`/`SoilModelsService` since it needs raw rows
      // for the engine, not the wrapped `IResponse` shape those return.
      GridElement,
      SoilLayer,
    ]),
    ProjectsModule,
    GridsModule,
    SoilModule,
  ],
  controllers: [CalculationsController],
  providers: [CalculationsService],
  exports: [CalculationsService],
})
export class CalculationsModule {}
