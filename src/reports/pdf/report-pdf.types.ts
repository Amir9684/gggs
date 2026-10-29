import type { DesignMethod, SoilLayeringMethod } from 'src/calculations/enum';
import type { SafetyEvaluationResult } from 'src/calculations/engine/types';
import type { GalerkinSettings } from 'src/galerkin/galerkin-settings';
import type { GalerkinSolverDetails } from 'src/galerkin/galerkin-solver-details';

import type { ConcreteReportTemplate } from '../report-template';

export interface SamplePoint {
  x: number;
  y: number;
  value: number;
}

export interface VoltageProfilePoint {
  x: number;
  y: number;
  voltage: number;
}

/** Intermediate engine values, as stored with the result. */
export type ReportDetails = SafetyEvaluationResult['details'];

/** The conductor chosen for the case, with its material constants. */
export interface ReportConductor {
  materialName: string;
  /** Thermal coefficient of resistivity at 20 °C, αr (1/°C). */
  alphaR: number;
  /** K0 = 1/α0 (°C). */
  k0: number;
  /** Resistivity at 20 °C, ρr (µΩ·cm). */
  rhoR: number;
  /** Thermal capacity, TCAP (J/(cm³·°C)). */
  tcap: number;
  ambientTemperature: number;
  allowableTemperature: number;
  sizingDuration: number;
  minimumAreaMm2: number;
  standardSizeMm2: number | null;
  crossSectionMm2: number | null;
}

/** Galerkin inputs and solver notes of a Galerkin result. */
export interface ReportGalerkin {
  settings: GalerkinSettings;
  solver: GalerkinSolverDetails;
}

export interface ReportOptions {
  /** Intermediate-value and methodology pages are printed. */
  includeDetails: boolean;
  /** The fault duration is printed as "0.5 s or more". */
  halfSecondVariant: boolean;
}

export interface ReportPdfData {
  template: ConcreteReportTemplate;
  options: ReportOptions;
  project: {
    name: string;
    substationName: string;
    voltageLevel: string;
    standard: string;
  };
  case: {
    name: string;
    description: string;
  };
  designMethod: DesignMethod;
  /** Only set for the IEEE methods. */
  soilLayering: SoilLayeringMethod | null;
  grid: {
    name: string;
    length: number;
    width: number;
    burialDepth: number;
  };
  soil: {
    name: string;
    surfaceResistivity: number;
  };
  fault: {
    faultCurrent: number;
    faultDuration: number;
    splitFactor: number;
    decrementFactor: number;
    shockDuration: number;
  } | null;
  settings: {
    surfaceLayerResistivity: number;
    surfaceLayerThickness: number;
    bodyWeight: number;
    frequency: number;
  } | null;
  conductor: ReportConductor | null;
  result: {
    gridResistance: number;
    gpr: number;
    meshVoltage: number;
    touchVoltage: number;
    stepVoltage: number;
    permissibleTouchVoltage: number;
    permissibleStepVoltage: number;
    safe: boolean;
  };
  /** `null` for results saved before the engine details were persisted, and for Galerkin. */
  details: ReportDetails | null;
  /** Set for Galerkin results only. */
  galerkin: ReportGalerkin | null;
  charts: {
    touchVoltageMap: SamplePoint[];
    stepVoltageMap: SamplePoint[];
    voltageProfile: VoltageProfilePoint[];
  };
  generatedAt: string;
}
