import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const createGridSchema = z.object({
  projectId: z.string('آیدی پروژه الزامیست'),

  name: z.string('نام شبکه الزامیست').trim().min(1, 'نام شبکه الزامیست'),

  length: z.number('طول شبکه الزامیست').positive('طول شبکه باید مثبت باشد'),

  width: z.number('عرض شبکه الزامیست').positive('عرض شبکه باید مثبت باشد'),

  burialDepth: z.number('عمق دفن الزامیست').positive('عمق دفن باید مثبت باشد'),
});

class CreateGridDto extends createZodDto(createGridSchema) {}

export { createGridSchema, CreateGridDto };
