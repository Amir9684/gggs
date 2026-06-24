import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
} from '@nestjs/common';

import { UserService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUsersQueryDTO } from './dto/get-users-query.dto';
import UserRole from './enum';

import { Auth } from 'src/auth/decorators/auth.decorator';

/**
 * Every route here manages user accounts directly (create/list/read/update/
 * delete any user) — restricted to authenticated admins only.
 * `JwtAuthGuard` must run before `RolesGuard` so `request.user` is populated.
 */
@Auth(UserRole.ADMIN)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get()
  getAll(@Query() queries: GetUsersQueryDTO) {
    return this.userService.getAll(queries);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.userService.getOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.userService.delete(id);
  }
}
