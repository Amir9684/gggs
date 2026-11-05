import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { SPLIT_METHODS } from '../split-method';

const createSplitProjectSchema = z.object({
  name: z
    .string('نام پروژه الزامیست')
    .trim()
    .min(1, 'نام پروژه الزامیست')
    .max(120, 'نام پروژه نمی‌تواند بیشتر از ۱۲۰ نویسه باشد'),

  method: z.enum(SPLIT_METHODS, { error: 'روش محاسبه نامعتبر است' }),

  /** Validated against the method's own schema in the service. */
  input: z.unknown(),
});

class CreateSplitProjectDto extends createZodDto(createSplitProjectSchema) {}

export { createSplitProjectSchema, CreateSplitProjectDto };
