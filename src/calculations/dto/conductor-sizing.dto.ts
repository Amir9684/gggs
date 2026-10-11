import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { ConductorMaterial } from '../enum';

const conductorSizingSchema = z
  .object({
    material: z.enum(ConductorMaterial, {
      error: 'انتخاب جنس هادی الزامیست',
    }),

    faultCurrent: z
      .number('جریان اتصال کوتاه الزامیست')
      .positive('جریان اتصال کوتاه باید مثبت باشد'),

    duration: z
      .number('مدت زمان عبور جریان الزامیست')
      .positive('مدت زمان عبور جریان باید مثبت باشد'),

    ambientTemperature: z
      .number('دمای محیط باید عدد باشد')
      .min(-40, 'دمای محیط نامعتبر است')
      .max(80, 'دمای محیط نامعتبر است')
      .default(40),

    // Defaults to the material's fusing temperature when omitted.
    allowableTemperature: z
      .number('دمای مجاز هادی باید عدد باشد')
      .positive('دمای مجاز هادی باید مثبت باشد')
      .optional(),
  })
  .refine(
    (data) =>
      data.allowableTemperature === undefined ||
      data.allowableTemperature > data.ambientTemperature,
    {
      message: 'دمای مجاز هادی باید بیشتر از دمای محیط باشد',
      path: ['allowableTemperature'],
    },
  );

class ConductorSizingDto extends createZodDto(conductorSizingSchema) {}

export { conductorSizingSchema, ConductorSizingDto };
