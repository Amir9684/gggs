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
const createGridElementsBulkSchema = z.object({
  gridId: z.string('آیدی شبکه الزامیست'),

  elements: z
    .array(
      z.object({
        type: gridElementTypeSchema,
        geometry: geometrySchema,
        properties: z.record(z.string(), z.any()).optional().default({}),
      }),
    )
    .min(1, 'حداقل یک المان الزامیست'),
});

class CreateGridElementDto extends createZodDto(createGridElementSchema) {}
class CreateGridElementsBulkDto extends createZodDto(
  createGridElementsBulkSchema,
) {}

export {
  gridElementTypeSchema,
  createGridElementSchema,
  createGridElementsBulkSchema,
  CreateGridElementDto,
  CreateGridElementsBulkDto,
};
