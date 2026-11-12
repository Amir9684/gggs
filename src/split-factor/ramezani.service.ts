import { Injectable } from '@nestjs/common';

import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';

import { RamezaniCalculateDto } from './dto/ramezani-calculate.dto';
import { GroundWiresService } from './ground-wires.service';
import { describeSplitError } from './split-error-messages';
import {
  runSplitProject,
  wireIdsOf,
  type RamezaniRunDetails,
} from './split-project.runner';
import type { CatalogWire } from './soni-input.builder';

/** Stateless Ramezani ("Analytical") split factor: nothing is saved. */
@Injectable()
export class RamezaniService {
  constructor(private readonly groundWiresService: GroundWiresService) {}

  calculate(dto: RamezaniCalculateDto, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const project = { method: 'RAMEZANI' as const, input: dto };

      const wires = new Map<string, CatalogWire>();
      for (const id of wireIdsOf(project)) {
        const wire = await this.groundWiresService.findOwnedOrAdmin(id, user);
        if (!wire) {
          return {
            statusCode: HttpStatus.NOT_FOUND,
            data: null,
            messages: `سیم گارد با آیدی: ${id} یافت نشد.`,
          };
        }
        wires.set(id, wire);
      }

      try {
        const outcome = runSplitProject(project, wires);
        const details = outcome.details as RamezaniRunDetails;

        return {
          statusCode: HttpStatus.OK,
          messages: [],
          data: {
            splitFactor: outcome.splitFactor,
            warnings: outcome.warnings,
            gridCurrent: details.gridCurrent,
            totalFaultCurrent: details.totalFaultCurrent,
            terminals: details.terminals,
          },
        };
      } catch (error) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: `محاسبه با این داده‌ها ممکن نیست: ${describeSplitError(error)}`,
        };
      }
    });
  }
}
