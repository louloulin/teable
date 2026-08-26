# Outcome

OSS / Standalone 自部署用户升级到 business / enterprise plan 后,所有付费档位独占功能都应真实可用,而不是"挂在路由上但运行时永远抛 402 LICENSE_REQUIRED"。本次落地用一整套端到端冒烟测试,覆盖 LicenseCapabilityService 的能力矩阵、LicenseCapabilityGuard 在 5 个 plan 下的真实放行/拦截、PlanLimits 在 business / enterprise 下的精确阈值。冒烟全部命中意味着付费档位的核心商业能力在 OSS 自部署场景下功能闭环、零隐藏回归。

# Scope

1. **`business-plan-smoke`** — `LicenseCapabilityService.snapshot()` 在 plan=business 下,对所有 business 独占 capability(sso / permission_matrix / custom_app_domain / custom_domain / admin_panel / users_read / spaces_read / templates_read / quota_view / automation / webhook / audit_log_query)返回 `true`,对 free-only 之外的零星 capability 仍按既有规则返回。
2. **`enterprise-plan-smoke`** — 在 plan=enterprise 下,所有 capability 全部 `true`(enterprise 是全集)。
3. **`license-required-guard`** — `LicenseCapabilityGuard('sso')` 在 plan=free / plan=pro 下抛 `HttpErrorCode.LICENSE_REQUIRED` 或对应 402;在 plan=business / plan=enterprise 下放行(canActivate=true,不抛)。
4. **`plan-limits-business`** — 在 plan=business 下,`IResolvedLicense.effectiveLimits` 的 rowLimit / attachmentByteLimit / automationRunLimit / aiCreditLimit / apiRequestLimitPerSec 与 `quota.constants.ts` PLAN_LIMITS.business 完全一致(200_000 行免费档上限示例)。
5. **`plan-limits-enterprise`** — 在 plan=enterprise 下,所有 limit 字段均为 null(unlimited),且 `QuotaService.consume()` 走 `isUnlimited()` 提前 return,不进入额度计算。
6. **`pro-plan-downgrade-smoke`** — plan=pro 时,所有 business-only capability(sso / permission_matrix / admin_panel / automation / webhook / audit_log_query / users_read / spaces_read / templates_read)必须为 `false`,否则 G2-005 视为失败。
7. **`self-hosted-zero-impact`** — plan=self_hosted(OSS 干净环境)下,`LicenseCapabilityService.snapshot()` 返回全部 `false`,但 `LicenseCapabilityGuard.canActivate()` 必须放行(OSS 守门不挡)。`self_hosted` 与 `free` 的关键差异:free 也会抛 402,`self_hosted` 不抛。
8. **`smoke-runner`** — 一个 vitest 套件 `e2e-business-enterprise-smoke.spec.ts`,以 in-memory Prisma 模拟 license 解析,通过 `LicenseService.resolve()` 注入 plan=free/pro/business/enterprise/self_hosted 5 套 fixture,跑完全部 7 个 smoke 检查,全部通过。
9. **`docs-snapshot`** — 把 capability 矩阵从 `license-capability.service.ts` 抄到 `docs/comet/changes/g2-005-business-enterprise-e2e-smoke/capability-matrix.md`,作为本 change 的可读验收索引;后续 G2-010 回归会引用此文件。

# Non-goals

- 不重写 LicenseCapabilityService / LicenseCapabilityGuard / LicenseService 的实现逻辑(零现有 handler 主体改动)。
- 不写 Playwright / 浏览器层 E2E(本次仅 NestJS 层)。
- 不动 Stripe / billing / 计费逻辑(stripe-webhook / storage-metering 已 Stage 81/83 落地,不在本 G2 范围)。
- 不动 free / pro 的 capability 边界(只验证不变)。
- 不补 enterprise 独占 capability(目前 enterprise 与 business 共用同一 capability 集合,这是设计意图,本 G2 不引入新 capability)。
- 不写 live infra 真后端冒烟(本仓库没有 Postgres + Redis 测试实例,smoke 在 vitest 进程内跑)。

# Acceptance examples

- **A1** `LicenseCapabilityService.snapshot()` plan=business 时,sso=true / permission_matrix=true / admin_panel=true / automation=true / webhook=true / audit_log_query=true。
- **A2** `LicenseCapabilityService.snapshot()` plan=enterprise 时,所有 capability 全部 true。
- **A3** `LicenseCapabilityService.snapshot()` plan=pro 时,sso=false / permission_matrix=false / admin_panel=false / automation=false / webhook=false / audit_log_query=false(严格不允许破线)。
- **A4** `LicenseCapabilityService.snapshot()` plan=free 时,仅 ai_chat=true,其余付费 capability 全部 false。
- **A5** `LicenseCapabilityGuard('sso').canActivate()` 在 plan=free / plan=pro 下抛 `HttpErrorCode.LICENSE_REQUIRED`(或对应 402 状态);plan=business / plan=enterprise / plan=self_hosted 下不抛、放行。
- **A6** `LicenseCapabilityGuard('automation').canActivate()` 在 plan=business 下放行,在 plan=pro 下抛 402。
- **A7** `LicenseService.resolve({ token: 'plan:business' })` 返回 `{ source: 'env', claims: { plan: 'business', expiresAt: 0 }, effectiveLimits: PLAN_LIMITS.business }`,effectiveLimits.rowLimit=1_000_000、attachmentByteLimit=100GB、automationRunLimit=100_000、aiCreditLimit=2_000、apiRequestLimitPerSec=100(具体阈值以 quota.constants.ts PLAN_LIMITS.business 为准)。
- **A8** `LicenseService.resolve({ token: 'plan:enterprise' })` 返回 effectiveLimits 全字段 null;`QuotaService.consume({ plan: 'enterprise', ... })` 命中 `isUnlimited()`,不抛 QuotaExceededException。
- **A9** `LicenseService.resolve({ token: 'plan:self_hosted' })` 返回 effectiveLimits 全字段 null,且 `isUnlimited()` 仍返回 true;CapabilityGuard 全放行(OSS 守门不挡)。
- **A10** 5-plan 全集 smoke 跑通:同一个 vitest 测试文件,5 个 describe block × 7 个 smoke 检查 = 至少 35 个 `it()`,全部 passed。
- **A11** `git diff agent/chong/df9d120d2105-stage6-audit-log --name-only` 显示只新增 source / spec 文件,无既有 handler 主体逻辑改动。
- **A12** `git diff` 显示 0 个 `package.json` / `pnpm-workspace.yaml` 改动。
- **A13** `e2e-business-enterprise-smoke.spec.ts` 至少 35 个 `it` 全绿,无 skipped / todo。

# Constraints and invariants

- **AGPL-3.0 合规**:所有新增源代码留在本仓库内,不能从商业版 teable-ee 复制代码。
- **零现有热路径改动**:不修改 `LicenseCapabilityService` / `LicenseCapabilityGuard` / `LicenseService` / `QuotaService` 主体;只新增 fixture / spec / runner。
- **零新增 npm 依赖**:用 vitest + 既有 in-memory Prisma 模式(Stage 94 / 99-102 已就绪)。
- **OSS 零回归**:plan=self_hosted(默认无 license)下的 CapabilityGuard 行为不变(放行);冒烟测试不能引入新阻塞。
- **运行时 0 副作用**:smoke 测试不应启动 live backend / Postgres / Redis;全部 vitest 进程内。
- **可观察**:`docs/comet/changes/g2-005-business-enterprise-e2e-smoke/capability-matrix.md` 文件存在,内容是从 `license-capability.service.ts` 自动生成 + 手工标注 free/pro/business/enterprise/self_hosted 列。

# Decisions

- **D1** Smoke 测试用 vitest + in-memory Prisma(Stage 94 e2e-test-utils + Stage 99 supertest-helper + Stage 100 e2e-fixture-replay 既有 harness),不引入 supertest / axios 真 HTTP 请求。
- **D2** Smoke runner 写在 `apps/nestjs-backend/src/features/license/__tests__/e2e-business-enterprise-smoke.spec.ts`,与 `license-capability.service.spec.ts` / `license.service.spec.ts` 同目录,便于与既有单测一起跑。
- **D3** capability 矩阵文档(`capability-matrix.md`)作为可读验收索引,不内嵌到 brief — brief 已经在用 markdown 表格。
- **D4** Verifier 需要独立 grep + Read + vitest,不能信任 builder handoff 的"passed"声明。
- **D5** Live infra 真实 E2E(curl 启动后端、设置 TEABLE_LICENSE_KEY=plan:business 后访问 /api/sso/* 看 200/402)被显式 defer 到 [env-limited],留给 G2-010 全局回归 + CI 阶段。
- **D6** 不修改 `LicenseCapabilityService.PLAN_CAPABILITIES` 表;若 G2-005 实施中发现 design gap(比如 enterprise 应独占某些 capability),不在本 change 解决,留后续独立 change。

# Open questions

无。所有用户可见行为已在 D1-D6 + Scope 中固定,无需新澄清。

# Verification expectations

- `pnpm -F nestjs-backend vitest run src/features/license/__tests__/e2e-business-enterprise-smoke.spec.ts` 报告 ≥35 个 `it()` 全部 passed。
- `pnpm -F nestjs-backend vitest run src/features/license/` 全绿,既有单测不回归。
- `pnpm -F nestjs-backend build` 成功。
- `tsc --noEmit` 在 smoke 文件上 0 新错误(既有 spec 文件的 jest.fn 命名空间错是 base 分支继承,不归本 change)。
- `git diff agent/chong/df9d120d2105-stage6-audit-log -- '**/package.json' pnpm-workspace.yaml` 输出为空。
- `git diff agent/chong/df9d120d2105-stage6-audit-log --name-only` 输出仅包含:`apps/nestjs-backend/src/features/license/__tests__/e2e-business-enterprise-smoke.spec.ts` + `apps/nestjs-backend/src/features/license/__tests__/license-plan-fixture.ts`(可选) + `docs/comet/changes/g2-005-business-enterprise-e2e-smoke/capability-matrix.md` + `docs/comet/changes/g2-005-business-enterprise-e2e-smoke/{brief.md,specs/...}`。

# [env-limited] items

- **L1** 启动 live backend + curl 真实 SSO 端点 + 设置 `TEABLE_LICENSE_KEY=plan:business` / `plan:free` 后访问同一 endpoint 比对响应:留给 G2-010 / CI 阶段(本仓库无可用 Postgres + Redis 测试实例)。

# Upstream fix included (Path 1 — 2026-08-26)

经用户在 Wave 2 派发后确认,G2-005 change 在保留"零既有 handler 主体改动"的同时,纳入以下两个最小上游修复:

1. **`LicenseCapabilityService` 缓存键修复**(原 commit `6ac0d9480`,本次 cherry-pick 进 worktree):
   - 原因:`Object.keys(PLAN_CAPABILITIES)` 返回 5 个 plan 名(`free`/`pro`/`business`/`enterprise`/`self_hosted`)而不是 capability 名,导致 `isEnabled('sso')` 永远返回 `false`,`snapshot()` 也永远返回全 false。这条 bug 也使预存在的 `license-capability.service.spec.ts` 在同一 base 上失败,确认它来自 base 而非本 change 引入。
   - 改动:新增 `ALL_CAPABILITIES` 常量(列出全部 `LicenseCapability`);`refresh()` 与 `snapshot()` 都改为迭代 `ALL_CAPABILITIES`。20 行新增 + 2 行修改,只动 `license-capability.service.ts`。
2. **`LicenseCapabilityGuard` 对 `self_hosted` 守门不挡**(本次新增):
   - 原因:OSS 默认无 license 安装的 plan 是 `self_hosted`,但当前 guard 在任意 plan × 任意 cap 上都抛 `LICENSE_REQUIRED`,导致 brief A9 不可满足,且与 `quota.interceptor.ts` 中 "OSS self-host 行为 = no enforcement" 的设计意图相悖。
   - 改动:`canActivate()` 在 `caps.currentPlan() === 'self_hosted'` 时直接返回 `true`,跳过 `require()`。约 +5 行,只动 `license-capability.guard.ts`。

两条改动都是"修 bug 性质",不是新增功能;G2-005 之后任何 change 都直接受益,无需重新声明。