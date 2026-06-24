import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { HttpStatus } from 'src/common/types';
import { createHttpException } from 'src/common/helper/create-http-exception';
import { User } from 'src/users/entities/user.entity';

/**
 * Protects a route, requiring a valid Bearer JWT.
 * Populates `request.user` with `{ id, username, role }` (see `JwtStrategy`).
 *
 * @example
 * @UseGuards(JwtAuthGuard)
 * @Get('me')
 * me(@CurrentUser() user: IAuthenticatedUser) {}
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = User>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw createHttpException(
        HttpStatus.UNAUTHORIZED,
        'لطفاً وارد حساب کاربری خود شوید.',
      );
    }
    return user;
  }
}
