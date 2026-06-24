import { Controller, Post, Body, Get } from '@nestjs/common';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import type { TAuthenticatedUserType } from './types/authenticated-request.type';
import { Auth } from './decorators/auth.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * Returns the currently authenticated user, derived from the JWT.
   * Useful for verifying a token client-side and for smoke-testing the guard.
   */
  @Auth()
  @Get('me')
  me(@CurrentUser() user: TAuthenticatedUserType) {
    return this.authService.me(user);
  }
}
