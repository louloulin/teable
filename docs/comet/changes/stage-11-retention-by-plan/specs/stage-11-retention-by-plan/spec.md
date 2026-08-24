# Stage 11 — Per-Plan Retention TTL

## 1. 能力目标

为 `record_history` cleanup 与 `automation_run` cleanup 提供按空间 plan 取 TTL 的能力,覆盖 Supervisor `teable-oss-vs-cloud-gap-fill` 验收项 **A6**。

| Plan | record_history 保留 | automation_run 保留 |
|------|---------------------|---------------------|
| self_hosted | 14 天 | 14 天 |
| free | 14 天 | 14 天 |
| pro | 365 天 | 365 天 |
| business | 1095 天 | 365 天 |
| enterprise | 1095 天(与 business 等价上限) | 365 天(与 business 等价上限) |
| 未知 / 缺省 | 14 天 | 14 天 |

## 2. 模块增量

新增 `apps/nestjs-backend/src/features/retention/` 目录,内部:

- `retention-policy.ts` — 导出 `getRetentionDaysForPlan(plan, kind): number`。
- `retention-policy.spec.ts` — vitest 用例。
- `automation-run-cleanup.processor.ts` — BullMQ processor,仅 stub(队列 + job 注册 + 取 TTL 记日志)。
- `automation-run-cleanup.module.ts` — NestJS module,把 processor 与 EventJobModule 队列绑定。

修改:

- `apps/nestjs-backend/src/features/record-history-cold/record-history-cold.processor.ts`
  - 注入 `LicenseCapabilityService`。
  - `process()` 调 `flusher.runFlush()` 时把 `horizonMs` 设为 `getRetentionDaysForPlan(plan, 'record') * 86_400_000`。
- `apps/nestjs-backend/src/features/record-history-cold/record-history-cold.module.ts`
  - `imports` 加入 `LicenseModule`。
- `apps/nestjs-backend/src/features/record-history-cold/record-history-cold.spec.ts`
  - 增加用例,断言 `process()` 透传按 plan 算出的 `horizonMs` 到 flusher。

## 3. 运行时行为

### 3.1 helper 行为

```ts
getRetentionDaysForPlan('free', 'record') === 14
getRetentionDaysForPlan('pro', 'record') === 365
getRetentionDaysForPlan('business', 'record') === 1095
getRetentionDaysForPlan('business', 'automation') === 365
getRetentionDaysForPlan('self_hosted', 'automation') === 14
getRetentionDaysForPlan('enterprise', 'record') === 1095
getRetentionDaysForPlan('enterprise', 'automation') === 365
getRetentionDaysForPlan('unknown' as any, 'record') === 14   // fallback
getRetentionDaysForPlan('pro', 'unknown' as any) === 14      // fallback
```

### 3.2 record-history-cold processor 改动

- 调用 `LicenseCapabilityService.currentPlan()` 取当前 plan。
- `horizonMs = getRetentionDaysForPlan(plan, 'record') * 86_400_000`。
- `flusher.runFlush({ mode: 'incremental', ignoreBookmarks: ..., horizonMs })`。
- 现有 `recordHistoryColdConfig().flushHorizonMs`(默认 24h)仅作为 fallback,显式 `horizonMs` 优先。

### 3.3 automation-run-cleanup processor(Stub)

- BullMQ 队列名:`automation-run-cleanup-queue`。
- Job 名:`automation-run-cleanup:tick`。
- `process()` 行为:
  1. 调 `getRetentionDaysForPlan(plan, 'automation')`,得 `days`。
  2. 计算 `cutoff = new Date(Date.now() - days * 86_400_000)`。
  3. 写一行 INFO 日志:`automation-run cleanup tick: plan=<plan> cutoff=<iso>`。
  4. 返回 `{ plan, days, cutoff }`(无 SQL,无业务)。
- 不挂 scheduler;spec 仅承诺队列 + job 注册 + 取 TTL,不发明业务。

## 4. 验收项

- **AC-001** `getRetentionDaysForPlan('free', 'record')` === 14。
- **AC-002** `getRetentionDaysForPlan('pro', 'record')` === 365。
- **AC-003** `getRetentionDaysForPlan('business', 'record')` === 1095。
- **AC-004** `getRetentionDaysForPlan('business', 'automation')` === 365。
- **AC-005** `getRetentionDaysForPlan('self_hosted', 'automation')` === 14,且未知 plan / 未知 kind 默认 14。

## 5. 反例与边界

- enterprise 不在定价页表格内,本 spec 把其视为"与 business 同档上限",避免有 license 反而被清理更早。
- 未知 plan 一律回退 14d(保守,宁多删不多留)。
- flusher 内部删除逻辑不变;只是 cutoff 被推前/推后。

## 6. 边界与不属于本规格

- 不引入 `automation_run` 表 / 真实删除 SQL。
- 不改 quota 表 `recordHistoryDays` / `automationHistoryDays`(quota 模块语义独立)。
- 不改 `LicenseCapabilityService` 内部 plan 解析。
