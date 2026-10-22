import { DesignMethod, SoilLayeringMethod } from 'src/calculations/enum';

/**
 * The report layouts. The Windows GGGS app has one report set per design
 * method and soil layering (`frmIeee86Rep1` / `frmieee86rep2..4` for 80-86,
 * `Rep1Ieee20` / `Rep2Ieee20` for 80-2000, and the `...Trep` forms for the
 * two-layer variants), so the web app has one template per combination.
 *
 * `AUTO` is only a request value: it means "the template that matches the
 * case" and never reaches the PDF builder (see `ConcreteReportTemplate`).
 */
export enum ReportTemplate {
  AUTO = 'AUTO',
  IEEE_80_86_ONE_LAYER = 'IEEE_80_86_ONE_LAYER',
  IEEE_80_86_TWO_LAYER = 'IEEE_80_86_TWO_LAYER',
  IEEE_80_2000_ONE_LAYER = 'IEEE_80_2000_ONE_LAYER',
  IEEE_80_2000_TWO_LAYER = 'IEEE_80_2000_TWO_LAYER',
}

export type ConcreteReportTemplate = Exclude<
  ReportTemplate,
  ReportTemplate.AUTO
>;

export const CONCRETE_REPORT_TEMPLATES: readonly ConcreteReportTemplate[] = [
  ReportTemplate.IEEE_80_86_ONE_LAYER,
  ReportTemplate.IEEE_80_86_TWO_LAYER,
  ReportTemplate.IEEE_80_2000_ONE_LAYER,
  ReportTemplate.IEEE_80_2000_TWO_LAYER,
];

export const REPORT_TEMPLATE_LABELS_FA: Record<ConcreteReportTemplate, string> =
  {
    [ReportTemplate.IEEE_80_86_ONE_LAYER]: 'IEEE 80-86 (خاک تک‌لایه)',
    [ReportTemplate.IEEE_80_86_TWO_LAYER]: 'IEEE 80-86 (خاک دولایه)',
    [ReportTemplate.IEEE_80_2000_ONE_LAYER]: 'IEEE 80-2000 (خاک تک‌لایه)',
    [ReportTemplate.IEEE_80_2000_TWO_LAYER]: 'IEEE 80-2000 (خاک دولایه)',
  };

/** The design method a concrete template belongs to. */
export function templateDesignMethod(
  template: ConcreteReportTemplate,
): DesignMethod {
  return template === ReportTemplate.IEEE_80_86_ONE_LAYER ||
    template === ReportTemplate.IEEE_80_86_TWO_LAYER
    ? DesignMethod.IEEE_80_86
    : DesignMethod.IEEE_80_2000;
}

export function isTwoLayerTemplate(template: ConcreteReportTemplate): boolean {
  return (
    template === ReportTemplate.IEEE_80_86_TWO_LAYER ||
    template === ReportTemplate.IEEE_80_2000_TWO_LAYER
  );
}

/**
 * The template that matches a case, or `null` when the case's method has
 * no report (Galerkin: no engine yet, so there is nothing to report).
 * An IEEE case without a stored layering is treated as one-layer, like
 * the calculation service does.
 */
export function resolveReportTemplate(
  designMethod: DesignMethod,
  soilLayering: SoilLayeringMethod | null,
): ConcreteReportTemplate | null {
  const twoLayer = soilLayering === SoilLayeringMethod.TWO_LAYER;

  switch (designMethod) {
    case DesignMethod.IEEE_80_86:
      return twoLayer
        ? ReportTemplate.IEEE_80_86_TWO_LAYER
        : ReportTemplate.IEEE_80_86_ONE_LAYER;
    case DesignMethod.IEEE_80_2000:
      return twoLayer
        ? ReportTemplate.IEEE_80_2000_TWO_LAYER
        : ReportTemplate.IEEE_80_2000_ONE_LAYER;
    case DesignMethod.GALERKIN:
      return null;
  }
}

export type TemplateChoice =
  | { ok: true; template: ConcreteReportTemplate }
  | { ok: false; message: string };

/**
 * Validates the requested template against the case. A report is always
 * produced from the stored result of that case, so only the matching
 * template can show its numbers: a two-layer template for a one-layer
 * result would have no Xhor / Yhor / Cm to print.
 */
export function chooseReportTemplate(
  requested: ReportTemplate,
  designMethod: DesignMethod,
  soilLayering: SoilLayeringMethod | null,
): TemplateChoice {
  const matching = resolveReportTemplate(designMethod, soilLayering);

  if (!matching) {
    return {
      ok: false,
      message: 'برای روش گالرکین هنوز قالب گزارشی وجود ندارد.',
    };
  }

  if (requested !== ReportTemplate.AUTO && requested !== matching) {
    return {
      ok: false,
      message: `قالب انتخاب‌شده با روش و لایه‌بندی خاک این کیس سازگار نیست. قالب مناسب: ${REPORT_TEMPLATE_LABELS_FA[matching]}.`,
    };
  }

  return { ok: true, template: matching };
}
