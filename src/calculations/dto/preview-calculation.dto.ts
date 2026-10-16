import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { MAX_BULK_ELEMENTS } from 'src/grids/dto/create-grid-element.dto';
import { gridElementTypeSchema } from 'src/grids/dto/create-grid-element.dto';
import { geometrySchema } from 'src/grids/dto/geometry.schema';

/**
 * Body of `POST /calculation-cases/:id/preview`.
 *
 * Everything is optional: an empty body previews the case exactly as
 * stored. Whatever is sent replaces the stored value *for this preview
 * only* — nothing here is saved. Values are only checked for being
 * numbers; the real limits (positive, <= 1, ...) are enforced by the same
 * validation `run()` uses, so a preview rejects exactly what a run would.
 */
const previewCalculationSchema = z.object({
  grid: z
    .object({
      length: z.number().optional(),
      width: z.number().optional(),
      burialDepth: z.number().optional(),
    })
    .optional(),

  // The editor's current, possibly unsaved, elements. When omitted the
  // grid's saved elements are used.
  elements: z
    .array(
      z.object({
        type: gridElementTypeSchema,
        geometry: geometrySchema,
        properties: z.record(z.string(), z.any()).optional().default({}),
      }),
    )
    .max(MAX_BULK_ELEMENTS)
    .optional(),

  fault: z
    .object({
      faultCurrent: z.number().optional(),
      faultDuration: z.number().optional(),
      splitFactor: z.number().optional(),
      decrementFactor: z.number().optional(),
      shockDuration: z.number().optional(),
    })
    .optional(),

  settings: z
    .object({
      surfaceLayerResistivity: z.number().optional(),
      surfaceLayerThickness: z.number().optional(),
      bodyWeight: z.number().optional(),
      frequency: z.number().optional(),
    })
    .optional(),
});

class PreviewCalculationDto extends createZodDto(previewCalculationSchema) {}

export { previewCalculationSchema, PreviewCalculationDto };
