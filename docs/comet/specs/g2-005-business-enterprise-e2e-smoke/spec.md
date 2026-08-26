# Spec — G2-005 business/enterprise plan 端到端冒烟

## 1. Purpose

OSS 自部署用户启用 `TEABLE_LICENSE_KEY=plan:business` / `plan:enterprise` 后,所有 business/enterprise 独占 capability 应当真实可用(没有运行时 402 拦截)。本 spec 定义一整套 vitest 进程内的端到端 smoke,覆盖 5 个 plan × 全部 capability × PlanLimits 阈值,确保付费档位闭环。

## 2. Surface

- 入口:`apps/nestjs-backend/src/features/license/__tests__/e2e-business-enterprise-smoke.spec.ts`
- 共享 fixture:`apps/nestjs-backend/src/features/license/__tests__/license-plan-fixture.ts`(可选,把 5 个 plan 的 IResolvedLicense 抽出来)
- 可读文档:`docs/comet/changes/g2-005-business-enterprise-e2e-smoke/capability-matrix.md`

## 3. Plan matrix (source of truth)

| Capability | free | pro | business | enterprise | self_hosted (OSS) |
| --- | :-: | :-: | :-: | :-: | :-: |
| ai_chat | ✓ | ✓ | ✓ | ✓ | (guard 放行,isEnabled=false 但不抛) |
| ai_field |  | ✓ | ✓ | ✓ |  |
| ai_app_builder |  | ✓ | ✓ | ✓ |  |
| cuppy_claw |  | ✓ | ✓ | ✓ |  |
| audit_log |  | ✓ | ✓ | ✓ |  |
| sso |  |  | ✓ | ✓ |  |
| permission_matrix |  |  | ✓ | ✓ |  |
| custom_app_domain |  |  | ✓ | ✓ |  |
| custom_domain |  |  | ✓ | ✓ |  |
| admin_panel |  |  | ✓ | ✓ |  |
| users_read |  |  | ✓ | ✓ |  |
| spaces_read |  |  | ✓ | ✓ |  |
| templates_read |  |  | ✓ | ✓ |  |
| ai |  |  | ✓ | ✓ |  |
| quota_view |  |  | ✓ | ✓ |  |
| automation |  |  | ✓ | ✓ |  |
| webhook |  |  | ✓ | ✓ |  |
| audit_log_query |  |  | ✓ | ✓ |  |

**关键不变量**:
- `LicenseCapabilityGuard.canActivate()` 对 `self_hosted` plan 永远返回 true(不抛),与 `isEnabled()=false` 共存(OSS 守门不挡)。
- `free` / `pro` plan 下的 guard 对 business-only capability 抛 `HttpErrorCode.LICENSE_REQUIRED`(对应 HTTP 402 PAYMENT_REQUIRED)。

## 4. Plan limits matrix (from `quota.constants.ts`)

| Plan | rowLimit | attachmentByteLimit | automationRunLimit | aiCreditLimit | apiRequestLimitPerSec |
| --- | --- | --- | --- | --- | --- |
| free | 1_000 | 1 GB | 100 | 200 | 10 |
| pro | 250_000 | 10 GB | 25_000 | 1_000 | 50 |
| business | 1_000_000 | 100 GB | 100_000 | 2_000 | 100 |
| enterprise | null | null | null | null | null |
| self_hosted | null | null | null | null | null |

> 实现以 `apps/nestjs-backend/src/features/quota/quota.constants.ts` PLAN_LIMITS 的真实值为准;若有调整,本 spec 必须同步更新。

## 5. Test layout

```
apps/nestjs-backend/src/features/license/__tests__/
├── e2e-business-enterprise-smoke.spec.ts   # 主入口
├── license-plan-fixture.ts                  # 共享 fixture
└── README.md                                # 用法说明(可选)
```

`e2e-business-enterprise-smoke.spec.ts` 必须包含 5 个 `describe` block × 7 个 smoke 检查:

### 5.1 `describe('business plan')`
- snapshot 包含全部 business-only capability 为 true
- `LicenseCapabilityGuard('sso').canActivate(ctx)` 不抛
- `LicenseCapabilityGuard('automation').canActivate(ctx)` 不抛
- `LicenseService.resolve({ token: 'plan:business' }).effectiveLimits` 与 PLAN_LIMITS.business 一致
- `LicenseService.resolve({ token: 'plan:business' }).source === 'env'`
- quota consume 不抛(行数 < 1_000_000)
- HTTP 200 模拟:在 in-memory controller 上挂 LicenseCapabilityGuard('sso'),请求应放行

### 5.2 `describe('enterprise plan')`
- snapshot 全部 capability 为 true
- 所有 guard 都放行
- effectiveLimits 全 null
- `isUnlimited(enterprise)` 各字段均为 true
- quota consume 不抛(无 cap 限制)
- 自定义"amount = 10^12 行"也放行(unlimited 路径)
- HTTP 200 模拟:全 capability guard 都放行

### 5.3 `describe('pro plan — business-only capability 严格不允许')`
- snapshot 中 sso=false / permission_matrix=false / admin_panel=false / automation=false / webhook=false / audit_log_query=false / users_read=false / spaces_read=false / templates_read=false
- `LicenseCapabilityGuard('sso').canActivate(ctx)` 抛 HttpErrorCode.LICENSE_REQUIRED
- `LicenseCapabilityGuard('automation').canActivate(ctx)` 抛 HttpErrorCode.LICENSE_REQUIRED
- `LicenseCapabilityGuard('webhook').canActivate(ctx)` 抛 HttpErrorCode.LICENSE_REQUIRED
- `LicenseCapabilityGuard('audit_log_query').canActivate(ctx)` 抛 HttpErrorCode.LICENSE_REQUIRED
- effectiveLimits 与 PLAN_LIMITS.pro 一致

### 5.4 `describe('free plan')`
- snapshot 中仅 ai_chat=true
- 其他付费 capability 全部 false
- `LicenseCapabilityGuard('sso').canActivate(ctx)` 抛 402
- effectiveLimits 与 PLAN_LIMITS.free 一致

### 5.5 `describe('self_hosted plan — OSS zero-impact')`
- snapshot 全部 capability 为 false
- `LicenseCapabilityGuard('sso').canActivate(ctx)` **不抛**(放行)
- `LicenseCapabilityGuard('automation').canActivate(ctx)` **不抛**(放行)
- `LicenseCapabilityGuard('webhook').canActivate(ctx)` **不抛**(放行)
- effectiveLimits 全字段 null
- 关键:这是 self_hosted 与 free 的本质区别 — free 会抛 402,self_hosted 不会

## 6. Acceptance IDs (13)

A1 - A13(详见 `docs/comet/changes/g2-005-business-enterprise-e2e-smoke/brief.md` 的 Acceptance examples)

## 7. Constraints

- 零既有 handler 主体改动。
- 零新增 npm 依赖。
- AGPL-3.0 合规,全部源码在本仓库。
- vitest in-process,不动 Postgres / Redis。

## 8. Out of scope

- Playwright / 真后端 / curl / live infra 烟测(defer 到 G2-010)。
- 改 LicenseCapabilityService.PLAN_CAPABILITIES 表(若需要新增 enterprise 独占 capability,留独立 change)。
- 写 CapabilityGuard 单元测试(已有 `license-capability.service.spec.ts`)。