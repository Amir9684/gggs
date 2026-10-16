import { z } from 'zod';

import {
  MAX_LINES_PER_DIRECTION,
  lineCountsFromSpacing,
  type GridGeneratorParams,
} from 'src/calculations/engine/grid-generator.engine';

const lineCount = z
  .number()
  .int('تعداد خطوط باید عدد صحیح باشد')
  .min(2, 'در هر جهت حداقل دو خط هادی لازم است')
  .max(
    MAX_LINES_PER_DIRECTION,
    `حداکثر ${MAX_LINES_PER_DIRECTION} خط هادی در هر جهت پشتیبانی می‌شود`,
  );

/**
 * Parameters of the parametric (Autoform-like) rectangular grid. Either
 * `spacing` or both line counts must be given; with `spacing` the line counts
 * are derived so the lines are evenly distributed over the dimensions.
 */
const gridGeneratorSchema = z
  .object({
    length: z.number('طول شبکه الزامیست').positive('طول شبکه باید مثبت باشد'),
    width: z.number('عرض شبکه الزامیست').positive('عرض شبکه باید مثبت باشد'),
    burialDepth: z
      .number('عمق دفن الزامیست')
      .positive('عمق دفن باید مثبت باشد'),
    /** Conductor diameter in metres. */
    conductorDiameter: z
      .number('قطر هادی الزامیست')
      .positive('قطر هادی باید مثبت باشد'),
    spacing: z.number().positive('فاصله هادی‌ها باید مثبت باشد').optional(),
    alongLengthCount: lineCount.optional(),
    alongWidthCount: lineCount.optional(),
    rods: z
      .object({
        arrangement: z.enum(['NONE', 'CORNERS', 'PERIMETER', 'INTERIOR']),
        count: z.number().int().min(0).default(0),
        length: z.number().min(0).default(0),
      })
      .default({ arrangement: 'NONE', count: 0, length: 0 }),
  })
  .refine(
    (value) =>
      value.spacing !== undefined ||
      (value.alongLengthCount !== undefined &&
        value.alongWidthCount !== undefined),
    {
      message: 'فاصله هادی‌ها یا تعداد خطوط در هر دو جهت باید مشخص شود',
      path: ['spacing'],
    },
  );

type GridGeneratorInput = z.infer<typeof gridGeneratorSchema>;

/** Resolves spacing / counts into the engine's parameter shape. */
function toGeneratorParams(input: GridGeneratorInput): GridGeneratorParams {
  const lineCounts =
    input.alongLengthCount !== undefined && input.alongWidthCount !== undefined
      ? {
          alongLength: input.alongLengthCount,
          alongWidth: input.alongWidthCount,
        }
      : lineCountsFromSpacing(input.length, input.width, input.spacing ?? 0);

  return {
    length: input.length,
    width: input.width,
    burialDepth: input.burialDepth,
    conductorDiameter: input.conductorDiameter,
    lineCounts,
    rods: input.rods,
  };
}

export { gridGeneratorSchema, toGeneratorParams };
export type { GridGeneratorInput };
