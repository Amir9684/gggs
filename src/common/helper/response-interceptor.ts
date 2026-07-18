import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import type { IResponse } from '../types';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((result: IResponse<T>) => {
        // Endpoints that stream a raw file (e.g. report downloads) handle
        // the response themselves via `@Res({ passthrough: false })` and
        // return nothing in the standard `IResponse` envelope — don't try
        // to re-wrap those, or re-set headers/status after they've
        // already been sent.
        if (result === undefined || res.headersSent) {
          return result;
        }

        res.status(result.statusCode);
        return result;
      }),
    );
  }
}
