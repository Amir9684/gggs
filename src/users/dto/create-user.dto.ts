import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const createUserSchema = z.object({
  username: z
    .string('نام کاربری الزامیست')
    .trim()
    .min(1, 'نام کاربری الزامیست'),

  email: z.string('ایمیل الزامیست').trim().email('ایمیل نامعتبر است'),

  password: z
    .string('رمز عبور الزامیست')
    .min(8, 'رمز عبور حداقل باید 8 کارکتر باشد')
    .max(16, 'رمز عبور حداکثر باید 16 کارکتر باشد'),
});

class CreateUserDto extends createZodDto(createUserSchema) {}

export { createUserSchema, CreateUserDto };
