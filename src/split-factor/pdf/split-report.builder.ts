import PDFDocument from 'pdfkit';

import {
  CONTENT_WIDTH,
  FONT_BOLD,
  FONT_REGULAR,
  PAGE_MARGIN,
  formulaBlock,
  n,
  paragraph,
  row,
  sectionTitle,
  tableRow,
  type Doc,
} from 'src/reports/pdf/pdf-helpers';

import type {
  ComplexValue,
  Ieee80RunDetails,
  RamezaniRunDetails,
  SoniRunDetails,
  SplitProjectInput,
  SplitRunOutcome,
} from '../split-project.runner';

export interface SplitReportData {
  projectName: string;
  project: SplitProjectInput;
  outcome: SplitRunOutcome;
  /** Names of the catalog wires a Soni project uses, by wire id. */
  wireNames: Readonly<Record<string, string>>;
  /** ISO time the report was made. */
  generatedAt: string;
}

const FAULT_TYPE_LABELS: Record<number, string> = {
  1: '۱۰۰٪ منبع دور (بدون منبع محلی)',
  2: '۷۵٪ منبع دور – ۲۵٪ منبع محلی',
  3: '۵۰٪ منبع دور – ۵۰٪ منبع محلی',
  4: '۲۵٪ منبع دور – ۷۵٪ منبع محلی',
};

const FOOTING_LABELS: Record<number, string> = {
  1: 'انتقال ۱۵ Ω و توزیع ۲۵ Ω',
  2: 'انتقال ۱۰۰ Ω و توزیع ۲۰۰ Ω',
};

const METHOD_LABELS = {
  SONI: 'روش تقریبی (Soni)',
  RAMEZANI: 'روش تحلیلی (Ramezani)',
  IEEE80: 'استاندارد IEEE 80',
} as const;

const OHM = '\u2126';

/** "magnitude ∠ angle°" with a unit, all Latin so it prints as one piece. */
const polarText = (value: ComplexValue, unit: string, decimals = 2) =>
  `${n(value.magnitude, decimals)} \u2220 ${n(value.angleDegrees, 1)}\u00b0 ${unit}`;

function header(doc: Doc, data: SplitReportData): void {
  doc
    .font('Vazirmatn-Bold')
    .fontSize(18)
    .fillColor('#1a1a1a')
    .text('گزارش ضریب تقسیم جریان', PAGE_MARGIN, PAGE_MARGIN, {
      width: CONTENT_WIDTH,
      align: 'right',
    });
  doc
    .font('Vazirmatn')
    .fontSize(10)
    .fillColor('#777777')
    .text(data.projectName, PAGE_MARGIN, doc.y + 2, {
      width: CONTENT_WIDTH,
      align: 'right',
    });
  doc.text(METHOD_LABELS[data.project.method], PAGE_MARGIN, doc.y + 2, {
    width: CONTENT_WIDTH,
    align: 'right',
  });
  doc.moveDown(1);
}

function soniInputs(
  doc: Doc,
  data: SplitReportData,
  details: SoniRunDetails,
): void {
  if (data.project.method !== 'SONI') return;
  const { input } = data.project;

  sectionTitle(doc, 'ورودی‌های اصلی');
  row(doc, 'مقاومت شبکه زمین (Rg)', `${n(input.gridResistance, 3)} ${OHM}`);
  row(doc, 'فرکانس', `${n(input.frequency, 0)} Hz`);

  input.terminals.forEach((terminal, index) => {
    sectionTitle(
      doc,
      `ترمینال ${index + 1}${terminal.name ? ` — ${terminal.name}` : ''}`,
    );

    row(
      doc,
      'جریان خطا (Ir)',
      `${n(Math.hypot(terminal.faultCurrent.re, terminal.faultCurrent.im))} \u2220 ${n(
        (Math.atan2(terminal.faultCurrent.im, terminal.faultCurrent.re) * 180) /
          Math.PI,
        1,
      )}\u00b0 A`,
    );
    row(doc, 'طول span', `${n(terminal.spanLength)} m`);
    row(
      doc,
      'مقاومت پایه دکل (Rft)',
      `${n(terminal.towerFootingResistance)} ${OHM}`,
    );

    const wire = terminal.groundWire;
    if (wire.source === 'CATALOG') {
      row(doc, 'سیم گارد', data.wireNames[wire.groundWireId] ?? '—');
      row(
        doc,
        'مقاومت ویژه خاک (ρ)',
        `${n(wire.earthResistivity)} ${OHM}\u00b7m`,
      );
      row(
        doc,
        'مقاومت و راکتانس سیم',
        `${wire.resistanceSource} / ${wire.reactanceSource === 'GMR' ? 'GMR' : 'X'}`,
      );
    } else {
      row(doc, 'سیم گارد', 'ورود مستقیم امپدانس');
    }
    row(
      doc,
      'امپدانس سیم گارد (Zgw)',
      polarText(details.terminals[index].groundWireImpedance, `${OHM}/km`, 3),
    );
    row(
      doc,
      'امپدانس متقابل (Zgm)',
      `${n(terminal.mutualImpedance.re, 6)} + j${n(terminal.mutualImpedance.im, 6)} ${OHM}/m`,
    );
  });
}

function soniMethod(doc: Doc): void {
  sectionTitle(doc, 'روش محاسبه (Soni)');
  paragraph(
    doc,
    'هر خط ورودی به پست یک زنجیرهٔ بی‌پایان از سیم گارد و پایه دکل‌هاست. امپدانس معادل آن از ترمینال پست، با تقریب Soni، از رابطهٔ زیر به دست می‌آید و جریان برگشتی هر ترمینال از حل دستگاه معادلات.',
  );
  formulaBlock(doc, [
    'zs = L · Zgw / 1000          Ze = zs/2 + sqrt( zs · Rft )',
    'Zm = (Zgm/1000) · Ze / Zgw',
    'A(i,i) = Rg + Ze(i)          A(i,j) = Rg   (i <> j)',
    'B(j) = Rg · sum(Ir) + Zm(j) · Ir(j)          A · Ie = B',
    'Ig = sum(Ir) − sum(Ie)          Sf = |Ig / sum(Ir)| · 100',
  ]);
}

function soniResults(
  doc: Doc,
  outcome: SplitRunOutcome,
  details: SoniRunDetails,
): void {
  sectionTitle(doc, 'نتایج');
  row(doc, 'ضریب تقسیم جریان (Sf)', `${n(outcome.splitFactor, 2)} %`);
  row(doc, 'مجموع جریان خطا', polarText(details.totalFaultCurrent, 'A'));
  row(doc, 'جریان وارد شبکه (Ig)', polarText(details.gridCurrent, 'A'));

  paragraph(doc, 'امپدانس معادل و جریان برگشتی هر ترمینال:');
  tableRow(
    doc,
    [{ text: 'ترمینال' }, { text: `Ze (${OHM})` }, { text: 'Ie (A)' }],
    { bold: true },
  );
  details.terminals.forEach((terminal, index) => {
    tableRow(doc, [
      { text: terminal.name || String(index + 1) },
      { text: polarText(terminal.equivalentImpedance, '', 2).trim() },
      { text: polarText(terminal.earthCurrent, '', 2).trim() },
    ]);
  });
}

function ramezaniInputs(
  doc: Doc,
  data: SplitReportData,
  details: RamezaniRunDetails,
): void {
  if (data.project.method !== 'RAMEZANI') return;
  const { input } = data.project;

  sectionTitle(doc, 'ورودی‌های اصلی');
  row(doc, 'مقاومت شبکه زمین (Rg)', `${n(input.gridResistance, 3)} ${OHM}`);
  row(doc, 'فرکانس', `${n(input.frequency, 0)} Hz`);

  const ig = input.groundFaultCurrent;
  const faultInside = ig.re === 0 && ig.im === 0;
  row(doc, 'محل خطا', faultInside ? 'داخل پست' : 'در نزدیکی پست');
  if (!faultInside) {
    row(
      doc,
      'جریان کل خطا (IG)',
      `${n(Math.hypot(ig.re, ig.im))} \u2220 ${n((Math.atan2(ig.im, ig.re) * 180) / Math.PI, 1)}\u00b0 A`,
    );
  }

  input.terminals.forEach((terminal, index) => {
    const detail = details.terminals[index];
    sectionTitle(
      doc,
      `ترمینال ${index + 1}${terminal.name ? ` — ${terminal.name}` : ''}`,
    );

    row(
      doc,
      'جریان خطا (Ir)',
      `${n(Math.hypot(terminal.faultCurrent.re, terminal.faultCurrent.im))} \u2220 ${n(
        (Math.atan2(terminal.faultCurrent.im, terminal.faultCurrent.re) * 180) /
          Math.PI,
        1,
      )}\u00b0 A`,
    );
    row(doc, 'تعداد span', n(detail.spanCount, 0));
    row(doc, 'طول کل خط', `${n(detail.lineLength, 3)} km`);

    const footings = terminal.spans.map((span) => span.towerFootingResistance);
    const lowest = Math.min(...footings);
    const highest = Math.max(...footings);
    row(
      doc,
      'مقاومت پایه دکل‌ها',
      lowest === highest
        ? `${n(lowest)} ${OHM}`
        : `${n(lowest)} \u2013 ${n(highest)} ${OHM}`,
    );

    const wire = terminal.groundWire;
    if (wire.source === 'CATALOG') {
      row(doc, 'سیم گارد', data.wireNames[wire.groundWireId] ?? '—');
      row(
        doc,
        'مقاومت ویژه خاک (ρ)',
        `${n(wire.earthResistivity)} ${OHM}\u00b7m`,
      );
    } else {
      row(doc, 'سیم گارد', 'ورود مستقیم امپدانس');
    }
    row(
      doc,
      'امپدانس سیم گارد (Zgw)',
      polarText(detail.groundWireImpedance, `${OHM}/km`, 3),
    );
    row(
      doc,
      'امپدانس متقابل (Zgm)',
      `${n(terminal.mutualImpedance.re, 4)} + j${n(terminal.mutualImpedance.im, 4)} ${OHM}/km`,
    );
    row(
      doc,
      'نسبت طول خط دارای سیم گارد (Lt)',
      `${n(terminal.groundWireFraction * 100, 0)} %`,
    );
  });
}

function ramezaniMethod(doc: Doc): void {
  sectionTitle(doc, 'روش محاسبه (Ramezani)');
  paragraph(
    doc,
    'هر خط به‌صورت یک نردبان از span‌های سیم گارد و مقاومت پایه دکل‌ها مدل می‌شود. از ماتریس انتقال زنجیرهٔ span‌ها، امپدانس معادل Ze و ضریب ولتاژ انتهای خط Ke به دست می‌آید و جریان برگشتی هر ترمینال از حل دستگاه معادلات.',
  );
  formulaBlock(doc, [
    'span i:  [ 1 + Zg/R   Zg ]      Zg = Zgw · L / 1000',
    '         [   1/R       1 ]',
    'Ze = (tm11·Zl + tm12) / (tm21·Zl + tm22)      Ke = −R_last / (tm21·Zl + tm22)',
    'Zl = Zg_last + R_last      tm = product of all spans but the last',
    'Zm = Zgm · Ze / Zgw',
    'A(i,i) = Rg + Ze(i)          A(i,j) = Rg   (i <> j)',
    'B(j) = Rg · (sum(Ir) − IG) + (Zm(j) − Ke(j)) · Ir(j)      [Lt < 1: Lt · Zm(j) · Ir(j)]',
    'A · Ie = B          Ig = IG − (sum(Ir) − sum(Ie))',
    'Sf = |Ig / IG| · 100      (|Ig / sum(Ir)| · 100 when IG = 0)',
  ]);
}

function ramezaniResults(
  doc: Doc,
  outcome: SplitRunOutcome,
  details: RamezaniRunDetails,
): void {
  sectionTitle(doc, 'نتایج');
  row(doc, 'ضریب تقسیم جریان (Sf)', `${n(outcome.splitFactor, 2)} %`);
  row(doc, 'مجموع جریان خطا', polarText(details.totalFaultCurrent, 'A'));
  row(doc, 'جریان وارد شبکه (Ig)', polarText(details.gridCurrent, 'A'));

  paragraph(doc, 'امپدانس معادل، ضریب ولتاژ و جریان برگشتی هر ترمینال:');
  tableRow(
    doc,
    [
      { text: 'ترمینال' },
      { text: `Ze (${OHM})` },
      { text: `Ke (${OHM})` },
      { text: 'Ie (A)' },
    ],
    { bold: true },
  );
  details.terminals.forEach((terminal, index) => {
    tableRow(doc, [
      { text: terminal.name || String(index + 1) },
      { text: polarText(terminal.equivalentImpedance, '', 2).trim() },
      { text: polarText(terminal.voltageCoefficient, '', 3).trim() },
      { text: polarText(terminal.earthCurrent, '', 2).trim() },
    ]);
  });
}

function ieee80Sections(
  doc: Doc,
  data: SplitReportData,
  outcome: SplitRunOutcome,
): void {
  if (data.project.method !== 'IEEE80') return;
  const { input } = data.project;
  const details = outcome.details as Ieee80RunDetails;

  sectionTitle(doc, 'ورودی‌ها');
  row(
    doc,
    'توزیع جریان خطا',
    FAULT_TYPE_LABELS[input.faultType] ?? String(input.faultType),
  );
  row(
    doc,
    'مقاومت پایه دکل',
    FOOTING_LABELS[input.footingSet] ?? String(input.footingSet),
  );
  row(doc, 'تعداد خطوط انتقال', n(input.transmissionLines, 0));
  row(doc, 'تعداد خطوط توزیع', n(input.distributionLines, 0));
  row(doc, 'مقاومت شبکه زمین (Rg)', `${n(input.gridResistance, 3)} ${OHM}`);

  sectionTitle(doc, 'روش محاسبه (منحنی‌های IEEE Std 80)');
  paragraph(
    doc,
    'ضریب تقسیم از منحنی‌های پیوست C استاندارد IEEE 80 خوانده می‌شود. روی هر منحنی، بین نقاط جدول، در مقیاس لگاریتمی (هم‌زمان برای Rg و Sf) درون‌یابی می‌شود؛ سپس بین تعداد خطوط انتقال و توزیع جدول‌شده به‌صورت خطی درون‌یابی انجام می‌گیرد. جدول برای ۰٫۱ تا ۲۵ اهم و ۰ تا ۱۸ خط تهیه شده است.',
  );
  formulaBlock(doc, [
    'log10(Sf) = m · (log10(Rg) − log10(Rk)) + log10(Sk)      Rk <= Rg < Rk+1',
    'm = ln(Sk+1 / Sk) / ln(Rk+1 / Rk)',
  ]);

  sectionTitle(doc, 'نتایج');
  row(doc, 'ضریب تقسیم جریان (Sf)', `${n(outcome.splitFactor, 2)} %`);
  if (details.clamped) {
    paragraph(
      doc,
      'مقاومت شبکه خارج از بازهٔ منحنی‌ها بود و مقدار نزدیک‌ترین نقطه به کار رفت.',
    );
  }
}

/** Builds the split factor report of one saved project. */
export function buildSplitReportPdf(data: SplitReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      doc.registerFont('Vazirmatn', FONT_REGULAR);
      doc.registerFont('Vazirmatn-Bold', FONT_BOLD);

      header(doc, data);

      if (data.project.method === 'SONI') {
        const details = data.outcome.details as SoniRunDetails;
        soniInputs(doc, data, details);
        soniMethod(doc);
        soniResults(doc, data.outcome, details);
      } else if (data.project.method === 'RAMEZANI') {
        const details = data.outcome.details as RamezaniRunDetails;
        ramezaniInputs(doc, data, details);
        ramezaniMethod(doc);
        ramezaniResults(doc, data.outcome, details);
      } else {
        ieee80Sections(doc, data, data.outcome);
      }

      if (data.outcome.warnings.length > 0) {
        sectionTitle(doc, 'هشدارها');
        for (const warning of data.outcome.warnings) {
          paragraph(doc, warning);
        }
      }

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
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
