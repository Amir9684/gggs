import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import {
  AuthenticatedRequest,
  IAuthenticatedUser,
} from '../types/authenticated-request.type';
/**
 * Extracts the authenticated user attached to the request by `JwtStrategy`.
 *
 * @example
 * @UseGuards(JwtAuthGuard)
 * @Get('me')
 * me(@CurrentUser() user: IAuthenticatedUser) {}
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IAuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
