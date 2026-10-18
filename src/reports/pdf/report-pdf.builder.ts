import PDFDocument from 'pdfkit';

import {
  FONT_BOLD,
  FONT_REGULAR,
  PAGE_MARGIN,
  drawVoltageMapChart,
  drawVoltageProfileChart,
} from './pdf-helpers';
import {
  conductorSection,
  decrementFactorSection,
  detailsUnavailableNote,
  electricalSection,
  footerBlock,
  geometrySection,
  headerBlock,
  inputSections,
  methodologySection,
  resultsSection,
  twoLayerSection,
} from './report-sections';
import type { ReportPdfData } from './report-pdf.types';
import { isTwoLayerTemplate } from '../report-template';

export type { ReportPdfData } from './report-pdf.types';

/**
 * Builds the grounding-safety report PDF directly with pdfkit.
 *
 * One builder, four templates (`ReportTemplate`): the page order below is
 * the same for all of them, and `data.template` decides what each page
 * prints (80-86 vs 80-2000 formulas, the two-layer soil page). The pages
 * follow the Windows GGGS report forms:
 *
 *   1. inputs            project, case, grid & soil, fault, settings
 *                        and the decrement-factor table
 *   2. details           conductor sizing, Rg / GPR / Cs and the 50 kg /
 *                        70 kg limits, geometry and Km / Ks / Ki / Kh / n,
 *                        two-layer soil correction (two-layer templates)
 *   3. methodology       the formulas the engine used
 *   4. results           Rg, GPR, Em, Es against the limits
 *   5. charts            touch map, step map, surface profile
 *
 * Pages 2 and 3 are skipped when `data.options.includeDetails` is off.
 */
export function buildReportPdf(data: ReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      doc.registerFont('Vazirmatn', FONT_REGULAR);
      doc.registerFont('Vazirmatn-Bold', FONT_BOLD);

      // ── 1. Inputs ─────────────────────────────────────────────────
      headerBlock(doc, data);
      inputSections(doc, data);
      decrementFactorSection(doc, data);

      // ── 2. Details ────────────────────────────────────────────────
      if (data.options.includeDetails) {
        doc.addPage();
        if (data.details) {
          conductorSection(doc, data);
          electricalSection(doc, data, data.details);

          doc.addPage();
          geometrySection(doc, data, data.details);
          if (isTwoLayerTemplate(data.template)) {
            twoLayerSection(doc, data, data.details);
          }
        } else {
          conductorSection(doc, data);
          detailsUnavailableNote(doc);
        }

        // ── 3. Methodology ──────────────────────────────────────────
        doc.addPage();
        methodologySection(doc, data);
      }

      // ── 4. Results ──────────────────────────────────────────────────
      doc.addPage();
      resultsSection(doc, data);

      // ── 5. Charts ───────────────────────────────────────────────────
      doc.addPage();
      drawVoltageMapChart(doc, 'نقشه ولتاژ تماس', data.charts.touchVoltageMap);
      drawVoltageMapChart(doc, 'نقشه ولتاژ گام', data.charts.stepVoltageMap);
      drawVoltageProfileChart(doc, data.charts.voltageProfile);

      footerBlock(doc, data);

      doc.end();
    } catch (error) {
      // A throw while drawing would otherwise leave the promise pending
      // forever: `doc.end()` is never reached, so neither 'end' nor
      // 'error' fires.
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

