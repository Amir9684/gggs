import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const createCalculationCaseSchema = z.object({
  projectId: z.string('آیدی پروژه الزامیست'),

  gridId: z.string('آیدی شبکه الزامیست'),

  soilModelId: z.string('آیدی مدل خاک الزامیست'),

  name: z
    .string('نام کیس محاسباتی الزامیست')
    .trim()
    .min(1, 'نام کیس محاسباتی الزامیست'),

  description: z.string().trim().optional().default(''),

  fault: z.object({
    faultCurrent: z
      .number('جریان اتصال کوتاه الزامیست')
      .positive('جریان اتصال کوتاه باید مثبت باشد'),

    faultDuration: z
      .number('مدت زمان خطا الزامیست')
      .positive('مدت زمان خطا باید مثبت باشد'),

    splitFactor: z
      .number('ضریب تقسیم جریان الزامیست')
      .gt(0, 'ضریب تقسیم جریان باید بزرگ‌تر از صفر باشد')
      .lte(1, 'ضریب تقسیم جریان باید حداکثر یک باشد'),

    decrementFactor: z
      .number('فاکتور کاهنده الزامیست')
      .gte(1, 'فاکتور کاهنده باید حداقل یک باشد'),

    shockDuration: z
      .number('مدت زمان شوک الزامیست')
      .positive('مدت زمان شوک باید مثبت باشد'),
  }),

  settings: z.object({
    surfaceLayerResistivity: z
      .number('مقاومت ویژه لایه سطحی الزامیست')
      .positive('مقاومت ویژه لایه سطحی باید مثبت باشد'),

    surfaceLayerThickness: z
      .number('ضخامت لایه سطحی الزامیست')
      .min(0, 'ضخامت لایه سطحی باید صفر یا بیشتر باشد'),

    bodyWeight: z
      .number('وزن بدن الزامیست')
      .positive('وزن بدن باید مثبت باشد')
      .default(70),

    frequency: z
      .number('فرکانس شبکه الزامیست')
      .positive('فرکانس شبکه باید مثبت باشد')
      .default(50),
  }),
});

class CreateCalculationCaseDto extends createZodDto(
  createCalculationCaseSchema,
) {}

export { createCalculationCaseSchema, CreateCalculationCaseDto };
