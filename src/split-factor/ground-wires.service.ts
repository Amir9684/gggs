import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import UserRole from 'src/users/enum';

import { CreateGroundWireDto } from './dto/create-ground-wire.dto';
import { UpdateGroundWireDto } from './dto/update-ground-wire.dto';
import { GroundWire } from './entities/ground-wire.entity';

const notFound = (id: string) => ({
  statusCode: HttpStatus.NOT_FOUND,
  data: null,
  messages: `سیم گارد با آیدی: ${id} یافت نشد.`,
});

/** The ground wire catalog: every route is scoped to the owner, admins see all. */
@Injectable()
export class GroundWiresService {
  constructor(
    @InjectRepository(GroundWire)
    private readonly groundWireRepository: Repository<GroundWire>,
  ) {}

  /** Shared with the split factor service, which loads the wires a request uses. */
  async findOwnedOrAdmin(
    id: string,
    user: TAuthenticatedUserType,
  ): Promise<GroundWire | null> {
    const queryBuilder = this.groundWireRepository
      .createQueryBuilder('wire')
      .where('wire.id = :id', { id });

    if (user.role !== UserRole.ADMIN) {
      queryBuilder.andWhere('wire.ownerId = :ownerId', { ownerId: user.id });
    }

    return queryBuilder.getOne();
  }

  create(dto: CreateGroundWireDto, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const created = await this.groundWireRepository.save(
        this.groundWireRepository.create({ ...dto, owner: { id: user.id } }),
      );

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'سیم گارد با موفقیت ایجاد شد.',
        data: created,
      };
    });
  }

  getAll(user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const queryBuilder = this.groundWireRepository
        .createQueryBuilder('wire')
        .orderBy('wire.name', 'ASC');

      if (user.role !== UserRole.ADMIN) {
        queryBuilder.where('wire.ownerId = :ownerId', { ownerId: user.id });
      }

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: await queryBuilder.getMany(),
      };
    });
  }

  update(id: string, dto: UpdateGroundWireDto, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const existing = await this.findOwnedOrAdmin(id, user);
      if (!existing) return notFound(id);

      const updated = await this.groundWireRepository.save({
        ...existing,
        ...dto,
      });

      return {
        statusCode: HttpStatus.OK,
        messages: 'سیم گارد با موفقیت ویرایش شد.',
        data: updated,
      };
    });
  }

  delete(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const existing = await this.findOwnedOrAdmin(id, user);
      if (!existing) return notFound(id);

      await this.groundWireRepository.remove(existing);

      return {
        statusCode: HttpStatus.OK,
        messages: 'سیم گارد حذف شد.',
        data: { id },
      };
    });
  }
}
