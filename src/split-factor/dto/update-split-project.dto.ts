import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const updateSplitProjectSchema = z.object({
  name: z
    .string('نام پروژه باید متن باشد')
    .trim()
    .min(1, 'نام پروژه الزامیست')
    .max(120, 'نام پروژه نمی‌تواند بیشتر از ۱۲۰ نویسه باشد')
    .optional(),

  /** Validated against the stored method's schema in the service. */
  input: z.unknown().optional(),
});

class UpdateSplitProjectDto extends createZodDto(updateSplitProjectSchema) {}

export { updateSplitProjectSchema, UpdateSplitProjectDto };
