import UserRole from '../enum';

import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const getUsersQuerySchema = z.object({
  username: z.string().optional(),
  email: z.email().optional(),
  role: z.enum(UserRole).optional(),
  pageNumber: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(50),
});

export class GetUsersQueryDTO extends createZodDto(getUsersQuerySchema) {}
