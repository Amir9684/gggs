import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import { UserService } from 'src/users/users.service';
import { User } from 'src/users/entities/user.entity';

import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

interface IJwtPayload {
  id: string;
  username: string;
  role: User['role'];
}

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

  private signToken(user: User): string {
    const payload: IJwtPayload = {
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
          message: 'نام کاربری یا رمز عبور اشتباه است.',
          data: null,
        };
      }

      const accessToken = this.signToken(user);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...safeUser } = user;

      return {
        statusCode: HttpStatus.OK,
        message: 'ورود با موفقیت انجام شد.',
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
          message: 'نام کاربری یا ایمیل در سیستم ثبت شده است',
        };
      }

      const createResult = await this.userService.create(registerDto);
      if (!createResult.data) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          message: 'نام کاربری یا ایمیل در سیستم ثبت شده است',
        };
      }

      const accessToken = this.signToken(createResult.data);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...safeUser } = createResult.data;

      return {
        statusCode: HttpStatus.CREATED,
        data: { accessToken, user: safeUser },
        message: 'ثبت‌نام با موفقیت انجام شد.',
      };
    });
  }
}
