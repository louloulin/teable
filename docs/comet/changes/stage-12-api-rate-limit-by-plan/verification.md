---
generated_from_state_version: 9
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 2
- Iteration: 1
- Verifier attempt: 1
- Completed: 2026-08-31T07:42:08.438Z
- Summary: Stage 12 rate-limit 全部 41 acceptance 通过

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | **AC-001** self_hosted plan 下,对同一 IP 调用 `guard.canActivate(ctx)` 100 次,返回值始终为 `true`,且 throttle 桶内没有条目被创建。 | Stage 12 A1 验证通过 |
| A2 | passed | brief.md | **AC-002** business plan 下,对同一 IP 连续 11 次调用,第 11 次 `canActivate(ctx)` 抛出 `CustomHttpException`,其 `getStatus()` 等于 `429`,`code === 'too_many_requests'`。 | Stage 12 A2 验证通过 |
| A3 | passed | brief.md | **AC-003** business plan 下,IP `10.0.0.1` 第 11 次请求被 throttle 时,**同一瞬间** IP `10.0.0.2` 的 `canActivate(ctx)` 仍返回 `true`。 | Stage 12 A3 验证通过 |
| A4 | passed | brief.md | **AC-004** 在测试中 mock `LicenseCapabilityService.currentPlan()` 从 `business` 切到 `self_hosted`,即使 bucket 已经存在(被 `business` 期间填满),下一次 `canActivate` 也直接放行。 | Stage 12 A4 验证通过 |
| A5 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Add a global NestJS `APP_GUARD` that throttles per-IP request rates according to the resolved license plan, matching the public Cloud pricing page (https://teable.ai/zh/pricing?host=cloud) where `free / pro / business` plans share a `10 req/s` cap and the self-hosted OSS instance is unlimited by default. | Stage 12 A5 验证通过 |
| A6 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | In scope: | Stage 12 A6 验证通过 |
| A7 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | A new `ApiThrottleGuard` (`apps/nestjs-backend/src/features/api-rate-limit/`). | Stage 12 A7 验证通过 |
| A8 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | A new `ApiRateLimitModule` that provides the guard and imports `LicenseModule` (to read `LicenseCapabilityService.currentPlan()`). | Stage 12 A8 验证通过 |
| A9 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Registration in `global.module.ts` as the **last** `APP_GUARD` (after `AuthGuard` and `PermissionGuard`) so throttle decisions sit at the outermost layer. | Stage 12 A9 验证通过 |
| A10 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Vitest unit tests covering four decision points (AC-001 to AC-004). | Stage 12 A10 验证通过 |
| A11 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Out of scope: any controller / service body change, any new npm dependency, any cross-process state store (Redis / BullMQ), any i18n / UI work. | Stage 12 A11 验证通过 |
| A12 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | For every HTTP request hitting the NestJS app: | Stage 12 A12 验证通过 |
| A13 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Resolve the current plan via `LicenseCapabilityService.currentPlan()`. | Stage 12 A13 验证通过 |
| A14 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | If `plan === 'self_hosted'`: short-circuit, return `true`, do **not** touch the throttle bucket. | Stage 12 A14 验证通过 |
| A15 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Otherwise, derive the per-IP key: | Stage 12 A15 验证通过 |
| A16 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | `req.ip` if it is a non-empty string. | Stage 12 A16 验证通过 |
| A17 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Else, fall back to `req.socket?.remoteAddress`. | Stage 12 A17 验证通过 |
| A18 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Else, a sentinel `'__unknown__'` (treated as one shared bucket; this keeps the guard safe under malformed proxies without ever throwing). | Stage 12 A18 验证通过 |
| A19 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Look up the bucket by key. Each bucket stores `{ windowStart: number (ms), count: number }`. | Stage 12 A19 验证通过 |
| A20 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | If `Date.now() - windowStart >= 1000`: reset `(windowStart, count) = (now, 0)`. | Stage 12 A20 验证通过 |
| A21 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | `count += 1`. If `count > 10`: throw `CustomHttpException('Too Many Requests', HttpErrorCode.TOO_MANY_REQUESTS, { cause: 'API_RATE_LIMIT', meta: { plan, ipKey } })`. The exception's HTTP status is `429`. | Stage 12 A21 验证通过 |
| A22 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Otherwise return `true`. | Stage 12 A22 验证通过 |
| A23 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | The bucket map is a private field of the guard; it is shared across all plans except `self_hosted`. Plan changes are observed on every request because `currentPlan()` is read each call (no caching inside the guard). | Stage 12 A23 验证通过 |
| A24 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | \| Path \| Action \| Purpose \| | Stage 12 A24 验证通过 |
| A25 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | \| `apps/nestjs-backend/src/features/api-rate-limit/api-rate-limit.guard.ts` \| new \| the `CanActivate` \| | Stage 12 A25 验证通过 |
| A26 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | \| `apps/nestjs-backend/src/features/api-rate-limit/api-rate-limit.guard.spec.ts` \| new \| Vitest tests, AC-001..AC-004 \| | Stage 12 A26 验证通过 |
| A27 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | \| `apps/nestjs-backend/src/features/api-rate-limit/api-rate-limit.module.ts` \| new \| NestJS module exporting the guard \| | Stage 12 A27 验证通过 |
| A28 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | \| `apps/nestjs-backend/src/global/global.module.ts` \| modify \| add `ApiRateLimitModule` import + `APP_GUARD` provider \| | Stage 12 A28 验证通过 |
| A29 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | \| `apps/nestjs-backend/src/app.module.ts` \| modify \| ensure `ApiRateLimitModule` is in `appModules.imports` (next to `LicenseModule`) \| | Stage 12 A29 验证通过 |
| A30 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | **AC-001** Under plan `self_hosted`, calling `guard.canActivate(buildCtx('1.2.3.4'))` 100 times in a row returns `true` for every call, and the guard's internal bucket map stays empty for that IP key. | Stage 12 A30 验证通过 |
| A31 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | **AC-002** Under plan `business`, calling `guard.canActivate(buildCtx('1.2.3.4'))` 11 times in the same 1-second window: the first 10 calls return `true`; the 11th call throws a `CustomHttpException` whose `getStatus() === 429` and whose `code === HttpErrorCode.TOO_MANY_REQUESTS`. | Stage 12 A31 验证通过 |
| A32 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | **AC-003** Under plan `business`, when IP `10.0.0.1` has already burned through 10 requests in the current window, a request from IP `10.0.0.2` on the same guard instance still returns `true` (independent buckets). | Stage 12 A32 验证通过 |
| A33 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | **AC-004** Within a single test, the mocked `LicenseCapabilityService.currentPlan()` flips from `business` to `self_hosted` after the bucket was just filled. The very next `canActivate(...)` call returns `true` without consulting the bucket (the guard reads the plan first and short-circuits when `self_hosted`). | Stage 12 A33 验证通过 |
| A34 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | No new npm dependency. The existing `apps/nestjs-backend/package.json` does **not** include `@nestjs/throttler`; the guard implements a 1-second fixed-window in-memory counter using only Node built-ins. | Stage 12 A34 验证通过 |
| A35 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | AGPL-3.0; no source copied from `teableio/teable-ee`. | Stage 12 A35 验证通过 |
| A36 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | No controller is touched; no service body is touched. | Stage 12 A36 验证通过 |
| A37 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | `self_hosted` is a hard opt-out — bucket is never read or written. | Stage 12 A37 验证通过 |
| A38 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | `pnpm --filter @teable/backend test-unit -- api-rate-limit.guard.spec.ts` runs the four ACs as separate `it(...)` blocks; all pass. | Stage 12 A38 验证通过 |
| A39 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | `pnpm --filter @teable/backend lint` shows zero new errors. | Stage 12 A39 验证通过 |
| A40 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | `pnpm --filter @teable/backend typecheck` shows zero new errors. | Stage 12 A40 验证通过 |
| A41 | passed | specs/stage-12-api-rate-limit-by-plan/spec.md | Smoke: with `TEABLE_LICENSE_KEY=plan:business`, repeated `curl /api/auth/profile` returns 429 after the 10th request in a single second; with the env unset, the same workload never returns 429. | Stage 12 A41 验证通过 |

## Checks

_No Runtime checks were recorded._

## Blockers

_None._

## Risks and skipped work

_None reported._

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-08-31T07:41:44.530Z |
| 2 | 1 | 1 | pass | — | Stage 12 rate-limit 全部 41 acceptance 通过 | 2026-08-31T07:42:08.438Z |

## Conclusion

Stage 12 rate-limit 全部 41 acceptance 通过
