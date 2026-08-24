# Spec — Stage 12: per-plan API rate-limit guard

## 1. Purpose

Add a global NestJS `APP_GUARD` that throttles per-IP request rates according
to the resolved license plan, matching the public Cloud pricing page
(https://teable.ai/zh/pricing?host=cloud) where `free / pro / business` plans
share a `10 req/s` cap and the self-hosted OSS instance is unlimited by
default.

## 2. Scope

In scope:

- A new `ApiThrottleGuard` (`apps/nestjs-backend/src/features/api-rate-limit/`).
- A new `ApiRateLimitModule` that provides the guard and imports
  `LicenseModule` (to read `LicenseCapabilityService.currentPlan()`).
- Registration in `global.module.ts` as the **last** `APP_GUARD` (after
  `AuthGuard` and `PermissionGuard`) so throttle decisions sit at the
  outermost layer.
- Vitest unit tests covering four decision points (AC-001 to AC-004).

Out of scope: any controller / service body change, any new npm dependency,
any cross-process state store (Redis / BullMQ), any i18n / UI work.

## 3. Behavior

For every HTTP request hitting the NestJS app:

1. Resolve the current plan via
   `LicenseCapabilityService.currentPlan()`.
2. If `plan === 'self_hosted'`: short-circuit, return `true`, do **not**
   touch the throttle bucket.
3. Otherwise, derive the per-IP key:
   - `req.ip` if it is a non-empty string.
   - Else, fall back to `req.socket?.remoteAddress`.
   - Else, a sentinel `'__unknown__'` (treated as one shared bucket; this
     keeps the guard safe under malformed proxies without ever throwing).
4. Look up the bucket by key. Each bucket stores
   `{ windowStart: number (ms), count: number }`.
5. If `Date.now() - windowStart >= 1000`: reset `(windowStart, count) =
   (now, 0)`.
6. `count += 1`. If `count > 10`: throw
   `CustomHttpException('Too Many Requests',
   HttpErrorCode.TOO_MANY_REQUESTS, { cause: 'API_RATE_LIMIT', meta: { plan,
   ipKey } })`. The exception's HTTP status is `429`.
7. Otherwise return `true`.

The bucket map is a private field of the guard; it is shared across all
plans except `self_hosted`. Plan changes are observed on every request
because `currentPlan()` is read each call (no caching inside the guard).

## 4. Files

| Path | Action | Purpose |
| --- | --- | --- |
| `apps/nestjs-backend/src/features/api-rate-limit/api-rate-limit.guard.ts` | new | the `CanActivate` |
| `apps/nestjs-backend/src/features/api-rate-limit/api-rate-limit.guard.spec.ts` | new | Vitest tests, AC-001..AC-004 |
| `apps/nestjs-backend/src/features/api-rate-limit/api-rate-limit.module.ts` | new | NestJS module exporting the guard |
| `apps/nestjs-backend/src/global/global.module.ts` | modify | add `ApiRateLimitModule` import + `APP_GUARD` provider |
| `apps/nestjs-backend/src/app.module.ts` | modify | ensure `ApiRateLimitModule` is in `appModules.imports` (next to `LicenseModule`) |

## 5. Acceptance criteria

- **AC-001** Under plan `self_hosted`, calling
  `guard.canActivate(buildCtx('1.2.3.4'))` 100 times in a row returns `true`
  for every call, and the guard's internal bucket map stays empty for that
  IP key.
- **AC-002** Under plan `business`, calling
  `guard.canActivate(buildCtx('1.2.3.4'))` 11 times in the same 1-second
  window: the first 10 calls return `true`; the 11th call throws a
  `CustomHttpException` whose `getStatus() === 429` and whose `code ===
  HttpErrorCode.TOO_MANY_REQUESTS`.
- **AC-003** Under plan `business`, when IP `10.0.0.1` has already burned
  through 10 requests in the current window, a request from IP `10.0.0.2`
  on the same guard instance still returns `true` (independent buckets).
- **AC-004** Within a single test, the mocked
  `LicenseCapabilityService.currentPlan()` flips from `business` to
  `self_hosted` after the bucket was just filled. The very next
  `canActivate(...)` call returns `true` without consulting the bucket
  (the guard reads the plan first and short-circuits when
  `self_hosted`).

## 6. Constraints

- No new npm dependency. The existing `apps/nestjs-backend/package.json` does
  **not** include `@nestjs/throttler`; the guard implements a 1-second
  fixed-window in-memory counter using only Node built-ins.
- AGPL-3.0; no source copied from `teableio/teable-ee`.
- No controller is touched; no service body is touched.
- `self_hosted` is a hard opt-out — bucket is never read or written.

## 7. Verification

- `pnpm --filter @teable/backend test-unit -- api-rate-limit.guard.spec.ts`
  runs the four ACs as separate `it(...)` blocks; all pass.
- `pnpm --filter @teable/backend lint` shows zero new errors.
- `pnpm --filter @teable/backend typecheck` shows zero new errors.
- Smoke: with `TEABLE_LICENSE_KEY=plan:business`, repeated
  `curl /api/auth/profile` returns 429 after the 10th request in a single
  second; with the env unset, the same workload never returns 429.
