import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Windows GGGS files are a few KB; anything this large is not one. */
export const MAX_GGGS_FILE_BYTES = 64 * 1024;

const parseGggsSchema = z.object({
  /** The `.gggs` file, base64-encoded. */
  contentBase64: z
    .string('محتوای فایل الزامیست')
    .min(1, 'فایل خالی است')
    .max(
      Math.ceil((MAX_GGGS_FILE_BYTES * 4) / 3) + 4,
      'حجم فایل بیش از حد مجاز است',
    )
    .regex(/^[A-Za-z0-9+/\s]+={0,2}\s*$/, 'محتوای فایل base64 معتبر نیست'),

  /** `AUTO` tells the file type apart by its record count. */
  kind: z
    .enum(['AUTO', 'GROUNDING_INPUT', 'IEEE_80_2000', 'IEEE_80_2000_TWO_LAYER'])
    .default('AUTO'),
});

class ParseGggsDto extends createZodDto(parseGggsSchema) {}

export { parseGggsSchema, ParseGggsDto };
