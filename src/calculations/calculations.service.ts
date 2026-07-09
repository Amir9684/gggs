import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import { ProjectsService } from 'src/projects/projects.service';
import { GridsService } from 'src/grids/grids.service';
import { SoilModelsService } from 'src/soil/soil-models.service';
import { GridElement } from 'src/grids/entities/grid-element.entity';
import { SoilLayer } from 'src/soil/entities/soil-layer.entity';
import UserRole from 'src/users/enum';

import { CalculationCase } from './entities/calculation-case.entity';
import { CaseFault } from './entities/case-fault.entity';
import { CaseSetting } from './entities/case-setting.entity';
import { CalculationResult } from './entities/calculation-result.entity';
import { StepVoltageMap } from './entities/step-voltage-map.entity';
import { TouchVoltageMap } from './entities/touch-voltage-map.entity';
import { VoltageProfile } from './entities/voltage-profile.entity';

import { CreateCalculationCaseDto } from './dto/create-calculation-case.dto';
import { UpdateCalculationCaseDto } from './dto/update-calculation-case.dto';
import { GetCalculationCasesQueryDTO } from './dto/get-calculation-cases-query.dto';

import { extractGridGeometry } from './engine/grid-geometry.extractor';
import { computeApparentResistivity } from './engine/soil-apparent-resistivity.engine';
import { evaluateGroundingSafety } from './engine/safety-evaluation.engine';
import { sampleSurfacePotential } from './engine/surface-potential-sampling.engine';
import type { SafetyEvaluationInput } from './engine/types';

/**
 * `CalculationCase` is the aggregate root for a single grounding-safety
 * evaluation: it points at one grid + one soil model (both under the same
 * project) plus its own fault parameters (`CaseFault`) and settings
 * (`CaseSetting`). Running it (`run`) is what actually invokes the IEEE 80
 * engine in `./engine` and persists a new `CalculationResult` — creating a
 * case only stores the inputs, it never computes anything by itself, so a
 * case can be re-run (e.g. after the grid is redrawn) to get a fresh
 * result without losing the history of previous results.
 */
@Injectable()
export class CalculationsService {
  constructor(
    @InjectRepository(CalculationCase)
    private readonly calculationCaseRepository: Repository<CalculationCase>,
    @InjectRepository(CaseFault)
    private readonly caseFaultRepository: Repository<CaseFault>,
    @InjectRepository(CaseSetting)
    private readonly caseSettingRepository: Repository<CaseSetting>,
    @InjectRepository(CalculationResult)
    private readonly calculationResultRepository: Repository<CalculationResult>,
    @InjectRepository(StepVoltageMap)
    private readonly stepVoltageMapRepository: Repository<StepVoltageMap>,
    @InjectRepository(TouchVoltageMap)
    private readonly touchVoltageMapRepository: Repository<TouchVoltageMap>,
    @InjectRepository(VoltageProfile)
    private readonly voltageProfileRepository: Repository<VoltageProfile>,
    @InjectRepository(GridElement)
    private readonly gridElementRepository: Repository<GridElement>,
    @InjectRepository(SoilLayer)
    private readonly soilLayerRepository: Repository<SoilLayer>,
    private readonly projectsService: ProjectsService,
    private readonly gridsService: GridsService,
    private readonly soilModelsService: SoilModelsService,
  ) {}

  /**
   * Fetches a calculation case by id together with its `project`, `grid`
   * and `soilModel`, scoped to the requesting user via
   * `ProjectsService.findOwnedOrAdmin`. Returns `null` if the case doesn't
   * exist or its project isn't owned by the requester.
   */
  private async findOwnedOrAdmin(
    id: string,
    user: TAuthenticatedUserType,
  ): Promise<CalculationCase | null> {
    const calculationCase = await this.calculationCaseRepository
      .createQueryBuilder('calculationCase')
      .leftJoinAndSelect('calculationCase.project', 'project')
      .leftJoinAndSelect('calculationCase.grid', 'grid')
      .leftJoinAndSelect('calculationCase.soilModel', 'soilModel')
      .where('calculationCase.id = :id', { id })
      .getOne();

    if (!calculationCase) {
      return null;
    }

    const ownedProject = await this.projectsService.findOwnedOrAdmin(
      calculationCase.project.id,
      user,
    );
    if (!ownedProject) {
      return null;
    }

    return calculationCase;
  }

  create(
    createCalculationCaseDto: CreateCalculationCaseDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      const { projectId, gridId, soilModelId, fault, settings, ...rest } =
        createCalculationCaseDto;

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

      const grid = await this.gridsService.findOwnedOrAdmin(gridId, user);
      if (!grid || grid.project.id !== project.id) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `شبکه با آیدی: ${gridId} یافت نشد.`,
        };
      }

      const soilModel = await this.soilModelsService.findOwnedOrAdmin(
        soilModelId,
        user,
      );
      if (!soilModel || soilModel.project.id !== project.id) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `مدل خاک با آیدی: ${soilModelId} یافت نشد.`,
        };
      }

      // Case + its fault/settings are created together in one transaction:
      // a `CalculationCase` with no `CaseFault`/`CaseSetting` row is an
      // invalid state (`run` has nothing to evaluate), so either all three
      // are saved or none are.
      const createdCase =
        await this.calculationCaseRepository.manager.transaction(
          async (manager) => {
            const newCase = manager.create(CalculationCase, {
              ...rest,
              project: { id: project.id },
              grid: { id: grid.id },
              soilModel: { id: soilModel.id },
            });
            const savedCase = await manager.save(CalculationCase, newCase);

            const newFault = manager.create(CaseFault, {
              ...fault,
              calculationCase: { id: savedCase.id },
            });
            const newSetting = manager.create(CaseSetting, {
              ...settings,
              calculationCase: { id: savedCase.id },
            });
            const [savedFault, savedSetting] = await Promise.all([
              manager.save(CaseFault, newFault),
              manager.save(CaseSetting, newSetting),
            ]);

            return { ...savedCase, fault: savedFault, settings: savedSetting };
          },
        );

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'کیس محاسباتی با موفقیت ایجاد شد.',
        data: createdCase,
      };
    });
  }

  getAll(queries: GetCalculationCasesQueryDTO, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const {
        projectId,
        gridId,
        soilModelId,
        name,
        pageNumber = 1,
        pageSize = 50,
      } = queries;

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

      const queryBuilder = this.calculationCaseRepository
        .createQueryBuilder('calculationCase')
        .leftJoinAndSelect('calculationCase.project', 'project')
        .leftJoinAndSelect('calculationCase.grid', 'grid')
        .leftJoinAndSelect('calculationCase.soilModel', 'soilModel');

      if (projectId) {
        queryBuilder.andWhere('project.id = :projectId', { projectId });
      } else if (user.role !== UserRole.ADMIN) {
        queryBuilder.andWhere('project.ownerId = :ownerId', {
          ownerId: user.id,
        });
      }

      if (gridId) {
        queryBuilder.andWhere('grid.id = :gridId', { gridId });
      }
      if (soilModelId) {
        queryBuilder.andWhere('soilModel.id = :soilModelId', {
          soilModelId,
        });
      }
      if (name) {
        queryBuilder.andWhere('calculationCase.name LIKE :name', {
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
      const calculationCase = await this.findOwnedOrAdmin(id, user);
      if (!calculationCase) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `کیس محاسباتی با آیدی: ${id} یافت نشد.`,
        };
      }

      const [fault, settings] = await Promise.all([
        this.caseFaultRepository.findOne({
          where: { calculationCase: { id } },
          order: { createdAt: 'DESC' },
        }),
        this.caseSettingRepository.findOne({
          where: { calculationCase: { id } },
          order: { createdAt: 'DESC' },
        }),
      ]);

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: { ...calculationCase, fault, settings },
      };
    });
  }

  update(
    id: string,
    updateCalculationCaseDto: UpdateCalculationCaseDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      if (id !== updateCalculationCaseDto.id) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          messages: 'عدم تطابق آیدی',
          data: null,
        };
      }

      const existingCase = await this.findOwnedOrAdmin(id, user);
      if (!existingCase) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `کیس محاسباتی با آیدی: ${id} یافت نشد.`,
        };
      }

      const calculationCase = Object.assign(
        existingCase,
        updateCalculationCaseDto,
      );
      const updatedCase =
        await this.calculationCaseRepository.save(calculationCase);

      return {
        statusCode: HttpStatus.OK,
        messages: 'کیس محاسباتی با موفقیت بروزرسانی شد.',
        data: updatedCase,
      };
    });
  }

  delete(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const existingCase = await this.findOwnedOrAdmin(id, user);
      if (!existingCase) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          messages: `کیس محاسباتی با آیدی: ${id} یافت نشد.`,
          data: null,
        };
      }

      // No cascade is declared at the entity level for fault/settings/
      // results (they're plain `ManyToOne` back-references), so the
      // dependents are deleted explicitly in one transaction before the
      // case itself — otherwise the FK on any of them would block the
      // delete, or (worse, if the FK were nullable) leave orphans behind.
      await this.calculationCaseRepository.manager.transaction(
        async (manager) => {
          const results = await manager.find(CalculationResult, {
            where: { calculationCase: { id } },
          });
          const resultIds = results.map((r) => r.id);

          if (resultIds.length > 0) {
            await Promise.all([
              manager.delete(StepVoltageMap, { result: { id: In(resultIds) } }),
              manager.delete(TouchVoltageMap, {
                result: { id: In(resultIds) },
              }),
              manager.delete(VoltageProfile, { result: { id: In(resultIds) } }),
            ]);
            await manager.delete(CalculationResult, { id: In(resultIds) });
          }

          await Promise.all([
            manager.delete(CaseFault, { calculationCase: { id } }),
            manager.delete(CaseSetting, { calculationCase: { id } }),
          ]);
          await manager.delete(CalculationCase, { id });
        },
      );

      return {
        statusCode: HttpStatus.OK,
        data: { id },
        messages: 'کیس محاسباتی با موفقیت حذف شد.',
      };
    });
  }

  /**
   * The actual "run the calculation" entrypoint. Pulls together everything
   * a `CalculationCase` points at — grid dimensions + drawn `GridElement`s,
   * soil model + its `SoilLayer`s, the case's `CaseFault` and
   * `CaseSetting` — reduces them into the engine's plain-data input shape,
   * calls `evaluateGroundingSafety` (the one orchestrator in `./engine`),
   * and persists a new `CalculationResult` plus its surface-potential
   * sample maps.
   *
   * Re-runnable: each call appends a new `CalculationResult` rather than
   * overwriting the previous one, so a case's result history survives
   * edits to the underlying grid/soil model.
   */
  run(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const calculationCase = await this.findOwnedOrAdmin(id, user);
      if (!calculationCase) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `کیس محاسباتی با آیدی: ${id} یافت نشد.`,
        };
      }

      const [fault, settings, elements, layers] = await Promise.all([
        this.caseFaultRepository.findOne({
          where: { calculationCase: { id } },
          order: { createdAt: 'DESC' },
        }),
        this.caseSettingRepository.findOne({
          where: { calculationCase: { id } },
          order: { createdAt: 'DESC' },
        }),
        this.gridElementRepository.find({
          where: { grid: { id: calculationCase.grid.id } },
        }),
        this.soilLayerRepository.find({
          where: { soilModel: { id: calculationCase.soilModel.id } },
          order: { layerOrder: 'ASC' },
        }),
      ]);

      if (!fault || !settings) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages:
            'برای این کیس، اطلاعات خطا یا تنظیمات ثبت نشده است. ابتدا کیس را کامل کنید.',
        };
      }
      if (layers.length === 0) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'مدل خاک انتخاب‌شده هیچ لایه‌ای ندارد.',
        };
      }

      const { grid, soilModel } = calculationCase;

      // Postgres `decimal` columns come back as strings through the pg
      // driver (no value transformer is configured on these entities), so
      // every numeric field pulled from the DB is coerced through `Number`
      // before it reaches the engine, which does plain arithmetic on it.
      const geometry = extractGridGeometry(
        {
          length: Number(grid.length),
          width: Number(grid.width),
          burialDepth: Number(grid.burialDepth),
        },
        elements,
      );

      const apparentResistivity = computeApparentResistivity(
        layers.map((l) => ({
          resistivity: Number(l.resistivity),
          thickness: Number(l.thickness),
          layerOrder: l.layerOrder,
        })),
      );

      const evaluationInput: SafetyEvaluationInput = {
        geometry,
        soil: {
          surfaceResistivity: Number(soilModel.surfaceResistivity),
          apparentResistivity,
        },
        fault: {
          faultCurrent: Number(fault.faultCurrent),
          faultDuration: Number(fault.faultDuration),
          splitFactor: Number(fault.splitFactor),
          decrementFactor: Number(fault.decrementFactor),
          shockDuration: Number(fault.shockDuration),
        },
        settings: {
          surfaceLayerResistivity: Number(settings.surfaceLayerResistivity),
          surfaceLayerThickness: Number(settings.surfaceLayerThickness),
          bodyWeight: Number(settings.bodyWeight),
          frequency: Number(settings.frequency),
        },
      };

      const evaluation = evaluateGroundingSafety(evaluationInput);

      const samples = sampleSurfacePotential(
        geometry.length,
        geometry.width,
        evaluation.gpr,
        evaluation.meshVoltage,
        evaluation.stepVoltage,
      );

      // Result row + its sample maps are written in one transaction so a
      // failure partway through (e.g. saving the voltage profile) can't
      // leave a `CalculationResult` with only some of its maps persisted.
      const savedResult =
        await this.calculationResultRepository.manager.transaction(
          async (manager) => {
            const newResult = manager.create(CalculationResult, {
              calculationCase: { id },
              gridResistance: evaluation.gridResistance,
              gpr: evaluation.gpr,
              meshVoltage: evaluation.meshVoltage,
              touchVoltage: evaluation.touchVoltage,
              stepVoltage: evaluation.stepVoltage,
              permissibleTouchVoltage: evaluation.permissibleTouchVoltage,
              permissibleStepVoltage: evaluation.permissibleStepVoltage,
              safe: evaluation.safe,
            });
            const result = await manager.save(CalculationResult, newResult);

            const toRow = (p: { x: number; y: number; value: number }) => ({
              result: { id: result.id },
              x: p.x,
              y: p.y,
              value: p.value,
            });

            await Promise.all([
              manager.save(StepVoltageMap, samples.stepVoltageMap.map(toRow)),
              manager.save(TouchVoltageMap, samples.touchVoltageMap.map(toRow)),
              manager.save(
                VoltageProfile,
                samples.voltageProfile.map((p) => ({
                  result: { id: result.id },
                  x: p.x,
                  y: p.y,
                  voltage: p.value,
                })),
              ),
            ]);

            return result;
          },
        );

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'محاسبات با موفقیت انجام شد.',
        data: {
          ...savedResult,
          details: evaluation.details,
        },
      };
    });
  }

  /**
   * Returns the most recent `CalculationResult` for a case, together with
   * its surface-potential sample maps — everything a results view needs
   * in a single call.
   */
  getResults(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const calculationCase = await this.findOwnedOrAdmin(id, user);
      if (!calculationCase) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `کیس محاسباتی با آیدی: ${id} یافت نشد.`,
        };
      }

      const latestResult = await this.calculationResultRepository.findOne({
        where: { calculationCase: { id } },
        order: { createdAt: 'DESC' },
      });

      if (!latestResult) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: 'هنوز محاسبه‌ای برای این کیس انجام نشده است.',
        };
      }

      const [stepVoltageMap, touchVoltageMap, voltageProfile] =
        await Promise.all([
          this.stepVoltageMapRepository.find({
            where: { result: { id: latestResult.id } },
          }),
          this.touchVoltageMapRepository.find({
            where: { result: { id: latestResult.id } },
          }),
          this.voltageProfileRepository.find({
            where: { result: { id: latestResult.id } },
          }),
        ]);

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: {
          ...latestResult,
          stepVoltageMap,
          touchVoltageMap,
          voltageProfile,
        },
      };
    });
  }
}
