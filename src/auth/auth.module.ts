import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { UserModule } from 'src/users/users.module';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

type JwtExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;
type JwtDuration = Extract<JwtExpiresIn, string>;

const DEFAULT_JWT_EXPIRES_IN: JwtDuration = '1d';

/**
 * A zeit/ms-style duration such as `60s`, `15m`, `1h`, `1d` or `1 week`.
 * (A bare number string is read as milliseconds by `jsonwebtoken`.)
 */
const DURATION_PATTERN =
  /^\d+(\.\d+)?\s*(ms|msec|msecs|millisecond|milliseconds|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|y|yr|yrs|year|years)?$/i;

function isJwtDuration(value: string): value is JwtDuration {
  return DURATION_PATTERN.test(value);
}

/**
 * Reads the token lifetime from configuration without asserting its type:
 * the raw string is validated against the duration syntax `jsonwebtoken`
 * accepts, and a malformed value fails at start-up instead of at the first
 * login.
 */
function parseJwtExpiresIn(raw: string | undefined): JwtExpiresIn {
  if (raw === undefined || raw === '') {
    return DEFAULT_JWT_EXPIRES_IN;
  }
  if (isJwtDuration(raw)) {
    return raw;
  }
  throw new Error(
    `Invalid JWT_EXPIRES_IN "${raw}": expected a duration such as "1h" or "1d".`,
  );
}

@Module({
  imports: [
    UserModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET_KEY'),
        signOptions: {
          expiresIn: parseJwtExpiresIn(config.get<string>('JWT_EXPIRES_IN')),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
