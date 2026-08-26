# Outcome

把 Wave N2 商业版企业能力的 NestJS `@Module` 已在 `features/` 但未在 `app.module.ts` 注册的模块一次性激活,补齐 Round 26 识别的"36 个 module 文件未被 app.module.ts 引用"中企业能力类的全部缺口。最终交付是**单 PR commit**,merge 到目标分支 `agent/chong/df9d120d2105-stage6-audit-log`。

# Scope

## Source coverage

> 来源:LUM-18 Round 26 / Round 28 实证:实测 ~36 个 module 文件未在 `app.module.ts` 出现。Wave N1 (g2-006,已完成 merge) 处理安全/合规/计费 8 个,Wave N2 (本 change) 处理企业能力 ~15 个。均为本仓库 OSS 已有源代码,**不复制** `teableio/teable-ee`。

| 来源 module | 当前状态 | 落地动作 |
|------|------|------|
| `database-view` (SQL 数据库视图) | service + module 已写,无挂载 | AppModule `imports` |
| `graph` (关系图视图) | service + module 已写,无挂载 | AppModule `imports` |
| `calculation` (公式计算核心) | 6 service + module 已写,无挂载 | AppModule `imports` |
| `data-loader` (GraphQL 数据加载) | service + module 已写,无挂载 | AppModule `imports` |
| `table-domain` (DDD table 聚合) | service + module 已写,无挂载 | AppModule `imports` |
| `record` (record CRUD 域) | service + module 已写,无挂载 | AppModule `imports` |
| `record-modify` (record 修改 helper) | service + module 已写,无挂载 | AppModule `imports` |
| `computed` (计算字段引擎) | service + module 已写,无挂载 | AppModule `imports` |
| `record-query-builder` (查询构造器) | service + module 已写,无挂载 | AppModule `imports` |
| `record-open-api` (record open-api controller) | controller + module 已写,无挂载 | AppModule `imports` |
| `table` (table CRUD 域) | service + module 已写,无挂载 | AppModule `imports` |
| `table-open-api` (table open-api controller) | controller + module 已写,无挂载 | AppModule `imports` |
| `model` (Model 抽象层) | service + module 已写,无挂载 | AppModule `imports` |
| `view` (View 抽象层) | service + module 已写,无挂载 | AppModule `imports` |
| `view-open-api` (view open-api controller) | controller + module 已写,无挂载 | AppModule `imports` |

## 本 change 落地范围

每个 module 接线动作:**在 `app.module.ts` 的 `imports` 数组里追加对应 import + module 名**(共 15 个 module)。同时:

- 解决任何模块间的循环依赖(用 `forwardRef` 或调整 import 顺序)
- 确保每个 module 的依赖(其他 module / service)都已注册或可见
- 保留所有现有 module 的注册顺序与行为

每个 module 都遵守以下约束:
- AGPL-3.0:不复制 `teableio/teable-ee`
- 零现有热路径改动:已有 handler / service / controller 主体不变,只动 `app.module.ts` 的 imports 段
- 零新增 npm 依赖
- License capability gate:如新模块需要商业版独占路由,在 controller 上挂 `LicenseCapabilityGuard.for(...)`(本 change 不主动引入新端点,只解决 module-level 接线;若发现新 module 的 controller 已有 admin-only 路由,在该路由加 guard,但不修改 controller 内部)

# Non-goals

- **不复制** `teableio/teable-ee` 任何源代码
- **不**新增 npm 依赖
- **不**修改 module 内部 service / controller 实现
- **不**做 UI(前端 `apps/nextjs-app` 不动)
- **不**新增 Prisma migration(只调整 module 接线,不改 schema)
- **不**新增 open-api controller 路由(只注册已有 module)
- **不**处理 Wave H 漏接模块(`webhook-*` / `byok-*` / `kms-encryption` / `workspace-mirror` / `dr-canvas`,那是 g2-008 scope)

# Acceptance examples

- **GA1 15 个 module 全部在 `app.module.ts` 出现**:grep `imports: \[` 段应包含 DatabaseViewModule、GraphModule、CalculationModule、DataLoaderModule、TableDomainQueryModule、RecordModule、RecordModifyModule、ComputedModule、RecordQueryBuilderModule、RecordOpenApiModule、TableModule、TableOpenApiModule、ModelModule、ViewModule、ViewOpenApiModule
- **GA2 build 不破坏**:`pnpm -F nestjs-backend build` 整体成功
- **GA3 tsc 不破坏**:`pnpm -F nestjs-backend exec tsc --noEmit` 0 error
- **GA4 单测全绿**:`pnpm -F nestjs-backend exec vitest run` 0 失败(或与 baseline 持平)
- **GA5 启动冒烟**:`node dist/index.js` 启动后 `/health` 200 + Nest 应用日志无 UnhandledModuleError
- **GA6 路由可达**:基础路由(`/api/space/...`,`/api/base/...`,`/api/table/...`)在新接线后仍能响应(不回归)
- **GA7 既有 round-26 测试仍通过**:`apps/nestjs-backend/src/features/license/__tests__/e2e-business-enterprise-smoke.spec.ts` 全绿

# Constraints and invariants

- **AGPL-3.0 合规**:任何新增源代码在本仓库内
- **零现有热路径改动**:已有 handler / controller 主体逻辑不变
- **零新增 npm 依赖**
- **迁移幂等**:本 change **不**新增 Prisma migration
- **DI 优先**:新增 module 用 NestJS 标准 `@Module({})` 装饰器,避免手写 DI token
- **循环依赖**:如检测到循环依赖,优先用 `forwardRef`,不引入新机制

# Decisions

1. **Wave N2 = 15 module**:本 change 只做企业能力 module 接线,Wave H (g2-008) 处理 4 大业务域(Webhook/BYOK/KMS/DR)
2. **module 顺序按依赖层排序**:`table-domain` → `record` → `view` → `model` → 域外 module(database-view / graph / calculation / data-loader)→ open-api controllers(避免 forwardRef)
3. **既有 open-api controller 不重命名**:`RecordOpenApiModule` / `TableOpenApiModule` / `ViewOpenApiModule` 沿用现有命名,不新建别名
4. **不修改 license-capability.service.ts**:除非新 module 引入了新 license capability 名,否则不改 capability 表(本 change 范围内不需要新 capability)
5. **单 PR commit**:与 g2-006 一致,所有 module 接线合并为 1 个 commit 便于 revert / cherry-pick

# Open questions

- 无。用户原文 "全量实现" = 同意本 child 在 supervisor 之外独立落地。

# Verification expectations

- **build-time**:`pnpm -F nestjs-backend build` 整体成功
- **type-time**:`pnpm -F nestjs-backend exec tsc --noEmit` 0 error
- **test-time**:`pnpm -F nestjs-backend exec vitest run` 全绿(包含 g2-005 落地的 39 个 e2e-business-enterprise-smoke 用例)
- **runtime smoke**:
  1. 启动 backend
  2. `grep -E "(DatabaseViewModule|GraphModule|CalculationModule|DataLoaderModule|TableDomainQueryModule|RecordModule|RecordModifyModule|ComputedModule|RecordQueryBuilderModule|RecordOpenApiModule|TableModule|TableOpenApiModule|ModelModule|ViewModule|ViewOpenApiModule)" apps/nestjs-backend/src/app.module.ts` → ≥ 15 行
  3. `curl http://127.0.0.1:3000/health` → 200
  4. `curl http://127.0.0.1:3000/api/space/xxx -H "Authorization: Bearer ..."` → 401/200(既有路由不回归)
