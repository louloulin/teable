---
generated_from_state_version: 2
---

# Verification

## Current result

- Result: **In progress — pending Runtime verifier**
- Builder self-check: **passed**
- Goal cycle: 1
- Iteration: 1

## Self-check evidence (Builder pre-handoff)

### Wiring registered

| Hook | Class | Source | Provider |
| --- | --- | --- | --- |
| `APP_GUARD` | `PermissionGuard` (permission-matrix) | `apps/nestjs-backend/src/features/permission-matrix/permission.guard.ts` | `apps/nestjs-backend/src/global/global.module.ts` (providers block, after `AuthGuard` and the auth-module `PermissionGuard`) |
| `APP_INTERCEPTOR` | `PermissionInterceptor` (permission-matrix) | `apps/nestjs-backend/src/features/permission-matrix/permission.interceptor.ts` | `apps/nestjs-backend/src/global/global.module.ts` (providers block, after `AuditInterceptor`, before `RouteTracingInterceptor`) |

Verified in built artifact: `apps/nestjs-backend/dist/index.js:153078-153102` shows both providers correctly compiled with webpack module references `_features_permission_matrix_permission_guard_*` and `_features_permission_matrix_permission_interceptor_*`.

### Hidden-field write protection

`PermissionGuard.canActivate()` now:
1. Reads `req.method`
2. If write method (POST / PATCH / PUT / DELETE) → calls `assertFieldEditAllowed(req, tableId, baseId)` after the action allow/deny check
3. `assertFieldEditAllowed` iterates `req.body.fields` and throws `CustomHttpException('field hidden by permission: ${fieldId}', HttpErrorCode.RESTRICTED_RESOURCE, { meta: { fieldId, tableId } })` when a field is hidden

This still preserves the opt-in `@RequirePermission()` decorator semantics:
- Read methods (GET / HEAD) without opt-in metadata → fall through to existing OSS admin/owner path
- Decorated routes with disallowed action → throw `RESTRICTED_RESOURCE`
- Write methods with a hidden field in `req.body.fields` → throw `RESTRICTED_RESOURCE`

### Row filter injection

`PermissionInterceptor.intercept()` now:
1. Calls `prepareRequest(req, tableId, baseId, userId)` → resolves roles, AND-merges record filters via `matrix.mergeRecordFilters`, substitutes `$current_user` placeholders via `matrix.applyCurrentUser`, then calls `stashFilterOnReq(req, filter)`
2. After the next handler completes, calls `projectResponseForUser(body, req, tableId, baseId, userId)` → applies the existing `projectResponse` for hidden/readonly field projection

`req.permission.filter` is the AND-merged filter with `$current_user` already substituted — downstream code can read it from the request to AND-merge into Prisma `where`.

### Tests

`pnpm vitest run src/features/permission-matrix/permission-matrix.guard-interceptor.spec.ts` — **7 / 7 tests passed (6 ms)**

| # | Decision point | Status |
| --- | --- | --- |
| 1 | allow (role permits update, no hidden field) | passed |
| 2 | deny (role disallows update) | passed |
| 3 | hidden field on PATCH | passed |
| 4 | hidden field on POST without `@RequirePermission` | passed |
| 5 | row filter stashed on `req.permission.filter` | passed |
| 6 | row filter writes null when no roles apply | passed |
| 7 | row filter skips when no tableId/baseId | passed |

### Audit tests still green

`pnpm vitest run src/features/audit/` — **27 / 27 tests passed (2.39 s)**

### Build

`pnpm build` — **compiled successfully (6.93 s)**

`apps/nestjs-backend/dist/index.js` regenerated (8.10 MB).

### tsc --noEmit on touched files

No errors in:
- `apps/nestjs-backend/src/features/permission-matrix/permission.guard.ts`
- `apps/nestjs-backend/src/features/permission-matrix/permission.interceptor.ts`
- `apps/nestjs-backend/src/global/global.module.ts`
- `apps/nestjs-backend/src/features/permission-matrix/permission-matrix.guard-interceptor.spec.ts`

Pre-existing tsc errors in `permission-matrix.service.ts` and the older spec files (`permission.guard.spec.ts`, `permission.interceptor.spec.ts` — they reference `jest.fn()` / `jest.Mock` which is not aliased in the vitest setup) are unrelated to this change. The new spec file uses `vi.fn()` consistently and compiles cleanly.

## Conclusion

All four decision points (allow / deny / hidden field / row filter) are covered by unit tests; the wiring is registered as `APP_GUARD` / `APP_INTERCEPTOR` in `global.module.ts` and verified in the compiled artifact. Build and tests pass.