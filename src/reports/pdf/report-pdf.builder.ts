import PDFDocument from 'pdfkit';
import * as path from 'path';

import { DesignMethod, SoilLayeringMethod } from 'src/calculations/enum';

/**
 * Bundled directly rather than pulled from an npm font package at runtime:
 * only the two weights actually used here are needed, and vendoring them
 * avoids depending on a 300+ file package for two TTFs. Source: the
 * `vazirmatn` npm package's `fonts/ttf/` build (SIL OFL — see
 * `LICENSE-Vazirmatn.txt` in this folder), which is the *combined*
 * Persian+Latin build (Vazirmatn's Latin glyphs are merged in from Roboto
 * by the project's own build script). That combined coverage matters: the
 * lighter `@fontsource/vazirmatn` package ships the same font pre-split
 * into per-script subset files (arabic-only, latin-only, ...) for
 * smaller web downloads, and the Arabic-subset file alone has no digit
 * or Latin glyphs at all — any number or Latin word in a string (which
 * is most of this report: currents, resistances, voltages, project
 * names) silently vanishes from the rendered PDF with that font. The
 * combined build here doesn't have that gap.
 *
 * Resolved the same way as `ReportsService.storageDir` (project-root
 * relative via `process.cwd()`, not `__dirname`) so it also works from
 * the compiled `dist/` build, since `src/` ships alongside `dist/` in a
 * normal deployment rather than being copied into it.
 */
const FONT_DIR = path.resolve(process.cwd(), 'src/reports/assets/fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Vazirmatn-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Vazirmatn-Bold.ttf');

interface SamplePoint {
  x: number;
  y: number;
  value: number;
}

interface VoltageProfilePoint {
  x: number;
  y: number;
  voltage: number;
}

export interface ReportPdfData {
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
  /** Only set when `designMethod === DesignMethod.IEEE_80_2000`. */
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
  charts: {
    touchVoltageMap: SamplePoint[];
    stepVoltageMap: SamplePoint[];
    voltageProfile: VoltageProfilePoint[];
  };
  generatedAt: string;
}

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width in pt minus margins

const DESIGN_METHOD_LABELS_FA: Record<DesignMethod, string> = {
  [DesignMethod.IEEE_80_86]: 'IEEE 80-86',
  [DesignMethod.IEEE_80_2000]: 'IEEE 80-2000',
  [DesignMethod.GALERKIN]: 'گالرکین (Galerkin)',
};

const SOIL_LAYERING_LABELS_FA: Record<SoilLayeringMethod, string> = {
  [SoilLayeringMethod.ONE_LAYER]: 'تک‌لایه',
  [SoilLayeringMethod.TWO_LAYER]: 'دولایه',
};

function n(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

/**
 * Adds a page break first if `neededHeight` wouldn't fit before the
 * bottom margin, so a row's label and its value (drawn as two separate
 * `.text()` calls — see `row()`) never end up split across two pages
 * with pdfkit's own automatic pagination landing between them. Also used
 * by the paragraph/formula/chart helpers below for the same reason.
 */
function ensureSpace(doc: PDFKit.PDFDocument, neededHeight: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

/**
 * A right-aligned Persian label paired with a left-aligned value on the
 * same line. Kept as two separate `.text()` calls in two separate
 * columns rather than one interpolated string — pdfkit's bidi handling
 * for a *single* string mixing Persian with embedded Latin/digits is
 * unreliable even with a font that has the right glyphs (numbers and
 * Latin fragments can end up mis-ordered or dropped). Two single-script
 * calls sidesteps that entirely.
 *
 * Both calls pass the same explicit `y`, and `doc.y` is set once
 * afterwards to `y + rowHeight` (rather than left at whatever the second
 * `.text()` call happened to leave it at) — otherwise a wrapped
 * multi-line label with a short single-line value would leave `doc.y`
 * too small, and the next row would overlap it.
 */
function row(doc: PDFKit.PDFDocument, label: string, value: string): void {
  const half = CONTENT_WIDTH / 2;
  doc.font('Vazirmatn').fontSize(10);

  const labelHeight = doc.heightOfString(label, { width: half });
  const valueHeight = doc.heightOfString(value, { width: half - 10 });
  const rowHeight = Math.max(labelHeight, valueHeight);

  ensureSpace(doc, rowHeight + 8);

  const y = doc.y;
  doc
    .fillColor('#333333')
    .text(label, PAGE_MARGIN + half, y, { width: half, align: 'right' });
  doc.text(value, PAGE_MARGIN, y, { width: half - 10, align: 'left' });

  doc.y = y + rowHeight;
  doc.moveDown(0.6);
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 50);
  doc.moveDown(0.8);
  doc
    .font('Vazirmatn-Bold')
    .fontSize(13)
    .fillColor('#1a1a1a')
    .text(title, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'right' });
  doc
    .moveTo(PAGE_MARGIN, doc.y + 2)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y + 2)
    .strokeColor('#dddddd')
    .stroke();
  doc.moveDown(0.6);
}

/** A right-aligned, wrapped Persian prose paragraph. */
function paragraph(doc: PDFKit.PDFDocument, text: string): void {
  doc.font('Vazirmatn').fontSize(9.5).fillColor('#333333');
  const height = doc.heightOfString(text, { width: CONTENT_WIDTH });
  ensureSpace(doc, height + 6);
  doc.text(text, PAGE_MARGIN, doc.y, {
    width: CONTENT_WIDTH,
    align: 'right',
  });
  doc.moveDown(0.5);
}

/**
 * A formula shown as plain LTR text (variable names and math operators
 * are all Latin/ASCII, so — unlike the Persian prose around it — this is
 * safe to render as a single string with no bidi risk) inside a light
 * background box, visually set apart from the surrounding paragraph.
 */
function formulaBlock(doc: PDFKit.PDFDocument, lines: string[]): void {
  doc.font('Vazirmatn').fontSize(9.5);
  const lineHeight = 14;
  const boxHeight = lines.length * lineHeight + 12;
  ensureSpace(doc, boxHeight + 8);

  const y = doc.y;
  doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, boxHeight).fill('#f4f4f4');

  doc.fillColor('#1a1a1a');
  lines.forEach((line, i) => {
    doc.text(line, PAGE_MARGIN + 12, y + 6 + i * lineHeight, {
      width: CONTENT_WIDTH - 24,
      align: 'left',
    });
  });

  doc.y = y + boxHeight;
  doc.moveDown(0.6);
}

/** Low → high interpolation, success green through copper to danger red — same gradient the frontend's `voltage-color.ts` uses, ported so the PDF and the app agree visually. */
function voltageColorFor(t: number): string {
  const LOW: [number, number, number] = [79, 174, 122];
  const MID: [number, number, number] = [201, 122, 69];
  const HIGH: [number, number, number] = [229, 72, 77];
  const clamped = Math.min(1, Math.max(0, t));
  const [from, to, localT] =
    clamped < 0.5
      ? ([LOW, MID, clamped / 0.5] as const)
      : ([MID, HIGH, (clamped - 0.5) / 0.5] as const);
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  const r = Math.round(from[0] + (to[0] - from[0]) * localT);
  const g = Math.round(from[1] + (to[1] - from[1]) * localT);
  const b = Math.round(from[2] + (to[2] - from[2]) * localT);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Renders a sampled voltage map (touch or step) as a grid of colored
 * cells — a static, printable equivalent of the frontend's
 * `VoltageHeatmap` (not the interactive `VoltageSurface3D`, which has no
 * meaningful "printed" analogue). One cell per unique (x, y) sample,
 * arranged by index in the sorted coordinate lists rather than scaled to
 * true physical spacing — same simplification the frontend's own
 * heatmap makes.
 */
function drawVoltageMapChart(
  doc: PDFKit.PDFDocument,
  title: string,
  points: SamplePoint[],
): void {
  sectionTitle(doc, title);

  if (points.length === 0) {
    paragraph(doc, 'داده‌ای برای نمایش وجود ندارد.');
    return;
  }

  const xs = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
  const ys = [...new Set(points.map((p) => p.y))].sort((a, b) => a - b);
  const lookup = new Map(points.map((p) => [`${p.x}:${p.y}`, p.value]));
  const maxValue = Math.max(...points.map((p) => p.value));
  const minValue = Math.min(...points.map((p) => p.value));

  const chartHeight = 200;
  ensureSpace(doc, chartHeight + 40);

  const chartTop = doc.y;
  const cellWidth = CONTENT_WIDTH / xs.length;
  const cellHeight = chartHeight / ys.length;

  ys.forEach((y, yi) => {
    xs.forEach((x, xi) => {
      const value = lookup.get(`${x}:${y}`);
      const color =
        value === undefined || maxValue === 0
          ? '#e6e6e6'
          : voltageColorFor(value / maxValue);
      doc
        .rect(
          PAGE_MARGIN + xi * cellWidth,
          chartTop + yi * cellHeight,
          cellWidth,
          cellHeight,
        )
        .fill(color);
    });
  });

  doc
    .rect(PAGE_MARGIN, chartTop, CONTENT_WIDTH, chartHeight)
    .strokeColor('#cccccc')
    .stroke();

  doc.y = chartTop + chartHeight + 8;
  doc
    .font('Vazirmatn')
    .fontSize(8)
    .fillColor('#777777')
    .text(
      `کمترین: ${n(minValue, 1)} V     بیشترین: ${n(maxValue, 1)} V`,
      PAGE_MARGIN,
      doc.y,
      { width: CONTENT_WIDTH, align: 'left' },
    );
  doc.moveDown(0.8);
}

/**
 * Line chart of the diagonal ground-potential transect — the printed
 * equivalent of the frontend's `VoltageProfileChart`. Distance is
 * measured along the diagonal from the first sampled point, same as the
 * frontend chart does.
 */
function drawVoltageProfileChart(
  doc: PDFKit.PDFDocument,
  points: VoltageProfilePoint[],
): void {
  sectionTitle(doc, 'پروفیل ولتاژ سطح (مقطع قطری)');

  if (points.length === 0) {
    paragraph(doc, 'داده‌ای برای نمایش وجود ندارد.');
    return;
  }

  const origin = points[0];
  const distances = points.map((p) =>
    Math.hypot(p.x - origin.x, p.y - origin.y),
  );
  const maxDistance = distances[distances.length - 1] || 1;
  const maxVoltage = Math.max(...points.map((p) => p.voltage), 0);

  const chartHeight = 140;
  ensureSpace(doc, chartHeight + 30);

  const chartTop = doc.y;
  const chartBottom = chartTop + chartHeight;

  doc
    .moveTo(PAGE_MARGIN, chartTop)
    .lineTo(PAGE_MARGIN, chartBottom)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, chartBottom)
    .strokeColor('#cccccc')
    .stroke();

  const coords = points.map((p, i) => {
    const px = PAGE_MARGIN + (distances[i] / maxDistance) * CONTENT_WIDTH;
    const py =
      chartBottom -
      (maxVoltage > 0 ? (p.voltage / maxVoltage) * chartHeight : 0);
    return [px, py] as const;
  });

  doc.moveTo(coords[0][0], coords[0][1]);
  for (const [px, py] of coords.slice(1)) {
    doc.lineTo(px, py);
  }
  doc.strokeColor('#c97a45').lineWidth(1.5).stroke();

  doc.y = chartBottom + 8;
  doc
    .font('Vazirmatn')
    .fontSize(8)
    .fillColor('#777777')
    .text(`حداکثر ولتاژ: ${n(maxVoltage, 1)} V`, PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'left',
    });
  doc.moveDown(0.8);
}

/**
 * The "روش محاسبه" (calculation methodology) section — walks through the
 * actual formulas `src/calculations/engine/*.ts` computes, in the same
 * order the engine applies them, so this text always describes what the
 * software actually did rather than a generic textbook summary. Kept in
 * sync manually with the engine's own doc comments; if a formula there
 * changes, update the matching `formulaBlock` call here.
 */
function methodologySection(
  doc: PDFKit.PDFDocument,
  data: ReportPdfData,
): void {
  sectionTitle(doc, 'روش محاسبه');

  const methodLabel = DESIGN_METHOD_LABELS_FA[data.designMethod];
  paragraph(
    doc,
    `این گزارش بر اساس روش ${methodLabel} تهیه شده است. مراحل محاسبه به ترتیب زیر انجام می‌شود: تعیین مقاومت ویژه ظاهری خاک، محاسبه مقاومت شبکه زمین (Rg)، محاسبه افزایش پتانسیل زمین (GPR) از روی جریان مؤثر شبکه، محاسبه ضرایب هندسی (Km، Ks، Ki)، محاسبه ضریب کاهندگی سطحی (Cs)، و در نهایت محاسبه ولتاژ مش و ولتاژ گام و مقایسه آن‌ها با حد مجاز ایمنی.`,
  );

  if (data.designMethod === DesignMethod.IEEE_80_86) {
    paragraph(
      doc,
      'در روش IEEE 80-86، ضرایب Km، Ks، Kii و Kh مطابق فرمول‌های اصلی اسوراک (Sverak) محاسبه می‌شوند که بدون تغییر در ویرایش‌های بعدی استاندارد نیز حفظ شده‌اند. تفاوت اصلی این ویرایش با IEEE 80-2000/2013 در نحوه محاسبه n (تعداد مؤثر هادی‌های موازی) است: در این ویرایش از تعداد واقعی هادی‌ها در هر راستا (n = nx×ny برای Km/Ki و n = max(nx,ny) برای Ks/Ki) استفاده می‌شود، در حالی که ویرایش ۲۰۰۰/۲۰۱۳ از فرمول هندسی na×nb×nc×nd استفاده می‌کند.',
    );
    paragraph(
      doc,
      'ضریب کاهندگی سطحی (Cs) در روش IEEE 80-86 از فرمول سری نامتناهی نسخهٔ ۱۹۸۶ محاسبه می‌شود (K = (ρ − ρs)/(ρ + ρs) و Cs = (1 + 2·Σ Kⁿ/√(1 + (2n·hs/0.08)²)) / 0.96) که با نرم‌افزار ویندوزی GGGS یکسان است. این فرمول برای لایهٔ سطحی بسیار مقاوم نسبت به خاک، Cs کمتر و حدود مجاز محافظه‌کارانه‌تری نسبت به فرمول بستهٔ IEEE 80-2000/2013 می‌دهد.',
    );
  } else if (data.soilLayering) {
    paragraph(
      doc,
      `لایه‌بندی خاک انتخاب‌شده برای این کیس: ${SOIL_LAYERING_LABELS_FA[data.soilLayering]}.`,
    );
  }

  paragraph(doc, '۱) مقاومت شبکه زمین (Rg) — معادله ساده‌شده اسوراک:');
  formulaBlock(doc, [
    'Rg = rho · [ 1/LT + (1/√(20·A)) · (1 + 1/(1 + h·√(20/A))) ]',
    'rho: مقاومت ویژه ظاهری خاک (Ω·m)   LT: مجموع طول هادی و میله‌های دفن‌شده (m)',
    'A: مساحت شبکه (m²)   h: عمق دفن (m)',
  ]);

  paragraph(doc, '۲) جریان مؤثر شبکه (IG) و افزایش پتانسیل زمین (GPR):');
  formulaBlock(doc, [
    'IG = If · Sf · Df',
    'GPR = IG · Rg',
    'If: جریان خطای متقارن (A)   Sf: ضریب تقسیم جریان   Df: فاکتور کاهنده',
  ]);

  paragraph(doc, '۳) ضرایب هندسی مش (Km) و گام (Ks):');
  formulaBlock(doc, [
    'Km = (1/(2·pi)) · [ ln( D²/(16hd) + (D+2h)²/(8Dd) − h/(4d) ) + (Kii/Kh)·ln(8/(pi·(2n−1))) ]',
    'Ks = (1/pi) · [ 1/(2h) + 1/(D+h) + (1/D)·(1 − 0.5^(n−2)) ]',
    'Ki = 0.644 + 0.148·n   Kh = √(1 + h/h0)   D: فاصله هادی‌ها   d: قطر هادی',
  ]);

  paragraph(doc, '۴) ضریب کاهندگی سطحی (Cs):');
  formulaBlock(doc, [
    'Cs = 1 − [ 0.09 · (1 − rho/rho_s) ] / (2·hs + 0.09)',
    'rho_s: مقاومت ویژه لایه سطحی (Ω·m)   hs: ضخامت لایه سطحی (m)',
  ]);

  paragraph(doc, '۵) ولتاژ مش (Em) و ولتاژ گام (Es):');
  formulaBlock(doc, [
    'Em = (rho · Km · Ki · IG) / Lm',
    'Es = (rho · Ks · Ki · IG) / Ls',
    'Lm, Ls: طول مؤثر هادی برای محاسبه ولتاژ مش/گام (m)',
  ]);

  paragraph(doc, '۶) حد مجاز ولتاژ تماس و گام — معادله دالزیل (Dalziel):');
  formulaBlock(doc, [
    'Etouch = (1000 + 1.5·Cs·rho_s) · k / √ts',
    'Estep  = (1000 + 6·Cs·rho_s) · k / √ts',
    'k = 0.116 برای وزن بدن ۵۰ کیلوگرم، k = 0.157 برای ۷۰ کیلوگرم   ts: مدت زمان شوک (s)',
  ]);

  paragraph(
    doc,
    'در نهایت، طرح ایمن تلقی می‌شود اگر ولتاژ مش محاسبه‌شده کمتر از حد مجاز ولتاژ تماس و ولتاژ گام محاسبه‌شده کمتر از حد مجاز ولتاژ گام باشد.',
  );
}

/**
 * Builds the grounding-safety report PDF directly with pdfkit — no
 * external report server, no template format, no OAuth. Replaces the
 * previous Bold Reports (Syncfusion) integration in `bold-reports.
 * client.ts`, which called out to a self-hosted/cloud Report Server over
 * HTTP to render a published .rdl template. `ReportsService` still
 * gathers and shapes the data the same way it always did — this
 * function is the only thing that changed.
 */
export function buildReportPdf(data: ReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('Vazirmatn', FONT_REGULAR);
    doc.registerFont('Vazirmatn-Bold', FONT_BOLD);

    // ── Header ──────────────────────────────────────────────────────
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
    doc.moveDown(1);

    // ── Project ─────────────────────────────────────────────────────
    sectionTitle(doc, 'مشخصات پروژه');
    row(doc, 'نام پروژه', data.project.name);
    row(doc, 'نام پست', data.project.substationName);
    row(doc, 'سطح ولتاژ', data.project.voltageLevel);
    row(doc, 'استاندارد', data.project.standard);

    // ── Case ────────────────────────────────────────────────────────
    sectionTitle(doc, 'کیس محاسباتی');
    row(doc, 'نام کیس', data.case.name);
    if (data.case.description) {
      row(doc, 'توضیحات', data.case.description);
    }
    row(doc, 'روش طراحی', DESIGN_METHOD_LABELS_FA[data.designMethod]);
    if (data.soilLayering) {
      row(doc, 'لایه‌بندی خاک', SOIL_LAYERING_LABELS_FA[data.soilLayering]);
    }

    // ── Grid & soil ─────────────────────────────────────────────────
    sectionTitle(doc, 'شبکه و خاک');
    row(doc, 'نام شبکه', data.grid.name);
    row(doc, 'طول شبکه', `${n(data.grid.length)} m`);
    row(doc, 'عرض شبکه', `${n(data.grid.width)} m`);
    row(doc, 'عمق دفن', `${n(data.grid.burialDepth)} m`);
    row(doc, 'مدل خاک', data.soil.name);
    row(
      doc,
      'مقاومت ویژه خاک',
      `${n(data.soil.surfaceResistivity)} \u2126\u00b7m`,
    );

    // ── Fault & settings ────────────────────────────────────────────
    if (data.fault) {
      sectionTitle(doc, 'پارامترهای خطا');
      row(doc, 'جریان خطا', `${n(data.fault.faultCurrent, 0)} A`);
      row(doc, 'مدت زمان خطا', `${n(data.fault.faultDuration)} s`);
      row(doc, 'ضریب تقسیم جریان', n(data.fault.splitFactor, 3));
      row(doc, 'فاکتور کاهنده', n(data.fault.decrementFactor, 3));
      row(doc, 'مدت زمان شوک', `${n(data.fault.shockDuration)} s`);
    }
    if (data.settings) {
      sectionTitle(doc, 'تنظیمات');
      row(
        doc,
        'مقاومت ویژه لایه سطحی',
        `${n(data.settings.surfaceLayerResistivity)} \u2126\u00b7m`,
      );
      row(
        doc,
        'ضخامت لایه سطحی',
        `${n(data.settings.surfaceLayerThickness)} m`,
      );
      row(doc, 'وزن بدن', `${n(data.settings.bodyWeight, 0)} kg`);
      row(doc, 'فرکانس شبکه', `${n(data.settings.frequency, 0)} Hz`);
    }

    // ── Methodology (new) ───────────────────────────────────────────
    doc.addPage();
    methodologySection(doc, data);

    // ── Results ─────────────────────────────────────────────────────
    doc.addPage();
    sectionTitle(doc, 'نتایج محاسبه');
    row(doc, 'مقاومت شبکه', `${n(data.result.gridResistance)} \u2126`);
    row(doc, 'افزایش پتانسیل زمین (GPR)', `${n(data.result.gpr)} V`);
    row(doc, 'ولتاژ مش', `${n(data.result.meshVoltage)} V`);
    row(doc, 'ولتاژ تماس', `${n(data.result.touchVoltage)} V`);
    row(doc, 'ولتاژ گام', `${n(data.result.stepVoltage)} V`);
    row(doc, 'ولتاژ مجاز تماس', `${n(data.result.permissibleTouchVoltage)} V`);
    row(doc, 'ولتاژ مجاز گام', `${n(data.result.permissibleStepVoltage)} V`);

    doc.moveDown(0.6);
    ensureSpace(doc, 25);
    doc
      .fillColor(data.result.safe ? '#2e7d4f' : '#c0392b')
      .text(
        data.result.safe ? 'نتیجه: طرح ایمن است' : 'نتیجه: طرح ایمن نیست',
        PAGE_MARGIN,
        doc.y,
        { width: CONTENT_WIDTH, align: 'right' },
      );

    // ── Charts (new) ────────────────────────────────────────────────
    doc.addPage();
    drawVoltageMapChart(doc, 'نقشه ولتاژ تماس', data.charts.touchVoltageMap);
    drawVoltageMapChart(doc, 'نقشه ولتاژ گام', data.charts.stepVoltageMap);
    drawVoltageProfileChart(doc, data.charts.voltageProfile);

    // ── Footer ──────────────────────────────────────────────────────
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

    doc.end();
  });
}
