# Outcome

把 Supervisor Change `teable-oss-vs-cloud-gap-fill` 中划定的 Stage 4.2 在本 worktree 真实实现:新增 BullMQ repeatable job,周期清理 `createdAt + 5min < now()` 的 `SsoLoginState` 行;启动时由 `app.module.ts` 自动 register。本 child 是 Supervisor acceptance `A9 / A10 / A11` 的最小真实落地。

# Scope

## Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Supervisor brief | `../teable-oss-vs-cloud-gap-fill/brief.md` §"Stage 4.2" | `complete` | 范围与 A9 验收 |
| Supervisor spec | `../teable-oss-vs-cloud-gap-fill/specs/teable-oss-vs-cloud-gap-fill/spec.md` §3.2 / §3.7 | `complete` | 行为契约 |
| 已落地 Stage 4 | commit `ad55ecaf4`(`SsoLoginState` 表) | `complete` | 事实基础 |
| BullMQ 复用 | `apps/nestjs-backend/src/features/v2/computed-outbox-trigger/bullmq-computed-outbox-wakeup.processor.ts` | `complete` | repeatable job 注册模式参考 |

## Inherited constraints(来自 Supervisor)

- **AGPL-3.0 / 零热路径改动**:`app.module.ts` 主体不变,新增 module 通过 `imports` 注册。
- **零新增 npm 依赖**:BullMQ + nestjs/bullmq + Prisma 已存在。
- **Prisma migration 幂等**:本 child **不**新增表。

# Non-goals

- 不实现 SSO callback 完整链路(由 `stage-4-1-sso-callback` 负责)。
- 不实现 SAML(由 `stage-9-saml-provider` 负责)。
- 不改 IdP discovery / metadata 拉取 / 验签核心。

# Acceptance examples

- **A9** SsoLoginState BullMQ 清理:超过 5 分钟的 state 行被删除,DB 中无残留。
  - 验证步骤:
    1. 在 DB 直接 `INSERT INTO sso_login_state (id, state, provider_id, organization_id, expires_at) VALUES ('sso_test_old', 'old_state', 'pid_acme', 'org_1', NOW() - INTERVAL '10 min');`
    2. 触发 cleanup job(在测试里直接调 `SsoLoginStateCleanupProcessor.process({})` 或手动 schedule 一次)。
    3. `SELECT COUNT(*) FROM sso_login_state WHERE id='sso_test_old'` → 0。
- **A10** Prisma migration 全部成功:本 child **不**新增 migration,既有 migration 顺序应用 0 失败。
- **A11** 单测全绿:`pnpm -F nestjs-backend test` 0 失败;`sso-login-state-cleanup.processor.spec.ts` 至少覆盖:空表 / 删除过期行 / 保留未过期行 / 不删 `consumed=true` 的过期行(便于审计)。

# Constraints and invariants

- **5 分钟 TTL**:与现有 `SSO_LOGIN_STATE_TTL_MS = 5 * 60 * 1000`(`sso.constants.ts`)保持一致;cleanup 阈值用同一常量,不引入新值。
- **job 触发周期**:每 1 分钟跑一次(`repeat: { every: 60_000 }`)。
- **幂等**:重复触发不留残留(用 `DELETE WHERE createdAt + interval '5 min' < now()`;不依赖 select + delete 二步)。
- **失败重试**:job 失败 → BullMQ 默认 3 次重试 + 指数退避,最终失败 → 入 DLQ(可选,本 child 仅日志告警,不实现 DLQ)。

# Decisions

1. **模块位置**:`apps/nestjs-backend/src/features/sso/sso-login-state-cleanup.processor.ts` + `sso-login-state-cleanup.module.ts`,挂 `SsoModule.imports`(SsoModule 现有)。
2. **cleanup 实现**:`prisma.ssoLoginState.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - SSO_LOGIN_STATE_TTL_MS) } } })` 单条 SQL,DELETE 原子,不 select-then-delete。
3. **保留 consumed=true 行**:cleanup 只按 createdAt 切,不过滤 `consumed`;审计角度 `consumed=true` 的过期行也是清理目标(它表示 callback 已完成,state 行再无用途)。这一决策与 Supervisor brief 不冲突(Spec §3.2 第 6 步:state 消费后无新作用)。
4. **启动注册**:`SsoModule` 在 `onModuleInit` hook 调 `cleanupQueue.add('cleanup', {}, { repeat: { every: 60_000 } })`;关闭时调 `cleanupQueue.close()`。
5. **并发**:`concurrency = 1`(清理任务串行避免锁竞争)。

# Open questions

- 无。所有 stage-4.2 行为已在 Supervisor brief / spec 中固化。

# Verification expectations

- 单元测试 `sso-login-state-cleanup.processor.spec.ts` 覆盖:
  - 空表 → deleteMany 调 0 次返回 0。
  - 过期未消费行被删。
  - 未过期行被保留。
  - 过期但 consumed=true 行也被删。
- 端到端:启 nestjs-backend → 等 1 分钟(测试中可用 `@nestjs/schedule` mock)→ 验证 DB 中过期行被清空。
- `git diff comet/stage-4-2-sso-state-cleanup..comet/teable-oss-vs-cloud-gap-fill` 仅本 child 改动文件。