import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { HttpStatus } from 'src/common/types';
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

  /**
   * The report PDF of a project, streamed as raw bytes (it cannot fit the
   * standard response envelope). Errors still use the envelope, through
   * `res.json`, so they look like every other endpoint's.
   */
  @Get(':id/report')
  async report(
    @Param('id') id: string,
    @CurrentUser() user: TAuthenticatedUserType,
    @Res() res: Response,
  ) {
    const result = await this.splitProjectsService.getReportFile(id, user);

    if (!result.data || result.statusCode !== HttpStatus.OK) {
      res.status(result.statusCode).json(result);
      return;
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(result.data.fileName)}`,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.send(result.data.buffer);
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
