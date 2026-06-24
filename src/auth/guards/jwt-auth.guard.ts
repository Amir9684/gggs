import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

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
export class JwtAuthGuard extends AuthGuard('jwt') {}
