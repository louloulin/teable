# Teable OSS vs Cloud V29 — AI Field 可靠性补齐

**审计日期**：2026-09-02（Asia/Shanghai）  
**范围**：在 V28 记录写入自动触发基础上，补齐最小可用的幂等、重试、并发和运行状态记录。  
**验证环境**：NestJS `127.0.0.1:3000`、Next.js `127.0.0.1:3001`、PostgreSQL `127.0.0.1:42345`、MiniMax-M3。

## 本轮实现

| 能力 | 当前实现 | 说明 |
|---|---|---|
| 自动触发幂等 | ✅ | 以 `aiFieldId + recordId + inputText` 查询最近成功运行；命中后不重复调用模型。未增加 Prisma migration，降低已有数据库风险。 |
| 手动强制重跑 | ✅ | `POST /api/admin/ai-field/:aiFieldId/runs` 支持 `force: true`，绕过成功运行去重。 |
| 临时错误重试 | ✅ | 429、rate-limit、timeout、网络错误和 5xx 默认重试 2 次，退避 250ms/500ms。 |
| 最终状态 | ✅ | 429/rate-limit 最终写入 `rate-limited`，其他错误写入 `failed`，并保留错误信息。 |
| 并发限制 | ✅ | 进程内等待队列，默认最多 2 个 provider 执行；可用 `AI_FIELD_MAX_CONCURRENCY` 调整。 |
| 运行参数 | ✅ | `AI_FIELD_RETRY_ATTEMPTS` 和 `AI_FIELD_RETRY_BASE_MS` 可调整重试策略。 |
| 多实例幂等 | ⚠️ | 当前查询去重和并发闸门是进程内/非唯一约束；多副本部署仍需要数据库 source hash 唯一键或分布式锁。 |

## 代码位置

- `apps/nestjs-backend/src/features/ai-field/ai-field.auth.service.ts`：运行去重、并发队列、重试和错误分类。
- `apps/nestjs-backend/src/features/ai-field/ai-field.controller.ts`：透传 `force` 手动重跑参数。
- `apps/nestjs-backend/src/features/ai-field/ai-field.auth.service.spec.ts`：可靠性决策点测试。

## 真实验证

### 单元测试

```text
ai-field.auth.service.spec.ts   31 passed
ai-field.service.spec.ts        27 passed
ai-setting.auth.service.spec.ts  8 passed
合计：66 passed
```

覆盖了成功输入去重、`force` 重跑、429 重试并最终标记 `rate-limited`、并发上限排队，以及既有自动写回行为。

### 构建

```text
pnpm exec nest build
webpack 5.90.1 compiled successfully
```

### 前后端启动和 HTTP 烟测

- `GET http://127.0.0.1:3000/healthz` → `200`，返回 `{"status":"ok"}`。
- `GET http://127.0.0.1:3001/auth/login` → `200`，Next.js 登录页可返回。
- `POST /api/auth/signin` 使用本地默认管理员登录 → `200`。
- 登录后 `GET /api/auth/profile` → `200`，返回管理员用户。
- 登录后 `GET /api/admin/ai-field?baseId=...&tableId=...` → `200`，返回已配置 MiniMax AI Field。
- 登录后 runs/usage → `200`，真实数据库中有 `status=ok` 的 MiniMax-M3 运行记录和 token/duration 聚合。

## 真实进度判断

- AI Field 核心文本能力：由 V28 约 90% 提升到约 **93%**；可靠性基础已具备，但还不是 Cloud 全量等价。
- 当前全局企业能力：不能用 readiness 声明替代真实行为验收；SSO、权限热路径、审计、配额、限流、License、域名等已有阶段性实现，仍需逐模块持续验证。
- 全局完成度按“已真实验证的企业级行为 / 目标企业能力”估计约 **70%**；该百分比是工程进度估计，不是 Teable 官方评分，也不代表商业版兼容率。

## 仍明确未完成

1. AI Score、Image Generation 和完整 Cloud AI Field response schema。
2. 多实例幂等的数据库唯一约束/分布式锁，以及持久化队列和跨重启恢复。
3. 失败任务后台重试、死信、租户级 AI rate limit 和成本预算。
4. 模板库选择、自定义 prompt 的完整 UI/HTTP 合同，以及权限/审计事件的逐项浏览器验证。
5. 全仓库 `tsc --noEmit` 的历史跨模块错误；本轮相关单测和 Nest build 已通过。

## 后续最小计划

1. 为 `AiFieldRun` 增加 source hash 与数据库索引/唯一策略，先补迁移测试再启用多副本幂等。
2. 把重试任务移入现有 BullMQ 体系，增加租户限额、死信和可观测指标。
3. 补齐 AI Score/Image Generation，并以真实 MiniMax/OpenAI-compatible provider 做端到端验证。
4. 继续按 Cloud 官方权限矩阵、App Builder、SSO、审计导出逐项做 API/DB/UI 证据审计，不以空模块或 readiness 字段宣称完成。
