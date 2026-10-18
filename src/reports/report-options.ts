/**
 * Fault durations of the Windows GGGS decrement-factor table (seconds).
 * The last row of that table is "0.5 s or more" (Df = 1.0): the Windows
 * report page shows it with an "Or More" button instead of a number.
 */
export const HALF_SECOND = 0.5;

export type HalfSecondChoice =
  | { ok: true; value: boolean }
  | { ok: false; message: string };

/**
 * Decides whether the report prints the fault duration as "0.5 s or
 * more". When the request doesn't say, it follows the fault duration.
 * Asking for the variant on a shorter fault would print a duration the
 * calculation didn't use, so that is refused.
 */
export function resolveHalfSecondVariant(
  faultDuration: number,
  requested: boolean | undefined,
): HalfSecondChoice {
  const qualifies = faultDuration >= HALF_SECOND;

  if (requested === true && !qualifies) {
    return {
      ok: false,
      message:
        'حالت «۰٫۵ ثانیه یا بیشتر» فقط برای مدت زمان خطای ۰٫۵ ثانیه یا بیشتر قابل استفاده است.',
    };
  }

  return { ok: true, value: requested ?? qualifies };
}
