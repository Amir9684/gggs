import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const generateReportSchema = z.object({
  resultId: z.string('آیدی نتیجه محاسبه الزامیست'),

  name: z.string().trim().min(1).optional(),

  format: z.enum(['PDF', 'Word', 'Excel']).optional().default('PDF'),
});

class GenerateReportDto extends createZodDto(generateReportSchema) {}

export { generateReportSchema, GenerateReportDto };
