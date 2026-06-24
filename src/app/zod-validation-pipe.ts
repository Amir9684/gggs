import { BadRequestException } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';
import type { ZodError } from 'zod';

import { HttpStatus, HttpStatusLabel } from 'src/common/types';

/**
 * Reshapes nestjs-zod's default validation error body:
 *
 * {
 *   statusCode,
 *   message: "Validation failed",
 *   errors: [ <zod issue>, ... ]
 * }
 *
 * into the app's own error envelope:
 *
 * {
 *   statusCode,
 *   HttpStatus: HttpStatusLabel[HttpStatus],
 *   messages: ["<message 1>", "<message 2>"]
 * }
 *
 * Registered as the global `APP_PIPE` in place of the bare `ZodValidationPipe`.
 */
export const AppZodValidationPipe = createZodValidationPipe({
  createValidationException: (error: ZodError) =>
    new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      messages: error.issues.map((issue) => issue.message),
      data: null,
      error: HttpStatusLabel[HttpStatus.BAD_REQUEST],
    }),
});
