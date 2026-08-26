# Outcome

把 Wave H 漏接的 4 大业务域(Webhook / BYOK / KMS / DR)在目标分支的 nestjs-backend 中**完整引入并接线激活**:8 个独立 NestJS 模块目录 × 4 文件(`*.module.ts` / `*.service.ts` / `*.auth.service.ts` / `*.types.ts`)+ 对应 spec,共 32+ 个新文件,然后在 `app.module.ts` 注册并接好 license capability gate。最终交付是**单 PR commit**,merge 到目标分支 `agent/chong/df9d120d2105-stage6-audit-log`。

# Scope

## Source coverage

> 来源:LUM-18 Wave H 阶段(Stage 50 / 53 / 61 / 62 / 66)已经在 supervisor 分支 `comet/teable-oss-vs-cloud-gap-fill` 实现了这 8 个 service/auth.service/types 单元,但**没有 `*.module.ts` NestJS 包装**,也**没有在 `app.module.ts` 注册**。本 change 把这些 service 重新落到目标分支,创建 NestJS module 包装,接 license capability gate。
>
> 不复制 `teableio/teable-ee`。源实现细节参考 supervisor 分支对应的 `apps/nestjs-backend/src/features/<module>/` 目录。

| 来源 module | Wave H 阶段 | 目标分支状态 | 落地动作 |
|------|------|------|------|
| `webhook-delivery` | Stage 53 | service 已写,无 module | 创建 `webhook-delivery.module.ts` + AppModule 注册 + LicenseCapabilityGuard (`webhook`) |
| `webhook-bridge` | Stage 62 | service 已写,无 module | 创建 `webhook-bridge.module.ts` + AppModule 注册 + LicenseCapabilityGuard (`webhook`) |
| `webhook-canvas` | Stage 62 (UI orchestration) | service 已写,无 module | 创建 `webhook-canvas.module.ts` + AppModule 注册 + LicenseCapabilityGuard (`webhook`) |
| `byok-llm` | Stage 66 | service 已写,无 module | 创建 `byok-llm.module.ts` + AppModule 注册 + LicenseCapabilityGuard (`byok_llm`) |
| `byok-kms` | Stage 66 | service 已写,无 module | 创建 `byok-kms.module.ts` + AppModule 注册 + LicenseCapabilityGuard (`byok_kms`) |
| `kms-encryption` | Stage 50 | service 已写,无 module | 创建 `kms-encryption.module.ts` + AppModule 注册 + LicenseCapabilityGuard (`kms_encryption`) |
| `workspace-mirror` | Stage 61 (DR 副本) | service 已写,无 module | 创建 `workspace-mirror.module.ts` + AppModule 注册 + LicenseCapabilityGuard (`workspace_mirror`) |
| `dr-canvas` | Stage 61 (UI orchestration) | service 已写,无 module | 创建 `dr-canvas.module.ts` + AppModule 注册 + LicenseCapabilityGuard (`workspace_mirror`) |

## 本 change 落地范围

每个 module 落地动作:

1. **创建 4 文件**(`*.module.ts` / `*.service.ts` / `*.auth.service.ts` / `*.types.ts`)— 可从 supervisor 分支的对应目录复制,但需保证 import 路径与目标分支一致(`@teable/db-main-prisma` 等已在本仓库)
2. **创建对应 `*.service.spec.ts`** — 至少 5 个 vitest it 覆盖核心 service 方法
3. **NestJS `@Module({})` 包装** — `providers: [Service, AuthService]`,`exports: [Service, AuthService]`(供未来 feature 注入)
4. **AppModule `imports` 注册** — 8 个 module 全部加入,顺序按业务依赖(Webhook 子模块优先 → BYOK → KMS → DR)
5. **License capability gate** — `license-capability.service.ts` 的 `PLAN_CAPABILITIES.business/.enterprise` 集合新增 4 个 capability 名:`webhook` / `byok_llm` / `byok_kms` / `kms_encryption` / `workspace_mirror`(共 5 个,dr-canvas 与 workspace-mirror 共享 `workspace_mirror` capability)
6. **既有 controller 接入**(如有 admin 路由):在已存在的 controller(若 supervisor 分支已有)上挂 `LicenseCapabilityGuard.for(...)`;**若目标分支没有 controller**,则不主动新增 controller(本 change 只做 module 接线 + 服务可注入,新增端点留作未来 change)

每个 module 都遵守以下约束:
- AGPL-3.0:不复制 `teableio/teable-ee`
- 零现有热路径改动:已有 handler 主体逻辑不变
- 零新增 npm 依赖
- service 实现只做必要迁移,不改 service 内部行为(从 supervisor 复制下来的 service 直接用)

# Non-goals

- **不复制** `teableio/teable-ee` 任何源代码
- **不**新增 npm 依赖
- **不**修改 supervisor 已落地的 service 内部实现
- **不**新增 Prisma migration
- **不**做 UI(前端 `apps/nextjs-app` 不动)
- **不**实现完整 DR 双向同步(只完成 module 接线 + 占位 service;真实 DR 复制流程是后续 wave)
- **不**处理 g2-007 范围内的 N2 module 接线

# Acceptance examples

- **GA1 8 个 module 目录全部存在**:`apps/nestjs-backend/src/features/{webhook-delivery,webhook-bridge,webhook-canvas,byok-llm,byok-kms,kms-encryption,workspace-mirror,dr-canvas}/` 各自有 `*.module.ts`
- **GA2 8 个 module 全部在 `app.module.ts` 出现**:grep imports 段至少含 8 行新 module 名
- **GA3 license capability 表扩展**:`PLAN_CAPABILITIES.business` 和 `.enterprise` 至少含 `webhook` / `byok_llm` / `byok_kms` / `kms_encryption` / `workspace_mirror`(共 5 个 capability)
- **GA4 build 不破坏**:`pnpm -F nestjs-backend build` 整体成功
- **GA5 tsc 不破坏**:`pnpm -F nestjs-backend exec tsc --noEmit` 0 error
- **GA6 单测全绿**:`pnpm -F nestjs-backend exec vitest run` 0 失败(包括新 module 的 spec)
- **GA7 新 module 可注入**:在已有 controller(如 `admin-open-api.controller.ts`)里 `constructor(private readonly webhookDeliveryService: WebhookDeliveryService)` 不报 DI 错误
- **GA8 既有 round-26 测试仍通过**:`e2e-business-enterprise-smoke.spec.ts` 全绿

# Constraints and invariants

- **AGPL-3.0 合规**:任何新增源代码在本仓库内
- **零现有热路径改动**:已有 handler / controller 主体不变
- **零新增 npm 依赖**
- **迁移幂等**:本 change **不**新增 Prisma migration
- **DI 优先**:用 NestJS 标准 `@Module({})`,避免手写 provider token
- **service 复制保真**:从 supervisor 分支复制 service 时,直接 `git show comet/teable-oss-vs-cloud-gap-fill:apps/nestjs-backend/src/features/<module>/<service>.ts` 落地,不改一行

# Decisions

1. **Wave H = 8 module, 5 capability**:本 change 处理 8 个 service 域 + 5 个新 license capability,Wave N2 (g2-007) 处理 15 个企业能力 module
2. **service 复制自 supervisor**:用 `git show` 直接拉 supervisor 分支的 service / auth.service / types / spec 文件,不重写
3. **新增 5 个 capability 名**:`webhook` / `byok_llm` / `byok_kms` / `kms_encryption` / `workspace_mirror`(dr-canvas 共享 workspace-mirror capability)
4. **不新增 controller**:本 change 只做 module 接线 + 服务可注入;admin 路由(如 `/api/admin/webhook-config`)留作后续 wave
5. **单 PR commit**:与 g2-006 / g2-007 一致,所有 module 接线合并为 1 个 commit

# Open questions

- 无。用户原文 "全量实现" = 同意本 child 在 supervisor 之外独立落地。

# Verification expectations

- **build-time**:`pnpm -F nestjs-backend build` 整体成功
- **type-time**:`pnpm -F nestjs-backend exec tsc --noEmit` 0 error
- **test-time**:`pnpm -F nestjs-backend exec vitest run` 全绿(包含 8 个新 module 的 spec + 既有 g2-005 e2e)
- **runtime smoke**:
  1. 启动 backend
  2. `ls apps/nestjs-backend/src/features/{webhook-delivery,byok-llm,kms-encryption,workspace-mirror}/` → 8 个目录均存在
  3. `grep -E "(WebhookDeliveryModule|WebhookBridgeModule|WebhookCanvasModule|ByokLlmModule|ByokKmsModule|KmsEncryptionModule|WorkspaceMirrorModule|DrCanvasModule)" apps/nestjs-backend/src/app.module.ts` → 8 行
  4. `grep -E "(webhook|byok_llm|byok_kms|kms_encryption|workspace_mirror)" apps/nestjs-backend/src/features/license/license-capability.service.ts` → ≥ 5 个新 capability 名
  5. `curl http://127.0.0.1:3000/health` → 200
