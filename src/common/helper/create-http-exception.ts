import { HttpException } from '@nestjs/common';

import { HttpStatus, HttpStatusLabel } from '../types';

/**
 * Builds an `HttpException` whose response body matches the app's
 * `IResponse` envelope, e.g.:
 *
 * {
 *   statusCode: 401,
 *   message: ["..."],
 *   data: null,
 *   error: "Unauthorized"
 * }
 *
 * Use this anywhere a guard/filter needs to throw in the app's own shape
 * instead of Nest's default `{ statusCode, message, error }` body.
 */
export function createHttpException(
  statusCode: HttpStatus,
  message: string | string[],
): HttpException {
  return new HttpException(
    {
      statusCode,
      message: Array.isArray(message) ? message : [message],
      data: null,
      error: HttpStatusLabel[statusCode],
    },
    statusCode,
  );
}
