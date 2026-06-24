import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const loginSchema = z.object({
  username: z
    .string('نام کاربری الزامیست')
    .trim()
    .min(1, 'نام کاربری الزامیست'),

  password: z.string('رمز عبور الزامیست').min(1, 'رمز عبور الزامیست'),
});

class LoginDto extends createZodDto(loginSchema) {}

export { loginSchema, LoginDto };
