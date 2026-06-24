import { Injectable, CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import UserRole from 'src/users/enum';
import { TAuthenticatedRequestType } from 'src/auth/types/authenticated-request.type';
import { createHttpException } from 'src/common/helper/create-http-exception';

import { ROLES_KEY } from '../constants';
import { HttpStatus } from 'src/common/types';
/**
 * Authorizes a request based on the roles set via `@Roles(...)`.
 * Must run after `JwtAuthGuard` so `request.user.role` is available.
 *
 * @example
 * @Roles(UserRole.ADMIN)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Delete(':id')
 * delete() {}
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<TAuthenticatedRequestType>();

    if (!user || !requiredRoles.includes(user.role)) {
      throw createHttpException(
        HttpStatus.FORBIDDEN,
        'شما به این بخش دسترسی ندارید.',
      );
    }

    return true;
  }
}
