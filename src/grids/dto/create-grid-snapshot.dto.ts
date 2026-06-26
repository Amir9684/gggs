import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const createGridSnapshotSchema = z.object({
  gridId: z.string('آیدی شبکه الزامیست'),
});

class CreateGridSnapshotDto extends createZodDto(createGridSnapshotSchema) {}

export { createGridSnapshotSchema, CreateGridSnapshotDto };
