import { DesignMethod, SoilLayeringMethod } from 'src/calculations/enum';

import { buildReportPdf } from '../pdf/report-pdf.builder';
import type {
  ReportDetails,
  ReportPdfData,
} from '../pdf/report-pdf.types';
import { ReportTemplate } from '../report-template';

/**
 * Every string the builder draws, in order. `jest.mock` factories may
 * only close over variables named `mock*`; the fake below fills this.
 */
const mockTexts: string[] = [];
let mockPageCount = 1;

jest.mock('pdfkit', () => {
  class FakeDocument {
    page = { height: 842, margins: { bottom: 50 } };
    y = 50;
    private handlers: Record<string, (arg?: Buffer) => void> = {};

    on(event: string, handler: (arg?: Buffer) => void) {
      this.handlers[event] = handler;
      return this;
    }
    registerFont() {
      return this;
    }
    font() {
      return this;
    }
    fontSize() {
      return this;
    }
    fillColor() {
      return this;
    }
    strokeColor() {
      return this;
    }
    lineWidth() {
      return this;
    }
    rect() {
      return this;
    }
    fill() {
      return this;
    }
    stroke() {
      return this;
    }
    moveTo() {
      return this;
    }
    lineTo() {
      return this;
    }
    moveDown(lines = 1) {
      this.y += lines * 12;
      return this;
    }
    heightOfString() {
      return 12;
    }
    addPage() {
      mockPageCount += 1;
      this.y = 50;
      return this;
    }
    text(value: string) {
      mockTexts.push(value);
      this.y += 14;
      return this;
    }
    end() {
      this.handlers['data']?.(Buffer.from('%PDF-fake'));
      this.handlers['end']?.();
    }
  }
  return { __esModule: true, default: FakeDocument };
});

const baseDetails: ReportDetails = {
  effectiveGridCurrent: 1908,
  cs: 0.743,
  geometricFactors: {
    km: 0.8896,
    ki: 2.272,
    kii: 0.57,
    kh: 1.225,
    ks: 0.5,
    n: 11,
  },
  permissibleVoltages: {
    kg50: { touch: 600, step: 1900 },
    kg70: { touch: 840, step: 2600 },
  },
  warnings: [],
  safeForEveryPoint: false,
  grid: {
    conductorCountAlongLength: 11,
    conductorCountAlongWidth: 11,
    meshCount: 100,
    averageSpacing: 7,
    totalConductorLength: 1540,
    rodCount: 0,
    totalRodLength: 0,
  },
  twoLayer: null,
  apparentResistivity: 400,
  effectiveMeshLength: 1540,
  effectiveStepLength: 1155,
  conductorDiameter: 0.01,
  burialDepth: 0.5,
};

const twoLayerCorrection = {
  upperResistivity: 100,
  lowerResistivity: 400,
  upperThickness: 2,
  xhor: 0.12,
  yhor: 0.2,
  meshCorrection: 1.18,
  stepCorrection: 1.32,
};

function makeData(overrides: Partial<ReportPdfData> = {}): ReportPdfData {
  return {
    template: ReportTemplate.IEEE_80_2000_ONE_LAYER,
    options: { includeDetails: true, halfSecondVariant: false },
    project: {
      name: 'Pars substation',
      substationName: 'Pars',
      voltageLevel: '63 kV',
      standard: 'IEEE 80',
    },
    case: { name: 'Case A', description: '' },
    designMethod: DesignMethod.IEEE_80_2000,
    soilLayering: SoilLayeringMethod.ONE_LAYER,
    grid: { name: 'Grid', length: 70, width: 70, burialDepth: 0.5 },
    soil: { name: 'Soil', surfaceResistivity: 400 },
    fault: {
      faultCurrent: 3180,
      faultDuration: 0.5,
      splitFactor: 0.6,
      decrementFactor: 1,
      shockDuration: 0.5,
    },
    settings: {
      surfaceLayerResistivity: 2500,
      surfaceLayerThickness: 0.102,
      bodyWeight: 70,
      frequency: 60,
    },
    conductor: {
      materialName: 'Standard Annealed Soft Copper Wire',
      alphaR: 0.00393,
      k0: 234,
      rhoR: 1.7241,
      tcap: 3.422,
      ambientTemperature: 40,
      allowableTemperature: 1083,
      sizingDuration: 0.5,
      minimumAreaMm2: 28.4,
      standardSizeMm2: 35,
      crossSectionMm2: null,
    },
    result: {
      gridResistance: 2.776,
      gpr: 5296,
      meshVoltage: 994.7,
      touchVoltage: 994.7,
      stepVoltage: 600,
      permissibleTouchVoltage: 840.5,
      permissibleStepVoltage: 2686,
      safe: false,
    },
    details: baseDetails,
    galerkin: null,
    charts: {
      touchVoltageMap: [{ x: 0, y: 0, value: 800 }],
      stepVoltageMap: [{ x: 0, y: 0, value: 300 }],
      voltageProfile: [
        { x: 0, y: 0, voltage: 100 },
        { x: 10, y: 10, voltage: 200 },
      ],
    },
    generatedAt: '2026-10-17T10:00:00.000Z',
    ...overrides,
  };
}

const has = (needle: string): boolean =>
  mockTexts.some((text) => text.includes(needle));

async function build(data: ReportPdfData): Promise<Buffer> {
  mockTexts.length = 0;
  mockPageCount = 1;
  return buildReportPdf(data);
}

describe('buildReportPdf', () => {
  it('builds every template without throwing', async () => {
    const cases: Array<[ReportTemplate, DesignMethod, SoilLayeringMethod]> = [
      [ReportTemplate.IEEE_80_86_ONE_LAYER, DesignMethod.IEEE_80_86, SoilLayeringMethod.ONE_LAYER],
      [ReportTemplate.IEEE_80_86_TWO_LAYER, DesignMethod.IEEE_80_86, SoilLayeringMethod.TWO_LAYER],
      [ReportTemplate.IEEE_80_2000_ONE_LAYER, DesignMethod.IEEE_80_2000, SoilLayeringMethod.ONE_LAYER],
      [ReportTemplate.IEEE_80_2000_TWO_LAYER, DesignMethod.IEEE_80_2000, SoilLayeringMethod.TWO_LAYER],
    ];

    for (const [template, designMethod, soilLayering] of cases) {
      const twoLayer = soilLayering === SoilLayeringMethod.TWO_LAYER;
      const buffer = await build(
        makeData({
          template: template as ReportPdfData['template'],
          designMethod,
          soilLayering,
          details: {
            ...baseDetails,
            twoLayer: twoLayer ? twoLayerCorrection : null,
          },
        }),
      );
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  it('prints the 1986 n definitions only on the 80-86 templates', async () => {
    await build(
      makeData({
        template: ReportTemplate.IEEE_80_86_ONE_LAYER,
        designMethod: DesignMethod.IEEE_80_86,
        details: {
          ...baseDetails,
          geometricFactors: {
            ...baseDetails.geometricFactors,
            nStep: 11,
            kiStep: 2.27,
          },
        },
      }),
    );
    expect(has('n (mesh) = nx · ny')).toBe(true);
    expect(has('na = 2·Lc / Lp')).toBe(false);
    expect(has('Σ(n=1..∞)')).toBe(true);
  });

  it('prints the 2000 n and Cs formulas on the 80-2000 templates', async () => {
    await build(makeData());
    expect(has('na = 2·Lc / Lp')).toBe(true);
    expect(has('n (mesh) = nx · ny')).toBe(false);
    expect(has('Cs = 1 − [ 0.09')).toBe(true);
  });

  it('adds the two-layer soil page only for two-layer templates', async () => {
    await build(makeData());
    expect(has('اصلاح خاک دولایه')).toBe(false);

    await build(
      makeData({
        template: ReportTemplate.IEEE_80_2000_TWO_LAYER,
        soilLayering: SoilLayeringMethod.TWO_LAYER,
        details: { ...baseDetails, twoLayer: twoLayerCorrection },
      }),
    );
    expect(has('اصلاح خاک دولایه')).toBe(true);
    expect(has('Cm = (rho2 / rho1)^Xhor')).toBe(true);
  });

  it('picks the Xhor / Yhor branch the engine used', async () => {
    // Rods present, lower layer MORE resistive than the upper one.
    await build(
      makeData({
        template: ReportTemplate.IEEE_80_2000_TWO_LAYER,
        soilLayering: SoilLayeringMethod.TWO_LAYER,
        details: {
          ...baseDetails,
          grid: { ...baseDetails.grid, rodCount: 4, totalRodLength: 12 },
          twoLayer: twoLayerCorrection,
        },
      }),
    );
    expect(has('Xhor = 0.16 · log10(sqrt(A) · hs) − 0.1')).toBe(true);
    expect(has('Yhor = 0.032')).toBe(true);

    // Rods present, lower layer LESS resistive.
    await build(
      makeData({
        template: ReportTemplate.IEEE_80_2000_TWO_LAYER,
        soilLayering: SoilLayeringMethod.TWO_LAYER,
        details: {
          ...baseDetails,
          grid: { ...baseDetails.grid, rodCount: 4, totalRodLength: 12 },
          twoLayer: {
            ...twoLayerCorrection,
            upperResistivity: 400,
            lowerResistivity: 100,
          },
        },
      }),
    );
    expect(has('Xhor = 0.33 · log10(10 · hs)')).toBe(true);

    // No rods, thick upper layer: both exponents are 0.
    await build(
      makeData({
        template: ReportTemplate.IEEE_80_2000_TWO_LAYER,
        soilLayering: SoilLayeringMethod.TWO_LAYER,
        details: {
          ...baseDetails,
          twoLayer: { ...twoLayerCorrection, xhor: 0, yhor: 0 },
        },
      }),
    );
    expect(has('Xhor = 0   (hs >= sqrt(A))')).toBe(true);
  });

  it('skips the detail and methodology pages when details are off', async () => {
    await build(
      makeData({ options: { includeDetails: false, halfSecondVariant: false } }),
    );
    expect(has('روش محاسبه')).toBe(false);
    expect(has('هندسهٔ شبکه')).toBe(false);
    expect(has('هادی و مقطع مورد نیاز')).toBe(false);
    expect(has('نتایج محاسبه')).toBe(true);
    expect(has('نقشه ولتاژ تماس')).toBe(true);
  });

  it('prints fewer pages without the details', async () => {
    await build(makeData());
    const withDetails = mockPageCount;
    await build(
      makeData({ options: { includeDetails: false, halfSecondVariant: false } }),
    );
    expect(mockPageCount).toBeLessThan(withDetails);
  });

  it('prints the "0.5 s or more" variant on the fault duration', async () => {
    await build(
      makeData({ options: { includeDetails: true, halfSecondVariant: true } }),
    );
    expect(has('(0.5 s or more)')).toBe(true);
    expect(has('فاکتور کاهنده برابر ۱٫۰')).toBe(true);

    await build(makeData());
    expect(has('(0.5 s or more)')).toBe(false);
  });

  it('always shows the decrement-factor table', async () => {
    await build(makeData());
    expect(has('0.008')).toBe(true);
    expect(has('0.25')).toBe(true);
    expect(has('0.5 or more')).toBe(true);
  });

  it('flags a manually overridden decrement factor', async () => {
    await build(
      makeData({
        fault: {
          faultCurrent: 3180,
          faultDuration: 0.1,
          splitFactor: 0.6,
          decrementFactor: 1.4,
          shockDuration: 0.5,
        },
      }),
    );
    expect(has('به‌صورت دستی')).toBe(true);
  });

  it('prints Cs = 1 when there is no surface layer', async () => {
    await build(
      makeData({
        settings: {
          surfaceLayerResistivity: 2500,
          surfaceLayerThickness: 0,
          bodyWeight: 70,
          frequency: 60,
        },
      }),
    );
    // The detail page prints exactly "Cs = 1"; the methodology page
    // always lists the general formula, so only an exact match counts.
    expect(mockTexts.includes('Cs = 1')).toBe(true);

    await build(makeData());
    expect(mockTexts.includes('Cs = 1')).toBe(false);
  });

  it('shows both body weights and the safe-for-every-point note', async () => {
    await build(
      makeData({ details: { ...baseDetails, safeForEveryPoint: true } }),
    );
    expect(has('50 kg')).toBe(true);
    expect(has('70 kg')).toBe(true);
    expect(has('طرح در همهٔ نقاط ایمن است')).toBe(true);
  });

  it('prints the conductor sizing page when the case has a conductor', async () => {
    await build(makeData());
    expect(has('هادی و مقطع مورد نیاز')).toBe(true);
    expect(has('Standard Annealed Soft Copper Wire')).toBe(true);

    await build(makeData({ conductor: null }));
    expect(has('هادی و مقطع مورد نیاز')).toBe(false);
  });

  it('says so when the result was saved without details', async () => {
    const buffer = await build(makeData({ details: null }));
    expect(buffer.length).toBeGreaterThan(0);
    expect(has('مقادیر میانی این نتیجه')).toBe(true);
    expect(has('هندسهٔ شبکه')).toBe(false);
  });

  it('prints design warnings from the details', async () => {
    await build(
      makeData({
        details: {
          ...baseDetails,
          warnings: [
            {
              code: 'BURIAL_DEPTH_OUT_OF_RANGE',
              message: 'عمق دفن خارج از محدوده است',
              value: 3,
              limit: 2.5,
            },
          ],
        },
      }),
    );
    expect(has('عمق دفن خارج از محدوده است')).toBe(true);
  });

  describe('Galerkin template', () => {
    const galerkinData = (overrides: Partial<ReportPdfData> = {}): ReportPdfData =>
      makeData({
        template: ReportTemplate.GALERKIN,
        designMethod: DesignMethod.GALERKIN,
        soilLayering: null,
        details: null,
        galerkin: {
          settings: { segmentLength: 5, rodRadius: 0.0125, wellDiameter: 0.3, wellLength: 3, kro: 1 },
          solver: {
            method: 'GALERKIN',
            segmentLength: 5,
            segmentCount: 308,
            rodCount: 4,
            wellCount: 0,
            meshCount: 100,
            surgeImpedance: null,
            soilResistivity: 400,
            groundCurrent: 1908,
          },
        },
        ...overrides,
      });

    it('prints the solver inputs, the method and no IEEE factor pages', async () => {
      const buffer = await build(galerkinData());

      expect(buffer.length).toBeGreaterThan(0);
      expect(has('ورودی‌های حل‌گر گالرکین')).toBe(true);
      expect(has('روش محاسبه (گالرکین)')).toBe(true);
      expect(has('R · x = 1')).toBe(true);
      expect(has('گالرکین (Galerkin)')).toBe(true);
      expect(has('هندسهٔ شبکه')).toBe(false);
      expect(has('n (mesh) = nx · ny')).toBe(false);
      expect(has('مقادیر میانی این نتیجه')).toBe(false);
    });

    it('shows the element counts and the injected current', async () => {
      await build(galerkinData());

      expect(has('308')).toBe(true);
      expect(has('1908.00 A')).toBe(true);
      // No wells: their dimensions are not listed.
      expect(has('ضریب Kro')).toBe(false);
    });

    it('lists the well data when there are wells', async () => {
      await build(
        galerkinData({
          galerkin: {
            settings: { segmentLength: 5, rodRadius: 0.0125, wellDiameter: 0.3, wellLength: 3, kro: 1 },
            solver: {
              method: 'GALERKIN',
              segmentLength: 5,
              segmentCount: 100,
              rodCount: 0,
              wellCount: 2,
              meshCount: 16,
              surgeImpedance: 2.9,
            },
          },
        }),
      );

      expect(has('ضریب Kro')).toBe(true);
      expect(has('2.900 \u2126')).toBe(true);
    });

    it('is shorter without details and still prints inputs, results and charts', async () => {
      await build(galerkinData());
      const full = mockPageCount;
      await build(
        galerkinData({ options: { includeDetails: false, halfSecondVariant: false } }),
      );

      expect(mockPageCount).toBeLessThan(full);
      expect(has('ورودی‌های حل‌گر گالرکین')).toBe(false);
      expect(has('نتایج محاسبه')).toBe(true);
      expect(has('نقشه ولتاژ تماس')).toBe(true);
    });

    it('says so when the solver details were not stored', async () => {
      const buffer = await build(galerkinData({ galerkin: null }));

      expect(buffer.length).toBeGreaterThan(0);
      expect(has('جزئیات حل‌گر همراه با این نتیجه ذخیره نشده است')).toBe(true);
    });
  });

  it('rejects instead of hanging when drawing throws', async () => {
    const broken = makeData();
    // @ts-expect-error — deliberately malformed to make drawing throw
    broken.charts = undefined;
    await expect(build(broken)).rejects.toThrow();
  });
});
