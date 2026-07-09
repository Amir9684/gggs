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

import { CalculationsService } from './calculations.service';
import { CreateCalculationCaseDto } from './dto/create-calculation-case.dto';
import { UpdateCalculationCaseDto } from './dto/update-calculation-case.dto';
import { GetCalculationCasesQueryDTO } from './dto/get-calculation-cases-query.dto';

/**
 * Every route is scoped to the requesting user's own projects via the
 * case's parent project (admins bypass), enforced in `CalculationsService`.
 */
@Auth()
@Controller('calculation-cases')
export class CalculationsController {
  constructor(private readonly calculationsService: CalculationsService) {}

  @Post()
  create(
    @Body() createCalculationCaseDto: CreateCalculationCaseDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.calculationsService.create(createCalculationCaseDto, user);
  }

  @Get()
  getAll(
    @Query() queries: GetCalculationCasesQueryDTO,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.calculationsService.getAll(queries, user);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.calculationsService.getOne(id, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateCalculationCaseDto: UpdateCalculationCaseDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.calculationsService.update(id, updateCalculationCaseDto, user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.calculationsService.delete(id, user);
  }

  /**
   * Executes the IEEE 80 engine for this case and persists a new
   * `CalculationResult`. Idempotent in the sense that it never mutates
   * inputs — each call just appends a fresh result.
   */
  @Post(':id/run')
  run(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.calculationsService.run(id, user);
  }

  @Get(':id/results')
  getResults(
    @Param('id') id: string,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.calculationsService.getResults(id, user);
  }
}
