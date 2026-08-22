import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const getReportsQuerySchema = z.object({
  projectId: z.string().optional(),
  resultId: z.string().optional(),
  name: z.string().optional(),
  pageNumber: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(50),
});

export class GetReportsQueryDTO extends createZodDto(getReportsQuerySchema) {}
