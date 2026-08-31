# Stage 4.2 — SsoLoginState BullMQ 过期清理

> 本 spec 描述归档后 Stage 4.2 的完整行为。父 change `teable-oss-vs-cloud-gap-fill` §"Stage 4.2" 已固化清理范围,本 spec 落到 BullMQ processor + 模块集成。

## 1. 能力目标

后台周期任务清理 `createdAt + 5min < now()` 的 `SsoLoginState` 行,保持 DB 表不无限增长,避免泄漏 IdP `state` / `emailHint` / `redirectTo` 等隐私字段。

## 2. 数据模型增量

无新增表。`SsoLoginState` 在 Stage 4 已落地。

## 3. 运行时行为

### 3.1 cleanup 规则

- 阈值:`createdAt < now() - SSO_LOGIN_STATE_TTL_MS`(5 分钟,复用 `sso.constants.ts` 常量)。
- 过滤:不过滤 `consumed`;`consumed=true` 的过期行同样清理(callback 已完成,state 行再无用途)。
- 实现:`prisma.ssoLoginState.deleteMany({ where: { createdAt: { lt: threshold } } })`,单 SQL,DELETE 原子。

### 3.2 调度

- 队列名:`SSO_LOGIN_STATE_CLEANUP_QUEUE = 'sso-login-state-cleanup'`(`sso.constants.ts` 新增)。
- 触发:`SsoLoginStateCleanupProcessor.process(job)`,每次只取 job.data = `{}`(无 payload)。
- 周期:`SsoModule.onModuleInit` 中 `queue.add('cleanup', {}, { repeat: { every: 60_000 } })`。
- 并发:`@Processor(..., { concurrency: 1 })`。
- 关闭:`SsoModule.onModuleDestroy` 调 `queue.close()`。

### 3.3 失败处理

- 任何 Prisma 抛错 → BullMQ 默认 retry 3 次(指数退避)。
- 最终失败 → 日志 `error:level` 告警,本 child **不**实现 DLQ。

## 4. 验收项

- **AC-001** 5 分钟过期行被删:`deleteMany` 命中已过期行,返回 `{count: N}`。
- **AC-002** 未过期行被保留:不命中未过期行。
- **AC-003** `consumed=true` 的过期行也被删:验证 callback 完成后的状态行也会被清理。
- **AC-004** 重复触发幂等:连续 5 次触发 → DB 中过期行数稳定为 0。
- **AC-005** 启动注册:SsoModule.onModuleInit 后 `queue.getRepeatableJobs()` 含 1 个 `cleanup` job。
- **AC-006** 关闭清理:SsoModule.onModuleDestroy 后 `queue.isClosed()` 为 true。
- **AC-007** 单元测试:`sso-login-state-cleanup.processor.spec.ts` 至少 4 个 it(),全部 pass。

## 5. 反例与边界

- 不清理未过期行:任何 createdAt 距 now 小于 5 分钟的行保留。
- 不依赖外部 cron / schedule module:使用 BullMQ 自带的 repeatable job,降低启动依赖。

## 6. 边界与不属于本 spec

- SSO callback 完整接通 → `stage-4-1-sso-callback`。
- SAML provider → `stage-9-saml-provider`。
- DLQ → 后续 child(若需要)。