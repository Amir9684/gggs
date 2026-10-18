import { DECREMENT_FACTOR_TABLE } from 'src/calculations/engine/decrement-factor.engine';
import { DesignMethod, SoilLayeringMethod } from 'src/calculations/enum';

import {
  REPORT_TEMPLATE_LABELS_FA,
  isTwoLayerTemplate,
  templateDesignMethod,
} from '../report-template';
import {
  CONTENT_WIDTH,
  PAGE_MARGIN,
  formulaBlock,
  n,
  paragraph,
  row,
  sectionTitle,
  tableRow,
  type Doc,
} from './pdf-helpers';
import type { ReportDetails, ReportPdfData } from './report-pdf.types';

const DESIGN_METHOD_LABELS_FA: Record<DesignMethod, string> = {
  [DesignMethod.IEEE_80_86]: 'IEEE 80-86',
  [DesignMethod.IEEE_80_2000]: 'IEEE 80-2000',
  [DesignMethod.GALERKIN]: 'گالرکین (Galerkin)',
};

const SOIL_LAYERING_LABELS_FA: Record<SoilLayeringMethod, string> = {
  [SoilLayeringMethod.ONE_LAYER]: 'تک‌لایه',
  [SoilLayeringMethod.TWO_LAYER]: 'دولایه',
};

const OHM_METER = '\u2126\u00b7m';
const OHM = '\u2126';

const isIeee86 = (data: ReportPdfData): boolean =>
  templateDesignMethod(data.template) === DesignMethod.IEEE_80_86;

const isTwoLayer = (data: ReportPdfData): boolean =>
  isTwoLayerTemplate(data.template);

/** Nominal fault duration (s) the Windows decrement-factor table prints per row. */
const DF_ROW_LABELS: Record<number, string> = {
  0: '0.008',
  0.1: '0.1',
  0.25: '0.25',
  0.5: '0.5 or more',
};

// ── Header ──────────────────────────────────────────────────────────

export function headerBlock(doc: Doc, data: ReportPdfData): void {
  doc
    .font('Vazirmatn-Bold')
    .fontSize(18)
    .fillColor('#1a1a1a')
    .text('گزارش ایمنی سیستم زمین', PAGE_MARGIN, PAGE_MARGIN, {
      width: CONTENT_WIDTH,
      align: 'right',
    });
  doc
    .font('Vazirmatn')
    .fontSize(10)
    .fillColor('#777777')
    .text(data.project.name, PAGE_MARGIN, doc.y + 2, {
      width: CONTENT_WIDTH,
      align: 'right',
    });
  doc.text(
    REPORT_TEMPLATE_LABELS_FA[data.template],
    PAGE_MARGIN,
    doc.y + 2,
    { width: CONTENT_WIDTH, align: 'right' },
  );
  doc.moveDown(1);
}

// ── Page 1: inputs ──────────────────────────────────────────────────

export function inputSections(doc: Doc, data: ReportPdfData): void {
  sectionTitle(doc, 'مشخصات پروژه');
  row(doc, 'نام پروژه', data.project.name);
  row(doc, 'نام پست', data.project.substationName);
  row(doc, 'سطح ولتاژ', data.project.voltageLevel);
  row(doc, 'استاندارد', data.project.standard);

  sectionTitle(doc, 'کیس محاسباتی');
  row(doc, 'نام کیس', data.case.name);
  if (data.case.description) {
    row(doc, 'توضیحات', data.case.description);
  }
  row(doc, 'روش طراحی', DESIGN_METHOD_LABELS_FA[data.designMethod]);
  if (data.soilLayering) {
    row(doc, 'لایه‌بندی خاک', SOIL_LAYERING_LABELS_FA[data.soilLayering]);
  }

  sectionTitle(doc, 'شبکه و خاک');
  row(doc, 'نام شبکه', data.grid.name);
  row(doc, 'طول شبکه', `${n(data.grid.length)} m`);
  row(doc, 'عرض شبکه', `${n(data.grid.width)} m`);
  row(doc, 'عمق دفن', `${n(data.grid.burialDepth)} m`);
  row(doc, 'مدل خاک', data.soil.name);

  const twoLayer = data.details?.twoLayer ?? null;
  if (isTwoLayer(data) && twoLayer) {
    row(
      doc,
      'مقاومت ویژه لایه بالایی (ρ1)',
      `${n(twoLayer.upperResistivity)} ${OHM_METER}`,
    );
    row(
      doc,
      'مقاومت ویژه لایه پایینی (ρ2)',
      `${n(twoLayer.lowerResistivity)} ${OHM_METER}`,
    );
    row(doc, 'ضخامت لایه بالایی (hs)', `${n(twoLayer.upperThickness)} m`);
  } else {
    row(
      doc,
      'مقاومت ویژه خاک',
      `${n(data.soil.surfaceResistivity)} ${OHM_METER}`,
    );
  }

  if (data.fault) {
    sectionTitle(doc, 'پارامترهای خطا');
    row(doc, 'جریان خطا', `${n(data.fault.faultCurrent, 0)} A`);
    row(
      doc,
      'مدت زمان خطا',
      data.options.halfSecondVariant
        ? `${n(data.fault.faultDuration)} s  (0.5 s or more)`
        : `${n(data.fault.faultDuration)} s`,
    );
    row(doc, 'ضریب تقسیم جریان', n(data.fault.splitFactor, 3));
    row(doc, 'فاکتور کاهنده', n(data.fault.decrementFactor, 3));
    row(doc, 'مدت زمان شوک', `${n(data.fault.shockDuration)} s`);
  }

  if (data.settings) {
    sectionTitle(doc, 'تنظیمات');
    row(
      doc,
      'مقاومت ویژه لایه سطحی',
      `${n(data.settings.surfaceLayerResistivity)} ${OHM_METER}`,
    );
    row(
      doc,
      'ضخامت لایه سطحی',
      `${n(data.settings.surfaceLayerThickness)} m`,
    );
    row(doc, 'وزن بدن', `${n(data.settings.bodyWeight, 0)} kg`);
    row(doc, 'فرکانس شبکه', `${n(data.settings.frequency, 0)} Hz`);
  }
}

// ── Details pages ───────────────────────────────────────────────────

/** Shown instead of the details pages for a result saved without them. */
export function detailsUnavailableNote(doc: Doc): void {
  sectionTitle(doc, 'مقادیر میانی محاسبه');
  paragraph(
    doc,
    'مقادیر میانی این نتیجه همراه با آن ذخیره نشده‌اند (نتیجه پیش از افزودن این قابلیت اجرا شده است). برای دیدن آن‌ها در گزارش، محاسبه را دوباره اجرا کنید و گزارش را از نتیجهٔ جدید بسازید.',
  );
}

/**
 * The decrement-factor table of the Windows report (fault duration →
 * Df) with the row that applies to this case highlighted. The last row
 * reads "0.5 or more", exactly as the Windows "Or More" button does.
 */
export function decrementFactorSection(doc: Doc, data: ReportPdfData): void {
  if (!data.fault) return;
  const { faultDuration, decrementFactor } = data.fault;

  sectionTitle(doc, 'فاکتور کاهنده (Df)');
  paragraph(
    doc,
    'فاکتور کاهنده از مدت زمان خطا به دست می‌آید. برای مدت‌های بین دو ردیف جدول، ردیف کوتاه‌تر (محافظه‌کارانه‌تر) به کار می‌رود.',
  );

  tableRow(
    doc,
    [{ text: 'مدت زمان خطا (s)' }, { text: 'فاکتور کاهنده (Df)' }],
    { bold: true },
  );

  // The table is ordered longest duration first, the Windows report
  // prints it shortest first.
  const rows = [...DECREMENT_FACTOR_TABLE].reverse();
  const applicable = DECREMENT_FACTOR_TABLE.find(
    (entry) => faultDuration >= entry.fromSeconds,
  );

  for (const entry of rows) {
    tableRow(
      doc,
      [
        { text: DF_ROW_LABELS[entry.fromSeconds] ?? n(entry.fromSeconds, 3) },
        { text: n(entry.factor, 2) },
      ],
      { highlight: entry === applicable },
    );
  }

  if (applicable && Math.abs(applicable.factor - decrementFactor) > 1e-9) {
    paragraph(
      doc,
      `فاکتور کاهنده این کیس به‌صورت دستی روی ${n(decrementFactor, 3)} تنظیم شده و با جدول بالا متفاوت است.`,
    );
  } else if (data.options.halfSecondVariant) {
    paragraph(
      doc,
      'مدت زمان خطا ۰٫۵ ثانیه یا بیشتر است؛ فاکتور کاهنده برابر ۱٫۰ در نظر گرفته می‌شود.',
    );
  }
}

/** Fusing-equation sizing of the case's conductor (Windows `conductor.frm`). */
export function conductorSection(doc: Doc, data: ReportPdfData): void {
  const conductor = data.conductor;
  if (!conductor) return;

  sectionTitle(doc, 'هادی و مقطع مورد نیاز');
  row(doc, 'جنس هادی', conductor.materialName);
  row(doc, 'دمای محیط (Ta)', `${n(conductor.ambientTemperature, 0)} °C`);
  row(
    doc,
    'دمای مجاز هادی (Tm)',
    `${n(conductor.allowableTemperature, 0)} °C`,
  );
  row(doc, 'زمان عبور جریان (tc)', `${n(conductor.sizingDuration)} s`);
  row(doc, 'ضریب حرارتی مقاومت (αr)', conductor.alphaR.toString());
  row(doc, 'ثابت K0', `${n(conductor.k0, 0)} °C`);
  row(doc, 'مقاومت ویژه هادی (ρr)', `${n(conductor.rhoR, 4)} µ${OHM}·cm`);
  row(doc, 'ظرفیت حرارتی (TCAP)', `${n(conductor.tcap, 3)} J/(cm³·°C)`);
  row(doc, 'حداقل مقطع لازم', `${n(conductor.minimumAreaMm2)} mm²`);
  row(
    doc,
    'مقطع استاندارد',
    conductor.standardSizeMm2 === null
      ? 'بیش از ۳۰۰ mm²'
      : `${n(conductor.standardSizeMm2, 0)} mm²`,
  );
  if (conductor.crossSectionMm2 !== null) {
    row(doc, 'مقطع واردشده', `${n(conductor.crossSectionMm2)} mm²`);
  }

  formulaBlock(doc, [
    'A = 0.001 · I · sqrt( (tc · αr · ρr · 10^4 / TCAP) / ln(1 + (Tm − Ta)/(K0 + Ta)) )',
    'A: mm²   I: A',
  ]);
}

/** True when the surface layer doesn't derate anything (Cs = 1). */
function surfaceLayerAbsent(data: ReportPdfData): boolean {
  const settings = data.settings;
  if (!settings) return false;
  if (
    settings.surfaceLayerThickness === 0 ||
    settings.surfaceLayerResistivity <= 0
  ) {
    return true;
  }
  if (!isIeee86(data)) return false;

  // The 1986 series also returns 1 when the layer is as resistive as the
  // soil under it.
  const under =
    data.details?.twoLayer?.upperResistivity ??
    data.details?.apparentResistivity;
  return under !== undefined && under === settings.surfaceLayerResistivity;
}

/** Rg, IG, GPR, Cs and the permissible voltages for 50 kg and 70 kg. */
export function electricalSection(
  doc: Doc,
  data: ReportPdfData,
  details: ReportDetails,
): void {
  sectionTitle(doc, 'مقاومت شبکه و افزایش پتانسیل زمین');
  if (details.apparentResistivity !== undefined) {
    row(doc, 'مقاومت ویژه ظاهری خاک (ρ)', `${n(details.apparentResistivity)} ${OHM_METER}`);
  }
  row(doc, 'مقاومت شبکه (Rg)', `${n(data.result.gridResistance, 3)} ${OHM}`);
  row(doc, 'جریان مؤثر شبکه (IG)', `${n(details.effectiveGridCurrent)} A`);
  row(doc, 'افزایش پتانسیل زمین (GPR)', `${n(data.result.gpr)} V`);

  sectionTitle(doc, 'ضریب کاهندگی لایه سطحی (Cs)');
  row(doc, 'ضریب Cs', n(details.cs, 4));

  if (surfaceLayerAbsent(data)) {
    paragraph(
      doc,
      'لایه سطحی وجود ندارد یا مقاومت ویژهٔ آن با خاک زیرین برابر است؛ بنابراین Cs برابر ۱ است.',
    );
    formulaBlock(doc, ['Cs = 1']);
  } else if (isIeee86(data)) {
    formulaBlock(doc, [
      'K  = (rho − rho_s) / (rho + rho_s)',
      'Cs = (1 / 0.96) · [ 1 + 2 · Σ(n=1..∞) K^n / √(1 + (2·n·hs / 0.08)²) ]',
    ]);
  } else {
    formulaBlock(doc, ['Cs = 1 − [ 0.09 · (1 − rho/rho_s) ] / (2·hs + 0.09)']);
  }

  sectionTitle(doc, 'ولتاژ مجاز تماس و گام');
  const limits = details.permissibleVoltages;
  tableRow(
    doc,
    [
      { text: 'وزن بدن' },
      { text: 'ولتاژ مجاز تماس' },
      { text: 'ولتاژ مجاز گام' },
    ],
    { bold: true },
  );
  const usesLighterBody = data.settings
    ? Math.abs(data.settings.bodyWeight - 50) <=
      Math.abs(data.settings.bodyWeight - 70)
    : false;
  tableRow(
    doc,
    [
      { text: '50 kg' },
      { text: `${n(limits.kg50.touch)} V` },
      { text: `${n(limits.kg50.step)} V` },
    ],
    { highlight: usesLighterBody },
  );
  tableRow(
    doc,
    [
      { text: '70 kg' },
      { text: `${n(limits.kg70.touch)} V` },
      { text: `${n(limits.kg70.step)} V` },
    ],
    { highlight: !usesLighterBody },
  );
  paragraph(
    doc,
    'ردیف هایلایت‌شده وزن بدنی است که حکم ایمن/ناایمن بر پایهٔ آن صادر شده است.',
  );
}

/** Kii is 1 for rods on the perimeter, the closed form otherwise. */
function kiiLines(kii: number): string[] {
  return Math.abs(kii - 1) < 1e-12
    ? ['Kii = 1   (rods in the corners / on the perimeter)']
    : ['Kii = 1 / (2n)^(2/n)   (no rods, or rods only inside the grid)'];
}

/** Grid counts, effective lengths and the Km / Ks / Ki / Kh / n family. */
export function geometrySection(
  doc: Doc,
  data: ReportPdfData,
  details: ReportDetails,
): void {
  const factors = details.geometricFactors;
  const grid = details.grid;
  const ieee86 = isIeee86(data);

  sectionTitle(doc, 'هندسهٔ شبکه');
  row(doc, 'تعداد هادی در راستای طول', n(grid.conductorCountAlongLength, 0));
  row(doc, 'تعداد هادی در راستای عرض', n(grid.conductorCountAlongWidth, 0));
  row(doc, 'تعداد مش', n(grid.meshCount, 0));
  row(doc, 'فاصلهٔ هادی‌ها (D)', `${n(grid.averageSpacing)} m`);
  if (details.conductorDiameter !== undefined) {
    row(doc, 'قطر هادی (d)', `${n(details.conductorDiameter, 4)} m`);
  }
  row(doc, 'عمق دفن (h)', `${n(details.burialDepth ?? data.grid.burialDepth)} m`);
  row(doc, 'طول کل هادی افقی (Lc)', `${n(grid.totalConductorLength)} m`);
  row(doc, 'تعداد میله ارت', n(grid.rodCount, 0));
  row(doc, 'طول کل میله‌ها (LR)', `${n(grid.totalRodLength)} m`);
  if (details.effectiveMeshLength !== undefined) {
    row(doc, 'طول مؤثر برای ولتاژ مش (Lm)', `${n(details.effectiveMeshLength)} m`);
  }
  if (details.effectiveStepLength !== undefined) {
    row(doc, 'طول مؤثر برای ولتاژ گام (Ls)', `${n(details.effectiveStepLength)} m`);
  }

  sectionTitle(doc, 'ضرایب هندسی');
  if (ieee86) {
    row(doc, 'تعداد مؤثر هادی برای مش (n = nx·ny)', n(factors.n, 2));
    row(
      doc,
      'تعداد مؤثر هادی برای گام (n = max(nx, ny))',
      n(factors.nStep, 2),
    );
  } else {
    row(doc, 'تعداد مؤثر هادی (n)', n(factors.n, 3));
  }
  row(doc, 'ضریب Kh', n(factors.kh, 4));
  row(doc, 'ضریب Kii', n(factors.kii, 4));
  row(doc, 'ضریب Ki برای مش', n(factors.ki, 4));
  if (ieee86) {
    row(doc, 'ضریب Ki برای گام', n(factors.kiStep, 4));
  }
  row(doc, 'ضریب Km', n(factors.km, 4));
  row(doc, 'ضریب Ks', n(factors.ks, 4));

  formulaBlock(doc, [
    ...kiiLines(factors.kii),
    'Kh = √(1 + h/h0),  h0 = 1 m',
    'Ki = 0.644 + 0.148·n',
  ]);

  for (const warning of details.warnings) {
    paragraph(doc, `هشدار: ${warning.message}`);
  }
}

/** Xhor, Yhor, Cm and the step correction of the two-layer templates. */
export function twoLayerSection(
  doc: Doc,
  data: ReportPdfData,
  details: ReportDetails,
): void {
  const correction = details.twoLayer;
  sectionTitle(doc, 'اصلاح خاک دولایه');

  if (!correction) {
    paragraph(
      doc,
      'برای این نتیجه ضرایب اصلاح خاک دولایه ذخیره نشده است. محاسبه را دوباره اجرا کنید.',
    );
    return;
  }

  const hasRods = details.grid.totalRodLength > 0;
  const lowerIsLessResistive =
    correction.lowerResistivity < correction.upperResistivity;
  // Without rods, Xhor and Yhor are both 0 exactly when hs >= sqrt(A);
  // otherwise Xhor is strictly positive. This reads the branch off the
  // stored numbers instead of needing the grid area again.
  const thinUpperLayer = correction.xhor !== 0;

  row(doc, 'ضخامت لایه بالایی (hs)', `${n(correction.upperThickness)} m`);
  row(doc, 'نسبت ρ2/ρ1', n(correction.lowerResistivity / correction.upperResistivity, 4));

  let xhorLines: string[];
  let yhorLines: string[];
  if (!hasRods) {
    xhorLines = thinUpperLayer
      ? ['Xhor = 0.075 · ( log10(sqrt(A) / hs) )^2']
      : ['Xhor = 0   (hs >= sqrt(A))'];
    yhorLines = thinUpperLayer
      ? ['Yhor = (2h / hs)^(1/3) · ( 0.3 · log10(Lc / sqrt(A)) + 0.1 )']
      : ['Yhor = 0   (hs >= sqrt(A))'];
  } else if (lowerIsLessResistive) {
    xhorLines = ['Xhor = 0.33 · log10(10 · hs)'];
    yhorLines = [
      'Yhor = 0.475 · log10(140 · sqrt(M) / sqrt(A)) + 0.14 · log10(hs)',
    ];
  } else {
    xhorLines = ['Xhor = 0.16 · log10(sqrt(A) · hs) − 0.1'];
    yhorLines = ['Yhor = 0.032 · log10(2850 · M) · log10(2810 / hs)'];
  }

  row(doc, 'توان اصلاح مش (Xhor)', n(correction.xhor, 4));
  formulaBlock(doc, [
    ...xhorLines,
    'Cm = (rho2 / rho1)^Xhor',
    'A: grid area (m²)   M: number of meshes   Lc: total conductor length (m)',
  ]);
  row(doc, 'ضریب اصلاح مش (Cm)', n(correction.meshCorrection, 4));

  row(doc, 'توان اصلاح گام (Yhor)', n(correction.yhor, 4));
  formulaBlock(doc, [...yhorLines, 'Cs = (rho2 / rho1)^Yhor']);
  row(doc, 'ضریب اصلاح گام (Cs)', n(correction.stepCorrection, 4));

  paragraph(
    doc,
    isIeee86(data)
      ? 'Cs در این بخش ضریب اصلاح خاک برای ولتاژ گام است و با ضریب کاهندگی لایه سطحی (Cs) که در بخش قبل آمد تفاوت دارد.'
      : 'Cs در این بخش ضریب اصلاح خاک برای ولتاژ گام است و با ضریب کاهندگی لایه سطحی (Cs) که پیش‌تر آمد تفاوت دارد.',
  );
}

/**
 * The "روش محاسبه" (calculation methodology) pages — the formulas
 * `src/calculations/engine/*.ts` computes, in the order the engine applies
 * them, for the template's own method. Kept in sync manually with the
 * engine's doc comments; if a formula there changes, update the matching
 * `formulaBlock` here.
 */
export function methodologySection(doc: Doc, data: ReportPdfData): void {
  const ieee86 = isIeee86(data);
  const twoLayer = isTwoLayer(data);

  sectionTitle(doc, 'روش محاسبه');
  paragraph(
    doc,
    `این گزارش بر اساس روش ${DESIGN_METHOD_LABELS_FA[data.designMethod]} و خاک ${twoLayer ? 'دولایه' : 'تک‌لایه'} تهیه شده است. مراحل محاسبه به ترتیب زیر انجام می‌شود: مقاومت شبکه زمین (Rg)، جریان مؤثر شبکه و افزایش پتانسیل زمین (GPR)، ضرایب هندسی (n، Ki، Kii، Kh، Km، Ks)، ضریب کاهندگی لایه سطحی (Cs)${twoLayer ? '، اصلاح خاک دولایه (Cm و Cs گام)' : ''}، ولتاژ مش و گام، و مقایسه با حد مجاز ایمنی.`,
  );

  paragraph(doc, '۱) مقاومت شبکه زمین (Rg) — معادله ساده‌شده اسوراک:');
  formulaBlock(doc, [
    'Rg = rho · [ 1/LT + (1/√(20·A)) · (1 + 1/(1 + h·√(20/A))) ]',
    'rho: apparent soil resistivity (ohm·m)   LT: total buried conductor + rod length (m)',
    'A: grid area (m²)   h: burial depth (m)',
  ]);

  paragraph(doc, '۲) جریان مؤثر شبکه (IG) و افزایش پتانسیل زمین (GPR):');
  formulaBlock(doc, [
    'IG = If · Sf · Df',
    'GPR = IG · Rg',
    'If: symmetrical fault current (A)   Sf: current split factor   Df: decrement factor',
  ]);

  if (ieee86) {
    paragraph(
      doc,
      '۳) تعداد مؤثر هادی‌ها (n) — در روش IEEE 80-86 از تعداد واقعی هادی‌ها در هر راستا استفاده می‌شود و برای مش و گام دو n متفاوت (و در نتیجه دو Ki متفاوت) به کار می‌رود:',
    );
    formulaBlock(doc, [
      'n (mesh) = nx · ny          n (step) = max(nx, ny)',
      'Ki = 0.644 + 0.148·n        (evaluated at each n)',
    ]);
  } else {
    paragraph(
      doc,
      '۳) تعداد مؤثر هادی‌ها (n) — در روش IEEE 80-2000 از فرمول هندسی بر پایهٔ طول کل هادی و محیط شبکه استفاده می‌شود و یک n برای مش و گام به کار می‌رود:',
    );
    formulaBlock(doc, [
      'n = na · nb · nc · nd',
      'na = 2·Lc / Lp   nb = 1 (square) or √(Lp / (4·√A))   nc = nd = 1',
      'Ki = 0.644 + 0.148·n',
    ]);
  }

  paragraph(doc, '۴) ضرایب هندسی مش (Km) و گام (Ks):');
  formulaBlock(doc, [
    'Km = (1/(2·pi)) · [ ln( D²/(16·h·d) + (D+2h)²/(8·D·d) − h/(4d) ) + (Kii/Kh)·ln(8/(pi·(2n−1))) ]',
    'Ks = (1/pi) · [ 1/(2h) + 1/(D+h) + (1/D)·(1 − 0.5^(n−2)) ]',
    'Kii = 1 (rods on the perimeter) or 1/(2n)^(2/n)     Kh = √(1 + h/h0)',
    'D: conductor spacing   d: conductor diameter',
  ]);

  paragraph(doc, '۵) ضریب کاهندگی لایه سطحی (Cs):');
  formulaBlock(
    doc,
    ieee86
      ? [
          'K  = (rho − rho_s) / (rho + rho_s)',
          'Cs = (1 / 0.96) · [ 1 + 2 · Σ(n=1..∞) K^n / √(1 + (2·n·hs / 0.08)²) ]',
          'rho_s: surface layer resistivity   hs: surface layer thickness (m)',
        ]
      : [
          'Cs = 1 − [ 0.09 · (1 − rho/rho_s) ] / (2·hs + 0.09)',
          'rho_s: surface layer resistivity   hs: surface layer thickness (m)',
        ],
  );

  paragraph(doc, '۶) طول مؤثر هادی برای ولتاژ مش (Lm) و گام (Ls):');
  formulaBlock(doc, [
    'Lm = Lc                                           (no rods)',
    'Lm = Lc + LR                                      (rods away from the perimeter)',
    'Lm = Lc + [ 1.55 + 1.22·(Lr / √(Lx² + Ly²)) ] · LR   (rods in the corners / on the perimeter)',
    'Ls = 0.75·Lc + 0.85·LR',
  ]);

  if (twoLayer) {
    paragraph(doc, '۷) اصلاح خاک دولایه برای ولتاژ مش و گام:');
    formulaBlock(doc, [
      'Cm = (rho2/rho1)^Xhor     Cs = (rho2/rho1)^Yhor',
      'Em = Cm · rho1 · Km · Ki · IG / Lm',
      'Es = Cs · rho1 · Ks · Ki · IG / Ls',
      'Xhor, Yhor: see the two-layer soil page',
    ]);
  } else {
    paragraph(doc, '۷) ولتاژ مش (Em) و ولتاژ گام (Es):');
    formulaBlock(doc, [
      'Em = rho · Km · Ki · IG / Lm',
      'Es = rho · Ks · Ki · IG / Ls',
    ]);
  }

  paragraph(doc, '۸) حد مجاز ولتاژ تماس و گام — معادله دالزیل (Dalziel):');
  formulaBlock(doc, [
    'Etouch = (1000 + 1.5·Cs·rho_s) · k / √ts',
    'Estep  = (1000 + 6·Cs·rho_s) · k / √ts',
    'k = 0.116 for a 50 kg body, k = 0.157 for 70 kg   ts: shock duration (s)',
  ]);

  paragraph(
    doc,
    'در نهایت، طرح ایمن تلقی می‌شود اگر ولتاژ مش کمتر یا برابر حد مجاز ولتاژ تماس و ولتاژ گام کمتر یا برابر حد مجاز ولتاژ گام باشد.',
  );
}

// ── Results ─────────────────────────────────────────────────────────

export function resultsSection(doc: Doc, data: ReportPdfData): void {
  const { result, details } = data;

  sectionTitle(doc, 'نتایج محاسبه');
  row(doc, 'مقاومت شبکه', `${n(result.gridResistance, 3)} ${OHM}`);
  row(doc, 'افزایش پتانسیل زمین (GPR)', `${n(result.gpr)} V`);
  row(doc, 'ولتاژ مش', `${n(result.meshVoltage)} V`);
  row(doc, 'ولتاژ تماس', `${n(result.touchVoltage)} V`);
  row(doc, 'ولتاژ گام', `${n(result.stepVoltage)} V`);
  row(doc, 'ولتاژ مجاز تماس', `${n(result.permissibleTouchVoltage)} V`);
  row(doc, 'ولتاژ مجاز گام', `${n(result.permissibleStepVoltage)} V`);

  if (details) {
    sectionTitle(doc, 'مقایسه با حد مجاز');
    tableRow(
      doc,
      [
        { text: 'کمیت' },
        { text: 'مقدار محاسبه‌شده' },
        { text: 'مجاز (۵۰ کیلوگرم)' },
        { text: 'مجاز (۷۰ کیلوگرم)' },
      ],
      { bold: true },
    );
    const limits = details.permissibleVoltages;
    tableRow(doc, [
      { text: 'ولتاژ تماس' },
      { text: `${n(result.touchVoltage)} V` },
      { text: `${n(limits.kg50.touch)} V` },
      { text: `${n(limits.kg70.touch)} V` },
    ]);
    tableRow(doc, [
      { text: 'ولتاژ گام' },
      { text: `${n(result.stepVoltage)} V` },
      { text: `${n(limits.kg50.step)} V` },
      { text: `${n(limits.kg70.step)} V` },
    ]);

    if (details.safeForEveryPoint) {
      paragraph(
        doc,
        'افزایش پتانسیل زمین (GPR) از ولتاژ مجاز تماس بیشتر نیست؛ بنابراین طرح در همهٔ نقاط ایمن است.',
      );
    }
  }

  doc.moveDown(0.6);
  doc
    .font('Vazirmatn-Bold')
    .fontSize(11)
    .fillColor(result.safe ? '#2e7d4f' : '#c0392b')
    .text(
      result.safe ? 'نتیجه: طرح ایمن است' : 'نتیجه: طرح ایمن نیست',
      PAGE_MARGIN,
      doc.y,
      { width: CONTENT_WIDTH, align: 'right' },
    );
}

export function footerBlock(doc: Doc, data: ReportPdfData): void {
  doc.moveDown(2);
  doc
    .font('Vazirmatn')
    .fontSize(8)
    .fillColor('#999999')
    .text(
      `تاریخ تولید گزارش: ${new Date(data.generatedAt).toLocaleString('fa-IR')}`,
      PAGE_MARGIN,
      doc.y,
      { width: CONTENT_WIDTH, align: 'right' },
    );
}

