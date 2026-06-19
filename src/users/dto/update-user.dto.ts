import { createUserSchema } from './create-user.dto';
import z from 'zod';

const updateUserSchema = createUserSchema.partial().extend({
  id: z.string('آیدی پروژه الزامیست'),
});

type UpdateUserDto = z.infer<typeof updateUserSchema>;

export { updateUserSchema, type UpdateUserDto };
