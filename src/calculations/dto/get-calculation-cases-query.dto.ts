import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const getCalculationCasesQuerySchema = z.object({
  projectId: z.string().optional(),
  gridId: z.string().optional(),
  soilModelId: z.string().optional(),
  name: z.string().optional(),
  pageNumber: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(50),
});

export class GetCalculationCasesQueryDTO extends createZodDto(
  getCalculationCasesQuerySchema,
) {}
