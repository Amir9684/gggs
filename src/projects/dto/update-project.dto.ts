import { createZodDto } from 'nestjs-zod';
import z from 'zod';

import { createProjectSchema } from './create-project.dto';

const updateProjectSchema = createProjectSchema.partial().extend({
  id: z.string('آیدی پروژه الزامیست'),
});

class UpdateProjectDto extends createZodDto(updateProjectSchema) {}

export { updateProjectSchema, UpdateProjectDto };
