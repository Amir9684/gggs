import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import UserRole from 'src/users/enum';

import { CreateSplitProjectDto } from './dto/create-split-project.dto';
import { UpdateSplitProjectDto } from './dto/update-split-project.dto';
import { SplitProject } from './entities/split-project.entity';
import { GroundWiresService } from './ground-wires.service';
import { parseSplitInput } from './split-input.schema';
import { runSplitProject, wireIdsOf } from './split-project.runner';
import type { CatalogWire } from './soni-input.builder';

const notFound = (id: string) => ({
  statusCode: HttpStatus.NOT_FOUND,
  data: null,
  messages: `پروژه ضریب تقسیم با آیدی: ${id} یافت نشد.`,
});

const badRequest = (messages: string | string[]) => ({
  statusCode: HttpStatus.BAD_REQUEST,
  data: null,
  messages,
});

/** Saved split factor studies: every route is scoped to the owner, admins see all. */
@Injectable()
export class SplitProjectsService {
  constructor(
    @InjectRepository(SplitProject)
    private readonly splitProjectRepository: Repository<SplitProject>,
    private readonly groundWiresService: GroundWiresService,
  ) {}

  private findOwnedOrAdmin(
    id: string,
    user: TAuthenticatedUserType,
  ): Promise<SplitProject | null> {
    const queryBuilder = this.splitProjectRepository
      .createQueryBuilder('project')
      .where('project.id = :id', { id });

    if (user.role !== UserRole.ADMIN) {
      queryBuilder.andWhere('project.ownerId = :ownerId', { ownerId: user.id });
    }

    return queryBuilder.getOne();
  }

  create(dto: CreateSplitProjectDto, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const parsed = parseSplitInput(dto.method, dto.input);
      if (!parsed.ok) return badRequest(parsed.messages);

      const created = await this.splitProjectRepository.save(
        this.splitProjectRepository.create({
          name: dto.name,
          method: dto.method,
          input: parsed.project.input as unknown as Record<string, unknown>,
          lastResult: null,
          owner: { id: user.id },
        }),
      );

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'پروژه ضریب تقسیم ذخیره شد.',
        data: created,
      };
    });
  }

  getAll(user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const queryBuilder = this.splitProjectRepository
        .createQueryBuilder('project')
        .orderBy('project.updatedAt', 'DESC');

      if (user.role !== UserRole.ADMIN) {
        queryBuilder.where('project.ownerId = :ownerId', { ownerId: user.id });
      }

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: await queryBuilder.getMany(),
      };
    });
  }

  getOne(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const project = await this.findOwnedOrAdmin(id, user);
      if (!project) return notFound(id);

      return { statusCode: HttpStatus.OK, messages: [], data: project };
    });
  }

  update(id: string, dto: UpdateSplitProjectDto, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const project = await this.findOwnedOrAdmin(id, user);
      if (!project) return notFound(id);

      if (dto.name !== undefined) project.name = dto.name;

      if (dto.input !== undefined) {
        const parsed = parseSplitInput(project.method, dto.input);
        if (!parsed.ok) return badRequest(parsed.messages);

        project.input = parsed.project.input as unknown as Record<string, unknown>;
        // The stored result belongs to the old input.
        project.lastResult = null;
      }

      return {
        statusCode: HttpStatus.OK,
        messages: 'پروژه ضریب تقسیم ویرایش شد.',
        data: await this.splitProjectRepository.save(project),
      };
    });
  }

  delete(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const project = await this.findOwnedOrAdmin(id, user);
      if (!project) return notFound(id);

      await this.splitProjectRepository.remove(project);

      return {
        statusCode: HttpStatus.OK,
        messages: 'پروژه ضریب تقسیم حذف شد.',
        data: { id },
      };
    });
  }

  /** Runs the project's method on its stored input and stores the result with it. */
  calculate(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const project = await this.findOwnedOrAdmin(id, user);
      if (!project) return notFound(id);

      // The stored input was validated when saved, but the schema may have
      // moved on since; validating again keeps a stale project from
      // reaching the engine as garbage.
      const parsed = parseSplitInput(project.method, project.input);
      if (!parsed.ok) return badRequest(parsed.messages);

      const wires = new Map<string, CatalogWire>();
      for (const wireId of wireIdsOf(parsed.project)) {
        const wire = await this.groundWiresService.findOwnedOrAdmin(wireId, user);
        if (!wire) {
          return badRequest(
            'سیم گاردی که در این پروژه استفاده شده در کاتالوگ وجود ندارد (حذف شده است). سیم را دوباره انتخاب کنید.',
          );
        }
        wires.set(wireId, wire);
      }

      let outcome;
      try {
        outcome = runSplitProject(parsed.project, wires);
      } catch (error) {
        return badRequest(
          `محاسبه با این داده‌ها ممکن نیست: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      project.lastResult = {
        splitFactor: outcome.splitFactor,
        computedAt: new Date().toISOString(),
        details: outcome.details,
      };
      const saved = await this.splitProjectRepository.save(project);

      return {
        statusCode: HttpStatus.OK,
        messages: 'محاسبه انجام شد.',
        data: saved,
      };
    });
  }
}
