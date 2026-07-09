import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const updateCalculationCaseSchema = z.object({
  id: z.string('آیدی کیس محاسباتی الزامیست'),
  name: z.string().trim().min(1, 'نام کیس محاسباتی الزامیست').optional(),
  description: z.string().trim().optional(),
});

class UpdateCalculationCaseDto extends createZodDto(
  updateCalculationCaseSchema,
) {}

export { updateCalculationCaseSchema, UpdateCalculationCaseDto };
