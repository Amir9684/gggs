import { DesignMethod, SoilLayeringMethod } from 'src/calculations/enum';

import {
  ReportTemplate,
  chooseReportTemplate,
  isTwoLayerTemplate,
  resolveReportTemplate,
  templateDesignMethod,
} from '../report-template';

describe('resolveReportTemplate', () => {
  it.each([
    [DesignMethod.IEEE_80_86, SoilLayeringMethod.ONE_LAYER, ReportTemplate.IEEE_80_86_ONE_LAYER],
    [DesignMethod.IEEE_80_86, SoilLayeringMethod.TWO_LAYER, ReportTemplate.IEEE_80_86_TWO_LAYER],
    [DesignMethod.IEEE_80_2000, SoilLayeringMethod.ONE_LAYER, ReportTemplate.IEEE_80_2000_ONE_LAYER],
    [DesignMethod.IEEE_80_2000, SoilLayeringMethod.TWO_LAYER, ReportTemplate.IEEE_80_2000_TWO_LAYER],
  ])('maps %s + %s to %s', (method, layering, expected) => {
    expect(resolveReportTemplate(method, layering)).toBe(expected);
  });

  it('treats an IEEE case without a stored layering as one-layer', () => {
    expect(resolveReportTemplate(DesignMethod.IEEE_80_86, null)).toBe(
      ReportTemplate.IEEE_80_86_ONE_LAYER,
    );
    expect(resolveReportTemplate(DesignMethod.IEEE_80_2000, null)).toBe(
      ReportTemplate.IEEE_80_2000_ONE_LAYER,
    );
  });

  it('has its own template for Galerkin', () => {
    expect(resolveReportTemplate(DesignMethod.GALERKIN, null)).toBe(
      ReportTemplate.GALERKIN,
    );
    expect(templateDesignMethod(ReportTemplate.GALERKIN)).toBe(DesignMethod.GALERKIN);
    expect(isTwoLayerTemplate(ReportTemplate.GALERKIN)).toBe(false);
  });
});

describe('template helpers', () => {
  it('knows which method and layering a template belongs to', () => {
    expect(templateDesignMethod(ReportTemplate.IEEE_80_86_TWO_LAYER)).toBe(
      DesignMethod.IEEE_80_86,
    );
    expect(templateDesignMethod(ReportTemplate.IEEE_80_2000_ONE_LAYER)).toBe(
      DesignMethod.IEEE_80_2000,
    );
    expect(isTwoLayerTemplate(ReportTemplate.IEEE_80_2000_TWO_LAYER)).toBe(true);
    expect(isTwoLayerTemplate(ReportTemplate.IEEE_80_86_ONE_LAYER)).toBe(false);
  });
});

describe('chooseReportTemplate', () => {
  it('AUTO picks the template that matches the case', () => {
    expect(
      chooseReportTemplate(
        ReportTemplate.AUTO,
        DesignMethod.IEEE_80_86,
        SoilLayeringMethod.TWO_LAYER,
      ),
    ).toEqual({ ok: true, template: ReportTemplate.IEEE_80_86_TWO_LAYER });
  });

  it('accepts the matching template when asked for it explicitly', () => {
    expect(
      chooseReportTemplate(
        ReportTemplate.IEEE_80_2000_ONE_LAYER,
        DesignMethod.IEEE_80_2000,
        SoilLayeringMethod.ONE_LAYER,
      ),
    ).toEqual({ ok: true, template: ReportTemplate.IEEE_80_2000_ONE_LAYER });
  });

  it('refuses a template that does not match the case', () => {
    const choice = chooseReportTemplate(
      ReportTemplate.IEEE_80_86_TWO_LAYER,
      DesignMethod.IEEE_80_2000,
      SoilLayeringMethod.ONE_LAYER,
    );
    expect(choice.ok).toBe(false);
  });

  it('refuses a two-layer template for a one-layer case', () => {
    const choice = chooseReportTemplate(
      ReportTemplate.IEEE_80_2000_TWO_LAYER,
      DesignMethod.IEEE_80_2000,
      SoilLayeringMethod.ONE_LAYER,
    );
    expect(choice.ok).toBe(false);
  });

  it('picks the Galerkin template for Galerkin cases and refuses IEEE templates there', () => {
    expect(
      chooseReportTemplate(ReportTemplate.AUTO, DesignMethod.GALERKIN, null),
    ).toEqual({ ok: true, template: ReportTemplate.GALERKIN });
    expect(
      chooseReportTemplate(
        ReportTemplate.IEEE_80_2000_ONE_LAYER,
        DesignMethod.GALERKIN,
        null,
      ).ok,
    ).toBe(false);
    expect(
      chooseReportTemplate(
        ReportTemplate.GALERKIN,
        DesignMethod.IEEE_80_2000,
        SoilLayeringMethod.ONE_LAYER,
      ).ok,
    ).toBe(false);
  });
});
