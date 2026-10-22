import { createZodDto } from 'nestjs-zod';

import { createGroundWireSchema } from './create-ground-wire.dto';

const updateGroundWireSchema = createGroundWireSchema.partial();

class UpdateGroundWireDto extends createZodDto(updateGroundWireSchema) {}

export { updateGroundWireSchema, UpdateGroundWireDto };
