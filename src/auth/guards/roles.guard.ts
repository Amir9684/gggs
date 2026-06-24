import {
  Injectable,
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import UserRole from 'src/users/enum';

import { AuthenticatedRequest } from 'src/auth/types/authenticated-request.type';
import { ROLES_KEY } from '../constants';
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

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('شما به این بخش دسترسی ندارید.');
    }

    return true;
  }
}
