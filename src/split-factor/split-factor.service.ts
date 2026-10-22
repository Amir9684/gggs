import { Injectable } from '@nestjs/common';

import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';

import { SoniCalculateDto } from './dto/soni-calculate.dto';
import { abs, type Complex } from './engine/complex';
import { computeSoniSplitFactor } from './engine/soni.engine';
import { GroundWiresService } from './ground-wires.service';
import {
  buildSoniInput,
  requestedWireIds,
  type CatalogWire,
} from './soni-input.builder';

/** A complex quantity as the API returns it: rectangular and polar. */
export interface ComplexValue {
  re: number;
  im: number;
  magnitude: number;
  angleDegrees: number;
}

export const toComplexValue = (value: Complex): ComplexValue => ({
  re: value.re,
  im: value.im,
  magnitude: abs(value),
  angleDegrees: (Math.atan2(value.im, value.re) * 180) / Math.PI,
});

@Injectable()
export class SplitFactorService {
  constructor(private readonly groundWiresService: GroundWiresService) {}

  /**
   * Stateless Soni ("Approximate") split factor: nothing is saved.
   * Catalog wires are loaded scoped to the user, so one user can't
   * compute with another's wire.
   */
  calculateSoni(dto: SoniCalculateDto, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const wires = new Map<string, CatalogWire>();
      for (const id of requestedWireIds(dto)) {
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

      let result;
      try {
        result = computeSoniSplitFactor(buildSoniInput(dto, wires));
      } catch (error) {
        // The engine throws plain Errors for data it cannot compute with
        // (zero resistance, singular system...). That is a bad request,
        // not a server fault.
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: `محاسبه با این داده‌ها ممکن نیست: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: {
          splitFactor: result.splitFactor,
          gridCurrent: toComplexValue(result.gridCurrent),
          totalFaultCurrent: toComplexValue(result.totalFaultCurrent),
          terminals: dto.terminals.map((terminal, i) => ({
            name: terminal.name ?? null,
            equivalentImpedance: toComplexValue(result.equivalentImpedances[i]),
            earthCurrent: toComplexValue(result.terminalEarthCurrents[i]),
          })),
        },
      };
    });
  }
}
