import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { MAX_BULK_ELEMENTS } from 'src/grids/dto/create-grid-element.dto';
import { gridElementTypeSchema } from 'src/grids/dto/create-grid-element.dto';
import { geometrySchema } from 'src/grids/dto/geometry.schema';
import { gridGeneratorSchema } from 'src/grids/dto/grid-generator.schema';

/**
 * Body of `POST /calculation-cases/:id/preview`.
 *
 * Everything is optional: an empty body previews the case exactly as
 * stored. Whatever is sent replaces the stored value *for this preview
 * only* — nothing here is saved. Values are only checked for being
 * numbers, except the split factor's 0 < Sf <= 1; the other limits are
 * enforced by the same validation `run()` uses, so a preview rejects exactly
 * what a run would.
 *
 * `grid` is either new plan dimensions for the stored layout, or the
 * parameters of the parametric generator (the grid editor's generator
 * dialog): in that case the layout is generated for this preview and the
 * stored elements are not read.
 */
const previewCalculationSchema = z.object({
  grid: z
    .union([
      gridGeneratorSchema,
      // Strict, so a half-filled generator (e.g. a conductor diameter with
      // neither spacing nor line counts) is rejected instead of being
      // silently read as plain dimensions.
      z.strictObject({
        length: z.number().optional(),
        width: z.number().optional(),
        burialDepth: z.number().optional(),
      }),
    ])
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
      // Same bounds as the case form: the split factor is a fraction.
      splitFactor: z
        .number()
        .gt(0, 'ضریب تقسیم جریان باید بزرگ‌تر از صفر باشد')
        .lte(1, 'ضریب تقسیم جریان باید حداکثر یک باشد')
        .optional(),
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
