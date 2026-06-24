import { SetMetadata } from '@nestjs/common';

import UserRole from 'src/users/enum';
import { ROLES_KEY } from '../constants';

/**
 * Restricts a route to the given user roles.
 * Must be combined with `JwtAuthGuard` and `RolesGuard`.
 *
 * @example
 * @Roles(UserRole.ADMIN)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Delete(':id')
 * delete() {}
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
