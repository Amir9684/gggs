import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ieee80CalculateSchema = z.object({
  /** 1 = 100 % remote source, 2 = 75/25, 3 = 50/50, 4 = 25/75 (remote/local). */
  faultType: z.union(
    [z.literal(1), z.literal(2), z.literal(3), z.literal(4)],
    'نوع توزیع خطا نامعتبر است',
  ),

  /** 1 = tower footing 15/25 ohm, 2 = 100/200 ohm. */
  footingSet: z.union(
    [z.literal(1), z.literal(2)],
    'نوع مقاومت پایه دکل نامعتبر است',
  ),

  transmissionLines: z
    .number('تعداد خطوط انتقال الزامیست')
    .int('تعداد خطوط انتقال باید عدد صحیح باشد')
    .min(0, 'تعداد خطوط انتقال نمی‌تواند منفی باشد')
    .max(18, 'حداکثر تعداد خطوط انتقال ۱۸ است'),

  distributionLines: z
    .number('تعداد خطوط توزیع الزامیست')
    .int('تعداد خطوط توزیع باید عدد صحیح باشد')
    .min(0, 'تعداد خطوط توزیع نمی‌تواند منفی باشد')
    .max(18, 'حداکثر تعداد خطوط توزیع ۱۸ است'),

  gridResistance: z
    .number('مقاومت شبکه زمین الزامیست')
    .positive('مقاومت شبکه زمین باید بزرگ‌تر از صفر باشد'),
});

class Ieee80CalculateDto extends createZodDto(ieee80CalculateSchema) {}

export { ieee80CalculateSchema, Ieee80CalculateDto };
