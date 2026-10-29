import { Body, Controller, Post } from '@nestjs/common';

import { Auth } from 'src/auth/decorators/auth.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { Ieee80CalculateDto } from './dto/ieee80-calculate.dto';
import { SoniCalculateDto } from './dto/soni-calculate.dto';
import { SplitFactorService } from './split-factor.service';

@Auth()
@Controller('split-factor')
export class SplitFactorController {
  constructor(private readonly splitFactorService: SplitFactorService) {}

  /** Stateless: split factor from the IEEE Std 80 Annex C curves. */
  @Post('ieee80/calculate')
  calculateIeee80(@Body() dto: Ieee80CalculateDto) {
    return this.splitFactorService.calculateIeee80(dto);
  }

  /** Stateless: computes the Soni split factor and saves nothing. */
  @Post('soni/calculate')
  calculateSoni(
    @Body() dto: SoniCalculateDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.splitFactorService.calculateSoni(dto, user);
  }
}
