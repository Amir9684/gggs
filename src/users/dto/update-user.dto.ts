import { createZodDto } from 'nestjs-zod';
import { createUserSchema } from './create-user.dto';
import z from 'zod';

const updateUserSchema = createUserSchema.partial().extend({
  id: z.string('آیدی پروژه الزامیست'),
});

class UpdateUserDto extends createZodDto(updateUserSchema) {}

export { updateUserSchema, UpdateUserDto };
