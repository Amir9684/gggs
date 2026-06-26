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

import { GridsService } from './grids.service';
import { CreateGridDto } from './dto/create-grid.dto';
import { UpdateGridDto } from './dto/update-grid.dto';
import { GetGridsQueryDTO } from './dto/get-grids-query.dto';

/**
 * Every route is scoped to the requesting user's own projects via the
 * grid's parent project (admins bypass), enforced in `GridsService`.
 */
@Auth()
@Controller('grids')
export class GridsController {
  constructor(private readonly gridsService: GridsService) {}

  @Post()
  create(
    @Body() createGridDto: CreateGridDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.gridsService.create(createGridDto, user);
  }

  @Get()
  getAll(
    @Query() queries: GetGridsQueryDTO,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.gridsService.getAll(queries, user);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.gridsService.getOne(id, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateGridDto: UpdateGridDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.gridsService.update(id, updateGridDto, user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.gridsService.delete(id, user);
  }
}
