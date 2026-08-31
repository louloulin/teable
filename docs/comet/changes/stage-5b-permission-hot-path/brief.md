# Outcome

把 Supervisor Change `teable-oss-vs-cloud-gap-fill` 中划定的 Stage 5b 在本 worktree 真实实现:把已经实现的 `PermissionInterceptor`(读路径)+ `PermissionGuard`(写路径)挂到 `record-open-api` 各 handler,让 hidden 字段在 list 响应中为 `null`、row filter 实际缩小 Prisma `where`、PATCH 写 hidden 字段返回 403。本 child 是 Supervisor acceptance `A3 / A10 / A11` 的最小真实落地。

# Scope

## Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Supervisor brief | `../teable-oss-vs-cloud-gap-fill/brief.md` §"Stage 5b" | `complete` | 范围与 A3 验收 |
| Supervisor spec | `../teable-oss-vs-cloud-gap-fill/specs/teable-oss-vs-cloud-gap-fill/spec.md` §3.4 | `complete` | 运行时行为契约 |
| 已落地 PermissionInterceptor | `apps/nestjs-backend/src/features/permission-matrix/permission.interceptor.ts` | `complete` | 读路径投影 |
| 已落地 PermissionGuard | `apps/nestjs-backend/src/features/permission-matrix/permission.guard.ts` | `complete` | 写路径 403 |
| 已落地 PermissionMatrixModule | `apps/nestjs-backend/src/features/permission-matrix/permission-matrix.module.ts` | `complete` | DI 容器 |

## Inherited constraints(来自 Supervisor)

- **AGPL-3.0 / 零 hot path 改动**:`record-open-api.service.ts` 的查询逻辑**主体不变**,仅在 read handler 入口读 `req.permission.filter` 并与现有 `where` AND 合并。
- **零新增 npm 依赖**。
- **能力闸**:`PermissionGuard` 自动 `LicenseCapabilityGuard.for('permission_matrix')`(已存在)。
- **零破坏**:已使用 record-open-api 的现有功能继续 work;Permission hot path 由 `@RequirePermissionFilter()` metadata opt-in 触发,**不**全局启用。

# Non-goals

- 不实现权限矩阵数据模型(已在 Stage 5)。
- 不实现 row filter DSL 扩展(已有 `PermissionMatrixService.mergeRecordFilters()`)。
- 不实现 stage-6 审计埋点(由 stage-6 负责)。

# Acceptance examples

- **A3** 权限矩阵热路径生效:
  1. 设 `TEABLE_LICENSE_KEY=plan:business`(已实现)。
  2. 创建 role `R1`,field `F1` access = `hidden`(已实现)。
  3. user `U1` 加入 `R1`,`GET /api/base/{base}/table/{table}/record` → 响应 records 中 `F1` = `null`(其他字段保留)。
  4. `PATCH /api/base/{base}/table/{table}/record/{id}` body 含 `fields.F1 = 'x'` → 403 `RESTRICTED_RESOURCE`(由 `PermissionGuard.assertFieldEditAllowed()`)。
  5. role `R1` 设 record filter `priority=low` → `GET /record?filter=priority=high` 实际 SQL `where` 含 `(priority='low') AND (priority='high')` → 0 行命中。
- **A10** Prisma migration 全部成功:本 child **不**新增 migration。
- **A11** 单测全绿:`pnpm -F nestjs-backend test` 0 失败;`record-open-api-permission-hot-path.spec.ts` 至少覆盖:hidden 字段被投影为 null / readonly 字段保留值 / row filter 注入 where / 写 hidden 字段 403。

# Constraints and invariants

- **opt-in 触发**:仅 `@RequirePermissionFilter()` 标记的 handler 才走 PermissionInterceptor。其他 handler 行为不变。
- **where 合并顺序**:`req.permission.filter` **AND** 现有 where(角色 filter 是 narrowing,不能 widen)。
- **失败拒绝**:写 hidden 字段 → 403 `RESTRICTED_RESOURCE`,**不**抛 500。

# Decisions

1. **挂载范围**:在 `record-open-api.controller.ts` 的 list/get handler 加 `@RequirePermissionFilter()`(读路径投影 + row filter);在 create/update/delete handler 顶层 `PermissionGuard` 校验。
2. **filter 注入**:新增 helper `applyPermissionFilter(req, where)`,在 read handler 中调,把 `req.permission.filter` 与现有 where 用 Prisma `AND` 合并。
3. **写路径校验**:`PermissionGuard` 已在 stage-5.2 落地;本 child 只挂到对应 handler,**不**改 `PermissionGuard` 内部。
4. **能力位**:`PermissionInterceptor` / `PermissionGuard` 必须经 `LicenseCapabilityGuard.for('permission_matrix')` 顶层。本 child **不**新增 capability 闸,使用既有 module-level `PermissionMatrixModule.imports` 含 LicenseModule 的链路。

# Open questions

- 无。

# Verification expectations

- 单元测试 `record-open-api-permission-hot-path.spec.ts` 覆盖4个决策点。
- 集成:启测试 license=business → seed role/field → 验证 list 响应 / 写 403 / filter SQL。
- `git diff comet/stage-5b-permission-hot-path..comet/teable-oss-vs-cloud-gap-fill` 仅本 child 改动文件。