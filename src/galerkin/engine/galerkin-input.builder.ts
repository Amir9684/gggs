import type { Geometry } from 'geojson';

import type { GalerkinSettings } from '../galerkin-settings';
import type {
  GalerkinInput,
  GalerkinRods,
  GalerkinWells,
  HorizontalSegment,
  VerticalPosition,
} from './galerkin.engine';

/** Minimal shape of a drawn `GridElement` this builder needs. */
export interface GalerkinElementLike {
  type: number;
  geometry: Geometry;
  properties: Record<string, any> | null | undefined;
}

/** Mirrors `GridElementType` (CONDUCTOR, ROD, WELL) so the engine has no grids dependency. */
const ELEMENT_TYPE = { CONDUCTOR: 0, ROD: 1, WELL: 2 } as const;

/** More segments than this make the dense solve too slow for a request. */
export const MAX_GALERKIN_SEGMENTS = 1200;

/** A conductor within this slope of an axis is snapped onto it (about 1 degree). */
const AXIS_SLOPE_TOLERANCE = 0.0175;

/** Input the drawn grid cannot satisfy; the message is meant for the user. */
export class GalerkinInputError extends Error {}

export interface GalerkinInputSummary {
  conductorCount: number;
  segmentCount: number;
  rodCount: number;
  wellCount: number;
}

function positive(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Turns a grid's drawn elements into the Galerkin solver input: each
 * conductor polyline is cut into axis-parallel segments of about
 * `settings.segmentLength`; rods and wells become vertical elements.
 * Like the Windows solver this only handles orthogonal grids and one rod
 * length, and says so when a drawing doesn't fit.
 *
 * A conductor can carry its own burial depth in `properties.depth` (m);
 * the others use `burialDepth`.
 */
export function buildGalerkinInput(args: {
  elements: readonly GalerkinElementLike[];
  burialDepth: number;
  conductorRadius: number;
  soilResistivity: number;
  groundCurrent: number;
  settings: GalerkinSettings;
}): { input: GalerkinInput; summary: GalerkinInputSummary } {
  const {
    elements,
    burialDepth,
    conductorRadius,
    soilResistivity,
    groundCurrent,
    settings,
  } = args;

  if (!(burialDepth > 0)) {
    throw new GalerkinInputError(
      'برای روش گالرکین عمق دفن شبکه باید بزرگ‌تر از صفر باشد.',
    );
  }

  const horizontalSegments: HorizontalSegment[] = [];
  let conductorCount = 0;

  elements.forEach((element) => {
    if (
      element.type !== ELEMENT_TYPE.CONDUCTOR ||
      element.geometry.type !== 'LineString'
    ) {
      return;
    }

    conductorCount += 1;
    const depth = positive(element.properties?.depth) ?? burialDepth;
    const points = element.geometry.coordinates;

    for (let i = 1; i < points.length; i += 1) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) continue;

      let ex = x1;
      let ey = y1;
      if (Math.abs(dy) <= AXIS_SLOPE_TOLERANCE * length) {
        ey = y0;
      } else if (Math.abs(dx) <= AXIS_SLOPE_TOLERANCE * length) {
        ex = x0;
      } else {
        throw new GalerkinInputError(
          `هادی ${conductorCount} با محورهای شبکه موازی نیست. روش گالرکین فقط شبکه‌های متعامد (هادی‌های موازی محور X یا Y) را پشتیبانی می‌کند.`,
        );
      }

      const snappedLength = Math.abs(ex - x0) + Math.abs(ey - y0);
      const pieces = Math.max(
        1,
        Math.ceil(snappedLength / settings.segmentLength),
      );
      for (let piece = 0; piece < pieces; piece += 1) {
        const a = piece / pieces;
        const b = (piece + 1) / pieces;
        horizontalSegments.push({
          x1: x0 + (ex - x0) * a,
          y1: y0 + (ey - y0) * a,
          x2: x0 + (ex - x0) * b,
          y2: y0 + (ey - y0) * b,
          depth,
        });
      }
    }
  });

  if (horizontalSegments.length === 0) {
    throw new GalerkinInputError(
      'روش گالرکین حداقل به یک هادی افقی در شبکه نیاز دارد.',
    );
  }
  if (horizontalSegments.length > MAX_GALERKIN_SEGMENTS) {
    throw new GalerkinInputError(
      `تعداد قطعات هادی (${horizontalSegments.length}) از حد مجاز ${MAX_GALERKIN_SEGMENTS} بیشتر است. طول قطعه را در تنظیمات گالرکین افزایش دهید.`,
    );
  }

  const rodPositions: VerticalPosition[] = [];
  const rodLengths = new Set<number>();
  const wellPositions: VerticalPosition[] = [];

  elements.forEach((element) => {
    if (element.geometry.type !== 'Point') return;
    const [x, y] = element.geometry.coordinates;

    if (element.type === ELEMENT_TYPE.ROD) {
      const length =
        positive(element.properties?.length) ??
        positive(element.properties?.lengthM);
      if (length === undefined) {
        throw new GalerkinInputError('طول یکی از میله‌های ارت مشخص نیست.');
      }
      rodLengths.add(Number(length.toFixed(6)));
      rodPositions.push({ x, y });
    } else if (element.type === ELEMENT_TYPE.WELL) {
      wellPositions.push({ x, y });
    }
  });

  if (rodLengths.size > 1) {
    throw new GalerkinInputError(
      'روش گالرکین فقط میله‌هایی با طول یکسان را پشتیبانی می‌کند. طول همهٔ میله‌ها را برابر کنید.',
    );
  }

  const rods: GalerkinRods | undefined =
    rodPositions.length > 0 || wellPositions.length > 0
      ? {
          positions: rodPositions,
          // Wells reuse the rod radius, so it is passed even with no rods.
          length:
            rodLengths.size === 1 ? [...rodLengths][0] : settings.wellLength,
          radius: settings.rodRadius,
        }
      : undefined;

  const wells: GalerkinWells | undefined =
    wellPositions.length > 0
      ? {
          positions: wellPositions,
          length: settings.wellLength,
          diameter: settings.wellDiameter,
          kro: settings.kro,
        }
      : undefined;

  return {
    input: {
      soilResistivity,
      conductorRadius,
      groundCurrent,
      horizontalSegments,
      topDepth: burialDepth,
      ...(rods && { rods }),
      ...(wells && { wells }),
    },
    summary: {
      conductorCount,
      segmentCount: horizontalSegments.length,
      rodCount: rodPositions.length,
      wellCount: wellPositions.length,
    },
  };
}
