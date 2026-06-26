import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { GridsService } from './grids.service';
import { GridElement } from './entities/grid-element.entity';
import { GridSnapshot } from './entities/grid-snapshot.entity';
import {
  CreateGridElementDto,
  CreateGridElementsBulkDto,
} from './dto/create-grid-element.dto';
import { UpdateGridElementDto } from './dto/update-grid-element.dto';
import { GetGridElementsQueryDTO } from './dto/get-grid-elements-query.dto';
import { CreateGridSnapshotDto } from './dto/create-grid-snapshot.dto';

@Injectable()
export class GridElementsService {
  constructor(
    @InjectRepository(GridElement)
    private readonly gridElementRepository: Repository<GridElement>,
    @InjectRepository(GridSnapshot)
    private readonly gridSnapshotRepository: Repository<GridSnapshot>,
    private readonly gridsService: GridsService,
  ) {}

  create(
    createGridElementDto: CreateGridElementDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      const { gridId, ...rest } = createGridElementDto;

      const grid = await this.gridsService.findOwnedOrAdmin(gridId, user);
      if (!grid) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `شبکه با آیدی: ${gridId} یافت نشد.`,
        };
      }

      const newElement = this.gridElementRepository.create({
        ...rest,
        grid: { id: grid.id },
      });
      const createdElement = await this.gridElementRepository.save(newElement);

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'المان با موفقیت ایجاد شد.',
        data: createdElement,
      };
    });
  }

  /**
   * Replaces the elements of `gridId` with the given batch in one call —
   * the typical save action when a grid is drawn/edited on a map. Existing
   * elements for the grid are deleted first, then the new batch is
   * inserted, all within a single transaction so a failure can't leave the
   * grid half-updated.
   */
  createBulk(
    createGridElementsBulkDto: CreateGridElementsBulkDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      const { gridId, elements } = createGridElementsBulkDto;

      const grid = await this.gridsService.findOwnedOrAdmin(gridId, user);
      if (!grid) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `شبکه با آیدی: ${gridId} یافت نشد.`,
        };
      }

      const savedElements =
        await this.gridElementRepository.manager.transaction(
          async (manager) => {
            await manager.delete(GridElement, { grid: { id: gridId } });

            const newElements = elements.map((element) =>
              manager.create(GridElement, {
                ...element,
                grid: { id: gridId },
              }),
            );

            return manager.save(GridElement, newElements);
          },
        );

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'المان‌ها با موفقیت ذخیره شدند.',
        data: savedElements,
      };
    });
  }

  getAll(queries: GetGridElementsQueryDTO, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const { gridId, type } = queries;

      const grid = await this.gridsService.findOwnedOrAdmin(gridId, user);
      if (!grid) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `شبکه با آیدی: ${gridId} یافت نشد.`,
        };
      }

      const queryBuilder = this.gridElementRepository
        .createQueryBuilder('element')
        .where('element.gridId = :gridId', { gridId });

      if (type !== undefined) {
        queryBuilder.andWhere('element.type = :type', { type });
      }

      const list = await queryBuilder.getMany();

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: list,
      };
    });
  }

  /**
   * Fetches a single grid element scoped to the requesting user, by
   * walking element → grid → project ownership.
   */
  private async findOwnedOrAdmin(
    id: string,
    user: TAuthenticatedUserType,
  ): Promise<GridElement | null> {
    const element = await this.gridElementRepository
      .createQueryBuilder('element')
      .leftJoinAndSelect('element.grid', 'grid')
      .where('element.id = :id', { id })
      .getOne();

    if (!element) {
      return null;
    }

    const ownedGrid = await this.gridsService.findOwnedOrAdmin(
      element.grid.id,
      user,
    );
    if (!ownedGrid) {
      return null;
    }

    return element;
  }

  update(
    id: string,
    updateGridElementDto: UpdateGridElementDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      if (id !== updateGridElementDto.id) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          messages: 'عدم تطابق آیدی',
          data: null,
        };
      }

      const existingElement = await this.findOwnedOrAdmin(id, user);
      if (!existingElement) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `المان با آیدی: ${id} یافت نشد.`,
        };
      }

      const element = Object.assign(existingElement, updateGridElementDto);
      const updatedElement = await this.gridElementRepository.save(element);

      return {
        statusCode: HttpStatus.OK,
        messages: 'المان با موفقیت بروزرسانی شد.',
        data: updatedElement,
      };
    });
  }

  delete(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const existingElement = await this.findOwnedOrAdmin(id, user);
      if (!existingElement) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          messages: `المان با آیدی: ${id} یافت نشد.`,
          data: null,
        };
      }

      const deleteResult = await this.gridElementRepository.delete(
        existingElement.id,
      );
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
        messages: 'المان با موفقیت حذف شد.',
      };
    });
  }

  /**
   * Snapshots the current state of a grid's elements as a new, immutable,
   * auto-incrementing version. `snapshotData` is server-generated (a JSON
   * serialization of the grid's elements at save time) — never accepted
   * from the client.
   */
  createSnapshot(
    createGridSnapshotDto: CreateGridSnapshotDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      const { gridId } = createGridSnapshotDto;

      const grid = await this.gridsService.findOwnedOrAdmin(gridId, user);
      if (!grid) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `شبکه با آیدی: ${gridId} یافت نشد.`,
        };
      }

      const elements = await this.gridElementRepository.find({
        where: { grid: { id: gridId } },
      });

      const lastSnapshot = await this.gridSnapshotRepository.findOne({
        where: { grid: { id: gridId } },
        order: { version: 'DESC' },
      });
      const nextVersion = (lastSnapshot?.version ?? 0) + 1;

      const newSnapshot = this.gridSnapshotRepository.create({
        grid: { id: gridId },
        version: nextVersion,
        snapshotData: JSON.stringify(elements),
      });
      const createdSnapshot =
        await this.gridSnapshotRepository.save(newSnapshot);

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'نسخه شبکه با موفقیت ذخیره شد.',
        data: createdSnapshot,
      };
    });
  }

  getSnapshots(gridId: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const grid = await this.gridsService.findOwnedOrAdmin(gridId, user);
      if (!grid) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `شبکه با آیدی: ${gridId} یافت نشد.`,
        };
      }

      const snapshots = await this.gridSnapshotRepository.find({
        where: { grid: { id: gridId } },
        order: { version: 'DESC' },
      });

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: snapshots,
      };
    });
  }

  /**
   * Restores a grid's elements from a previously saved snapshot: replaces
   * all current elements with the ones stored in `snapshotData`, inside a
   * transaction. Does not delete or alter the snapshot itself, so it can
   * be restored again later.
   */
  restoreSnapshot(snapshotId: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const snapshot = await this.gridSnapshotRepository
        .createQueryBuilder('snapshot')
        .leftJoinAndSelect('snapshot.grid', 'grid')
        .where('snapshot.id = :snapshotId', { snapshotId })
        .getOne();

      if (!snapshot) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `نسخه با آیدی: ${snapshotId} یافت نشد.`,
        };
      }

      const grid = await this.gridsService.findOwnedOrAdmin(
        snapshot.grid.id,
        user,
      );
      if (!grid) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `نسخه با آیدی: ${snapshotId} یافت نشد.`,
        };
      }

      const restoredElementsData = JSON.parse(
        snapshot.snapshotData,
      ) as GridElement[];

      const restoredElements =
        await this.gridElementRepository.manager.transaction(
          async (manager) => {
            await manager.delete(GridElement, { grid: { id: grid.id } });

            const newElements = restoredElementsData.map(
              ({ type, geometry, properties }) =>
                manager.create(GridElement, {
                  type,
                  geometry,
                  properties,
                  grid: { id: grid.id },
                }),
            );

            return manager.save(GridElement, newElements);
          },
        );

      return {
        statusCode: HttpStatus.OK,
        messages: 'شبکه با موفقیت به این نسخه بازگردانده شد.',
        data: restoredElements,
      };
    });
  }
}
