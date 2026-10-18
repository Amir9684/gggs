import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';
import { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';
import { ProjectsService } from 'src/projects/projects.service';
import UserRole from 'src/users/enum';

import { CalculationResult } from 'src/calculations/entities/calculation-result.entity';
import { CaseConductor } from 'src/calculations/entities/case-conductor.entity';
import { CaseFault } from 'src/calculations/entities/case-fault.entity';
import { CaseSetting } from 'src/calculations/entities/case-setting.entity';
import { TouchVoltageMap } from 'src/calculations/entities/touch-voltage-map.entity';
import { StepVoltageMap } from 'src/calculations/entities/step-voltage-map.entity';
import { VoltageProfile } from 'src/calculations/entities/voltage-profile.entity';

import { Report } from './entities/report.entity';
import { GenerateReportDto } from './dto/generate-report.dto';
import { GetReportsQueryDTO } from './dto/get-reports-query.dto';
import { getConductorMaterial } from 'src/calculations/engine/conductor-material.catalog';

import { buildReportPdf } from './pdf/report-pdf.builder';
import type {
  ReportConductor,
  ReportOptions,
  ReportPdfData,
} from './pdf/report-pdf.types';
import { resolveHalfSecondVariant } from './report-options';
import { chooseReportTemplate } from './report-template';

/** The stored conductor choice plus its material constants, as the PDF prints them. */
function toReportConductor(conductor: CaseConductor): ReportConductor {
  const material = getConductorMaterial(conductor.material);

  return {
    materialName: material.name,
    alphaR: material.alphaR,
    k0: material.k0,
    rhoR: material.rhoR,
    tcap: material.tcap,
    ambientTemperature: Number(conductor.ambientTemperature),
    allowableTemperature: Number(conductor.allowableTemperature),
    sizingDuration: Number(conductor.sizingDuration),
    minimumAreaMm2: Number(conductor.minimumAreaMm2),
    standardSizeMm2:
      conductor.standardSizeMm2 === null
        ? null
        : Number(conductor.standardSizeMm2),
    crossSectionMm2:
      conductor.crossSectionMm2 === null
        ? null
        : Number(conductor.crossSectionMm2),
  };
}

/**
 * Generates a PDF grounding-safety report for a `CalculationResult`
 * directly with pdfkit (see `pdf/report-pdf.builder.ts`) and stores the
 * exported file on disk. A `Report` row is the record of "this file was
 * generated for this result" — the file itself lives under
 * `REPORTS_STORAGE_DIR`, addressed by `filePath`.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(CalculationResult)
    private readonly calculationResultRepository: Repository<CalculationResult>,
    @InjectRepository(CaseFault)
    private readonly caseFaultRepository: Repository<CaseFault>,
    @InjectRepository(CaseSetting)
    private readonly caseSettingRepository: Repository<CaseSetting>,
    @InjectRepository(CaseConductor)
    private readonly caseConductorRepository: Repository<CaseConductor>,
    @InjectRepository(TouchVoltageMap)
    private readonly touchVoltageMapRepository: Repository<TouchVoltageMap>,
    @InjectRepository(StepVoltageMap)
    private readonly stepVoltageMapRepository: Repository<StepVoltageMap>,
    @InjectRepository(VoltageProfile)
    private readonly voltageProfileRepository: Repository<VoltageProfile>,
    private readonly projectsService: ProjectsService,
    private readonly config: ConfigService,
  ) {}

  private get storageDir(): string {
    const configured = this.config.get<string>(
      'REPORTS_STORAGE_DIR',
      'storage/reports',
    );
    return path.resolve(process.cwd(), configured);
  }

  /**
   * Fetches a report by id together with its `project`, scoped to the
   * requesting user via `ProjectsService.findOwnedOrAdmin`. Returns
   * `null` if the report doesn't exist or its project isn't owned by the
   * requester.
   */
  private async findOwnedOrAdmin(
    id: string,
    user: TAuthenticatedUserType,
  ): Promise<Report | null> {
    const report = await this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.project', 'project')
      .leftJoinAndSelect('report.result', 'result')
      .where('report.id = :id', { id })
      .getOne();

    if (!report) {
      return null;
    }

    const ownedProject = await this.projectsService.findOwnedOrAdmin(
      report.project.id,
      user,
    );
    if (!ownedProject) {
      return null;
    }

    return report;
  }

  generate(dto: GenerateReportDto, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const result = await this.calculationResultRepository
        .createQueryBuilder('result')
        .leftJoinAndSelect('result.calculationCase', 'calculationCase')
        .leftJoinAndSelect('calculationCase.project', 'project')
        .leftJoinAndSelect('calculationCase.grid', 'grid')
        .leftJoinAndSelect('calculationCase.soilModel', 'soilModel')
        .where('result.id = :id', { id: dto.resultId })
        .getOne();

      if (!result) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `نتیجه محاسبه با آیدی: ${dto.resultId} یافت نشد.`,
        };
      }

      const project = await this.projectsService.findOwnedOrAdmin(
        result.calculationCase.project.id,
        user,
      );
      if (!project) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `نتیجه محاسبه با آیدی: ${dto.resultId} یافت نشد.`,
        };
      }

      const { calculationCase } = result;

      const templateChoice = chooseReportTemplate(
        dto.template,
        calculationCase.designMethod,
        calculationCase.soilLayering,
      );
      if (!templateChoice.ok) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: templateChoice.message,
        };
      }

      const [
        fault,
        settings,
        conductor,
        touchVoltageMap,
        stepVoltageMap,
        voltageProfile,
      ] =
        await Promise.all([
          this.caseFaultRepository.findOne({
            where: { calculationCase: { id: calculationCase.id } },
            order: { createdAt: 'DESC' },
          }),
          this.caseSettingRepository.findOne({
            where: { calculationCase: { id: calculationCase.id } },
            order: { createdAt: 'DESC' },
          }),
          this.caseConductorRepository.findOne({
            where: { calculationCase: { id: calculationCase.id } },
            order: { createdAt: 'DESC' },
          }),
          this.touchVoltageMapRepository.find({
            where: { result: { id: result.id } },
          }),
          this.stepVoltageMapRepository.find({
            where: { result: { id: result.id } },
          }),
          this.voltageProfileRepository.find({
            where: { result: { id: result.id } },
          }),
        ]);

      const halfSecond = resolveHalfSecondVariant(
        fault ? Number(fault.faultDuration) : 0,
        dto.halfSecondVariant,
      );
      if (!halfSecond.ok) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: halfSecond.message,
        };
      }

      const options: ReportOptions = {
        includeDetails: dto.includeDetails,
        halfSecondVariant: halfSecond.value,
      };

      // This is the data source handed to `buildReportPdf` — keep it
      // flat and self-describing rather than mirroring the entity
      // shapes 1:1, since the PDF layout is designed against these
      // field names, not the DB schema.
      const reportData: ReportPdfData = {
        template: templateChoice.template,
        options,
        project: {
          name: project.name,
          substationName: project.substationName,
          voltageLevel: project.voltageLevel,
          standard: project.standard,
        },
        case: {
          name: calculationCase.name,
          description: calculationCase.description,
        },
        designMethod: calculationCase.designMethod,
        soilLayering: calculationCase.soilLayering,
        grid: {
          name: calculationCase.grid.name,
          length: Number(calculationCase.grid.length),
          width: Number(calculationCase.grid.width),
          burialDepth: Number(calculationCase.grid.burialDepth),
        },
        soil: {
          name: calculationCase.soilModel.name,
          surfaceResistivity: Number(
            calculationCase.soilModel.surfaceResistivity,
          ),
        },
        fault: fault
          ? {
              faultCurrent: Number(fault.faultCurrent),
              faultDuration: Number(fault.faultDuration),
              splitFactor: Number(fault.splitFactor),
              decrementFactor: Number(fault.decrementFactor),
              shockDuration: Number(fault.shockDuration),
            }
          : null,
        settings: settings
          ? {
              surfaceLayerResistivity: Number(settings.surfaceLayerResistivity),
              surfaceLayerThickness: Number(settings.surfaceLayerThickness),
              bodyWeight: settings.bodyWeight,
              frequency: settings.frequency,
            }
          : null,
        conductor: conductor ? toReportConductor(conductor) : null,
        result: {
          gridResistance: Number(result.gridResistance),
          gpr: Number(result.gpr),
          meshVoltage: Number(result.meshVoltage),
          touchVoltage: Number(result.touchVoltage),
          stepVoltage: Number(result.stepVoltage),
          permissibleTouchVoltage: Number(result.permissibleTouchVoltage),
          permissibleStepVoltage: Number(result.permissibleStepVoltage),
          safe: result.safe,
        },
        details: result.details ?? null,
        charts: {
          touchVoltageMap: touchVoltageMap.map((p) => ({
            x: Number(p.x),
            y: Number(p.y),
            value: Number(p.value),
          })),
          stepVoltageMap: stepVoltageMap.map((p) => ({
            x: Number(p.x),
            y: Number(p.y),
            value: Number(p.value),
          })),
          voltageProfile: voltageProfile.map((p) => ({
            x: Number(p.x),
            y: Number(p.y),
            voltage: Number(p.voltage),
          })),
        },
        generatedAt: new Date().toISOString(),
      };

      const fileBuffer = await buildReportPdf(reportData);

      await fs.mkdir(this.storageDir, { recursive: true });
      const fileName = `${randomUUID()}.pdf`;
      const filePath = path.join(this.storageDir, fileName);
      await fs.writeFile(filePath, fileBuffer);

      const newReport = this.reportRepository.create({
        project: { id: project.id },
        result: { id: result.id },
        name: dto.name?.trim() || calculationCase.name,
        filePath,
        template: templateChoice.template,
        options,
      });
      const savedReport = await this.reportRepository.save(newReport);

      return {
        statusCode: HttpStatus.CREATED,
        messages: 'گزارش با موفقیت تولید شد.',
        data: savedReport,
      };
    });
  }

  getAll(queries: GetReportsQueryDTO, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const {
        projectId,
        resultId,
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

      const queryBuilder = this.reportRepository
        .createQueryBuilder('report')
        .leftJoinAndSelect('report.project', 'project')
        .leftJoinAndSelect('report.result', 'result');

      if (projectId) {
        queryBuilder.andWhere('project.id = :projectId', { projectId });
      } else if (user.role !== UserRole.ADMIN) {
        queryBuilder.andWhere('project.ownerId = :ownerId', {
          ownerId: user.id,
        });
      }

      if (resultId) {
        queryBuilder.andWhere('result.id = :resultId', { resultId });
      }
      if (name) {
        queryBuilder.andWhere('report.name LIKE :name', {
          name: `%${name}%`,
        });
      }

      queryBuilder
        .orderBy('report.createdAt', 'DESC')
        .skip((pageNumber - 1) * pageSize)
        .take(pageSize);
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
      const report = await this.findOwnedOrAdmin(id, user);
      if (!report) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `گزارش با آیدی: ${id} یافت نشد.`,
        };
      }

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: report,
      };
    });
  }

  delete(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const report = await this.findOwnedOrAdmin(id, user);
      if (!report) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          messages: `گزارش با آیدی: ${id} یافت نشد.`,
          data: null,
        };
      }

      // Best-effort file cleanup: a missing file (already deleted, or the
      // row/file pair is out of sync for some other reason) shouldn't
      // block deleting the record itself.
      try {
        await fs.unlink(report.filePath);
      } catch {
        // ignore
      }

      await this.reportRepository.delete({ id });

      return {
        statusCode: HttpStatus.OK,
        data: { id },
        messages: 'گزارش با موفقیت حذف شد.',
      };
    });
  }

  /**
   * Ownership-checked lookup used by the download route. Returns the same
   * `IResponse` envelope as every other method here — the download route
   * only diverges from that envelope for the actual success payload
   * (raw file bytes can't be JSON), not for the not-found case.
   */
  getFileForDownload(id: string, user: TAuthenticatedUserType) {
    return asyncFn(async () => {
      const report = await this.findOwnedOrAdmin(id, user);
      if (!report) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          data: null,
          messages: `گزارش با آیدی: ${id} یافت نشد.`,
        };
      }

      return {
        statusCode: HttpStatus.OK,
        messages: [],
        data: report,
      };
    });
  }
}

