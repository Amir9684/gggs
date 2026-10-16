import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { gridGeneratorSchema } from 'src/grids/dto/grid-generator.schema';

/**
 * Overrides for a stateless preview of a case. Nothing here is saved: the
 * case, its grid and its fault / settings rows stay exactly as stored, so a
 * UI can drive sliders against the engine without touching the data.
 */
const previewCalculationSchema = z.object({
  /**
   * A parametric grid used INSTEAD of the case's stored grid and elements
   * (dimensions, burial depth, line counts or spacing, rods, conductor
   * diameter).
   */
  grid: gridGeneratorSchema.optional(),

  fault: z
    .object({
      faultCurrent: z.number().positive('جریان خطا باید مثبت باشد'),
      /** When given without `decrementFactor`, Df follows from it. */
      faultDuration: z.number().positive('مدت زمان خطا باید مثبت باشد'),
      splitFactor: z
        .number()
        .positive('ضریب تقسیم باید مثبت باشد')
        .max(1, 'ضریب تقسیم حداکثر ۱ است'),
      decrementFactor: z.number().min(1, 'ضریب کاهشی باید حداقل ۱ باشد'),
    })
    .partial()
    .optional(),

  settings: z
    .object({
      surfaceLayerResistivity: z.number().min(0),
      surfaceLayerThickness: z.number().min(0),
      bodyWeight: z.number().positive(),
      frequency: z.number().positive(),
    })
    .partial()
    .optional(),
});

class PreviewCalculationDto extends createZodDto(previewCalculationSchema) {}

export { previewCalculationSchema, PreviewCalculationDto };
