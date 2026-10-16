import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { gridGeneratorSchema } from './grid-generator.schema';

/**
 * Generates a rectangular grid from parameters and replaces the elements of
 * `gridId` with it (the grid's own length / width / burial depth are updated
 * to match), all in one transaction.
 */
const generateGridSchema = z.intersection(
  z.object({ gridId: z.string('آیدی شبکه الزامیست') }),
  gridGeneratorSchema,
);

class GenerateGridDto extends createZodDto(generateGridSchema) {}

export { generateGridSchema, GenerateGridDto };
