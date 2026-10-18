import * as path from 'path';

import type { SamplePoint, VoltageProfilePoint } from './report-pdf.types';

/**
 * Vazirmatn is vendored under `src/reports/assets/fonts` (SIL OFL, the
 * combined Persian + Latin build — the Arabic-only subset has no digits
 * or Latin glyphs, so every number and Latin word would vanish). Resolved
 * from `process.cwd()` rather than `__dirname`, like
 * `ReportsService.storageDir`, so it also works from the compiled `dist/`
 * build (`src/` ships alongside `dist/` in a normal deployment).
 */
const FONT_DIR = path.resolve(process.cwd(), 'src/reports/assets/fonts');
export const FONT_REGULAR = path.join(FONT_DIR, 'Vazirmatn-Regular.ttf');
export const FONT_BOLD = path.join(FONT_DIR, 'Vazirmatn-Bold.ttf');

export const PAGE_MARGIN = 50;
export const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width in pt minus margins

export type Doc = PDFKit.PDFDocument;

/** Fixed-decimal number; "—" for a value the stored result doesn't have. */
export function n(value: number | null | undefined, decimals = 2): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : value.toFixed(decimals);
}

/**
 * Adds a page break first if `neededHeight` wouldn't fit before the
 * bottom margin, so a row's label and its value (drawn as two separate
 * `.text()` calls — see `row()`) never end up split across two pages
 * with pdfkit's own automatic pagination landing between them.
 */
export function ensureSpace(doc: Doc, neededHeight: number): void {
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
 * afterwards to `y + rowHeight` — otherwise a wrapped multi-line label
 * with a short single-line value would leave `doc.y` too small, and the
 * next row would overlap it.
 */
export function row(doc: Doc, label: string, value: string): void {
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

export function sectionTitle(doc: Doc, title: string): void {
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
export function paragraph(doc: Doc, text: string): void {
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
export function formulaBlock(doc: Doc, lines: string[]): void {
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

/** One cell of `tableRow`. Cells hold a single script (Persian OR Latin/digits). */
export interface TableCell {
  text: string;
  align?: 'left' | 'right' | 'center';
}

/**
 * A row of equal-width cells with an optional highlight band. Each cell
 * is its own `.text()` call for the same bidi reason as `row()`. Used for
 * the decrement-factor table and the limit comparison table.
 */
export function tableRow(
  doc: Doc,
  cells: TableCell[],
  options: { bold?: boolean; highlight?: boolean; color?: string } = {},
): void {
  const cellWidth = CONTENT_WIDTH / cells.length;
  doc.font(options.bold ? 'Vazirmatn-Bold' : 'Vazirmatn').fontSize(9.5);

  const rowHeight = Math.max(
    ...cells.map((cell) =>
      doc.heightOfString(cell.text, { width: cellWidth - 12 }),
    ),
  );
  ensureSpace(doc, rowHeight + 10);

  const y = doc.y;
  if (options.highlight) {
    doc
      .rect(PAGE_MARGIN, y - 2, CONTENT_WIDTH, rowHeight + 6)
      .fill('#fdf0e3');
  }

  doc.fillColor(options.color ?? '#333333');
  cells.forEach((cell, i) => {
    doc.text(cell.text, PAGE_MARGIN + i * cellWidth + 6, y, {
      width: cellWidth - 12,
      align: cell.align ?? 'center',
    });
  });

  doc.y = y + rowHeight;
  doc.moveDown(0.5);
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
 * `VoltageHeatmap`. One cell per unique (x, y) sample, arranged by index
 * in the sorted coordinate lists rather than scaled to true physical
 * spacing — same simplification the frontend's own heatmap makes.
 */
export function drawVoltageMapChart(
  doc: Doc,
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
  // A reduce, not `Math.max(...points)`: a large sample map would
  // overflow the call stack when spread into arguments.
  let maxValue = -Infinity;
  let minValue = Infinity;
  for (const p of points) {
    if (p.value > maxValue) maxValue = p.value;
    if (p.value < minValue) minValue = p.value;
  }

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
 * measured along the diagonal from the first sampled point.
 */
export function drawVoltageProfileChart(
  doc: Doc,
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
  let maxVoltage = 0;
  for (const p of points) {
    if (p.voltage > maxVoltage) maxVoltage = p.voltage;
  }

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
