import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { GridElementType } from '../enum';
import { geometrySchema } from './geometry.schema';

const gridElementTypeSchema = z.enum(GridElementType, {
  error: 'نوع المان نامعتبر است',
});

const createGridElementSchema = z.object({
  gridId: z.string('آیدی شبکه الزامیست'),

  type: gridElementTypeSchema,

  geometry: geometrySchema,

  properties: z.record(z.string(), z.any()).optional().default({}),
});

/**
 * Grids are typically authored on a map by drawing many elements at once
 * (conductors, rods, fences, ...), so creation supports a single element
 * or a batch sharing the same `gridId`.
 */
const MAX_BULK_ELEMENTS = 5000;

/**
 * Optional new plan dimensions for the grid, applied in the same
 * transaction as the element replacement. A generated layout changes the
 * grid's length/width/burial depth together with its conductors, and the
 * two must never be saved apart.
 */
const bulkGridDimensionsSchema = z.object({
  length: z.number().positive('طول شبکه باید مثبت باشد').optional(),
  width: z.number().positive('عرض شبکه باید مثبت باشد').optional(),
  burialDepth: z.number().positive('عمق دفن باید مثبت باشد').optional(),
});

const createGridElementsBulkSchema = z.object({
  gridId: z.string('آیدی شبکه الزامیست'),

  grid: bulkGridDimensionsSchema.optional(),

  elements: z
    .array(
      z.object({
        type: gridElementTypeSchema,
        geometry: geometrySchema,
        properties: z.record(z.string(), z.any()).optional().default({}),
      }),
    )
    .min(1, 'حداقل یک المان الزامیست')
    .max(
      MAX_BULK_ELEMENTS,
      `حداکثر ${MAX_BULK_ELEMENTS} المان در هر ذخیره مجاز است`,
    ),
});

class CreateGridElementDto extends createZodDto(createGridElementSchema) {}
class CreateGridElementsBulkDto extends createZodDto(
  createGridElementsBulkSchema,
) {}

export {
  MAX_BULK_ELEMENTS,
  bulkGridDimensionsSchema,
  gridElementTypeSchema,
  createGridElementSchema,
  createGridElementsBulkSchema,
  CreateGridElementDto,
  CreateGridElementsBulkDto,
};
