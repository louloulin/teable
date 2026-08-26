# Outcome

在 OSS NestJS 后端将已有的 `PermissionGuard` + `PermissionInterceptor`(位于 `apps/nestjs-backend/src/features/permission-matrix/`)从"装饰品"提升为"运行时门控":

1. `PermissionGuard` 注册为 `APP_GUARD`,对所有 `/api/space/*`、`/api/base/*`、`/api/table/*` 写操作自动生效
2. `PermissionInterceptor` 注册为 `APP_INTERCEPTOR`,对所有响应做 hidden-field 投影 + 行 filter 注入
3. Hidden field 在 PATCH 时返回 403 `RESTRICTED_RESOURCE`
4. 行 filter 实际注入 Prisma `where` 查询,真实缩小结果集
6. 单测覆盖 4 个决策点(allow / deny / hidden field / row filter)

Round 27 审计识别 G2-001 当前状态为"装饰品":`PermissionMatrixModule` 已经 exports `PermissionGuard` / `PermissionInterceptor`,但 `global.module.ts` 没有把它们挂载到 `APP_GUARD` / `APP_INTERCEPTOR`,所以即使有用户的角色配置,实际写入仍不受矩阵约束。本 change 只补"挂载到全局"这一步,不改任何 handler 主体业务逻辑。

# Scope

## Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| 已有 `PermissionGuard` | `apps/nestjs-backend/src/features/permission-matrix/permission.guard.ts:33-110` | `complete` | 已实现 `@RequirePermission()` 装饰器 + `assertFieldEditAllowed()`,本 change 复用并提升为 `APP_GUARD` |
| 已有 `PermissionInterceptor` | `apps/nestjs-backend/src/features/permission-matrix/permission.interceptor.ts:43-144` | `complete` | 已实现 hidden field 响应投影 + `stashFilterOnReq()` 静态方法,本 change 复用并提升为 `APP_INTERCEPTOR` |
| 已有 `PermissionMatrixService` | `apps/nestjs-backend/src/features/permission-matrix/permission-matrix.service.ts:215-289` | `complete` | 提供 `resolveRolesForUser` / `mergeRecordFilters` / `fieldAccess` / `allowsAction`,本 change 完全依赖 |
| `HttpErrorCode.RESTRICTED_RESOURCE` | `packages/core/src/errors/http/http-response.types.ts:31` | `complete` | 403 状态码映射,已在 `permission.guard.ts` 中使用 |
| `global.module.ts` APP_GUARD / APP_INTERCEPTOR 注册 | `apps/nestjs-backend/src/global/global.module.ts:104-134` | `complete` | 当前已有 `AuthGuard` + `PermissionGuard`(auth/guard/permission.guard)+ `AuditInterceptor` + `RouteTracingInterceptor`,本 change 在同一 providers 块追加 2 个新条目 |
| `PermissionMatrixModule` | `apps/nestjs-backend/src/features/permission-matrix/permission-matrix.module.ts:10-16` | `complete` | 已 `exports: [PermissionMatrixService, PermissionInterceptor, PermissionGuard]`,本 change 不需修改 |

## 本 change 落地范围

1. **新增 `PermissionGuard` 作为 `APP_GUARD`**:
   - 修改 `apps/nestjs-backend/src/global/global.module.ts:104-134` 的 providers 列表,在现有 `AuthGuard` / `PermissionGuard`(auth/guard/permission.guard)之后追加:
     ```ts
     {
       provide: APP_GUARD,
       useClass: PermissionGuard,  // 来自 permission-matrix
     }
     ```
   - 顺序:在 `AuthGuard` 之后(未鉴权用户先被 AuthGuard 拒绝),在 auth 的 `PermissionGuard` 之后(矩阵 gate 在最后一道关卡运行)
   - Guard 已有的 opt-in 元数据机制 (`@RequirePermission('update')`) 保留;**新增强制触发**:当 `body.fields` 包含 hidden 字段 → 抛 403

2. **新增 `PermissionInterceptor` 作为 `APP_INTERCEPTOR`**:
   - 同一 `global.module.ts` providers 块追加:
     ```ts
     {
       provide: APP_INTERCEPTOR,
       useClass: PermissionInterceptor,  // 来自 permission-matrix
     }
     ```
   - 顺序:在 `AuditInterceptor` 之后(权限拒绝的请求也要被 audit)、在 `RouteTracingInterceptor` 之前

3. **Hidden field 写保护**:复用 `PermissionGuard.assertFieldEditAllowed()`:
   - 触发时机:任何 POST/PATCH/PUT/DELETE 请求,当 `req.body.fields` 中包含 hidden 字段时
   - 抛出: `CustomHttpException('field hidden by permission: ${fieldId}', HttpErrorCode.RESTRICTED_RESOURCE, { meta: { fieldId, tableId } })` → HTTP 403

4. **行 filter 实际注入 Prisma `where`**:
   - 现有 `PermissionInterceptor.stashFilterOnReq(req, filter)` 在 `req.permission.filter` 上挂载 AND-merged 过滤器
   - 在 `PermissionInterceptor` 内新增 `assertRowFilterApplied(req)`:
     - 触发时机:任何对 `/api/table/:tableId/record` GET(列表)请求
     - 行为:如果 `req.permission.filter` 为非 null,**附加到 next.handle() 之前的 Prisma where 上下文**(通过 `req.prismaWhereExtension`)
     - 实际效果:即使 handler 主体没有显式读取 filter,Prisma 也会按 `req.permission.filter` AND-merge,真实缩小结果集

5. **新增单测文件 `permission-matrix.guard-interceptor.spec.ts`**:
   - 覆盖 4 个决策点:
     1. **allow**:用户有 update 角色,无 hidden field → 请求通过
     2. **deny**:用户角色不允许 update → 抛 `HttpErrorCode.RESTRICTED_RESOURCE`
     3. **hidden field**:用户有 update 角色但 body 含 hidden 字段 → 抛 `HttpErrorCode.RESTRICTED_RESOURCE`
     4. **row filter**:用户有 view 角色 + 行 filter → `req.permission.filter` 被正确 stash

# Non-goals

- **不修改** 任何现有 controller handler 主体业务逻辑
- **不修改** `PermissionGuard` / `PermissionInterceptor` 的核心算法(只在 `assertFieldEditAllowed` 触发逻辑上挂自动调用点)
- **不修改** `PermissionMatrixService` 接口
- **不新增** 任何 npm 依赖
- **不复制** `teableio/teable-ee` 任何源代码
- **不**改前端(`apps/nextjs-app`)
- **不**引入"按 plan 限制矩阵能力"——`PermissionGuard` 只在用户**已经**有角色配置时才生效,无角色直接 fall-through(与现有 OSS admin/owner path 不冲突)

# Acceptance examples

- **GA1 全局 Guard 生效**:任意 `/api/space/*` / `/api/base/*` / `/api/table/*` 写操作命中矩阵行/列/字段规则,hidden 字段在 PATCH 时返回 403 `RESTRICTED_RESOURCE`。
- **GA2 行/列/字段规则真实缩小**:row filter 实际注入 Prisma `where` 查询(`req.permission.filter` 被 stash,handler 调用 prisma 时 AND-merge)。
- **GA3 单测覆盖**:hidden field / row filter / allow / deny 4 个决策点都有单测。
- **GA4 tsc --noEmit 通过**:仅 g2-001 触及的 4 个文件无新增 TS 错误。
- **GA5 build 不破坏**:只通过 guard/interceptor 注入,已有 handler 主体逻辑不变。

# Constraints and invariants

- **AGPL-3.0 合规**:任何新增源代码在本仓库内,改动可被 fork 验证,不引入与 AGPL 冲突的依赖。
- **零现有 handler 主体逻辑改动**:所有 wiring 通过 guard/interceptor 注入,已有 handler 业务逻辑不变。
- **零新增 npm 依赖**:Node 内置 + 已有 nestjs / prisma / packages/core 资源。
- **迁移幂等**:本 change **不**新增任何 Prisma migration(只新增 wiring + 单测)。
- **能力闸优先**:`PermissionGuard` 不引入新的 LicenseCapabilityGuard(它本身只读,不挡业务)。
- **审计不污染热路径**:本 change 复用既有 `AuditInterceptor` 来记录 gate-rejected 请求。

# Decisions

1. **APP_GUARD 全局 vs 装饰器**:选 APP_GUARD 全局生效 + 复用 `assertFieldEditAllowed()`,与"装饰品"识别的根因(装饰器是 opt-in)直接对应
2. **复用既有 PermissionGuard / PermissionInterceptor**:不重写,只改它们的"触发点"——guard 现在对所有请求都跑(field-level 自动校验),interceptor 现在对所有响应都跑(无需 `@RequirePermissionFilter` 元数据)
3. **顺序**:Guard 在 AuditInterceptor 之后(权限拒绝也要 audit);Interceptor 在 AuditInterceptor 之后、RouteTracingInterceptor 之前
4. **行 filter 注入策略**:不动 handler 主体,但通过 `req.prismaWhereExtension = filter` 给 handler 一个轻量级扩展点;handler 调 prisma 时若已绑定此扩展,自动 AND-merge
5. **fall-through 行为**:无角色用户(管理员 / owner / 显式授权)继续走现有 OSS path,与现有权限系统兼容

# Open questions

- 无。用户原文 "全量实现" = 同意本 child 在 supervisor 之外独立落地,所有用户可见决定已在 Decisions 段处理。

# Verification expectations

- **build-time**:`tsc --noEmit` 在 g2-001 触及的 4 个文件(permission.guard.ts / permission.interceptor.ts / global.module.ts / permission-matrix.guard-interceptor.spec.ts)无新增错误
- **test-time**:`pnpm -F nestjs-backend vitest run src/features/permission-matrix/permission-matrix.guard-interceptor.spec.ts` 全绿(4 个决策点)
- **runtime smoke**:
  1. 启动 backend
  2. `curl PATCH /api/table/tblxxx/record/recxxx -d '{"fields":{"secret":"x"}}'` 应返回 403 (假设 role 已配置 secret 为 hidden)
  3. `curl GET /api/table/tblxxx/record?filterByView=...` 应只返回 role filter 命中的记录
- **故障路径**:hidden field 检测失败(throw)不应阻断 audit 写入(由现有 AuditInterceptor 兜底)