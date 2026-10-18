import { resolveHalfSecondVariant } from '../report-options';

describe('resolveHalfSecondVariant', () => {
  it('follows the fault duration when the request does not say', () => {
    expect(resolveHalfSecondVariant(0.5, undefined)).toEqual({
      ok: true,
      value: true,
    });
    expect(resolveHalfSecondVariant(1, undefined)).toEqual({
      ok: true,
      value: true,
    });
    expect(resolveHalfSecondVariant(0.25, undefined)).toEqual({
      ok: true,
      value: false,
    });
  });

  it('lets a long fault opt out of the variant', () => {
    expect(resolveHalfSecondVariant(1, false)).toEqual({
      ok: true,
      value: false,
    });
  });

  it('refuses the variant for a fault shorter than 0.5 s', () => {
    const choice = resolveHalfSecondVariant(0.25, true);
    expect(choice.ok).toBe(false);
  });

  it('accepts the variant at exactly 0.5 s', () => {
    expect(resolveHalfSecondVariant(0.5, true)).toEqual({
      ok: true,
      value: true,
    });
  });
});
