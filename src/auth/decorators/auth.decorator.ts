import { applyDecorators, UseGuards } from '@nestjs/common';

import UserRole from 'src/users/enum';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './role.decorator';

/**
 * Requires a valid JWT and, if any roles are given, restricts the route to
 * those roles. Combines `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`
 * into a single decorator.
 *
 * @example
 * @Auth(UserRole.ADMIN)
 * @Controller('users')
 * export class UserController {}
 *
 * @example
 * // Authenticated only, any role
 * @Auth()
 * @Get('me')
 * me() {}
 */
export const Auth = (...roles: UserRole[]) =>
  applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(...roles));
