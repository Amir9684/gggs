import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GroundWire } from './entities/ground-wire.entity';
import { GroundWiresController } from './ground-wires.controller';
import { GroundWiresService } from './ground-wires.service';
import { SplitFactorController } from './split-factor.controller';
import { SplitFactorService } from './split-factor.service';

@Module({
  imports: [TypeOrmModule.forFeature([GroundWire])],
  controllers: [GroundWiresController, SplitFactorController],
  providers: [GroundWiresService, SplitFactorService],
  exports: [GroundWiresService],
})
export class SplitFactorModule {}
