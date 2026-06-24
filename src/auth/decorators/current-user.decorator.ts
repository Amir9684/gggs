import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import {
  TAuthenticatedRequestType,
  TAuthenticatedUserType,
} from '../types/authenticated-request.type';
/**
 * Extracts the authenticated user attached to the request by `JwtStrategy`.
 *
 * @example
 * @UseGuards(JwtAuthGuard)
 * @Get('me')
 * me(@CurrentUser() user: TAuthenticatedUserType) {}
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TAuthenticatedUserType => {
    const request = ctx.switchToHttp().getRequest<TAuthenticatedRequestType>();
    return request.user;
  },
);
