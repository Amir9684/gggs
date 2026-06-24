import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import UserRole from 'src/users/enum';
import { UserService } from 'src/users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET_KEY'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: { id: string; username: string; role: UserRole }) {
    const user = await this.usersService.getOne(payload.id);

    if (!user) {
      throw new UnauthorizedException('UnAuthorized.');
    }

    return { id: payload.id, username: payload.username, role: payload.role };
  }
}
