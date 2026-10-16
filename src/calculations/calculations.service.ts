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
import { CaseConductor } from './entities/case-conductor.entity';
import { CalculationResult } from './entities/calculation-result.entity';
import { StepVoltageMap } from './entities/step-voltage-map.entity';
import { TouchVoltageMap } from './entities/touch-voltage-map.entity';
import { VoltageProfile } from './entities/voltage-profile.entity';
import { Report } from 'src/reports/entities/report.entity';

import { CreateCalculationCaseDto } from './dto/create-calculation-case.dto';
import { UpdateCalculationCaseDto } from './dto/update-calculation-case.dto';
import { GetCalculationCasesQueryDTO } from './dto/get-calculation-cases-query.dto';
import {
  DesignMethod,
  IMPLEMENTED_DESIGN_METHODS,
  SoilLayeringMethod,
} from './enum';

import { evaluateGroundingSafety } from './engine/safety-evaluation.engine';
import { evaluateGroundingSafety1986 } from './engine/safety-evaluation-1986.engine';
import { sampleSurfacePotential } from './engine/surface-potential-sampling.engine';
import { deriveDecrementFactor } from './engine/decrement-factor.engine';
import { computeConductorSizing } from './engine/conductor-sizing.engine';
import { buildEvaluationInput } from './evaluation-input.builder';
import { generateRectangularGrid } from './engine/grid-generator.engine';
import { toGeneratorParams } from 'src/grids/dto/grid-generator.schema';
import type { PreviewCalculationDto } from './dto/preview-calculation.dto';

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
    @InjectRepository(CaseConductor)
    private readonly caseConductorRepository: Repository<CaseConductor>,
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

  /**
   * Adds `crossSectionAdequate` to a stored conductor: `true` when the
   * cross-section the user entered is at least the computed minimum,
   * `false` when it is smaller, and `null` when no cross-section was
   * entered (a standard size is then chosen from `standardSizeMm2`).
   */
  private withAdequacy(conductor: CaseConductor | null) {
    if (!conductor) {
      return null;
    }
    return {
      ...conductor,
      crossSectionAdequate:
        conductor.crossSectionMm2 === null
          ? null
          : conductor.crossSectionMm2 >= conductor.minimumAreaMm2,
    };
  }

  create(
    createCalculationCaseDto: CreateCalculationCaseDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      const {
        projectId,
        gridId,
        soilModelId,
        fault,
        settings,
        designMethod,
        conductor,
        ...rest
      } = createCalculationCaseDto;

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

      // IEEE 80-86 and IEEE 80-2000 both support one- and two-layer soil;
      // 80-86 cases created without a choice are uniform-soil cases.
      const soilLayering =
        designMethod.soilLayering ??
        (designMethod.method === DesignMethod.IEEE_80_86
          ? SoilLayeringMethod.ONE_LAYER
          : null);

      if (soilLayering === SoilLayeringMethod.TWO_LAYER) {
        const layerCount = await this.soilLayerRepository.count({
          where: { soilModel: { id: soilModel.id } },
        });
        if (layerCount !== 2) {
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            data: null,
            messages: `برای خاک دولایه، مدل خاک باید دقیقاً دو لایه داشته باشد (مدل انتخاب‌شده ${layerCount} لایه دارد).`,
          };
        }
      }

      // Conductor sizing needs the case's own fault current and duration,
      // so it is computed here, before anything is written.
      let conductorSizing: ReturnType<typeof computeConductorSizing> | null =
        null;
      if (conductor) {
        try {
          conductorSizing = computeConductorSizing({
            material: conductor.material,
            faultCurrent: fault.faultCurrent,
            duration: conductor.sizingDuration ?? fault.faultDuration,
            ambientTemperature: conductor.ambientTemperature,
            allowableTemperature: conductor.allowableTemperature,
          });
        } catch (error) {
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            data: null,
            messages:
              error instanceof Error
                ? error.message
                : 'محاسبهٔ سطح مقطع هادی ناموفق بود.',
          };
        }
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
              designMethod: designMethod.method,
              soilLayering,
              project: { id: project.id },
              grid: { id: grid.id },
              soilModel: { id: soilModel.id },
            });
            const savedCase = await manager.save(CalculationCase, newCase);

            const newFault = manager.create(CaseFault, {
              ...fault,
              // Df follows from the fault duration unless the caller
              // supplied an explicit override.
              decrementFactor:
                fault.decrementFactor ??
                deriveDecrementFactor(fault.faultDuration),
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

            let savedConductor: CaseConductor | null = null;
            if (conductor && conductorSizing) {
              savedConductor = await manager.save(
                CaseConductor,
                manager.create(CaseConductor, {
                  material: conductor.material,
                  ambientTemperature: conductor.ambientTemperature,
                  allowableTemperature: conductorSizing.allowableTemperature,
                  sizingDuration:
                    conductor.sizingDuration ?? fault.faultDuration,
                  minimumAreaMm2: conductorSizing.minimumAreaMm2,
                  minimumAreaKcmil: conductorSizing.minimumAreaKcmil,
                  standardSizeMm2: conductorSizing.standardSizeMm2,
                  crossSectionMm2: conductor.crossSectionMm2 ?? null,
                  calculationCase: { id: savedCase.id },
                }),
              );
            }

            return {
              ...savedCase,
              fault: savedFault,
              settings: savedSetting,
              conductor: this.withAdequacy(savedConductor),
            };
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

      const [fault, settings, conductor] = await Promise.all([
        this.caseFaultRepository.findOne({
          where: { calculationCase: { id } },
          order: { createdAt: 'DESC' },
        }),
        this.caseSettingRepository.findOne({
          where: { calculationCase: { id } },
          order: { createdAt: 'DESC' },
        }),
        this.caseConductorRepository.findOne({
          where: { calculationCase: { id } },
          order: { createdAt: 'DESC' },
        }),
      ]);

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: {
          ...calculationCase,
          fault,
          settings,
          conductor: this.withAdequacy(conductor),
        },
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

      // `Report.result` has no `onDelete` cascade, so deleting a
      // `CalculationResult` that a report still points at would otherwise
      // fail with a raw FK-violation error from Postgres. Block the whole
      // case delete up front with a clear message rather than letting the
      // DB throw partway through the transaction below.
      const existingResultIds = (
        await this.calculationResultRepository.find({
          where: { calculationCase: { id } },
          select: { id: true },
        })
      ).map((r) => r.id);

      if (existingResultIds.length > 0) {
        const reportCount = await this.calculationCaseRepository.manager
          .getRepository(Report)
          .count({ where: { result: { id: In(existingResultIds) } } });
        if (reportCount > 0) {
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            data: null,
            messages:
              'برای نتایج این کیس محاسباتی گزارش تولید شده است. ابتدا گزارش‌ها را حذف کنید.',
          };
        }
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
            manager.delete(CaseConductor, { calculationCase: { id } }),
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

  /** Latest fault / settings rows, drawn elements and soil layers of a case. */
  private async loadEvaluationData(calculationCase: CalculationCase) {
    const id = calculationCase.id;
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

    return { fault, settings, elements, layers };
  }

  /**
   * The actual "run the calculation" entrypoint. Pulls together everything
   * a `CalculationCase` points at — grid dimensions + drawn `GridElement`s,
   * soil model + its `SoilLayer`s, the case's `CaseFault` and
   * `CaseSetting` — reduces them into the engine's plain-data input shape,
   * calls `evaluateGroundingSafety` or `evaluateGroundingSafety1986`
   * (picked by `CalculationCase.designMethod` — see `./enum` for
   * which methods are actually implemented), and persists a new
   * `CalculationResult` plus its surface-potential sample maps.
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

      const { fault, settings, elements, layers } =
        await this.loadEvaluationData(calculationCase);

      // ---------------------------------------------------------
      // Required calculation data
      // ---------------------------------------------------------

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

      // `./engine` only implements IEEE 80-2013 — see the note on
      // `IMPLEMENTED_DESIGN_METHODS`. Refuse rather than silently running
      // that engine under a method the user didn't actually pick.
      if (!IMPLEMENTED_DESIGN_METHODS.includes(calculationCase.designMethod)) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: `روش طراحی «${calculationCase.designMethod}» هنوز در بک‌اند پیاده‌سازی نشده است. فعلاً فقط IEEE 80-2000 و IEEE 80-86 پشتیبانی می‌شوند.`,
        };
      }

      // Validation and reduction to the engine's input are shared with the
      // stateless preview — see `evaluation-input.builder.ts`.
      const built = buildEvaluationInput({
        soilLayering: calculationCase.soilLayering,
        grid: calculationCase.grid,
        elements,
        soilModel: calculationCase.soilModel,
        layers,
        fault,
        settings,
      });

      if (!built.ok) {
        return {
          statusCode: built.statusCode,
          data: null,
          messages: built.message,
        };
      }

      const evaluationInput = built.input;
      const { geometry } = evaluationInput;

      // ---------------------------------------------------------
      // Run IEEE 80 calculation
      // ---------------------------------------------------------

      const evaluation =
        calculationCase.designMethod === DesignMethod.IEEE_80_86
          ? evaluateGroundingSafety1986(evaluationInput)
          : evaluateGroundingSafety(evaluationInput);

      // ---------------------------------------------------------
      // Generate visualization samples
      // ---------------------------------------------------------

      const samples = sampleSurfacePotential(
        geometry.length,
        geometry.width,
        evaluation.gpr,
        evaluation.meshVoltage,
        evaluation.stepVoltage,
      );

      // ---------------------------------------------------------
      // Persist result
      // ---------------------------------------------------------

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
              details: evaluation.details,
            });

            const result = await manager.save(CalculationResult, newResult);

            const toRow = (point: { x: number; y: number; value: number }) => ({
              result: { id: result.id },
              x: point.x,
              y: point.y,
              value: point.value,
            });

            await Promise.all([
              manager.save(StepVoltageMap, samples.stepVoltageMap.map(toRow)),

              manager.save(TouchVoltageMap, samples.touchVoltageMap.map(toRow)),

              manager.save(
                VoltageProfile,
                samples.voltageProfile.map((point) => ({
                  result: { id: result.id },
                  x: point.x,
                  y: point.y,
                  voltage: point.value,
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
   * Stateless preview: evaluates the case with optional overrides (a
   * parametric grid, fault values, settings) and returns the result WITHOUT
   * saving anything — no `CalculationResult`, no sample maps, no changes to
   * the case, its grid or its fault / settings rows. Meant for live
   * recalculation while a user drags sliders.
   */
  preview(
    id: string,
    previewCalculationDto: PreviewCalculationDto,
    user: TAuthenticatedUserType,
  ) {
    return asyncFn(async () => {
      const calculationCase = await this.findOwnedOrAdmin(id, user);

      if (!calculationCase) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `کیس محاسباتی با آیدی: ${id} یافت نشد.`,
        };
      }

      const stored = await this.loadEvaluationData(calculationCase);

      if (!stored.fault || !stored.settings) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages:
            'برای این کیس، اطلاعات خطا یا تنظیمات ثبت نشده است. ابتدا کیس را کامل کنید.',
        };
      }

      if (stored.layers.length === 0) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'مدل خاک انتخاب‌شده هیچ لایه‌ای ندارد.',
        };
      }

      if (!IMPLEMENTED_DESIGN_METHODS.includes(calculationCase.designMethod)) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: `روش طراحی «${calculationCase.designMethod}» هنوز در بک‌اند پیاده‌سازی نشده است. فعلاً فقط IEEE 80-2000 و IEEE 80-86 پشتیبانی می‌شوند.`,
        };
      }

      // Parametric grid overrides the stored grid and its elements.
      let grid: { length: number; width: number; burialDepth: number } = {
        length: Number(calculationCase.grid.length),
        width: Number(calculationCase.grid.width),
        burialDepth: Number(calculationCase.grid.burialDepth),
      };
      let elements = stored.elements;
      let generatedSummary:
        | ReturnType<typeof generateRectangularGrid>['summary']
        | null = null;

      if (previewCalculationDto.grid) {
        const params = toGeneratorParams(previewCalculationDto.grid);
        try {
          const generated = generateRectangularGrid(params);
          elements = generated.elements as typeof elements;
          generatedSummary = generated.summary;
          grid = {
            length: params.length,
            width: params.width,
            burialDepth: params.burialDepth,
          };
        } catch (error) {
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            data: null,
            messages: `پارامترهای تولید شبکه نامعتبر است: ${(error as Error).message}`,
          };
        }
      }

      // Fault: a new duration without an explicit Df re-derives Df.
      const faultOverride = previewCalculationDto.fault ?? {};
      const fault = {
        faultCurrent: faultOverride.faultCurrent ?? stored.fault.faultCurrent,
        faultDuration:
          faultOverride.faultDuration ?? stored.fault.faultDuration,
        splitFactor: faultOverride.splitFactor ?? stored.fault.splitFactor,
        shockDuration: stored.fault.shockDuration,
        decrementFactor:
          faultOverride.decrementFactor ??
          (faultOverride.faultDuration !== undefined
            ? deriveDecrementFactor(faultOverride.faultDuration)
            : stored.fault.decrementFactor),
      };

      const settingsOverride = previewCalculationDto.settings ?? {};
      const settings = {
        surfaceLayerResistivity:
          settingsOverride.surfaceLayerResistivity ??
          stored.settings.surfaceLayerResistivity,
        surfaceLayerThickness:
          settingsOverride.surfaceLayerThickness ??
          stored.settings.surfaceLayerThickness,
        bodyWeight: settingsOverride.bodyWeight ?? stored.settings.bodyWeight,
        frequency: settingsOverride.frequency ?? stored.settings.frequency,
      };

      const built = buildEvaluationInput({
        soilLayering: calculationCase.soilLayering,
        grid,
        elements,
        soilModel: calculationCase.soilModel,
        layers: stored.layers,
        fault,
        settings,
      });

      if (!built.ok) {
        return {
          statusCode: built.statusCode,
          data: null,
          messages: built.message,
        };
      }

      const evaluation =
        calculationCase.designMethod === DesignMethod.IEEE_80_86
          ? evaluateGroundingSafety1986(built.input)
          : evaluateGroundingSafety(built.input);

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: { ...evaluation, generated: generatedSummary },
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
