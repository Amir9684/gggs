import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { ReportTemplate } from '../report-template';

const generateReportSchema = z.object({
  resultId: z.string('آیدی نتیجه محاسبه الزامیست'),

  name: z.string().trim().min(1).optional(),

  /** `AUTO` (default) picks the template that matches the case. */
  template: z.enum(ReportTemplate).default(ReportTemplate.AUTO),

  /**
   * Include the intermediate values (conductor sizing, decrement factor,
   * Cs, Km, Ks, Ki, Kh, n, two-layer corrections) and the methodology
   * pages. Off gives the short report: inputs, results and charts.
   */
  includeDetails: z.boolean().default(true),

  /**
   * Print the fault duration as "0.5 s or more" (the Windows report's
   * last decrement-factor row). Omitted: follows the fault duration.
   */
  halfSecondVariant: z.boolean().optional(),
});

class GenerateReportDto extends createZodDto(generateReportSchema) {}

export { generateReportSchema, GenerateReportDto };
