import type { ValueTransformer } from 'typeorm';

/**
 * TypeORM/`pg` quirk: Postgres `numeric`/`decimal` columns are returned by
 * the driver as **strings**, not JS numbers — this avoids silent precision
 * loss for values too large/precise for a JS `number`, but it means every
 * `@Column('decimal')` field is typed `number` in TypeScript while actually
 * being a `string` at runtime. Left unhandled, that string leaks straight
 * through to API responses (`create`, `getOne`, `getResults`, etc.), which
 * is exactly the "numbers come back as strings" symptom on the frontend.
 *
 * Apply this transformer to every decimal column instead of converting
 * ad-hoc in services: `to()` runs when TypeORM writes the value to the DB,
 * `from()` runs whenever it reads a row back out. Centralizing it here
 * means the conversion happens once, consistently, everywhere the column
 * is read — not just in the one place (`CalculationsService.run()`) that
 * happened to add its own `Number(...)` calls.
 *
 * Usage:
 *   @Column('decimal', { transformer: decimalTransformer })
 *   surfaceResistivity: number;
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,

  from: (value?: string | null): number | null => {
    if (value === null || value === undefined) {
      return null;
    }

    const parsed = Number(value);

    // A malformed/non-numeric value in the DB shouldn't silently become
    // `NaN` and flow into calculations or JSON responses — surface it
    // loudly instead, since it means the row is corrupt.
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `decimalTransformer: expected a numeric string, got ${JSON.stringify(value)}`,
      );
    }

    return parsed;
  },
};
