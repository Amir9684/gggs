import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GroundWire } from './entities/ground-wire.entity';
import { SplitProject } from './entities/split-project.entity';
import { GroundWiresController } from './ground-wires.controller';
import { GroundWiresService } from './ground-wires.service';
import { SplitFactorController } from './split-factor.controller';
import { SplitFactorService } from './split-factor.service';
import { SplitProjectsController } from './split-projects.controller';
import { SplitProjectsService } from './split-projects.service';

@Module({
  imports: [TypeOrmModule.forFeature([GroundWire, SplitProject])],
  controllers: [
    GroundWiresController,
    SplitFactorController,
    SplitProjectsController,
  ],
  providers: [GroundWiresService, SplitFactorService, SplitProjectsService],
  exports: [GroundWiresService],
})
export class SplitFactorModule {}
