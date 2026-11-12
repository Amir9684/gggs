import {
  buildSplitReportPdf,
  type SplitReportData,
} from '../pdf/split-report.builder';
import type {
  RamezaniRunDetails,
  SoniRunDetails,
} from '../split-project.runner';

/**
 * Every string the builder draws. `jest.mock` factories may only close
 * over variables named `mock*`; the fake below fills this.
 */
const mockTexts: string[] = [];

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

const polar = (re: number, im: number) => ({
  re,
  im,
  magnitude: Math.hypot(re, im),
  angleDegrees: (Math.atan2(im, re) * 180) / Math.PI,
});

const baseDetails: SoniRunDetails = {
  gridCurrent: polar(300, -400),
  totalFaultCurrent: polar(400, -500),
  terminals: [
    {
      name: 'T1',
      groundWireImpedance: polar(0.55, 0.9),
      equivalentImpedance: polar(3, 2),
      earthCurrent: polar(100, -100),
    },
  ],
};

const soniData = (
  overrides: Partial<SplitReportData> = {},
): SplitReportData => ({
  projectName: 'پست شمال',
  project: {
    method: 'SONI',
    input: {
      gridResistance: 0.2,
      frequency: 50,
      terminals: [
        {
          name: 'T1',
          faultCurrent: { re: 400, im: -500 },
          spanLength: 500,
          towerFootingResistance: 10,
          groundWire: {
            source: 'CATALOG',
            groundWireId: 'w1',
            earthResistivity: 1000,
            resistanceSource: 'AC',
            reactanceSource: 'GMR',
          },
          mutualImpedance: { re: 0.00005, im: 0.00038 },
        },
      ],
    },
  },
  outcome: { splitFactor: 74.321, warnings: [], details: baseDetails },
  wireNames: { w1: 'ACSR Hawk' },
  generatedAt: '2026-10-30T10:00:00.000Z',
  ...overrides,
});

const ieee80Data = (
  overrides: Partial<SplitReportData> = {},
): SplitReportData => ({
  projectName: 'پست جنوب',
  project: {
    method: 'IEEE80',
    input: {
      faultType: 1,
      footingSet: 1,
      transmissionLines: 2,
      distributionLines: 4,
      gridResistance: 0.5,
    },
  },
  outcome: { splitFactor: 31.2, warnings: [], details: { clamped: null } },
  wireNames: {},
  generatedAt: '2026-10-30T10:00:00.000Z',
  ...overrides,
});

const ramezaniDetails: RamezaniRunDetails = {
  gridCurrent: polar(300, -400),
  totalFaultCurrent: polar(400, -500),
  terminals: [
    {
      name: 'T1',
      groundWireImpedance: polar(0.55, 0.9),
      equivalentImpedance: polar(3, 2),
      voltageCoefficient: polar(-0.2, 0.01),
      mutualFactor: polar(0.1, 0.1),
      earthCurrent: polar(100, -100),
      spanCount: 10,
      lineLength: 3,
    },
  ],
};

const ramezaniData = (
  overrides: Partial<SplitReportData> = {},
): SplitReportData => ({
  projectName: 'پست غرب',
  project: {
    method: 'RAMEZANI',
    input: {
      gridResistance: 0.3,
      frequency: 50,
      groundFaultCurrent: { re: 0, im: 0 },
      terminals: [
        {
          name: 'T1',
          faultCurrent: { re: 400, im: -500 },
          groundWire: { source: 'DIRECT', impedance: { re: 0.55, im: 0.9 } },
          mutualImpedance: { re: 0.05, im: 0.38 },
          spans: [
            { length: 300, towerFootingResistance: 8 },
            { length: 300, towerFootingResistance: 15 },
          ],
          groundWireFraction: 1,
        },
      ],
    },
  },
  outcome: { splitFactor: 61.5, warnings: [], details: ramezaniDetails },
  wireNames: {},
  generatedAt: '2026-10-30T10:00:00.000Z',
  ...overrides,
});

const has = (needle: string) => mockTexts.some((text) => text.includes(needle));

async function build(data: SplitReportData): Promise<Buffer> {
  mockTexts.length = 0;
  return buildSplitReportPdf(data);
}

describe('buildSplitReportPdf', () => {
  it('prints a Soni report: inputs, wire, method and results', async () => {
    const buffer = await build(soniData());

    expect(buffer.length).toBeGreaterThan(0);
    expect(has('گزارش ضریب تقسیم جریان')).toBe(true);
    expect(has('پست شمال')).toBe(true);
    expect(has('روش تقریبی (Soni)')).toBe(true);
    expect(has('ACSR Hawk')).toBe(true);
    expect(has('روش محاسبه (Soni)')).toBe(true);
    expect(has('Ze = zs/2 + sqrt( zs · Rft )')).toBe(true);
    expect(has('74.32 %')).toBe(true);
    expect(has('0.550 + j')).toBe(false);
  });

  it('prints the Zgw actually used, polar, and the terminal table', async () => {
    await build(soniData());

    expect(has('1.05 \u2220 58.6\u00b0')).toBe(false);
    expect(has('\u2220')).toBe(true);
    expect(has('Ie (A)')).toBe(true);
    expect(has('T1')).toBe(true);
    expect(has('ترمینال 1 — T1')).toBe(true);
  });

  it('says a directly typed impedance was typed', async () => {
    const data = soniData();
    if (data.project.method !== 'SONI') throw new Error('unexpected');
    data.project.input.terminals[0].groundWire = {
      source: 'DIRECT',
      impedance: { re: 0.55, im: 0.9 },
    };
    await build(data);

    expect(has('ورود مستقیم امپدانس')).toBe(true);
    expect(has('ACSR Hawk')).toBe(false);
  });

  it('prints a Ramezani report: spans, ladder method and the Ze / Ke table', async () => {
    const buffer = await build(ramezaniData());

    expect(buffer.length).toBeGreaterThan(0);
    expect(has('روش تحلیلی (Ramezani)')).toBe(true);
    expect(has('داخل پست')).toBe(true);
    expect(has('تعداد span')).toBe(true);
    expect(has('\u2013')).toBe(true);
    expect(has('روش محاسبه (Ramezani)')).toBe(true);
    expect(has('Zm = Zgm · Ze / Zgw')).toBe(true);
    expect(has('Ke (\u2126)')).toBe(true);
    expect(has('61.50 %')).toBe(true);
    expect(has('روش محاسبه (Soni)')).toBe(false);
  });

  it('prints the vicinity fault current in a Ramezani report', async () => {
    const data = ramezaniData();
    if (data.project.method !== 'RAMEZANI') throw new Error('unexpected');
    data.project.input.groundFaultCurrent = { re: 2000, im: -2500 };
    await build(data);

    expect(has('در نزدیکی پست')).toBe(true);
    expect(has('جریان کل خطا (IG)')).toBe(true);
  });

  it('prints the IEEE 80 report with the chosen curve inputs', async () => {
    await build(ieee80Data());

    expect(has('استاندارد IEEE 80')).toBe(true);
    expect(has('۱۰۰٪ منبع دور (بدون منبع محلی)')).toBe(true);
    expect(has('انتقال ۱۵ Ω و توزیع ۲۵ Ω')).toBe(true);
    expect(has('منحنی‌های IEEE Std 80')).toBe(true);
    expect(has('31.20 %')).toBe(true);
    expect(has('روش محاسبه (Soni)')).toBe(false);
  });

  it('prints warnings in their own section', async () => {
    await build(
      soniData({
        outcome: {
          splitFactor: 120,
          warnings: ['ضریب تقسیم بیشتر از ۱۰۰٪ شد'],
          details: baseDetails,
        },
      }),
    );

    expect(has('هشدارها')).toBe(true);
    expect(has('ضریب تقسیم بیشتر از ۱۰۰٪ شد')).toBe(true);

    await build(soniData());
    expect(has('هشدارها')).toBe(false);
  });

  it('notes a clamped IEEE 80 resistance', async () => {
    await build(
      ieee80Data({
        outcome: { splitFactor: 80, warnings: [], details: { clamped: 'LOW' } },
      }),
    );

    expect(has('خارج از بازهٔ منحنی‌ها بود')).toBe(true);
  });

  it('rejects instead of hanging when the data is malformed', async () => {
    const broken = soniData();
    // @ts-expect-error — deliberately malformed to make drawing throw
    broken.outcome = undefined;

    await expect(build(broken)).rejects.toThrow();
  });
});
