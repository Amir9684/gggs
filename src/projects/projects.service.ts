import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import UserRole from 'src/users/enum';
import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { Project } from './entities/project.entity';
import { Grid } from 'src/grids/entities/grid.entity';
import { SoilModel } from 'src/soil/entities/soil-model.entity';
import { CalculationCase } from 'src/calculations/entities/calculation-case.entity';
import { Report } from 'src/reports/entities/report.entity';
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
   * else ŌĆö callers should treat both the same way (404), so a non-admin
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
        messages: '┘Šž▒┘ł┌ś┘ć ž©ž¦ ┘ģ┘ł┘ü┘é█īž¬ ž¦█īž¼ž¦ž» ž┤ž».',
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
          messages: `┘Šž▒┘ł┌ś┘ć ž©ž¦ žó█īž»█ī: ${id} █īž¦┘üž¬ ┘åž┤ž».`,
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
          messages: 'ž╣ž»┘ģ ž¬žĘž¦ž©┘é žó█īž»█ī',
          data: null,
        };
      }

      const existingProject = await this.findOwnedOrAdmin(id, user);
      if (!existingProject) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `┘Šž▒┘ł┌ś┘ć ž©ž¦ žó█īž»█ī: ${id} █īž¦┘üž¬ ┘åž┤ž».`,
        };
      }

      const project = Object.assign(existingProject, updateProjectDto);
      const updatedProject = await this.projectRepository.save(project);

      return {
        statusCode: HttpStatus.OK,
        messages: '┘Šž▒┘ł┌ś┘ć ž©ž¦ ┘ģ┘ł┘ü┘é█īž¬ ž©ž▒┘łž▓ž▒ž│ž¦┘å█ī ž┤ž».',
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
          messages: `┘Šž▒┘ł┌ś┘ć ž©ž¦ žó█īž»█ī: ${id} █īž¦┘üž¬ ┘åž┤ž».`,
          data: null,
        };
      }

      // Grid, SoilModel, CalculationCase and Report all point at `Project`
      // via a plain `@ManyToOne` with no `onDelete` cascade configured, so
      // deleting a project that still has any of these would otherwise
      // fail with a raw FK-violation error from Postgres (caught by
      // `asyncFn` only as a generic 500). Guard it explicitly up front so
      // the caller gets a clear, actionable message instead.
      const manager = this.projectRepository.manager;
      const [gridCount, soilModelCount, calculationCaseCount, reportCount] =
        await Promise.all([
          manager.getRepository(Grid).count({ where: { project: { id } } }),
          manager
            .getRepository(SoilModel)
            .count({ where: { project: { id } } }),
          manager
            .getRepository(CalculationCase)
            .count({ where: { project: { id } } }),
          manager.getRepository(Report).count({ where: { project: { id } } }),
        ]);

      if (
        gridCount > 0 ||
        soilModelCount > 0 ||
        calculationCaseCount > 0 ||
        reportCount > 0
      ) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages:
            'ž¦█ī┘å ┘Šž▒┘ł┌ś┘ć ž»ž¦ž▒ž¦█ī ž┤ž©┌®┘ćžī ┘ģž»┘ä ž«ž¦┌®žī ┌®█īž│ ┘ģžŁž¦ž│ž©ž¦ž¬█ī █īž¦ ┌»ž▓ž¦ž▒ž┤ ┘üž╣ž¦┘ä ž¦ž│ž¬. ž¦ž©ž¬ž»ž¦ žó┘åŌĆī┘ćž¦ ž▒ž¦ žŁž░┘ü ┌®┘å█īž».',
        };
      }

      const deleteResult = await this.projectRepository.delete(
        existingProject.id,
      );
      if (!deleteResult.affected) {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          data: null,
          messages: [
            '┘ģž┤┌®┘ä█ī ž»ž▒ ž╣┘ģ┘ä█īž¦ž¬ žŁž░┘ü ž©┘ć ┘łž¼┘łž» žó┘ģž»┘ć ž¦ž│ž¬.',
          ],
        };
      }

      return {
        statusCode: HttpStatus.OK,
        data: { id },
        messages: '┘Šž▒┘ł┌ś┘ć ž©ž¦ ┘ģ┘ł┘ü┘é█īž¬ žŁž░┘ü ž┤ž».',
      };
    });
  }
}
