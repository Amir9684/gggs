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

import { UpdateGalerkinSettingsDto } from 'src/galerkin/dto/update-galerkin-settings.dto';
import { UpdateSplitFactorDto } from './dto/update-split-factor.dto';
import { evaluateGalerkinCase } from 'src/galerkin/galerkin-case.evaluator';
import { resolveGalerkinSettings } from 'src/galerkin/galerkin-settings';

import { CreateCalculationCaseDto } from './dto/create-calculation-case.dto';
import { UpdateCalculationCaseDto } from './dto/update-calculation-case.dto';
import { GetCalculationCasesQueryDTO } from './dto/get-calculation-cases-query.dto';
import { PreviewCalculationDto } from './dto/preview-calculation.dto';
import {
  DesignMethod,
  IMPLEMENTED_DESIGN_METHODS,
  SoilLayeringMethod,
} from './enum';

import {
  extractGridGeometry,
  type GridElementLike,
} from './engine/grid-geometry.extractor';
import { computeApparentResistivity } from './engine/soil-apparent-resistivity.engine';
import { evaluateGroundingSafety } from './engine/safety-evaluation.engine';
import { evaluateGroundingSafety1986 } from './engine/safety-evaluation-1986.engine';
import { sampleSurfacePotential } from './engine/surface-potential-sampling.engine';
import { deriveDecrementFactor } from './engine/decrement-factor.engine';
import { computeConductorSizing } from './engine/conductor-sizing.engine';
import { summarizeGridMeshes } from './engine/grid-mesh-summary.engine';
import type {
  GridGeometrySummary,
  SafetyEvaluationInput,
} from './engine/types';

/** Fault inputs `evaluateCase` reads — a stored `CaseFault` or a preview's overridden copy of one. */
type CaseFaultInput = Pick<
  CaseFault,
  | 'faultCurrent'
  | 'faultDuration'
  | 'splitFactor'
  | 'decrementFactor'
  | 'shockDuration'
>;

/** Settings inputs `evaluateCase` reads. */
type CaseSettingInput = Pick<
  CaseSetting,
  | 'surfaceLayerResistivity'
  | 'surfaceLayerThickness'
  | 'bodyWeight'
  | 'frequency'
>;

type SoilLayerInput = Pick<
  SoilLayer,
  'resistivity' | 'thickness' | 'layerOrder'
>;

/** A ready-to-send error response, or the engine's output for the inputs. */
type EvaluationOutcome =
  | { statusCode: HttpStatus; data: null; messages: string | string[] }
  | {
      geometry: GridGeometrySummary;
      evaluation: ReturnType<typeof evaluateGroundingSafety>;
      samples: ReturnType<typeof sampleSurfacePotential>;
    };

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

  /**
   * Validates a case's inputs and runs the IEEE 80 engine on them. Shared
   * by `run()` (which then persists the result) and `preview()` (which
   * never writes anything), so a preview can't drift from a real run.
   *
   * Returns either the evaluation, or the ready-to-send error response
   * (recognised by its `statusCode`) when an input is missing or invalid.
   */
  private evaluateCase(
    calculationCase: Pick<CalculationCase, 'designMethod' | 'soilLayering'> & {
      grid: { length: number; width: number; burialDepth: number };
      soilModel: { surfaceResistivity: number };
    },
    fault: CaseFaultInput | null,
    settings: CaseSettingInput | null,
    elements: GridElementLike[],
    layers: SoilLayerInput[],
  ): EvaluationOutcome {
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

    const { grid, soilModel } = calculationCase;

    // ---------------------------------------------------------
    // Convert database decimal values to numbers
    // ---------------------------------------------------------

    const gridLength = Number(grid.length);
    const gridWidth = Number(grid.width);
    const burialDepth = Number(grid.burialDepth);

    const faultCurrent = Number(fault.faultCurrent);
    const faultDuration = Number(fault.faultDuration);
    const splitFactor = Number(fault.splitFactor);
    const decrementFactor = Number(fault.decrementFactor);
    const shockDuration = Number(fault.shockDuration);

    const surfaceLayerResistivity = Number(settings.surfaceLayerResistivity);
    const surfaceLayerThickness = Number(settings.surfaceLayerThickness);
    const bodyWeight = Number(settings.bodyWeight);
    const frequency = Number(settings.frequency);

    const surfaceResistivity = Number(soilModel.surfaceResistivity);

    // ---------------------------------------------------------
    // Validate grid
    // ---------------------------------------------------------

    if (!Number.isFinite(gridLength) || gridLength <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'طول شبکه باید بزرگ‌تر از صفر باشد.',
      };
    }

    if (!Number.isFinite(gridWidth) || gridWidth <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'عرض شبکه باید بزرگ‌تر از صفر باشد.',
      };
    }

    if (!Number.isFinite(burialDepth) || burialDepth < 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'عمق دفن شبکه نمی‌تواند منفی باشد.',
      };
    }

    // ---------------------------------------------------------
    // Extract grid geometry
    // ---------------------------------------------------------

    const geometry = extractGridGeometry(
      {
        length: gridLength,
        width: gridWidth,
        burialDepth,
      },
      elements,
    );

    // A grounding grid must contain at least one
    // conductor or rod with a positive length.
    if (
      !Number.isFinite(geometry.totalConductorLength) ||
      !Number.isFinite(geometry.totalRodLength) ||
      geometry.totalConductorLength < 0 ||
      geometry.totalRodLength < 0
    ) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'اطلاعات هادی‌ها یا میله‌های ارت شبکه نامعتبر است.',
      };
    }

    if (geometry.totalConductorLength <= 0 && geometry.totalRodLength <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages:
          'امکان انجام محاسبات وجود ندارد. شبکه ارت فاقد هادی یا میله ارت است. لطفاً حداقل یک هادی یا میله ارت به شبکه اضافه کنید.',
      };
    }

    if (!Number.isFinite(geometry.area) || geometry.area <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'مساحت شبکه باید بزرگ‌تر از صفر باشد.',
      };
    }

    if (
      !Number.isFinite(geometry.averageSpacing) ||
      geometry.averageSpacing <= 0
    ) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages:
          'فاصله متوسط هادی‌های شبکه نامعتبر است. لطفاً آرایش هادی‌های شبکه را بررسی کنید.',
      };
    }

    if (
      !Number.isFinite(geometry.conductorDiameter) ||
      geometry.conductorDiameter <= 0
    ) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'قطر هادی شبکه باید بزرگ‌تر از صفر باشد.',
      };
    }

    // ---------------------------------------------------------
    // Validate soil model
    // ---------------------------------------------------------

    const soilLayers = layers.map((layer) => ({
      resistivity: Number(layer.resistivity),
      thickness: Number(layer.thickness),
      layerOrder: layer.layerOrder,
    }));

    const invalidSoilLayer = soilLayers.some(
      (layer) =>
        !Number.isFinite(layer.resistivity) ||
        layer.resistivity <= 0 ||
        !Number.isFinite(layer.thickness) ||
        layer.thickness < 0,
    );

    if (invalidSoilLayer) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages:
          'اطلاعات یکی از لایه‌های خاک نامعتبر است. مقاومت ویژه باید مثبت و ضخامت نمی‌تواند منفی باشد.',
      };
    }

    if (!Number.isFinite(surfaceResistivity) || surfaceResistivity <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'مقاومت ویژه سطح خاک باید بزرگ‌تر از صفر باشد.',
      };
    }

    // ---------------------------------------------------------
    // Calculate apparent soil resistivity
    // ---------------------------------------------------------

    const apparentResistivity = computeApparentResistivity(soilLayers);

    if (!Number.isFinite(apparentResistivity) || apparentResistivity <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages:
          'مقاومت ویژه ظاهری خاک نامعتبر است. لطفاً مدل خاک را بررسی کنید.',
      };
    }

    // ---------------------------------------------------------
    // Two-layer soil: exactly two layers, upper one has a thickness
    // ---------------------------------------------------------

    const isTwoLayer =
      calculationCase.soilLayering === SoilLayeringMethod.TWO_LAYER;

    if (isTwoLayer) {
      if (soilLayers.length !== 2) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: `برای خاک دولایه، مدل خاک باید دقیقاً دو لایه داشته باشد (مدل انتخاب‌شده ${soilLayers.length} لایه دارد).`,
        };
      }

      if (soilLayers[0].thickness <= 0) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages:
            'برای خاک دولایه، ضخامت لایهٔ بالایی باید بزرگ‌تر از صفر باشد.',
        };
      }

      const { meshCount } = summarizeGridMeshes(geometry);
      if (geometry.totalRodLength > 0 && meshCount < 1) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages:
            'برای محاسبهٔ خاک دولایه با میله‌های زمین، شبکه باید حداقل یک مش داشته باشد.',
        };
      }
    }

    // ---------------------------------------------------------
    // Validate fault parameters
    // ---------------------------------------------------------

    if (!Number.isFinite(faultCurrent) || faultCurrent <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'جریان خطا باید بزرگ‌تر از صفر باشد.',
      };
    }

    if (!Number.isFinite(splitFactor) || splitFactor <= 0 || splitFactor > 1) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages:
          'ضریب تقسیم جریان باید بیشتر از صفر و حداکثر برابر با ۱ باشد.',
      };
    }

    if (!Number.isFinite(decrementFactor) || decrementFactor < 1) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'ضریب کاهشی جریان باید بزرگ‌تر یا مساوی ۱ باشد.',
      };
    }

    if (!Number.isFinite(faultDuration) || faultDuration <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'مدت زمان خطا باید بزرگ‌تر از صفر باشد.',
      };
    }

    if (!Number.isFinite(shockDuration) || shockDuration <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'مدت زمان شوک باید بزرگ‌تر از صفر باشد.',
      };
    }

    // ---------------------------------------------------------
    // Validate settings
    // ---------------------------------------------------------

    if (!Number.isFinite(surfaceLayerThickness) || surfaceLayerThickness < 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'ضخامت لایه سطحی نمی‌تواند منفی باشد.',
      };
    }

    if (
      !Number.isFinite(surfaceLayerResistivity) ||
      surfaceLayerResistivity < 0
    ) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'مقاومت ویژه لایه سطحی نمی‌تواند منفی باشد.',
      };
    }

    if (!Number.isFinite(bodyWeight) || bodyWeight <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'وزن بدن باید بزرگ‌تر از صفر باشد.',
      };
    }

    if (!Number.isFinite(frequency) || frequency <= 0) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: 'فرکانس شبکه باید بزرگ‌تر از صفر باشد.',
      };
    }

    // ---------------------------------------------------------
    // Build calculation input
    // ---------------------------------------------------------

    const evaluationInput: SafetyEvaluationInput = {
      geometry,

      soil: {
        surfaceResistivity,
        apparentResistivity,
        ...(isTwoLayer && {
          twoLayer: {
            upperResistivity: soilLayers[0].resistivity,
            lowerResistivity: soilLayers[1].resistivity,
            upperThickness: soilLayers[0].thickness,
          },
        }),
      },

      fault: {
        faultCurrent,
        faultDuration,
        splitFactor,
        decrementFactor,
        shockDuration,
      },

      settings: {
        surfaceLayerResistivity,
        surfaceLayerThickness,
        bodyWeight,
        frequency,
      },
    };

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

    return { geometry, evaluation, samples };
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

      if (calculationCase.designMethod === DesignMethod.GALERKIN) {
        return this.runGalerkinCase(
          id,
          calculationCase,
          fault,
          settings,
          elements,
          layers,
        );
      }

      const outcome = this.evaluateCase(
        calculationCase,
        fault,
        settings,
        elements,
        layers,
      );
      if ('statusCode' in outcome) {
        return outcome;
      }
      const { evaluation, samples } = outcome;

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
   * The Galerkin path of `run()`: the method of moments solves the grid
   * (see `src/galerkin`) instead of the IEEE 80 formulas, so a result has
   * no IEEE `details`; its solver notes go in `solverDetails` and its
   * voltage maps come from the solved surface potential.
   */
  private async runGalerkinCase(
    id: string,
    calculationCase: CalculationCase,
    fault: CaseFault | null,
    settings: CaseSetting | null,
    elements: GridElement[],
    layers: SoilLayer[],
  ) {
    if (!fault || !settings) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages:
          'برای این کیس، اطلاعات خطا یا تنظیمات ثبت نشده است. ابتدا کیس را کامل کنید.',
      };
    }

    const outcome = evaluateGalerkinCase({
      grid: {
        length: Number(calculationCase.grid.length),
        width: Number(calculationCase.grid.width),
        burialDepth: Number(calculationCase.grid.burialDepth),
      },
      fault: {
        faultCurrent: Number(fault.faultCurrent),
        splitFactor: Number(fault.splitFactor),
        decrementFactor: Number(fault.decrementFactor),
        shockDuration: Number(fault.shockDuration),
      },
      settings: {
        surfaceLayerResistivity: Number(settings.surfaceLayerResistivity),
        surfaceLayerThickness: Number(settings.surfaceLayerThickness),
        bodyWeight: Number(settings.bodyWeight),
      },
      soilLayers: layers.map((layer) => ({
        resistivity: Number(layer.resistivity),
        thickness: Number(layer.thickness),
      })),
      elements,
      galerkinSettings: calculationCase.galerkinSettings,
    });

    if (!outcome.ok) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        data: null,
        messages: outcome.message,
      };
    }

    const { values, samples } = outcome;

    const savedResult =
      await this.calculationResultRepository.manager.transaction(
        async (manager) => {
          const result = await manager.save(
            CalculationResult,
            manager.create(CalculationResult, {
              calculationCase: { id },
              gridResistance: values.gridResistance,
              gpr: values.gpr,
              meshVoltage: values.meshVoltage,
              touchVoltage: values.touchVoltage,
              stepVoltage: values.stepVoltage,
              permissibleTouchVoltage: values.permissibleTouchVoltage,
              permissibleStepVoltage: values.permissibleStepVoltage,
              safe: values.safe,
              details: null,
              solverDetails: values.solverDetails,
            }),
          );

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
      data: savedResult,
    };
  }

  /**
   * Sets the current split factor Sf of a case's fault parameters, for
   * "use the split factor in the case" from the split factor module.
   * Earlier results were computed with the old value, so the response says
   * the case must be run again.
   */
  updateSplitFactor(
    id: string,
    dto: UpdateSplitFactorDto,
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

      const fault = await this.caseFaultRepository.findOne({
        where: { calculationCase: { id } },
        order: { createdAt: 'DESC' },
      });

      if (!fault) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'برای این کیس اطلاعات خطا ثبت نشده است.',
        };
      }

      fault.splitFactor = dto.splitFactor;
      await this.caseFaultRepository.save(fault);

      return {
        statusCode: HttpStatus.OK,
        messages:
          'ضریب تقسیم جریان کیس به‌روز شد. نتایج قبلی با مقدار قدیمی محاسبه شده‌اند؛ محاسبه را دوباره اجرا کنید.',
        data: { id, splitFactor: Number(fault.splitFactor) },
      };
    });
  }

  /**
   * Saves the Galerkin solver inputs of a Galerkin case; omitted fields
   * keep their current (or default) value.
   */
  updateGalerkinSettings(
    id: string,
    dto: UpdateGalerkinSettingsDto,
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

      if (calculationCase.designMethod !== DesignMethod.GALERKIN) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'تنظیمات گالرکین فقط برای کیس‌های روش گالرکین قابل ثبت است.',
        };
      }

      const provided = Object.fromEntries(
        Object.entries(dto).filter(([, value]) => value !== undefined),
      );
      const merged = {
        ...resolveGalerkinSettings(calculationCase.galerkinSettings),
        ...provided,
      };

      calculationCase.galerkinSettings = merged;
      await this.calculationCaseRepository.save(calculationCase);

      return {
        statusCode: HttpStatus.OK,
        messages: 'تنظیمات گالرکین ذخیره شد.',
        data: merged,
      };
    });
  }

  /**
   * Runs the engine on a case's inputs, optionally with overrides, and
   * returns the numbers without saving anything — the "what if" behind the
   * live recalculation panel. It goes through the same `evaluateCase` as
   * `run()`, so a preview always agrees with the result a run would store
   * for the same inputs.
   *
   * Overrides (all optional, never persisted): grid dimensions, the
   * editor's unsaved elements, and fault / settings values. When the fault
   * duration is overridden without a decrement factor, Df is re-derived
   * from the new duration, as on the case form.
   */
  preview(
    id: string,
    previewDto: PreviewCalculationDto,
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

      if (calculationCase.designMethod === DesignMethod.GALERKIN) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages:
            'پیش‌نمایش لحظه‌ای برای روش گالرکین پشتیبانی نمی‌شود. برای دیدن نتیجه، محاسبه را اجرا کنید.',
        };
      }

      const [fault, settings, savedElements, layers] = await Promise.all([
        this.caseFaultRepository.findOne({
          where: { calculationCase: { id } },
          order: { createdAt: 'DESC' },
        }),

        this.caseSettingRepository.findOne({
          where: { calculationCase: { id } },
          order: { createdAt: 'DESC' },
        }),

        previewDto.elements
          ? Promise.resolve<GridElementLike[]>([])
          : this.gridElementRepository.find({
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

      const definedOnly = <T extends object>(
        values: T | undefined,
      ): Partial<T> =>
        Object.fromEntries(
          Object.entries(values ?? {}).filter(([, v]) => v !== undefined),
        ) as Partial<T>;

      const faultOverrides = definedOnly(previewDto.fault);
      const previewFault: CaseFaultInput = { ...fault, ...faultOverrides };
      if (
        faultOverrides.faultDuration !== undefined &&
        faultOverrides.decrementFactor === undefined &&
        Number.isFinite(faultOverrides.faultDuration) &&
        faultOverrides.faultDuration > 0
      ) {
        previewFault.decrementFactor = deriveDecrementFactor(
          faultOverrides.faultDuration,
        );
      }

      const previewSettings: CaseSettingInput = {
        ...settings,
        ...definedOnly(previewDto.settings),
      };

      const outcome = this.evaluateCase(
        {
          ...calculationCase,
          grid: {
            length: Number(calculationCase.grid.length),
            width: Number(calculationCase.grid.width),
            burialDepth: Number(calculationCase.grid.burialDepth),
            ...definedOnly(previewDto.grid),
          },
        },
        previewFault,
        previewSettings,
        previewDto.elements ?? savedElements,
        layers,
      );
      if ('statusCode' in outcome) {
        return outcome;
      }

      const { evaluation, geometry } = outcome;

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: {
          gridResistance: evaluation.gridResistance,
          gpr: evaluation.gpr,
          meshVoltage: evaluation.meshVoltage,
          touchVoltage: evaluation.touchVoltage,
          stepVoltage: evaluation.stepVoltage,
          permissibleTouchVoltage: evaluation.permissibleTouchVoltage,
          permissibleStepVoltage: evaluation.permissibleStepVoltage,
          safe: evaluation.safe,
          decrementFactor: previewFault.decrementFactor,
          grid: {
            length: geometry.length,
            width: geometry.width,
            burialDepth: geometry.burialDepth,
            area: geometry.area,
            totalConductorLength: geometry.totalConductorLength,
            rodCount: geometry.rodCount,
            totalRodLength: geometry.totalRodLength,
          },
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

