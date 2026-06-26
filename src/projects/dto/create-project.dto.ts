import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const createProjectSchema = z.object({
  name: z.string('نام پروژه الزامیست').trim().min(1, 'نام پروژه الزامیست'),

  description: z.string().trim().optional(),

  substationName: z
    .string('نام پست الزامیست')
    .trim()
    .min(1, 'نام پست الزامیست'),

  voltageLevel: z
    .string('سطح ولتاژ الزامیست')
    .trim()
    .min(1, 'سطح ولتاژ الزامیست'),

  standard: z.string('استاندارد الزامیست').trim().min(1, 'استاندارد الزامیست'),
});

class CreateProjectDto extends createZodDto(createProjectSchema) {}

export { createProjectSchema, CreateProjectDto };
