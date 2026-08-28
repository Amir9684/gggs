# GGGS Backend — Edge Case & Guard Fixes

Files are laid out under `src/` matching their original paths in your repo —
drop each one in over the original to apply the fix.

## 1. `src/reports/reports.controller.ts` (most severe)

`download()` called `res.download()` directly, with no try/catch and no
callback, and no check that the file still exists on disk. If the DB row
and the stored file ever drifted out of sync (file manually removed,
storage volume reset, etc.), this produced an unhandled stream error
instead of a JSON response — the one place in the app that bypassed the
`asyncFn` safety net entirely.

**Fix:** check the file exists with `fs.access()` before streaming, and
pass an error callback to `res.download()` so any failure (permissions,
disk I/O, file disappearing mid-stream) resolves to the app's normal
`IResponse` JSON error shape instead of an unhandled error.

## 2. Foreign-key delete guards

Several relations have no `onDelete` cascade configured in the entities
(`Grid→Project`, `SoilModel→Project`, `CalculationCase→Project/Grid/
SoilModel`, `Report→Project/CalculationResult`, `Project→User`,
`GridSnapshot→Grid`). Deleting a parent row while children existed
previously fell straight into a raw Postgres FK-violation, which `asyncFn`
caught only as a generic 500 ("مشکلی پیش آمده بعداً تلاش کنید") — not
useful to a caller trying to figure out why the delete failed.

**Fix:** added explicit dependency checks before each delete, returning
`400` with a specific message instead of `500`.

- `src/projects/projects.service.ts` — `delete()` now checks for
  dependent grids, soil models, calculation cases, and reports.
- `src/grids/grids.service.ts` — `delete()` now blocks if any
  calculation case still references the grid; grid snapshots (pure
  history, no independent value) are cascade-deleted in a transaction
  instead of blocking.
- `src/soil/soil-models.service.ts` — `delete()` now blocks if any
  calculation case still references the soil model.
- `src/calculations/calculations.service.ts` — `delete()` now blocks if
  any report still references one of the case's results, before the
  transaction that deletes fault/settings/results/case runs.
- `src/users/users.service.ts` — `delete()` now blocks deleting a user
  who still owns projects.

## 3. `src/users/users.service.ts`

- **`getAll()`** had a duplicated, dead `if (username)` block (copy-paste
  bug) — removed.
- **`create()`** had no uniqueness check of its own; it relied entirely on
  the DB's unique constraint on `username`, which surfaced as a generic
  500 rather than a proper "already registered" message when called
  directly (e.g. the admin-only `POST /users` route, which doesn't go
  through `AuthService.register`'s pre-check). Added a
  `findConflictingUser()` guard.
- **`update()`** had no uniqueness check at all when changing
  `username`/`email` — same fix, excluding the user's own row.

## 4. `src/grids/grid-elements.service.ts`

`restoreSnapshot()` did `JSON.parse(snapshot.snapshotData) as
GridElement[]` with no validation, then immediately `.map()`'d over it.
A corrupted row or a shape mismatch would throw mid-transaction.

**Fix:** explicit try/catch around the parse, an `Array.isArray` check,
and a shape check on each element, all returning a clear "این نسخه خراب
است" message instead of falling through to a generic 500 or a raw
`TypeError`.

---

Everything else I reviewed (`auth.service.ts`, `grids.service.ts` reads,
`soil-models.service.ts` reads, `projects.service.ts` reads, the
`calculations.service.ts` `run()` method, and the IEEE-80 engine under
`calculations/engine/`) was already thoroughly guarded — `run()` in
particular validates every numeric input before it ever reaches the
engine, so I left that alone.
