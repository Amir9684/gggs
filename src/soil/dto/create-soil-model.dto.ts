import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const soilLayerSchema = z.object({
  layerOrder: z
    .number('ترتیب لایه الزامیست')
    .int()
    .min(1, 'ترتیب لایه باید حداقل 1 باشد'),

  resistivity: z
    .number('مقاومت ویژه الزامیست')
    .positive('مقاومت ویژه باید مثبت باشد'),

  thickness: z
    .number('ضخامت لایه الزامیست')
    .positive('ضخامت لایه باید مثبت باشد'),
});

const createSoilModelSchema = z.object({
  projectId: z.string('آیدی پروژه الزامیست'),

  name: z.string('نام مدل خاک الزامیست').trim().min(1, 'نام مدل خاک الزامیست'),

  surfaceResistivity: z
    .number('مقاومت ویژه سطحی الزامیست')
    .positive('مقاومت ویژه سطحی باید مثبت باشد'),

  layers: z
    .array(soilLayerSchema)
    .min(1, 'مدل خاک باید حداقل یک لایه داشته باشد'),
});

class CreateSoilModelDto extends createZodDto(createSoilModelSchema) {}

export { soilLayerSchema, createSoilModelSchema, CreateSoilModelDto };
