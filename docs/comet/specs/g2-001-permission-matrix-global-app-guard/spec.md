# Capability: g2-001-permission-matrix-global-app-guard

## Purpose

将已有的 `PermissionGuard` + `PermissionInterceptor` 从"装饰品"提升为"运行时门控":挂载到 NestJS 全局 `APP_GUARD` / `APP_INTERCEPTOR`,确保所有 controller 调用自动受权限矩阵约束。Hidden field 在 PATCH 时返回 403 `RESTRICTED_RESOURCE`,行 filter 实际注入 Prisma `where` 查询真实缩小结果集。

## Behavior

### 1. APP_GUARD 注册

修改 `apps/nestjs-backend/src/global/global.module.ts:104-134`,在现有 providers 列表(已有 AuthGuard + auth/guard/permission.guard 之后)追加:

```ts
{
  // Wires PermissionGuard (from permission-matrix) as a global APP_GUARD so
  // all /api/space/* /api/base/* /api/table/* writes hit the matrix.
  // The guard's `assertFieldEditAllowed()` is invoked on every non-GET so
  // hidden fields in PATCH/POST/PUT/DELETE body throw 403 immediately.
  provide: APP_GUARD,
  useClass: PermissionGuard,
}
```

- 顺序:在 `AuthGuard` 之后(未鉴权先被拒),在 auth 的 `PermissionGuard` 之后(矩阵 gate 在最后一道关卡)
- `PermissionGuard` 已有的 opt-in `@RequirePermission()` 装饰器机制保留
- `PermissionGuard.canActivate()` 在 GET 请求上继续 fall-through(只读路径不在此层拦截),**新增**:写操作方法(POST/PATCH/PUT/DELETE)自动调用 `assertFieldEditAllowed()`

### 2. APP_INTERCEPTOR 注册

同一 `global.module.ts` providers 块追加:

```ts
{
  // Wires PermissionInterceptor as APP_INTERCEPTOR so all responses get
  // hidden-field projection and row filters are AND-merged into Prisma where.
  provide: APP_INTERCEPTOR,
  useClass: PermissionInterceptor,
}
```

- 顺序:在 `AuditInterceptor` 之后(权限拒绝也写 audit),在 `RouteTracingInterceptor` 之前
- `PermissionInterceptor` 移除 `@RequirePermissionFilter()` 元数据门控——现在所有响应自动投影
- `PermissionInterceptor.stashFilterOnReq(req, filter)` 在响应投影之前被调用,把 AND-merged filter 挂到 `req.permission.filter`

### 3. Hidden field 写保护

`PermissionGuard` 在 `canActivate()` 末尾(对 POST/PATCH/PUT/DELETE 方法)自动调用 `assertFieldEditAllowed(req, tableId, baseId)`:

```ts
const method = req.method;
if (method !== 'GET' && method !== 'HEAD') {
  await this.assertFieldEditAllowed(req, tableId, baseId);
}
```

- 触发条件:从 `req.body.fields`(或 `req.body` 当 fields 缺失时)遍历所有 fieldId
- 对每个 fieldId 调 `matrix.fieldAccess(roles, tableId, fieldId)`
- 当 access === 'hidden' → 抛 `CustomHttpException('field hidden by permission: ${fieldId}', HttpErrorCode.RESTRICTED_RESOURCE, { meta: { fieldId, tableId } })`
- `HttpErrorCode.RESTRICTED_RESOURCE` 映射到 HTTP 403(`packages/core/src/errors/http/constant.ts:12`)

### 4. 行 filter 实际注入 Prisma `where`

`PermissionInterceptor.intercept()` 在响应投影之前,先 stash filter:

```ts
const filter = this.matrix.mergeRecordFilters(roles, tableId);
const appliedFilter = filter ? this.matrix.applyCurrentUser(filter, userId) : null;
PermissionInterceptor.stashFilterOnReq(req, appliedFilter);
```

- `req.permission.filter = AND-merged filter`(用户角色集中所有 tableId 匹配的 recordFilter 的合取)
- Handler 调用 prisma 时,内部 helper `applyPermissionFilterToPrismaWhere(prismaArgs, req)` 可读取 `req.permission.filter` 并 AND-merge 到 `prismaArgs.where`
- 即使 handler 没有显式调用 helper,NestJS 在请求作用域内暴露 `req.permission.filter` 供任意中间件读取

### 5. 单测覆盖 `permission-matrix.guard-interceptor.spec.ts`

新增 `apps/nestjs-backend/src/features/permission-matrix/permission-matrix.guard-interceptor.spec.ts`,覆盖 4 个决策点:

- **allow**:用户角色允许 update + body 无 hidden field → `canActivate` 返回 true
- **deny**:用户角色不允许 update → 抛 `CustomHttpException` with `HttpErrorCode.RESTRICTED_RESOURCE`
- **hidden field**:用户角色允许 update,但 body 含 hidden field → 抛 `CustomHttpException` with `HttpErrorCode.RESTRICTED_RESOURCE` (RESTRICTED_RESOURCE)
- **row filter**:用户有 view 角色 + recordFilter 配置 → `req.permission.filter` 被正确 stash 为 AND-merged 表达式

## Acceptance criteria

- **AC-GA1 全局 Guard 生效**:任意 `/api/space/*` / `/api/base/*` / `/api/table/*` 写操作命中矩阵行/列/字段规则,hidden 字段在 PATCH 时返回 403 `RESTRICTED_RESOURCE`。
- **AC-GA2 行/列/字段规则真实缩小**:row filter 实际注入 Prisma `where` 查询(`req.permission.filter` 被 stash,handler 调用 prisma 时 AND-merge)。
- **AC-GA3 单测覆盖**:hidden field / row filter / allow / deny 4 个决策点都有单测。
- **AC-GA4 tsc --noEmit 通过**:仅 g2-001 触及的 4 个文件无新增 TS 错误。
- **AC-GA5 build 不破坏**:只通过 guard/interceptor 注入,已有 handler 主体逻辑不变。

## Files

- 修改:`apps/nestjs-backend/src/global/global.module.ts`(providers 追加 1 个 APP_GUARD + 1 个 APP_INTERCEPTOR)
- 修改:`apps/nestjs-backend/src/features/permission-matrix/permission.guard.ts`(`canActivate` 末尾在写方法上调 `assertFieldEditAllowed`)
- 修改:`apps/nestjs-backend/src/features/permission-matrix/permission.interceptor.ts`(移除 `PERMISSION_INTERCEPTOR_META` 门控,响应投影前自动 stash)
- 新增:`apps/nestjs-backend/src/features/permission-matrix/permission-matrix.guard-interceptor.spec.ts`(4 个决策点单测)