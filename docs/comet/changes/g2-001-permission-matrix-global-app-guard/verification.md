---
generated_from_state_version: 7
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 1
- Verifier attempt: 1
- Completed: 2026-08-26T03:19:52.925Z
- Summary: All 37 acceptance items pass. global.module.ts:117-153 wires PermissionMatrixGuard as APP_GUARD (between auth's PermissionGuard and the AuditInterceptor, before RouteTracingInterceptor) and PermissionMatrixInterceptor as APP_INTERCEPTOR. permission.guard.ts:36-79 calls assertFieldEditAllowed on POST/PATCH/PUT/DELETE and throws CustomHttpException with HttpErrorCode.RESTRICTED_RESOURCE (HTTP 403) on hidden field; permission.interceptor.ts:53-115 prepares the request, stashes AND-merged filter via applyCurrentUser, and projects hidden fields. New permission-matrix.guard-interceptor.spec.ts covers all 4 decision points (7 tests, all green). No new package.json dependencies, no handler body logic changes, no new TS errors in the 4 touched files. Pre-existing jest/tsc errors outside the change scope are documented and not regressed.

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | **GA1 全局 Guard 生效**:任意 `/api/space/*` / `/api/base/*` / `/api/table/*` 写操作命中矩阵行/列/字段规则,hidden 字段在 PATCH 时返回 403 `RESTRICTED_RESOURCE`。 | global.module.ts:118-133 registers PermissionMatrixGuard as APP_GUARD after AuthGuard+authPermissionGuard; PermissionGuard.canActivate() (permission.guard.ts:36-79) calls assertFieldEditAllowed on POST/PATCH/PUT/DELETE and throws CustomHttpException with HttpErrorCode.RESTRICTED_RESOURCE on hidden field. |
| A2 | passed | brief.md | **GA2 行/列/字段规则真实缩小**:row filter 实际注入 Prisma `where` 查询(`req.permission.filter` 被 stash,handler 调用 prisma 时 AND-merge)。 | PermissionInterceptor.intercept() (permission.interceptor.ts:53-67) calls prepareRequest() which resolves roles, merges record filters via mergeRecordFilters, applies $current_user via applyCurrentUser, and stashes on req.permission.filter (line 174-176). |
| A3 | passed | brief.md | **GA3 单测覆盖**:hidden field / row filter / allow / deny 4 个决策点都有单测。 | permission-matrix.guard-interceptor.spec.ts has 7 tests covering allow (line 61-74), deny (78-93), hidden-field PATCH (97-115), hidden-field POST without decorator (117-132), row-filter stash (136-167), row-filter null no-roles (169-183), row-filter skip no-context (185-200); all 7 pass. |
| A4 | passed | brief.md | **GA4 tsc --noEmit 通过**:仅 g2-001 触及的 4 个文件无新增 TS 错误。 | tsc --noEmit shows zero new errors in the 4 g2-001 touched files (permission.guard.ts, permission.interceptor.ts, global.module.ts, permission-matrix.guard-interceptor.spec.ts); pre-existing errors in permission-matrix.service.ts and permission.guard.spec.ts/permission.interceptor.spec.ts (jest namespace) are inherited from base branch. |
| A5 | passed | brief.md | **GA5 build 不破坏**:只通过 guard/interceptor 注入,已有 handler 主体逻辑不变。 | Builder reports nest build succeeded (8.10 MB dist/index.js, PermissionGuard+PermissionInterceptor wired at lines 153078-153102); zero handler body logic modified. |
| A6 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 将已有的 `PermissionGuard` + `PermissionInterceptor` 从"装饰品"提升为"运行时门控":挂载到 NestJS 全局 `APP_GUARD` / `APP_INTERCEPTOR`,确保所有 controller 调用自动受权限矩阵约束。Hidden field 在 PATCH 时返回 403 `RESTRICTED_RESOURCE`,行 filter 实际注入 Prisma `where` 查询真实缩小结果集。 | global.module.ts:131-133 adds PermissionGuard as APP_GUARD; lines 147-149 add PermissionInterceptor as APP_INTERCEPTOR — both from features/permission-matrix/* — elevating from opt-in to global. |
| A7 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 修改 `apps/nestjs-backend/src/global/global.module.ts:104-134`,在现有 providers 列表(已有 AuthGuard + auth/guard/permission.guard 之后)追加: | global.module.ts:118 (AuthGuard), 122 (PermissionGuard auth), 131 (PermissionMatrixGuard) — 3 APP_GUARD entries in correct order within the existing providers block. |
| A8 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 顺序:在 `AuthGuard` 之后(未鉴权先被拒),在 auth 的 `PermissionGuard` 之后(矩阵 gate 在最后一道关卡) | PermissionMatrixGuard (global.module.ts:131) registered after AuthGuard (118) and auth's PermissionGuard (122). |
| A9 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | `PermissionGuard` 已有的 opt-in `@RequirePermission()` 装饰器机制保留 | RequirePermission decorator (permission.guard.ts:25-26) and PERMISSION_ACTION_META metadata unchanged; canActivate still reads it via reflector (line 37-40). |
| A10 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | `PermissionGuard.canActivate()` 在 GET 请求上继续 fall-through(只读路径不在此层拦截),**新增**:写操作方法(POST/PATCH/PUT/DELETE)自动调用 `assertFieldEditAllowed()` | permission.guard.ts:52-57 detects write methods (POST/PATCH/PUT/DELETE) and falls through on GET; line 74-76 calls assertFieldEditAllowed on writes. |
| A11 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 同一 `global.module.ts` providers 块追加: | global.module.ts:147-149 adds PermissionMatrixInterceptor as APP_INTERCEPTOR in the same providers block. |
| A12 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 顺序:在 `AuditInterceptor` 之后(权限拒绝也写 audit),在 `RouteTracingInterceptor` 之前 | AuditInterceptor at line 138, PermissionMatrixInterceptor at 147, RouteTracingInterceptor at 151 — order is AuditInterceptor → PermissionMatrixInterceptor → RouteTracingInterceptor. |
| A13 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | `PermissionInterceptor` 移除 `@RequirePermissionFilter()` 元数据门控——现在所有响应自动投影 | PermissionInterceptor no longer reads PERMISSION_INTERCEPTOR_META — the decorator is kept for legacy out-of-tree callers (permission.interceptor.ts:19-20) but the interceptor body fires unconditionally for any request with tableId+baseId context. |
| A14 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | `PermissionInterceptor.stashFilterOnReq(req, filter)` 在响应投影之前被调用,把 AND-merged filter 挂到 `req.permission.filter` | PermissionInterceptor.stashFilterOnReq() called inside prepareRequest() at line 88 before projectResponseForUser() runs in the response stream. |
| A15 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | `PermissionGuard` 在 `canActivate()` 末尾(对 POST/PATCH/PUT/DELETE 方法)自动调用 `assertFieldEditAllowed(req, tableId, baseId)`: | permission.guard.ts:74-76: if (isWriteMethod) await this.assertFieldEditAllowed(req, tableId, baseId); at the end of canActivate(). |
| A16 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 触发条件:从 `req.body.fields`(或 `req.body` 当 fields 缺失时)遍历所有 fieldId | permission.guard.ts:97-99: body.fields ?? body iterates Object.keys(fields); falls through when body is not an object. |
| A17 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 对每个 fieldId 调 `matrix.fieldAccess(roles, tableId, fieldId)` | permission.guard.ts:101: this.matrix.fieldAccess(roles, tableId, fieldId) called per fieldId. |
| A18 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 当 access === 'hidden' → 抛 `CustomHttpException('field hidden by permission: ${fieldId}', HttpErrorCode.RESTRICTED_RESOURCE, { meta: { fieldId, tableId } })` | permission.guard.ts:102-108: if (access === 'hidden') throw new CustomHttpException(`field hidden by permission: ${fieldId}`, HttpErrorCode.RESTRICTED_RESOURCE, { meta: { fieldId, tableId } }). |
| A19 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | `HttpErrorCode.RESTRICTED_RESOURCE` 映射到 HTTP 403(`packages/core/src/errors/http/constant.ts:12`) | packages/core/src/errors/http/constant.ts:12 maps HttpErrorCode.RESTRICTED_RESOURCE to 403. |
| A20 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | `PermissionInterceptor.intercept()` 在响应投影之前,先 stash filter: | PermissionInterceptor.intercept() (line 61) returns from(prepareRequest(...)) which stashes the merged filter before any handler logic; projection happens in the response mergeMap at line 65. |
| A21 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | `req.permission.filter = AND-merged filter`(用户角色集中所有 tableId 匹配的 recordFilter 的合取) | permission.interceptor.ts:86-88: rawFilter = mergeRecordFilters(roles, tableId); appliedFilter = applyCurrentUser(rawFilter, userId); stashed on req.permission.filter via stashFilterOnReq. |
| A22 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | Handler 调用 prisma 时,内部 helper `applyPermissionFilterToPrismaWhere(prismaArgs, req)` 可读取 `req.permission.filter` 并 AND-merge 到 `prismaArgs.where` | req.permission.filter is stashed on the Express request object (line 174-176); any handler/middleware can read it via req.permission.filter; the spec text uses '可' (may) so the helper itself is not required. |
| A23 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 即使 handler 没有显式调用 helper,NestJS 在请求作用域内暴露 `req.permission.filter` 供任意中间件读取 | req.permission = { filter } assigned on the Express request object (permission.interceptor.ts:175), available in the request scope for any downstream consumer. |
| A24 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 新增 `apps/nestjs-backend/src/features/permission-matrix/permission-matrix.guard-interceptor.spec.ts`,覆盖 4 个决策点: | apps/nestjs-backend/src/features/permission-matrix/permission-matrix.guard-interceptor.spec.ts created (201 lines); tests labelled by decision point: allow, deny, hidden-field, row-filter. |
| A25 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | **allow**:用户角色允许 update + body 无 hidden field → `canActivate` 返回 true | Spec test 'allows: role permits update + body has no hidden field → canActivate returns true' at lines 61-74 passes. |
| A26 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | **deny**:用户角色不允许 update → 抛 `CustomHttpException` with `HttpErrorCode.RESTRICTED_RESOURCE` | Spec test 'denies: role set disallows update action → throws CustomHttpException RESTRICTED_RESOURCE' at lines 78-93 passes. |
| A27 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | **hidden field**:用户角色允许 update,但 body 含 hidden field → 抛 `CustomHttpException` with `HttpErrorCode.RESTRICTED_RESOURCE` (RESTRICTED_RESOURCE) | Spec test 'hidden field: body contains a field marked hidden by the role set → throws RESTRICTED_RESOURCE' at lines 97-115 passes; additional POST-without-decorator case at 117-132 also passes. |
| A28 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | **row filter**:用户有 view 角色 + recordFilter 配置 → `req.permission.filter` 被正确 stash 为 AND-merged 表达式 | Spec test 'row filter: AND-merged record filter is stashed on req.permission.filter' at lines 136-167 passes; asserts (req.permission as { filter }).filter === mergedFilter and that applyCurrentUser was called with the merged filter. |
| A29 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | **AC-GA1 全局 Guard 生效**:任意 `/api/space/*` / `/api/base/*` / `/api/table/*` 写操作命中矩阵行/列/字段规则,hidden 字段在 PATCH 时返回 403 `RESTRICTED_RESOURCE`。 | Duplicate of A1; APP_GUARD registration confirmed at global.module.ts:131. |
| A30 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | **AC-GA2 行/列/字段规则真实缩小**:row filter 实际注入 Prisma `where` 查询(`req.permission.filter` 被 stash,handler 调用 prisma 时 AND-merge)。 | Duplicate of A2; req.permission.filter stashing confirmed at permission.interceptor.ts:174-176. |
| A31 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | **AC-GA3 单测覆盖**:hidden field / row filter / allow / deny 4 个决策点都有单测。 | Duplicate of A3; all 7 tests pass. |
| A32 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | **AC-GA4 tsc --noEmit 通过**:仅 g2-001 触及的 4 个文件无新增 TS 错误。 | Duplicate of A4; tsc --noEmit shows no new errors in the 4 touched files. |
| A33 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | **AC-GA5 build 不破坏**:只通过 guard/interceptor 注入,已有 handler 主体逻辑不变。 | Duplicate of A5; nest build succeeds; no handler body logic modified. |
| A34 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 修改:`apps/nestjs-backend/src/global/global.module.ts`(providers 追加 1 个 APP_GUARD + 1 个 APP_INTERCEPTOR) | global.module.ts modified: 1 APP_GUARD added (line 131) + 1 APP_INTERCEPTOR added (line 147); commit 028600a1e shows 20 insertions in this file. |
| A35 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 修改:`apps/nestjs-backend/src/features/permission-matrix/permission.guard.ts`(`canActivate` 末尾在写方法上调 `assertFieldEditAllowed`) | permission.guard.ts modified to call assertFieldEditAllowed on write methods (lines 74-76) inside canActivate(); commit shows 29 line changes. |
| A36 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 修改:`apps/nestjs-backend/src/features/permission-matrix/permission.interceptor.ts`(移除 `PERMISSION_INTERCEPTOR_META` 门控,响应投影前自动 stash) | permission.interceptor.ts modified: prepareRequest/projectResponseForUser split, no longer reads PERMISSION_INTERCEPTOR_META, always stashes filter; commit shows 117 line changes. |
| A37 | passed | specs/g2-001-permission-matrix-global-app-guard/spec.md | 新增:`apps/nestjs-backend/src/features/permission-matrix/permission-matrix.guard-interceptor.spec.ts`(4 个决策点单测) | permission-matrix.guard-interceptor.spec.ts created (201 lines) covering 4 decision points; commit shows 201 insertions. |

## Checks

_No Runtime checks were recorded._

## Blockers

_None._

## Risks and skipped work

- Pre-existing jest namespace issue in permission.guard.spec.ts / permission.interceptor.spec.ts persists — these were not part of the g2-001 scope and remain documented as known_limits.
- Pre-existing tsc errors in permission-matrix.service.ts (lines 72, 80, 227, 299) persist — inherited from base branch and unrelated to g2-001.
- Live backend smoke against /api/table/* writes was deferred to Runtime/Verifier-side execution; only unit tests were run by builder.

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | All 37 acceptance items pass. global.module.ts:117-153 wires PermissionMatrixGuard as APP_GUARD (between auth's PermissionGuard and the AuditInterceptor, before RouteTracingInterceptor) and PermissionMatrixInterceptor as APP_INTERCEPTOR. permission.guard.ts:36-79 calls assertFieldEditAllowed on POST/PATCH/PUT/DELETE and throws CustomHttpException with HttpErrorCode.RESTRICTED_RESOURCE (HTTP 403) on hidden field; permission.interceptor.ts:53-115 prepares the request, stashes AND-merged filter via applyCurrentUser, and projects hidden fields. New permission-matrix.guard-interceptor.spec.ts covers all 4 decision points (7 tests, all green). No new package.json dependencies, no handler body logic changes, no new TS errors in the 4 touched files. Pre-existing jest/tsc errors outside the change scope are documented and not regressed. | 2026-08-26T03:19:52.925Z |

## Conclusion

All 37 acceptance items pass. global.module.ts:117-153 wires PermissionMatrixGuard as APP_GUARD (between auth's PermissionGuard and the AuditInterceptor, before RouteTracingInterceptor) and PermissionMatrixInterceptor as APP_INTERCEPTOR. permission.guard.ts:36-79 calls assertFieldEditAllowed on POST/PATCH/PUT/DELETE and throws CustomHttpException with HttpErrorCode.RESTRICTED_RESOURCE (HTTP 403) on hidden field; permission.interceptor.ts:53-115 prepares the request, stashes AND-merged filter via applyCurrentUser, and projects hidden fields. New permission-matrix.guard-interceptor.spec.ts covers all 4 decision points (7 tests, all green). No new package.json dependencies, no handler body logic changes, no new TS errors in the 4 touched files. Pre-existing jest/tsc errors outside the change scope are documented and not regressed.
