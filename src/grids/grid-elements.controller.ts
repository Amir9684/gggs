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

import { GridElementsService } from './grid-elements.service';
import {
  CreateGridElementDto,
  CreateGridElementsBulkDto,
} from './dto/create-grid-element.dto';
import { UpdateGridElementDto } from './dto/update-grid-element.dto';
import { GetGridElementsQueryDTO } from './dto/get-grid-elements-query.dto';
import { CreateGridSnapshotDto } from './dto/create-grid-snapshot.dto';

@Auth()
@Controller('grid-elements')
export class GridElementsController {
  constructor(private readonly gridElementsService: GridElementsService) {}

  @Post()
  create(
    @Body() createGridElementDto: CreateGridElementDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.gridElementsService.create(createGridElementDto, user);
  }

  @Post('bulk')
  createBulk(
    @Body() createGridElementsBulkDto: CreateGridElementsBulkDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.gridElementsService.createBulk(createGridElementsBulkDto, user);
  }

  @Get()
  getAll(
    @Query() queries: GetGridElementsQueryDTO,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.gridElementsService.getAll(queries, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateGridElementDto: UpdateGridElementDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.gridElementsService.update(id, updateGridElementDto, user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.gridElementsService.delete(id, user);
  }
}

/**
 * Kept as a separate controller (rather than nested under
 * `GridElementsController`) so versioning concerns sit under their own
 * `grid-snapshots` resource path instead of being mixed into
 * `grid-elements`.
 */
@Auth()
@Controller('grid-snapshots')
export class GridSnapshotsController {
  constructor(private readonly gridElementsService: GridElementsService) {}

  @Post()
  create(
    @Body() createGridSnapshotDto: CreateGridSnapshotDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.gridElementsService.createSnapshot(createGridSnapshotDto, user);
  }

  @Get()
  getAll(
    @Query('gridId') gridId: string,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.gridElementsService.getSnapshots(gridId, user);
  }

  @Post(':id/restore')
  restore(
    @Param('id') id: string,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.gridElementsService.restoreSnapshot(id, user);
  }
}
