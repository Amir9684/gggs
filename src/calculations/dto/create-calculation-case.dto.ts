import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { ConductorMaterial, DesignMethod, SoilLayeringMethod } from '../enum';

const designMethodSchema = z
  .object({
    method: z.enum(DesignMethod, { error: 'انتخاب روش طراحی الزامی است.' }),
    soilLayering: z.enum(SoilLayeringMethod).optional(),
  })
  .refine(
    (data) => data.method !== DesignMethod.IEEE_80_2000 || !!data.soilLayering,
    {
      message: 'برای روش IEEE 80-2000 انتخاب نوع لایه‌بندی خاک الزامی است.',
      path: ['soilLayering'],
    },
  );

const caseConductorSchema = z
  .object({
    material: z.enum(ConductorMaterial, {
      error: 'انتخاب جنس هادی الزامیست',
    }),

    ambientTemperature: z
      .number('دمای محیط باید عدد باشد')
      .min(-40, 'دمای محیط نامعتبر است')
      .max(80, 'دمای محیط نامعتبر است')
      .default(40),

    // Defaults to the material's fusing temperature.
    allowableTemperature: z
      .number('دمای مجاز هادی باید عدد باشد')
      .positive('دمای مجاز هادی باید مثبت باشد')
      .optional(),

    // Defaults to `fault.faultDuration`.
    sizingDuration: z
      .number('مدت زمان عبور جریان باید عدد باشد')
      .positive('مدت زمان عبور جریان باید مثبت باشد')
      .optional(),

    // A cross-section the user entered instead of a standard size.
    crossSectionMm2: z
      .number('سطح مقطع هادی باید عدد باشد')
      .positive('سطح مقطع هادی باید مثبت باشد')
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

const createCalculationCaseSchema = z.object({
  projectId: z.string('آیدی پروژه الزامیست'),

  gridId: z.string('آیدی شبکه الزامیست'),

  soilModelId: z.string('آیدی مدل خاک الزامیست'),

  name: z
    .string('نام کیس محاسباتی الزامیست')
    .trim()
    .min(1, 'نام کیس محاسباتی الزامیست'),

  description: z.string().trim().optional().default(''),

  designMethod: designMethodSchema,

  // Optional: cases without it simply have no conductor sizing.
  conductor: caseConductorSchema.optional(),

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

    // Optional: when omitted, the service derives it from `faultDuration`
    // (see `engine/decrement-factor.engine.ts`). A supplied value overrides it.
    decrementFactor: z
      .number('فاکتور کاهنده باید عدد باشد')
      .gte(1, 'فاکتور کاهنده باید حداقل یک باشد')
      .optional(),

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

export {
  createCalculationCaseSchema,
  caseConductorSchema,
  CreateCalculationCaseDto,
};
