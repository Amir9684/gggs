import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProjectsModule } from 'src/projects/projects.module';

import { Grid } from './entities/grid.entity';
import { GridElement } from './entities/grid-element.entity';
import { GridSnapshot } from './entities/grid-snapshot.entity';

import { GridsService } from './grids.service';
import { GridElementsService } from './grid-elements.service';

import { GridsController } from './grids.controller';
import {
  GridElementsController,
  GridSnapshotsController,
} from './grid-elements.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Grid, GridElement, GridSnapshot]),
    ProjectsModule,
  ],
  controllers: [
    GridsController,
    GridElementsController,
    GridSnapshotsController,
  ],
  providers: [GridsService, GridElementsService],
  exports: [GridsService],
})
export class GridsModule {}
