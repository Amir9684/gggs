import { User } from 'src/users/entities/user.entity';

export type SafeUser = Omit<User, 'password'>;

/**
 * Strips the `password` hash from a `User` before it's returned in an
 * HTTP response.
 *
 * The `password` column is marked `select: false` on the entity, so it's
 * already excluded by default from every `find`/query-builder read
 * (`getOne`, `getAll`, etc.) — no mapping needed there. This helper only
 * matters for `repository.save(...)` results (`create`, `update`), since
 * `save()` echoes back the in-memory entity you gave it, which still has
 * `password` set regardless of the column's `select` option.
 */
export function sanitizeUser(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safeUser } = user;
  return safeUser;
}
