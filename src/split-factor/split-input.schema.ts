import { ieee80CalculateSchema } from './dto/ieee80-calculate.dto';
import { soniCalculateSchema } from './dto/soni-calculate.dto';
import type { SplitProjectInput } from './split-project.runner';
import type { SplitMethod } from './split-method';

export type ParsedSplitInput =
  | { ok: true; project: SplitProjectInput }
  | { ok: false; messages: string[] };

/**
 * Validates the stored input of a project with the schema of its method
 * (the same schemas the stateless calculate endpoints use) and returns
 * the parsed input with defaults applied, or the messages to show.
 */
export function parseSplitInput(
  method: SplitMethod,
  raw: unknown,
): ParsedSplitInput {
  if (method === 'SONI') {
    const parsed = soniCalculateSchema.safeParse(raw);
    return parsed.success
      ? { ok: true, project: { method, input: parsed.data } }
      : {
          ok: false,
          messages: parsed.error.issues.map((issue) => issue.message),
        };
  }

  const parsed = ieee80CalculateSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, project: { method, input: parsed.data } }
    : {
        ok: false,
        messages: parsed.error.issues.map((issue) => issue.message),
      };
}
