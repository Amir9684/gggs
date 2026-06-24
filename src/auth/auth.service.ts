import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import { UserService } from 'src/users/users.service';
import { User } from 'src/users/entities/user.entity';

import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import TJwtPayloadType from './types/jwt-payload';
import { TAuthenticatedUserType } from './types/authenticated-request.type';
import { sanitizeUser } from 'src/common/helper/sanitize-user';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Verifies a username/password pair.
   * Returns the matching user, or `null` if the credentials are invalid.
   * Kept separate from `login` so it can be reused (e.g. by a future
   * local Passport strategy) without re-issuing a token.
   */
  private async validateCredentials(
    username: string,
    password: string,
  ): Promise<User | null> {
    const user = await this.userService.findByUsername(username);
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  private signToken(user: Pick<User, 'id' | 'username' | 'role'>): string {
    const payload: TJwtPayloadType = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    return this.jwtService.sign(payload);
  }

  login(loginDto: LoginDto) {
    return asyncFn(async () => {
      const user = await this.validateCredentials(
        loginDto.username,
        loginDto.password,
      );

      if (!user) {
        return {
          statusCode: HttpStatus.UNAUTHORIZED,
          messages: 'نام کاربری یا رمز عبور اشتباه است.',
          data: null,
        };
      }

      const accessToken = this.signToken(user);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...safeUser } = user;

      return {
        statusCode: HttpStatus.OK,
        messages: 'ورود با موفقیت انجام شد.',
        data: { accessToken, user: safeUser },
      };
    });
  }

  register(registerDto: RegisterDto) {
    return asyncFn(async () => {
      const existingUser = await this.userService.findByUsernameOrEmail(
        registerDto.username,
        registerDto.email,
      );

      if (existingUser) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'نام کاربری یا ایمیل در سیستم ثبت شده است',
        };
      }

      const createResult = await this.userService.create(registerDto);
      if (!createResult.data) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'نام کاربری یا ایمیل در سیستم ثبت شده است',
        };
      }

      const accessToken = this.signToken(createResult.data);

      return {
        statusCode: HttpStatus.CREATED,
        data: { accessToken, user: createResult.data },
        messages: 'ثبت‌نام با موفقیت انجام شد.',
      };
    });
  }

  /**
   * Returns the full, current user record for whoever the JWT identifies.
   * The token payload itself only carries `{ id, username, role }`, so this
   * re-fetches from the DB to get the rest of the user's fields and to make
   * sure the account still exists (e.g. wasn't deleted after the token was
   * issued).
   */
  me(user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const foundUser = await this.userService.findByUsername(user.username);

      if (!foundUser) {
        return {
          statusCode: HttpStatus.UNAUTHORIZED,
          data: null,
          messages: 'حساب کاربری شما یافت نشد.',
        };
      }

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: sanitizeUser(foundUser),
      };
    });
  }
}
