# Outcome

在 OSS 自托管(AGPL-3.0)范围内,把 `record_history` cleanup 与 `automation_run` cleanup 两个 TTL 由环境变量/写死常量改为**按空间 plan 取值**。Free/Self-hosted 档保留 14 天,Pro 档保留 365 天,Business 档 record_history 保留 1095 天、automation_run 保留 365 天。对齐 `teable.io` Cloud 商业版定价页(https://teable.ai/zh/pricing?host=cloud)。

这是 Supervisor `teable-oss-vs-cloud-gap-fill` 的 Stage 11 子任务,覆盖验收项 **A6**(plan 切到 business 后,record history cleanup 保留期内记录保留,过期记录被删除)。

# Scope

## Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Supervisor brief §Stage 11 | `docs/comet/changes/teable-oss-vs-cloud-gap-fill/brief.md` | `complete` | Stage 11 范围与决策 |
| Supervisor spec §3.7 | `docs/comet/changes/teable-oss-vs-cloud-gap-fill/specs/teable-oss-vs-cloud-gap-fill/spec.md` | `complete` | 验收 A6 条款 |
| 现有 record-history-cold 处理器 | `apps/nestjs-backend/src/features/record-history-cold/record-history-cold.processor.ts` | `complete` | 现有 flush + compact 主路径 |
| `LicenseCapabilityService.currentPlan()` | `apps/nestjs-backend/src/features/license/license-capability.service.ts` | `complete` | 解析当前 plan 的入口 |
| QuotaService + SpaceQuota | `apps/nestjs-backend/src/features/quota/*` | `complete` | 已有 plan → 列名映射;新增 helper 不重读 |

## In scope

1. 新增 `apps/nestjs-backend/src/features/retention/retention-policy.ts`:
   - `getRetentionDaysForPlan(plan, kind)` 纯函数,返回 14/365/1095(record) 或 14/365/365(automation)
   - kind = `'record' | 'automation'`,plan = `'self_hosted' | 'free' | 'pro' | 'business' | 'enterprise'`
   - 未知 plan 或未知 kind 一律回退到 14 天保守默认
2. 新增 `apps/nestjs-backend/src/features/retention/retention-policy.spec.ts`:
   - 4 plan × 2 kind = 8 主矩阵 + 默认 fallback + enterprise 边界 + business 与 record 区分
3. 改造 `record-history-cold.processor.ts`:
   - 在 `process()` 调 `flusher.runFlush()` 时,按当前 plan 计算 `horizonMs`,覆盖默认 `flushHorizonMs`(24h)
   - 注入 `LicenseCapabilityService` 取当前 plan;plan 为 `enterprise`(无限)→ horizon 设为最大(1095d × 24h × 3600s × 1000ms),保持现有 worker 不动
4. 新增 `apps/nestjs-backend/src/features/retention/automation-run-cleanup.processor.ts`:
   - 注册 BullMQ 队列 `automation-run-cleanup-queue`,job 名 `automation-run-cleanup:tick`
   - `process()` **只**调用 `getRetentionDaysForPlan(plan, 'automation')` 计算 cutoff,再记一行日志,**不**实际执行 SQL 删除(无业务逻辑可抄;Stub 满足"队列被注册 / job body 不发明业务")
   - 与现有 record-history-cold 同形态,使用 `EventJobModule.registerQueue`
5. 单元测试:
   - `retention-policy.spec.ts` ≥ 9 个用例(8 矩阵 + 默认 fallback)
   - 在 `record-history-cold.spec.ts` 新增一个用例:验证 processor 调用 flusher 时传入了按 plan 计算的 `horizonMs`

## Out of scope

- **不**实现真正的 `automation_run` 删除 SQL(无 `automation_run` 表;现有 OSS 无该域)。
- **不**改造 flusher 内部删除逻辑;只通过 `IColdFlushOptions.horizonMs` 调整 cutoff。
- **不**改 hot path 写入(insert record_history)。
- **不**复制 `teableio/teable-ee` 任何代码。
- **不**新增 npm 依赖。
- **不**改现有 `LICENSE_KEY` / `TEABLE_QUOTA_ENFORCEMENT_ENABLED` 等环境变量语义。

# Non-goals

- Cloud 独占的运维组件(Stripe、发票、SLA、私有化 license 签发)— 见 supervisor brief。
- per-space 独立 cutoff 改造(本次只调整"全局默认"路径,保持 additive)。
- Cold part 对象的额外清理(只调 buffer 删除路径,即 cutoff 调整)。
- automation_run 真实表迁移(若未来引入,只需把 stub 替换为真实 service)。

# Acceptance examples

- **AC-001** `getRetentionDaysForPlan('free', 'record')` === 14。
- **AC-002** `getRetentionDaysForPlan('pro', 'record')` === 365。
- **AC-003** `getRetentionDaysForPlan('business', 'record')` === 1095。
- **AC-004** `getRetentionDaysForPlan('business', 'automation')` === 365(与 record 不同)。
- **AC-005** `getRetentionDaysForPlan('self_hosted', 'automation')` === 14,未知 plan / 未知 kind 回退到 14。
- **AC-006** `record-history-cold.processor.process()` 在 plan=business 时,把 `horizonMs = 1095 * 86_400_000` 传给 `flusher.runFlush()`。
- **AC-007** `automation-run-cleanup.processor` 能在 `EventJobModule.registerQueue('automation-run-cleanup-queue')` 下正常 `process()`,且不抛错。

# Constraints and invariants

- AGPL-3.0:任何新增源代码在本仓库内。
- 零 npm 依赖:Node 内置 + nestjs/bullmq + prisma + @teable/db-main-prisma 已覆盖。
- 零 hot path 改动:不修改 `RecordHistoryFlusherService` 的内部删除流程,只调参 `horizonMs`。
- 默认保守:未知 plan 默认 14d,enterprise 默认 1095d(record)/ 365d(automation)。
- 单测可独立跑:`pnpm --filter @teable/nestjs-backend test retention` 通过。

# Decisions

1. **加 helper 而非改 PLAN_LIMITS**:plan → retention days 是 cleanup 维度,与 quota `recordHistoryDays` / `automationHistoryDays` 的语义独立(后者是 UI/配额检查,前者是清理决策)。共享 PLAN_LIMITS 会让两套语义耦合,且 quota 表已存在归 quota 表,retention 是新概念。
2. **保留 enterprise 在 helper 内**:虽然 spec 只列 4 档,但 enterprise 用户付费不受限,cleanup 也走最长(1095d record / 365d automation),保持"按档位降序"。
3. **automation processor 用 stub**:现有 OSS 仓库无 `automation_run` 表,无业务可抄,stub 只为 spec 注册队列,未来替换为真实 service 不影响接口。
4. **processor 直接传 `horizonMs`,不重写 flusher**:最小改动;复用 `IColdFlushOptions.horizonMs` 既有字段。

# Open questions

无(全部由 Supervisor Q3 解决)。

# Verification expectations

- `pnpm --filter @teable/nestjs-backend test retention` 通过(本仓自有测试驱动 vitest)。
- `pnpm --filter @teable/nestjs-backend test record-history-cold` 通过(新增 horizonMs 校验用例)。
- `pnpm typecheck` 在修改文件 0 报错。
- 提交:`feat(retention): wire Stage 11 per-plan TTL for record/automation cleanup`。
