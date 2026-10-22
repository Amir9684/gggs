import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const complexSchema = z.object({
  re: z.number('مقدار حقیقی باید عدد باشد'),
  im: z.number('مقدار موهومی باید عدد باشد'),
});

/** The ground wire impedance is typed in directly (ohm/km)... */
const directWireSchema = z.object({
  source: z.literal('DIRECT'),
  impedance: complexSchema,
});

/** ...or computed from a catalog wire and the earth resistivity. */
const catalogWireSchema = z.object({
  source: z.literal('CATALOG'),
  groundWireId: z.string('انتخاب سیم گارد الزامیست').min(1),
  earthResistivity: z
    .number('مقاومت ویژه خاک الزامیست')
    .positive('مقاومت ویژه خاک باید بزرگ‌تر از صفر باشد'),
  resistanceSource: z.enum(['AC', 'DC']).default('AC'),
  reactanceSource: z.enum(['GMR', 'REACTANCE']).default('GMR'),
});

const soniTerminalSchema = z.object({
  name: z.string().trim().optional(),
  faultCurrent: complexSchema,
  spanLength: z
    .number('طول span الزامیست')
    .positive('طول span باید بزرگ‌تر از صفر باشد'),
  towerFootingResistance: z
    .number('مقاومت پایه دکل الزامیست')
    .positive('مقاومت پایه دکل باید بزرگ‌تر از صفر باشد'),
  groundWire: z.discriminatedUnion('source', [
    directWireSchema,
    catalogWireSchema,
  ]),
  /** Mutual impedance ground wire - phase conductors (ohm/m). */
  mutualImpedance: complexSchema.default({ re: 0, im: 0 }),
});

const soniCalculateSchema = z.object({
  gridResistance: z
    .number('مقاومت شبکه زمین الزامیست')
    .positive('مقاومت شبکه زمین باید بزرگ‌تر از صفر باشد'),
  frequency: z.number().positive().default(50),
  terminals: z
    .array(soniTerminalSchema)
    .min(1, 'حداقل یک ترمینال لازم است')
    .max(50, 'حداکثر ۵۰ ترمینال مجاز است'),
});

class SoniCalculateDto extends createZodDto(soniCalculateSchema) {}

export { soniCalculateSchema, SoniCalculateDto };
export type SoniCalculateInput = z.infer<typeof soniCalculateSchema>;
