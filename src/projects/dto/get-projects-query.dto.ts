import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const getProjectsQuerySchema = z.object({
  name: z.string().optional(),
  substationName: z.string().optional(),
  voltageLevel: z.string().optional(),
  pageNumber: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(50),
});

export class GetProjectsQueryDTO extends createZodDto(getProjectsQuerySchema) {}
