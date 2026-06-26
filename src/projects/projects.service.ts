import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import UserRole from 'src/users/enum';
import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { Project } from './entities/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { GetProjectsQueryDTO } from './dto/get-projects-query.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  /**
   * Fetches a project by id, scoped to its owner unless `user` is an admin.
   * Returns `null` if the project doesn't exist *or* belongs to someone
   * else — callers should treat both the same way (404), so a non-admin
   * can't tell the difference between "not found" and "not yours".
   *
   * Shared by every downstream module (soil, grids, calculations, reports)
   * that needs to verify a project belongs to the requesting user before
   * touching anything nested under it.
   */
  async findOwnedOrAdmin(
    id: string,
    user: TAuthenticatedUserType,
  ): Promise<Project | null> {
    const queryBuilder = this.projectRepository
      .createQueryBuilder('project')
      .where('project.id = :id', { id });

    if (user.role !== UserRole.ADMIN) {
      queryBuilder.andWhere('project.ownerId = :ownerId', {
        ownerId: user.id,
      });
    }

    return queryBuilder.getOne();
  }

  create(createProjectDto: CreateProjectDto, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const newProject = this.projectRepository.create({
        ...createProjectDto,
        owner: { id: user.id },
      });
      const createdProject = await this.projectRepository.save(newProject);

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'پروژه با موفقیت ایجاد شد.',
        data: createdProject,
      };
    });
  }

  getAll(queries: GetProjectsQueryDTO, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const {
        name,
        substationName,
        voltageLevel,
        pageNumber = 1,
        pageSize = 50,
      } = queries;

      const queryBuilder = this.projectRepository.createQueryBuilder('project');

      if (user.role !== UserRole.ADMIN) {
        queryBuilder.where('project.ownerId = :ownerId', {
          ownerId: user.id,
        });
      }

      if (name) {
        queryBuilder.andWhere('project.name LIKE :name', {
          name: `%${name}%`,
        });
      }
      if (substationName) {
        queryBuilder.andWhere('project.substationName LIKE :substationName', {
          substationName: `%${substationName}%`,
        });
      }
      if (voltageLevel) {
        queryBuilder.andWhere('project.voltageLevel = :voltageLevel', {
          voltageLevel,
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

  getOne(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const project = await this.findOwnedOrAdmin(id, user);
      if (!project) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `پروژه با آیدی: ${id} یافت نشد.`,
        };
      }

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: project,
      };
    });
  }

  update(
    id: string,
    updateProjectDto: UpdateProjectDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      if (id !== updateProjectDto.id) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          messages: 'عدم تطابق آیدی',
          data: null,
        };
      }

      const existingProject = await this.findOwnedOrAdmin(id, user);
      if (!existingProject) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `پروژه با آیدی: ${id} یافت نشد.`,
        };
      }

      const project = Object.assign(existingProject, updateProjectDto);
      const updatedProject = await this.projectRepository.save(project);

      return {
        statusCode: HttpStatus.OK,
        messages: 'پروژه با موفقیت بروزرسانی شد.',
        data: updatedProject,
      };
    });
  }

  delete(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const existingProject = await this.findOwnedOrAdmin(id, user);
      if (!existingProject) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          messages: `پروژه با آیدی: ${id} یافت نشد.`,
          data: null,
        };
      }

      const deleteResult = await this.projectRepository.delete(
        existingProject.id,
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
        messages: 'پروژه با موفقیت حذف شد.',
      };
    });
  }
}
