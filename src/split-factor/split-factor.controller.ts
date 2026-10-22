import { Body, Controller, Post } from '@nestjs/common';

import { Auth } from 'src/auth/decorators/auth.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { SoniCalculateDto } from './dto/soni-calculate.dto';
import { SplitFactorService } from './split-factor.service';

@Auth()
@Controller('split-factor')
export class SplitFactorController {
  constructor(private readonly splitFactorService: SplitFactorService) {}

  /** Stateless: computes the Soni split factor and saves nothing. */
  @Post('soni/calculate')
  calculateSoni(
    @Body() dto: SoniCalculateDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.splitFactorService.calculateSoni(dto, user);
  }
}
