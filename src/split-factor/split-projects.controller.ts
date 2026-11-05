import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { Auth } from 'src/auth/decorators/auth.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { CreateSplitProjectDto } from './dto/create-split-project.dto';
import { UpdateSplitProjectDto } from './dto/update-split-project.dto';
import { SplitProjectsService } from './split-projects.service';

@Auth()
@Controller('split-projects')
export class SplitProjectsController {
  constructor(private readonly splitProjectsService: SplitProjectsService) {}

  @Post()
  create(
    @Body() dto: CreateSplitProjectDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.splitProjectsService.create(dto, user);
  }

  @Get()
  getAll(@CurrentUser() user: TAuthenticatedUserType) {
    return this.splitProjectsService.getAll(user);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.splitProjectsService.getOne(id, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSplitProjectDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.splitProjectsService.update(id, dto, user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.splitProjectsService.delete(id, user);
  }

  /** Runs the project's method on its stored input and stores the result. */
  @Post(':id/calculate')
  calculate(
    @Param('id') id: string,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.splitProjectsService.calculate(id, user);
  }
}
