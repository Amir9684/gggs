import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  catalogWireSchema,
  complexSchema,
  directWireSchema,
} from './soni-calculate.dto';

const ramezaniSpanSchema = z.object({
  length: z
    .number('طول span الزامیست')
    .positive('طول span باید بزرگ‌تر از صفر باشد'),
  towerFootingResistance: z
    .number('مقاومت پایه دکل الزامیست')
    .positive('مقاومت پایه دکل باید بزرگ‌تر از صفر باشد'),
});

const ramezaniTerminalSchema = z.object({
  name: z.string().trim().optional(),
  faultCurrent: complexSchema,
  groundWire: z.discriminatedUnion('source', [
    directWireSchema,
    catalogWireSchema,
  ]),
  /** Mutual impedance ground wire - phase conductors, same unit as Zgw (ohm/km). */
  mutualImpedance: complexSchema.default({ re: 0, im: 0 }),
  spans: z
    .array(ramezaniSpanSchema)
    .min(1, 'هر ترمینال حداقل یک span لازم دارد')
    .max(200, 'حداکثر ۲۰۰ span برای هر ترمینال مجاز است'),
  /** Fraction of the line that has a ground wire; 1 = continuous. */
  groundWireFraction: z
    .number('نسبت طول سیم گارد باید عدد باشد')
    .gt(0, 'نسبت طول سیم گارد باید بیشتر از صفر باشد')
    .max(1, 'نسبت طول سیم گارد نمی‌تواند بیشتر از ۱ باشد')
    .default(1),
});

const ramezaniCalculateSchema = z.object({
  gridResistance: z
    .number('مقاومت شبکه زمین الزامیست')
    .positive('مقاومت شبکه زمین باید بزرگ‌تر از صفر باشد'),
  frequency: z.number().positive().default(50),
  /** Total fault current IG for a fault in the vicinity; zero = fault inside the substation. */
  groundFaultCurrent: complexSchema.default({ re: 0, im: 0 }),
  terminals: z
    .array(ramezaniTerminalSchema)
    .min(1, 'حداقل یک ترمینال لازم است')
    .max(50, 'حداکثر ۵۰ ترمینال مجاز است'),
});

class RamezaniCalculateDto extends createZodDto(ramezaniCalculateSchema) {}

export { ramezaniCalculateSchema, RamezaniCalculateDto };
export type RamezaniCalculateInput = z.infer<typeof ramezaniCalculateSchema>;
