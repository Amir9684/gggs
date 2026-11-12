import { Body, Controller, Post } from '@nestjs/common';

import { Auth } from 'src/auth/decorators/auth.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { RamezaniCalculateDto } from './dto/ramezani-calculate.dto';
import { RamezaniService } from './ramezani.service';

@Auth()
@Controller('split-factor')
export class RamezaniController {
  constructor(private readonly ramezaniService: RamezaniService) {}

  /** Stateless: computes the Ramezani split factor and saves nothing. */
  @Post('ramezani/calculate')
  calculate(
    @Body() dto: RamezaniCalculateDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.ramezaniService.calculate(dto, user);
  }
}
