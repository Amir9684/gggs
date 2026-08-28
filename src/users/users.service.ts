import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';

import asyncFn from 'src/common/helper/async';

import { User } from './entities/user.entity';
import { Project } from 'src/projects/entities/project.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { HttpStatus } from 'src/common/types';
import { GetUsersQueryDTO } from './dto/get-users-query.dto';
import { sanitizeUser } from 'src/common/helper/sanitize-user';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {}

  /**
   * Checks whether `username`/`email` already belong to a *different*
   * user (`excludeId`) before a create/update is allowed to hit the DB.
   * `username` has a unique DB constraint, so without this guard a
   * duplicate would surface as a raw `QueryFailedError` from Postgres —
   * caught by `asyncFn`, but only as a generic 500 rather than a proper
   * "این نام کاربری قبلاً ثبت شده" 400 response. Only the fields that are
   * actually provided are checked, so a partial update that doesn't touch
   * `username`/`email` never runs this query.
   */
  private async findConflictingUser(
    username: string | undefined,
    email: string | undefined,
    excludeId?: string,
  ): Promise<User | null> {
    if (!username && !email) {
      return null;
    }

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    if (username && email) {
      queryBuilder
        .where('user.username = :username', { username })
        .orWhere('user.email = :email', { email });
    } else if (username) {
      queryBuilder.where('user.username = :username', { username });
    } else {
      queryBuilder.where('user.email = :email', { email });
    }

    if (excludeId) {
      queryBuilder.andWhere('user.id != :excludeId', { excludeId });
    }

    return queryBuilder.getOne();
  }

  create(createUserDto: CreateUserDto) {
    return asyncFn(async () => {
      const conflictingUser = await this.findConflictingUser(
        createUserDto.username,
        createUserDto.email,
      );
      if (conflictingUser) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'نام کاربری یا ایمیل در سیستم ثبت شده است.',
        };
      }

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
        messages: 'کاربر با موفقیت ایجاد شد.',
        data: sanitizeUser(createdUser),
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
        messages: [],
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
          messages: `کاربر با آیدی: ${id} یافت نشد.`,
        };
      }

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: user,
      };
    });
  }

  /**
   * Fetches the raw `User` entity for internal use only (e.g. by `update`,
   * which merges changes into it before saving). Explicitly opts back into
   * selecting `password` — without it, saving this entity back would wipe
   * the stored hash whenever the caller doesn't also supply a new password.
   * Never return this value directly from a controller.
   */
  private findEntityById(id: string) {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id })
      .getOne();
  }

  /**
   * Used only for credential verification during login — explicitly opts
   * back into selecting `password`, which is excluded by default
   * (`select: false` on the entity) from every other read.
   */
  findByUsername(username: string) {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .getOne();
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
          messages: 'عدم تطابق آیدی',
          data: null,
        };
      }

      const existingUser = await this.findEntityById(id);
      if (!existingUser) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `کاربر با آیدی: ${id} یافت نشد.`,
        };
      }

      const conflictingUser = await this.findConflictingUser(
        updateUserDto.username,
        updateUserDto.email,
        id,
      );
      if (conflictingUser) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'نام کاربری یا ایمیل در سیستم ثبت شده است.',
        };
      }

      if (updateUserDto.password) {
        const salt = await bcrypt.genSalt(10);
        updateUserDto.password = await bcrypt.hash(
          updateUserDto.password,
          salt,
        );
      }

      const user = Object.assign(existingUser, updateUserDto);

      const updatedUser = await this.userRepository.save(user);

      return {
        statusCode: HttpStatus.OK,
        messages: 'اطلاعات کاربر با موفیت بروزرسانی شد.',
        data: sanitizeUser(updatedUser),
      };
    });
  }

  delete(id: string) {
    return asyncFn(async () => {
      const existingUser = await this.findEntityById(id);
      if (!existingUser) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          messages: `کاربر با آیدی: ${id} یافت نشد`,
          data: null,
        };
      }

      // `Project.owner` has no `onDelete` cascade, so deleting a user who
      // still owns projects would otherwise fail with a raw FK-violation
      // error from Postgres. Guard it explicitly with a clear message.
      const ownedProjectsCount = await this.userRepository.manager
        .getRepository(Project)
        .count({ where: { owner: { id: existingUser.id } } });
      if (ownedProjectsCount > 0) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages:
            'این کاربر دارای پروژه‌های فعال است. ابتدا پروژه‌های او را حذف یا منتقل کنید.',
        };
      }

      const deleteResult = await this.userRepository.delete(existingUser.id);
      if (!deleteResult.affected) {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          data: null,
          messages: ['مشکلی در عملیات حذف به وجود آمده است.'],
        };
      }

      return {
        statusCode: HttpStatus.OK,
        data: { id },
        messages: 'کاربر با موقیت حذف شد.',
      };
    });
  }
}
