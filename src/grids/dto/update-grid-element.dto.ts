import { createZodDto } from 'nestjs-zod';
import z from 'zod';

import { gridElementTypeSchema } from './create-grid-element.dto';
import { geometrySchema } from './geometry.schema';

const updateGridElementSchema = z.object({
  id: z.string('آیدی المان الزامیست'),
  type: gridElementTypeSchema.optional(),
  geometry: geometrySchema.optional(),
  properties: z.record(z.string(), z.any()).optional(),
});

class UpdateGridElementDto extends createZodDto(updateGridElementSchema) {}

export { updateGridElementSchema, UpdateGridElementDto };
