import { Body, Controller, Get, Post } from '@nestjs/common';

import { Auth } from 'src/auth/decorators/auth.decorator';

import { ConductorsService } from './conductors.service';
import { ConductorSizingDto } from './dto/conductor-sizing.dto';

@Auth()
@Controller('conductors')
export class ConductorsController {
  constructor(private readonly conductorsService: ConductorsService) {}

  /** The 14 IEEE 80 Table 1 materials and the standard sizes (mm²). */
  @Get('materials')
  getMaterials() {
    return this.conductorsService.getMaterials();
  }

  /** Minimum conductor area for a fault current, rounded up to a standard size. */
  @Post('sizing')
  calculateSizing(@Body() conductorSizingDto: ConductorSizingDto) {
    return this.conductorsService.calculateSizing(conductorSizingDto);
  }
}
