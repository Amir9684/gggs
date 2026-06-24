import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';

import asyncFn from 'src/common/helper/async';

import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { HttpStatus } from 'src/common/types';
import { GetUsersQueryDTO } from './dto/get-users-query.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {}

  create(createUserDto: CreateUserDto) {
    return asyncFn(async () => {
      if (createUserDto.password) {
        const salt = await bcrypt.genSalt(10);
        createUserDto.password = await bcrypt.hash(
          createUserDto.password,
          salt,
        );
      }
      const newUser = this.userRepository.create(createUserDto);
      const createdUser = await this.userRepository.save(newUser);

      return {
        statusCode: HttpStatus.CREATED,
        message: 'کاربر با موفقیت ایجاد شد.',
        data: createdUser,
      };
    });
  }

  getAll(queries: GetUsersQueryDTO) {
    return asyncFn(async () => {
      const queryBuilder = this.userRepository.createQueryBuilder('user');
      const { username, email, role, pageNumber = 1, pageSize = 50 } = queries;

      if (username) {
        queryBuilder.where('username LIKE :username', {
          username: `%${username}%`,
        });
      }
      if (username) {
        queryBuilder.where('username LIKE :username', {
          username: `%${username}%`,
        });
      }
      if (email) {
        queryBuilder.andWhere('email LIKE :email', {
          email: `${email}%`,
        });
      }
      if (role) {
        queryBuilder.andWhere('role = :role', {
          role,
        });
      }

      queryBuilder.skip((pageNumber - 1) * pageSize).take(pageSize);
      const [list, totalCount] = await queryBuilder.getManyAndCount();
      const totalPages = Math.ceil(totalCount / pageSize);
      return {
        statusCode: HttpStatus.OK,
        message: [],
        data: {
          list,
          pagination: {
            pageNumber,
            pageSize,
            totalPages,
            totalCount,
          },
        },
      };
    });
  }

  getOne(id: string) {
    return asyncFn(async () => {
      const user = await this.userRepository.findOneBy({ id });
      if (!user) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          message: `کاربر با آیدی: ${id} یافت نشد.`,
        };
      }

      return {
        statusCode: HttpStatus.OK,
        message: [],
        data: user,
      };
    });
  }

  findByUsername(username: string) {
    return this.userRepository.findOneBy({ username });
  }

  findByUsernameOrEmail(username: string, email: string) {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.username = :username', { username })
      .orWhere('user.email = :email', { email })
      .getOne();
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return asyncFn(async () => {
      if (id !== updateUserDto.id) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'عدم تطابق آیدی',
          data: null,
        };
      }

      const result = await this.getOne(id);
      if (!result.data) {
        return result;
      }
      if (updateUserDto.password) {
        const salt = await bcrypt.genSalt(10);
        updateUserDto.password = await bcrypt.hash(
          updateUserDto.password,
          salt,
        );
      }

      const user = Object.assign(result.data, updateUserDto);

      const updatedUser = await this.userRepository.save(user);

      return {
        statusCode: HttpStatus.OK,
        message: 'اطلاعات کاربر با موفیت بروزرسانی شد.',
        data: updatedUser,
      };
    });
  }

  delete(id: string) {
    return asyncFn(async () => {
      const result = await this.getOne(id);
      if (!result.data) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: `کاربر با آیدی: ${id} یافت نشد`,
          data: null,
        };
      }

      const deleteResult = await this.userRepository.delete(result.data.id);
      if (!deleteResult.affected) {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          data: null,
          message: ['مشکلی در عملیات حذف به وجود آمده است.'],
        };
      }

      return {
        statusCode: HttpStatus.OK,
        data: { id },
        message: 'کاربر با موقیت حذف شد.',
      };
    });
  }
}
