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
import { type CreateUserDto } from './dto/create-user.dto';
import { type UpdateUserDto } from './dto/update-user.dto';
import { GetUsersQueryDTO } from './dto/get-users-query.dto';
import { GetUserQueryDTO } from './dto/get-user-query.dto';

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
  getOne(@Param('id') id: string, @Query() queries: GetUserQueryDTO) {
    return this.userService.getOne(id, queries);
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
