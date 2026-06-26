import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
} from '@nestjs/common';

import { Auth } from 'src/auth/decorators/auth.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { SoilModelsService } from './soil-models.service';
import { CreateSoilModelDto } from './dto/create-soil-model.dto';
import { UpdateSoilModelDto } from './dto/update-soil-model.dto';
import { GetSoilModelsQueryDTO } from './dto/get-soil-models-query.dto';

/**
 * Soil models always belong to a project; every route here is scoped to
 * the requesting user's own projects (admins bypass), enforced in
 * `SoilModelsService` via `ProjectsService.findOwnedOrAdmin`.
 */
@Auth()
@Controller('soil-models')
export class SoilModelsController {
  constructor(private readonly soilModelsService: SoilModelsService) {}

  @Post()
  create(
    @Body() createSoilModelDto: CreateSoilModelDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.soilModelsService.create(createSoilModelDto, user);
  }

  @Get()
  getAll(
    @Query() queries: GetSoilModelsQueryDTO,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.soilModelsService.getAll(queries, user);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.soilModelsService.getOne(id, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateSoilModelDto: UpdateSoilModelDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.soilModelsService.update(id, updateSoilModelDto, user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.soilModelsService.delete(id, user);
  }
}
