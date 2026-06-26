import { createZodDto } from 'nestjs-zod';
import z from 'zod';

import { createGridSchema } from './create-grid.dto';

const updateGridSchema = createGridSchema
  .omit({ projectId: true })
  .partial()
  .extend({
    id: z.string('آیدی شبکه الزامیست'),
  });

class UpdateGridDto extends createZodDto(updateGridSchema) {}

export { updateGridSchema, UpdateGridDto };
