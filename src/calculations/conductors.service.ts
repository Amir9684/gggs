import { Injectable } from '@nestjs/common';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';

import type { ConductorSizingDto } from './dto/conductor-sizing.dto';
import { CONDUCTOR_MATERIALS } from './engine/conductor-material.catalog';
import {
  computeConductorSizing,
  STANDARD_CONDUCTOR_SIZES_MM2,
} from './engine/conductor-sizing.engine';

/**
 * Stateless conductor helpers: the material catalog and the minimum-size
 * calculation (with rounding to a standard size). Nothing here touches the
 * database; a case stores its conductor choice through
 * `CalculationsService.create`.
 */
@Injectable()
export class ConductorsService {
  getMaterials() {
    return asyncFn(() => ({
      statusCode: HttpStatus.OK,
      messages: [],
      data: {
        materials: CONDUCTOR_MATERIALS,
        standardSizesMm2: STANDARD_CONDUCTOR_SIZES_MM2,
      },
    }));
  }

  calculateSizing(dto: ConductorSizingDto) {
    return asyncFn(() => {
      try {
        const result = computeConductorSizing(dto);
        return {
          statusCode: HttpStatus.OK,
          messages: [],
          data: result,
        };
      } catch (error) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          messages:
            error instanceof Error
              ? error.message
              : 'محاسبهٔ سطح مقطع هادی ناموفق بود.',
          data: null,
        };
      }
    });
  }
}
