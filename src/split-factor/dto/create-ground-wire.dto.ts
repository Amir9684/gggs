import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const createGroundWireSchema = z.object({
  name: z
    .string('نام سیم گارد الزامیست')
    .trim()
    .min(1, 'نام سیم گارد الزامیست'),

  acResistance: z
    .number('مقاومت AC الزامیست')
    .positive('مقاومت AC باید بزرگ‌تر از صفر باشد'),

  dcResistance: z
    .number('مقاومت DC الزامیست')
    .positive('مقاومت DC باید بزرگ‌تر از صفر باشد'),

  gmr: z
    .number('شعاع متوسط هندسی (GMR) الزامیست')
    .positive('GMR باید بزرگ‌تر از صفر باشد'),

  reactance: z
    .number('راکتانس باید عدد باشد')
    .min(0, 'راکتانس نمی‌تواند منفی باشد')
    .default(0),
});

class CreateGroundWireDto extends createZodDto(createGroundWireSchema) {}

export { createGroundWireSchema, CreateGroundWireDto };
