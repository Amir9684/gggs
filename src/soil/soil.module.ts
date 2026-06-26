import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProjectsModule } from 'src/projects/projects.module';

import { SoilModel } from './entities/soil-model.entity';
import { SoilLayer } from './entities/soil-layer.entity';
import { SoilModelsService } from './soil-models.service';
import { SoilModelsController } from './soil-models.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SoilModel, SoilLayer]), ProjectsModule],
  controllers: [SoilModelsController],
  providers: [SoilModelsService],
  exports: [SoilModelsService],
})
export class SoilModule {}
