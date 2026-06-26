import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import { ProjectsService } from 'src/projects/projects.service';
import UserRole from 'src/users/enum';

import { SoilModel } from './entities/soil-model.entity';
import { CreateSoilModelDto } from './dto/create-soil-model.dto';
import { UpdateSoilModelDto } from './dto/update-soil-model.dto';
import { GetSoilModelsQueryDTO } from './dto/get-soil-models-query.dto';

@Injectable()
export class SoilModelsService {
  constructor(
    @InjectRepository(SoilModel)
    private readonly soilModelRepository: Repository<SoilModel>,
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * Fetches a soil model by id together with its parent `project`, scoped
   * to the requesting user via `ProjectsService.findOwnedOrAdmin`. Returns
   * `null` if the model doesn't exist or its project isn't owned by the
   * requester (admins bypass the ownership check).
   */
  private async findOwnedOrAdmin(
    id: string,
    user: TAuthenticatedUserType,
  ): Promise<SoilModel | null> {
    const soilModel = await this.soilModelRepository
      .createQueryBuilder('soilModel')
      .leftJoinAndSelect('soilModel.project', 'project')
      .leftJoinAndSelect('soilModel.layers', 'layers')
      .where('soilModel.id = :id', { id })
      .orderBy('layers.layerOrder', 'ASC')
      .getOne();

    if (!soilModel) {
      return null;
    }

    const ownedProject = await this.projectsService.findOwnedOrAdmin(
      soilModel.project.id,
      user,
    );
    if (!ownedProject) {
      return null;
    }

    return soilModel;
  }

  create(createSoilModelDto: CreateSoilModelDto, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const { projectId, ...rest } = createSoilModelDto;

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

      const newSoilModel = this.soilModelRepository.create({
        ...rest,
        project: { id: project.id },
      });
      const createdSoilModel =
        await this.soilModelRepository.save(newSoilModel);

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'مدل خاک با موفقیت ایجاد شد.',
        data: createdSoilModel,
      };
    });
  }

  getAll(queries: GetSoilModelsQueryDTO, user: TAuthenticatedUserType) {
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

      const queryBuilder = this.soilModelRepository
        .createQueryBuilder('soilModel')
        .leftJoinAndSelect('soilModel.project', 'project');

      if (projectId) {
        queryBuilder.andWhere('project.id = :projectId', { projectId });
      } else {
        // No explicit project filter: still scope to the user's own
        // projects unless they're an admin.
        queryBuilder.andWhere(
          user.role === UserRole.ADMIN ? '1 = 1' : 'project.ownerId = :ownerId',
          { ownerId: user.id },
        );
      }

      if (name) {
        queryBuilder.andWhere('soilModel.name LIKE :name', {
          name: `%${name}%`,
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
          pagination: { pageNumber, pageSize, totalPages, totalCount },
        },
      };
    });
  }

  getOne(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const soilModel = await this.findOwnedOrAdmin(id, user);
      if (!soilModel) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `مدل خاک با آیدی: ${id} یافت نشد.`,
        };
      }

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: soilModel,
      };
    });
  }

  update(
    id: string,
    updateSoilModelDto: UpdateSoilModelDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      if (id !== updateSoilModelDto.id) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          messages: 'عدم تطابق آیدی',
          data: null,
        };
      }

      const existingSoilModel = await this.findOwnedOrAdmin(id, user);
      if (!existingSoilModel) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `مدل خاک با آیدی: ${id} یافت نشد.`,
        };
      }

      const { layers, ...rest } = updateSoilModelDto;
      const soilModel = Object.assign(existingSoilModel, rest);

      // Cascade replaces nested layers wholesale on update: simplest model
      // that's safe given layers are small and only ever owned by one
      // soil model. Existing layers not present in the payload are
      // implicitly dropped via TypeORM's `cascade` + orphan removal would
      // be needed for that; without it, stale layers stay attached unless
      // explicitly replaced here.
      if (layers) {
        soilModel.layers = layers.map((layer) =>
          layer.id
            ? Object.assign(
                existingSoilModel.layers.find((l) => l.id === layer.id) ?? {},
                layer,
              )
            : layer,
        ) as SoilModel['layers'];
      }

      const updatedSoilModel = await this.soilModelRepository.save(soilModel);

      return {
        statusCode: HttpStatus.OK,
        messages: 'مدل خاک با موفقیت بروزرسانی شد.',
        data: updatedSoilModel,
      };
    });
  }

  delete(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const existingSoilModel = await this.findOwnedOrAdmin(id, user);
      if (!existingSoilModel) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          messages: `مدل خاک با آیدی: ${id} یافت نشد.`,
          data: null,
        };
      }

      const deleteResult = await this.soilModelRepository.delete(
        existingSoilModel.id,
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
        messages: 'مدل خاک با موفقیت حذف شد.',
      };
    });
  }
}
