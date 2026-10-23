import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const updateGalerkinSettingsSchema = z.object({
  segmentLength: z
    .number('طول قطعه باید عدد باشد')
    .min(0.5, 'طول قطعه نمی‌تواند کمتر از ۰٫۵ متر باشد')
    .max(50, 'طول قطعه نمی‌تواند بیشتر از ۵۰ متر باشد')
    .optional(),

  rodRadius: z
    .number('شعاع میله باید عدد باشد')
    .min(0.001, 'شعاع میله نمی‌تواند کمتر از ۱ میلی‌متر باشد')
    .max(0.1, 'شعاع میله نمی‌تواند بیشتر از ۱۰ سانتی‌متر باشد')
    .optional(),

  wellDiameter: z
    .number('قطر چاه باید عدد باشد')
    .min(0.05, 'قطر چاه نمی‌تواند کمتر از ۵ سانتی‌متر باشد')
    .max(5, 'قطر چاه نمی‌تواند بیشتر از ۵ متر باشد')
    .optional(),

  wellLength: z
    .number('طول چاه باید عدد باشد')
    .min(0.1, 'طول چاه نمی‌تواند کمتر از ۰٫۱ متر باشد')
    .max(50, 'طول چاه نمی‌تواند بیشتر از ۵۰ متر باشد')
    .optional(),

  kro: z
    .number('ضریب Kro باید عدد باشد')
    .positive('ضریب Kro باید مثبت باشد')
    .max(10, 'ضریب Kro نامعتبر است')
    .optional(),
});

class UpdateGalerkinSettingsDto extends createZodDto(
  updateGalerkinSettingsSchema,
) {}

export { updateGalerkinSettingsSchema, UpdateGalerkinSettingsDto };
