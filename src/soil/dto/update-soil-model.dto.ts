import { createZodDto } from 'nestjs-zod';
import z from 'zod';

import { soilLayerSchema } from './create-soil-model.dto';

const updateSoilLayerSchema = soilLayerSchema.partial().extend({
  id: z.string().optional(),
});

const updateSoilModelSchema = z.object({
  id: z.string('آیدی مدل خاک الزامیست'),

  name: z.string().trim().min(1, 'نام مدل خاک الزامیست').optional(),

  surfaceResistivity: z
    .number()
    .positive('مقاومت ویژه سطحی باید مثبت باشد')
    .optional(),

  layers: z
    .array(updateSoilLayerSchema)
    .min(1, 'مدل خاک باید حداقل یک لایه داشته باشد')
    .optional(),
});

class UpdateSoilModelDto extends createZodDto(updateSoilModelSchema) {}

export { updateSoilLayerSchema, updateSoilModelSchema, UpdateSoilModelDto };
