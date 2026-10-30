import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const updateSplitFactorSchema = z.object({
  /** Fraction of the fault current that flows into the grid: above 0, at most 1. */
  splitFactor: z
    .number('ضریب تقسیم جریان باید عدد باشد')
    .gt(0, 'ضریب تقسیم جریان باید بیشتر از صفر باشد')
    .max(1, 'ضریب تقسیم جریان نمی‌تواند بیشتر از ۱ باشد'),
});

class UpdateSplitFactorDto extends createZodDto(updateSplitFactorSchema) {}

export { updateSplitFactorSchema, UpdateSplitFactorDto };
