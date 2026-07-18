import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { extname } from 'path';

import { Auth } from 'src/auth/decorators/auth.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { ReportsService } from './reports.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import { GetReportsQueryDTO } from './dto/get-reports-query.dto';

/**
 * Every route is scoped to the requesting user's own projects via the
 * report's parent project (admins bypass), enforced in `ReportsService`.
 */
@Auth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Renders the grounding-report .rdl template (via Bold Reports) for a
   * calculation result and stores the exported file.
   */
  @Post()
  generate(
    @Body() generateReportDto: GenerateReportDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.reportsService.generate(generateReportDto, user);
  }

  @Get()
  getAll(
    @Query() queries: GetReportsQueryDTO,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.reportsService.getAll(queries, user);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.reportsService.getOne(id, user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.reportsService.delete(id, user);
  }

  /**
   * Streams the generated file directly for the success case — raw bytes
   * can't fit the standard `IResponse` envelope. The not-found case still
   * uses that same envelope (via `res.json`) rather than Nest's default
   * exception shape, so error responses stay consistent with every other
   * endpoint. `@Res({ passthrough: false })` hands the response over
   * fully either way, so the global `ResponseInterceptor` steps aside
   * (see its `headersSent` guard) once either branch writes to `res`.
   */
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: TAuthenticatedUserType,
    @Res({ passthrough: false }) res: Response,
  ) {
    const result = await this.reportsService.getFileForDownload(id, user);

    if (!result.data) {
      res.status(result.statusCode).json(result);
      return;
    }

    res.download(
      result.data.filePath,
      `${result.data.name}${extname(result.data.filePath)}`,
    );
  }
}
