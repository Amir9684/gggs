import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import { ProjectsService } from 'src/projects/projects.service';
import UserRole from 'src/users/enum';

import { Grid } from './entities/grid.entity';
import { GridSnapshot } from './entities/grid-snapshot.entity';
import { CalculationCase } from 'src/calculations/entities/calculation-case.entity';
import { CreateGridDto } from './dto/create-grid.dto';
import { UpdateGridDto } from './dto/update-grid.dto';
import { GetGridsQueryDTO } from './dto/get-grids-query.dto';

@Injectable()
export class GridsService {
  constructor(
    @InjectRepository(Grid)
    private readonly gridRepository: Repository<Grid>,
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * Fetches a grid by id together with its parent `project`, scoped to the
   * requesting user via `ProjectsService.findOwnedOrAdmin`. Returns `null`
   * if the grid doesn't exist or its project isn't owned by the requester.
   *
   * Exposed (not `private`) because `GridElementsService` needs the same
   * check before touching elements/snapshots that belong to a grid.
   */
  async findOwnedOrAdmin(
    id: string,
    user: TAuthenticatedUserType,
  ): Promise<Grid | null> {
    const grid = await this.gridRepository
      .createQueryBuilder('grid')
      .leftJoinAndSelect('grid.project', 'project')
      .where('grid.id = :id', { id })
      .getOne();

    if (!grid) {
      return null;
    }

    const ownedProject = await this.projectsService.findOwnedOrAdmin(
      grid.project.id,
      user,
    );
    if (!ownedProject) {
      return null;
    }

    return grid;
  }

  create(createGridDto: CreateGridDto, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const { projectId, ...rest } = createGridDto;

      const project = await this.projectsService.findOwnedOrAdmin(
        projectId,
        user,
      );
      if (!project) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `پروژه با آیدی: ${projectId} یافت نشد.`,
        };
      }

      const newGrid = this.gridRepository.create({
        ...rest,
        project: { id: project.id },
      });
      const createdGrid = await this.gridRepository.save(newGrid);

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'شبکه با موفقیت ایجاد شد.',
        data: createdGrid,
      };
    });
  }

  getAll(queries: GetGridsQueryDTO, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const { projectId, name, pageNumber = 1, pageSize = 50 } = queries;

      if (projectId) {
        const project = await this.projectsService.findOwnedOrAdmin(
          projectId,
          user,
        );
        if (!project) {
          return {
            statusCode: HttpStatus.NOT_FOUND,
            data: null,
            messages: `پروژه با آیدی: ${projectId} یافت نشد.`,
          };
        }
      }

      const queryBuilder = this.gridRepository
        .createQueryBuilder('grid')
        .leftJoinAndSelect('grid.project', 'project');

      if (projectId) {
        queryBuilder.andWhere('project.id = :projectId', { projectId });
      } else if (user.role !== UserRole.ADMIN) {
        queryBuilder.andWhere('project.ownerId = :ownerId', {
          ownerId: user.id,
        });
      }

      if (name) {
        queryBuilder.andWhere('grid.name LIKE :name', { name: `%${name}%` });
      }

      queryBuilder.skip((pageNumber - 1) * pageSize).take(pageSize);
      const [list, totalCount] = await queryBuilder.getManyAndCount();
      const totalPages = Math.ceil(totalCount / pageSize);

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: {
          list,
          pagination: { pageNumber, pageSize, totalPages, totalCount },
        },
      };
    });
  }

  getOne(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const grid = await this.findOwnedOrAdmin(id, user);
      if (!grid) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `شبکه با آیدی: ${id} یافت نشد.`,
        };
      }

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: grid,
      };
    });
  }

  update(
    id: string,
    updateGridDto: UpdateGridDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      if (id !== updateGridDto.id) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          messages: 'عدم تطابق آیدی',
          data: null,
        };
      }

      const existingGrid = await this.findOwnedOrAdmin(id, user);
      if (!existingGrid) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `شبکه با آیدی: ${id} یافت نشد.`,
        };
      }

      const grid = Object.assign(existingGrid, updateGridDto);
      const updatedGrid = await this.gridRepository.save(grid);

      return {
        statusCode: HttpStatus.OK,
        messages: 'شبکه با موفقیت بروزرسانی شد.',
        data: updatedGrid,
      };
    });
  }

  delete(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const existingGrid = await this.findOwnedOrAdmin(id, user);
      if (!existingGrid) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          messages: `شبکه با آیدی: ${id} یافت نشد.`,
          data: null,
        };
      }

      // `CalculationCase.grid` has no `onDelete` cascade, so deleting a
      // grid that's still referenced by a case would otherwise fail with
      // a raw FK-violation error from Postgres. Block it explicitly with
      // a clear message rather than letting the DB throw.
      const manager = this.gridRepository.manager;
      const calculationCaseCount = await manager
        .getRepository(CalculationCase)
        .count({ where: { grid: { id: existingGrid.id } } });
      if (calculationCaseCount > 0) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages:
            'این شبکه در یک یا چند کیس محاسباتی استفاده شده است. ابتدا آن‌ها را حذف کنید.',
        };
      }

      // `GridSnapshot.grid` also has no `onDelete` cascade (unlike
      // `GridElement`, which is `CASCADE` at the DB level). Snapshots are
      // just point-in-time history of this grid's elements with no value
      // once the grid itself is gone, so they're removed alongside it in
      // the same transaction rather than blocking the delete.
      const deleteResult = await manager.transaction(async (trxManager) => {
        await trxManager.delete(GridSnapshot, {
          grid: { id: existingGrid.id },
        });
        return trxManager.delete(Grid, { id: existingGrid.id });
      });
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
        messages: 'شبکه با موفقیت حذف شد.',
      };
    });
  }
}
