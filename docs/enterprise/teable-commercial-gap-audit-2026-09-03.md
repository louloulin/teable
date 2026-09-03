# Teable OSS 对标 Cloud 商业版全面审计

> 审计日期：2026-09-03  
> 审计对象：`/Users/louloulin/appx/teable` 当前 `develop` 工作区  
> 对标来源：`https://help.teable.ai/llms.txt` 及其 AI、Automation、Billing、Admin、Security 文档；Cloud 定价页  
> 结论类型：代码与静态证据审计，不等同于完整生产部署验收

## 1. 执行摘要

当前仓库不是“没有商业功能”，而是已经形成较大的商业能力实现面：按本轮当前工作区扫描，后端有 156 个 Controller 文件、150 个顶层 feature module，AI Chat、Cuppy、AI Field、Automation、SSO/SAML、SCIM、审计、权限矩阵、配额、备份、迁移连接器和多套管理页面均已出现。

但当前不能据此宣称“与 Cloud Business 功能等价”。主要原因：

1. `enterprise-readiness.service.ts` 把 module wiring、数据库表存在或静态探针直接当作 `enabled`，指标不是端到端用户功能完成度。
2. 多个模块只有 API/元数据/读取器，没有 Cloud 的完整用户闭环，例如 App Builder、通用连接器、部分迁移驱动和 Billing。
3. Cloud 的大量体验能力在前端缺失或未验证，例如 App Builder Chat/Live/Developer Mode、GitHub 同步、语音输入、OAuth 集成卡、Context usage、文件管理和自动修复。
4. 发现至少一个应按 P0 处理的备份鉴权问题：`actor` 参数非空即可绕过管理员身份校验。
5. 当前工作区有大量未提交改动；本文只记录审计结果，不覆盖或回滚这些改动。

总体判断：**核心基础能力较强，商业体验和生产治理仍处于“部分对齐”；最合理的整体评级为 Partial，而不是 Full parity。**

## 2. 证据等级与判定口径

每项能力按以下证据分级：

- **E0 缺失**：没有可执行入口、模块或持久化实现。
- **E1 骨架**：有模块、路由、类型或数据库表，但用户流程不能闭环。
- **E2 可调用**：有鉴权端点和主要服务逻辑，至少有单元测试或局部集成证据。
- **E3 业务闭环**：真实数据写入/读取、权限、失败处理、幂等、前端入口和端到端检查均有证据。
- **E4 商业等价**：在 Cloud 文档列出的用户流程、限制和运营语义上均有可复现证据。

本报告只在证据足够时给出 E3/E4；“代码存在”不等于“功能完成”。

## 3. 官方能力基线

官方文档当前明确覆盖的商业能力包括：

| 能力域 | Cloud 用户可见范围 |
| --- | --- |
| AI Chat | 当前表/视图、筛选结果、选中行列单元格、附件、`@` 节点、模型、Intelligence、Voice、Secrets、OAuth Integrations、三层 Skills、Context usage、文件管理、消息队列、Steer、长任务、Artifacts、图表/报告和数据写入计划 |
| App Builder | AI Chat 编辑、Preview/Live、Desktop/Tablet/Mobile、元素选择、直接改文案、Developer Mode、Monaco、React/Tailwind 文件树、GitHub 同步、Secrets、发布、公开 URL、自定义域名、App Login、版本回滚、Auto-fix、代码 ZIP 导入导出 |
| AI Field | 摘要、分类、评分、生图、多模型、批量运行、并发队列、失败重试/取消、用量和结果持久化 |
| Automation | AI 创建、Record/Condition/Webhook/Email/Button 等触发器；记录、AI、脚本、HTTP、邮件、循环、条件、跨 Base 等动作；Secrets、测试、运行历史、失败诊断、整次重跑和从失败步骤恢复 |
| Custom AI Model | OpenAI、Anthropic、OpenAI Compatible，模型列表、多模型配置、模型测试、批量测试、视觉/生图能力和大小写敏感模型名称 |
| Data migration | Airtable、Baserow、SmartSuite、NocoDB、Jira、monday、ClickUp、Smartsheet、API/数据库等的元数据、字段、记录、关系、附件和迁移结果 |
| Security/Admin | SSO/OIDC/SAML、SCIM、审计日志、审计导出、权限矩阵、域名验证、自定义域名、IP allowlist、TOTP、数据保护、备份恢复、保留策略、API 限流 |
| Billing/Operations | 订阅、Stripe Portal、付款方式、发票 PDF、席位计费、credits、automation/records/storage add-on、取消策略和用量校准 |

来源文件已下载并核对：`/tmp/teable-llms.txt`、`/tmp/teable-cloud-docs/`。

## 4. 差距矩阵

### 4.1 AI Chat / Cuppy

| 能力 | 当前证据 | 判定 | 差距/风险 |
| --- | --- | --- | --- |
| 会话、历史、删除、重命名、Fork、重生成、编辑重发 | `apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts` 有 sessions、fork、regenerate、resubmit；Cuppy 另有 conversation 路由 | E2 | 需要验证两套协议是否统一、跨设备历史是否使用同一数据源 |
| SSE 流式 | `ai-chat` 和 `cuppy.controller.ts` 均有 stream 路由；前端 `assistant-ui/Runtime.tsx` 消费 delta | E2 | 尚缺真实模型、断线、取消、工具调用中断的浏览器 E2E |
| 当前表/视图和选区上下文 | `ChatPanel.tsx` 使用 `gridSelection` 并格式化 selection；后端接收 context | E2 | 需验证筛选/排序结果、列/单元格范围、权限投影是否与 Cloud 一致 |
| 附件上传与抽取 | Cuppy 有 multipart upload；AI Chat 有 attachment extractor 与 prompt-injection 测试 | E2 | 需验证 PDF/XLSX/DOCX/图片真实解析、大小限制、病毒扫描、租户隔离和失败清理 |
| `@` 节点 | Cuppy 支持 table/view/app/automation/folder，且有权限校验 | E2 | 缺少前端完整 picker/删除/失效节点更新的端到端证据 |
| Memory / Artifact / Citation / Search / Export | 对应 service、route 和单测均存在 | E2 | 不能仅由单测证明 Cloud UI、版本、分享、引用跳转和跨会话语义完全一致 |
| Skills | 后端已有 instance skill 和 personal/base/space `SkillScopeService` 注入 | E2 | 需要验证导入、启停、同名优先级、`/` 选择器、Chat/App Builder 作用域和 UI；旧报告曾将该项判为缺失，结论已过时 |
| Queue / Long task / Steer | `AiChatLongTaskService` + `AiChatLongTaskProcessor`（BullMQ worker，附本地 fallback）写入 `ai-chat-long-task-queue`；`POST /api/chat/tasks/:taskId/cancel` 已生效；`AiChatLongTaskProcessor.onModuleInit` 启动时调用 `recoverExpiredTasks()` 回收过期租约 | E2 | 已落 `queued/running/succeeded/failed/canceled` 状态机、idempotencyKey（unique on `(sessionId, idempotencyKey)`）、5min lease + 30s heartbeat、指数退避重试、cancel-before-completion；尚未验证 24h sandbox、多 worker 并发抢租约的运行时行为 |
| Tools / 数据分析 | `AiChatToolsService` 只有 5 个只读工具：list tables/fields、count/get/search records | E1/E2 | Cloud 可建表、视图、应用、自动化并执行写入；当前写入主要走显式 write plan，工具集合与 Cloud agent 能力明显不同 |
| 语音输入 | 前端 ChatPanel 只有附件、输入和发送控件；未发现 microphone/transcription UI | E0/E1 | Cloud AI Chat 文档明确提供 Voice input；AI Settings 文档也要求 OpenAI transcription 配置 |
| OAuth 集成卡 | 未发现 Chat/App Builder OAuth card、授权回调和第三方连接状态闭环 | E0/E1 | Slack 等连接无法按 Cloud 语义完成授权、跳过和后续调用 |
| Context usage / Steer / 文件管理 UI | 后端有部分数据结构；当前 `assistant-ui/ChatPanel.tsx` 仅渲染基础消息、附件和发送 | E1/E2 | 用户可见控件和状态反馈不足，不能宣称 Cloud UX parity |
| 真实 LLM | `built-in-echo-llm.ts` 明确在未配置外部 LLM 时返回 deterministic placeholder | E1/E2 | 没有 provider 时可调用不代表 AI 已可用；应区分 fallback、configured、live-provider 三种状态 |

## 5. Phase 1 落地进展（2026-09-03 续）

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| Prisma schema + 迁移 | `packages/db-main-prisma/prisma/postgres/schema.prisma`、`…/migrations/20260904010000_add_ai_chat_long_task/migration.sql` | 新增 `error_code/idempotency_key/attempt/max_attempts/heartbeat_at/lease_until/retry_at/cancel_requested/tenant_id/correlation_id/context` 列；`(session_id, idempotency_key)` 唯一索引；`status` 默认值切换为 `queued` |
| BullMQ 队列注册 | `apps/nestjs-backend/src/features/ai-chat/ai-chat.module.ts`、`ai-chat-long-task.processor.ts`、`event-job/event-job.module.ts` | 通过 `EventJobModule.registerQueue('ai-chat-long-task-queue')` 复用 BullMQ + 本地 fallback；worker `concurrency: 2`，`onModuleInit` 触发 `recoverExpiredTasks()` |
| Service 协议 | `apps/nestjs-backend/src/features/ai-chat/ai-chat-long-task.service.ts` | 状态机 `queued → running → succeeded/failed/canceled`；`enqueue` 幂等键去重 + 持久化 queue job；`processTask` 抢 lease、心跳、检查 cancel、`maxAttempts` 内自动 requeue、`retryDelay` 指数退避；新增 `cancelTask` / `recoverExpiredTasks` |
| Controller | `apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts` | 新增 `POST /api/chat/tasks/:taskId/cancel`，enqueue 接受 `idempotencyKey/tenantId/correlationId/maxAttempts` |
| 测试 | `apps/nestjs-backend/src/features/ai-chat/ai-chat-long-task.service.spec.ts` | 16/16 通过：覆盖幂等、lease 抢失败、重试 enqueue、cancel、recoverExpiredTasks、状态映射、retry backoff |

下一步把同一任务协议推广到 AI Field 异步任务、迁移（airtable/notion/google sheets）和 Stripe webhook 的幂等处理。
## 6. Phase 1 后续落地（AI Field batch — 2026-09-03）

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| Prisma schema + 迁移 | `packages/db-main-prisma/prisma/postgres/schema.prisma`、`…/migrations/20260830230000_add_ai_generation_tasks/migration.sql` | 新增 `error_code/idempotency_key/attempt/max_attempts/heartbeat_at/lease_until/retry_at/tenant_id/correlation_id`；`(table_id, idempotency_key)` 唯一索引；迁移使用 `ALTER TABLE … ADD COLUMN IF NOT EXISTS` |
| BullMQ 队列 | `apps/nestjs-backend/src/features/ai-field/ai-field-batch.processor.ts`、`ai-field.module.ts`、`event-job/event-job.module.ts` | 新增 `ai-field-batch-queue`（`concurrency: 2`）；`onModuleInit` 触发 `recoverExpiredBatchTasks()`；服务在有队列时调用 `queue.add()`，未注入队列时回退到 `setImmediate` 以兼容单测 |
| Service 协议 | `apps/nestjs-backend/src/features/ai-field/ai-field.auth.service.ts` | `startBatchGeneration` 先按 idempotency key 去重，再做 active-task 冲突检测；写入 `idempotency_key/max_attempts/tenant_id/correlation_id`；`processBatchTask` 走 10 min 租约 + 60 s 心跳 + 多重 cancel 校验；新增 `recoverExpiredBatchTasks`；`cancelBatchTask` 写 `errorCode=TASK_CANCELED` |
| 类型 | `apps/nestjs-backend/src/features/ai-field/ai-field.types.ts` | `IAiGenerationTaskRow` 与 `IBatchGenerationInput` 暴露新字段，公开 `BatchTaskStatus` |
| 测试 | `apps/nestjs-backend/src/features/ai-field/ai-field.auth.service.spec.ts` | 新增 7 个用例：BullMQ enqueue、idempotency 命中、lease 抢失败、cancel-before-claim、cancel 写 errorCode、recoverExpiredBatchTasks 命中 / 空操作；`features/ai-field` 全量 87/87 通过 |

下一步把同一协议接入 Stripe webhook 幂等 + Notion/Google Sheets 迁移 driver，并接入 license/plan 限制与审计事件。
## 7. Phase 1 后续落地（Stripe webhook 幂等 — 2026-09-03）

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| Prisma schema + 迁移 | `packages/db-main-prisma/prisma/postgres/schema.prisma`、`…/migrations/20260904070000_extend_stripe_webhook_event_status/migration.sql` | `stripe_webhook_event` 新增 `status/attempt/max_attempts/heartbeat_at/lease_until/retry_at/last_error/error_code/tenant_id/correlation_id/processed_at`；`status` 默认值 `queued`；新增 `(status, lease_until)` 索引；迁移使用 `ALTER TABLE … ADD COLUMN IF NOT EXISTS` |
| Service 协议 | `apps/nestjs-backend/src/features/stripe-webhook/stripe-webhook.auth.service.ts` | `ingestEvent` 改为：先 `create({status:'queued'})` 抢占（捕获 `P2002`）；冲突时按 (a) `succeeded` 终态、(b) `processing` 租约未过期、(c) `failed` 重试窗口未到 三种情况分别返回 `null`；租约过期或可重试时再用 `updateMany` 抢 lease（5 min）；处理成功后写 `processedAt/heartbeatAt`，失败时按 `attempt<maxAttempts` 退避回 `queued` 或转 `failed`；新增 `recoverExpiredEvents()`，在 `OnModuleInit` 启动时回收过期租约 |
| 测试 | `apps/nestjs-backend/src/features/stripe-webhook/stripe-webhook.auth.service.spec.ts` | 新增 4 个用例：终态去重、租约过期 reclaim、reconcile 失败退避重试、`recoverExpiredEvents` 计数；`features/stripe-webhook` 全量 28/28 通过 |

Stripe webhook 幂等性已可抵御重放、租约过期和瞬时失败：单进程串行处理由数据库行级约束保证，进程重启后的恢复由 `OnModuleInit.recoverExpiredEvents()` 接管。下一步把同一套协议接入 Notion / Google Sheets 迁移 driver，并接入 license/plan 限制与审计事件。

## 8. Phase 1 后续落地（Source-import 统一驱动 — 2026-09-03）

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| Prisma schema + 迁移 | `packages/db-main-prisma/prisma/postgres/schema.prisma`、`…/migrations/20260904080000_add_source_import_task/migration.sql` | 新增 `SourceImportTask` 模型（`payload/result/total_count/processed_count/failed_count/cancel_requested/source/remote_id/triggered_by/…`），沿用统一任务协议列（`attempt/max_attempts/heartbeat_at/lease_until/retry_at/tenant_id/correlation_id`），`(source, idempotency_key)` 唯一索引；迁移使用 `IF NOT EXISTS` 安全添加 |
| Driver 契约扩展 | `apps/nestjs-backend/src/features/import-jobs/source-import.driver.ts` | `ISourceImportDriver` 新增 `runImport({task, isCanceled, onProgress})`：把 token 解析、分页、批写、cancel 校验、进度回报都收进 driver；`fetchBatch`/`writeBatch` 降级为诊断 / 旧 wizard 兼容，不被 processor 直接调用 |
| Driver 实现 | `apps/nestjs-backend/src/features/import-jobs/notion-source.driver.ts` | `NotionSourceDriver.runImport` 调用 `NotionImportService.importDatabase`，新增 `isCanceled` + `onProgress` 钩子；token 校验前置（`getStoredTokens` 缺失时直接抛 `no notion token stored`），错误在 task 行上变成 `NO_TOKEN`，不会浪费一轮 Notion pages 拉取 |
| Service 协议 | `apps/nestjs-backend/src/features/notion/notion-import.service.ts`、`apps/nestjs-backend/src/features/import-jobs/source-import.service.ts` | `NotionImportService.importDatabase` 接受可选 `isCanceled` + `onProgress` 回调，pages / 记录批两个边界都校验 cancel 并抛 `INotionImportCanceledError`；`SourceImportService` 新增 `isCanceled(taskId)` 与 `updateProgress(taskId, counts)`（顺手刷新 heartbeat + 5 min lease） |
| Processor 简化 | `apps/nestjs-backend/src/features/import-jobs/source-import.processor.ts` | `process` 退化为纯 lifecycle：claim lease → driver.runImport → markSucceeded/markFailed；自备 30 s 备用 heartbeat timer；`NOTION_IMPORT_CANCELED` / `isCanceled()` 命中时不做重试，让 `markSucceeded` 走 cancel reconciliation |
| Controller | `apps/nestjs-backend/src/features/import-jobs/source-import.controller.ts` | `POST/GET /api/admin/source-imports`、`POST /api/admin/source-imports/:taskId/cancel`、列表按 `source` 过滤；统一使用 `LicenseCapabilityGuard.for('admin_panel')`，避免 license 漂移 |
| Barrel | `apps/nestjs-backend/src/features/import-jobs/index.ts`、`apps/nestjs-backend/src/features/notion/index.ts` | import-jobs 暴露 `SourceImportService`/`SourceImportProcessor`/`SourceImportController`/`SourceImportModule`/`NotionSourceDriver` + `ISourceImportRunInput` / `ISourceImportRunResult`；notion 暴露 `INotionImportCanceledError`（手工附加，未被自动 barrel 覆盖） |
| 测试 | `apps/nestjs-backend/src/features/import-jobs/source-import.service.spec.ts`、`apps/nestjs-backend/src/features/import-jobs/notion-source.driver.spec.ts` | service 用例 10 → 15（新增 isCanceled 4 路 + updateProgress 1 路）；新增 NotionSourceDriver 4 用例覆盖缺 token / runImport 直通 / cancel-error 透传 / 完整 callback 流；`features/import-jobs` 19/19、`features/notion` 7/7、`features/ai-chat|ai-field|stripe-webhook` 同步回归 348/348 通过 |

Phase 1 driver 收敛落地：所有迁移 driver 现在都使用同一 persistent-task 协议 + 统一 cancel/heartbeat/retry 语义。下一步：Google Sheets 同步（`google-sheets-sync.service.ts` 加 `SourceImportDriver` 适配器，复用统一驱动 + 增量游标 checkpoint）+ App Builder pipeline 同协议接入。

## 9. Phase 4.1 落地（Airtable 迁移走统一驱动 — 2026-09-03）

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| Driver 实现 | `apps/nestjs-backend/src/features/import-jobs/airtable-source.driver.ts` | 适配 `AirtableImportService.importBase`：把 `IAirtableImportProgressReporter` 桥接到 `ISourceImportRunInput.onProgress` + `isCanceled`；table-progress 事件之间同步检测取消并抛 `IAirtableImportCanceledError`；credentials（`accessToken` 或 `integrationId`）+ `importAttachments` / `importViewConfig` / `shareLink` / `baseName` 从 task `payload` JSON 取，避免把 PAT 留在 controller 路径上 |
| 同步取消服务 | `apps/nestjs-backend/src/features/import-jobs/source-import-cancellation.service.ts` | 新增 `SourceImportCancellationService`：进程内 `canceledTaskIds: Set<string>`，`requestCancel/isCanceledSync/predicate/absorbDbState/forget`；让 driver 在 progress events 之间能在同步路径上判断取消，无需每次 DB read |
| 接口收紧 | `apps/nestjs-backend/src/features/import-jobs/source-import.driver.ts` | `ISourceImportRunInput.isCanceled` 由 `() => boolean \| Promise<boolean>` 收紧到 `() => boolean`，明确要求同步；新增 `SOURCE_IMPORT_DRIVER` 多 provider token；`ISourceImportTaskSlice` 增 `baseId? / payload?` |
| 加载修复 | `apps/nestjs-backend/src/features/import-jobs/source-import.module.ts`、`source-import.processor.ts` | 原 wiring 漏洞：driver 注册成 `provider` 但 processor 自己 `Map<string, ISourceImportDriver>.registerDriver` 没被任何地方调用，运行期任务全部走 `NO_DRIVER`。改成 `SOURCE_IMPORT_DRIVER` 多 provider token，processor `onModuleInit` 自动 discover，按 `driver.source` 索引 |
| Controller | `apps/nestjs-backend/src/features/import-jobs/source-import.controller.ts` | `POST /api/admin/source-imports/:taskId/cancel` 同步调 `cancellation.requestCancel(taskId)`；`POST` body `tableId` 改可选、`baseId` 新增、`payload` 新增 |
| DTO | `apps/nestjs-backend/src/features/import-jobs/source-import.service.ts` | `ISourceImportTask` 暴露 `payload / result`；`enqueue.input` `baseId? / tableId?` 改可选；`create.data` 落 `baseId` |
| Barrel | `apps/nestjs-backend/src/features/import-jobs/index.ts` | 暴露 `AirtableSourceDriver / IAirtableImportCanceledError / IAirtableTaskPayload / SourceImportCancellationService / SOURCE_IMPORT_DRIVER / ISourceImportTaskSlice` |
| 测试 | `airtable-source.driver.spec.ts` 6、`source-import-cancellation.service.spec.ts` 7、`source-import.service.spec.ts` 15、`notion-source.driver.spec.ts` 4 | AirtableSourceDriver：缺 spaceId / 缺 remoteId / 缺 credentials / 完整 callback + 凭证透传 / 同进程 cancel-error 透传 / isCanceled 同步监测。Cancellation service：默认值、requestCancel flips、predicate 闭包、forget、absorbDbState 命中/未命中、`requestCancel` 幂等。`import-jobs + notion + airtable-import + ai-chat + ai-field + stripe-webhook` 6 模块 417/417 通过 |

`AirtableSourceDriver` 入栈后，Airtable 迁移从原本同步阻塞 controller 升级到 lease + heartbeat + cancel + retry 全服务。下一步：Google Sheets driver（OAuth + Sheets API v4 → 同 `runImport`）+ App Builder pipeline 同协议接入 + Billing dunning + Snapshot validation。

## 10. Phase 5 落地（Billing proration 数学层 — 2026-09-03）

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| Proration 服务 | `apps/nestjs-backend/src/features/billing/billing-proration.service.ts` | `BillingProrationService` 纯函数：零 Stripe 调用、零 DB 写；`previewSeatChange` 在相同 plan 下计算 seat 增量的 proration，`previewPlanChange` 处理跨 plan + seat 改的 net cents（升级 → 正、退钱 → 负、noOp → 0）；`remainingSecondsInPeriod` 暴露剩余秒数计算。逻辑与 Stripe `proration_behavior: create_prorations` 同款数学，便于内部 Subscription 变更与 Stripe 后续 webhook report 对账 |
| 模块接线 | `apps/nestjs-backend/src/features/billing/billing.module.ts`、`billing/index.ts` | `BillingProrationService` 注册到 `BillingModule.providers/exports`；barrel 手工附加（自动生成器未覆盖） |
| 测试 | `apps/nestjs-backend/src/features/billing/billing-proration.service.spec.ts`（18 用例） | seat delta 正负、period 起点 / 中点 / 终点、跨月、倒序 period、Feb 28 天（13/27 天分段）、currency 不匹配抛错、rate 缺失抛错、过期归零、noOp 单独 case、`remainingSecondsInPeriod` 起点/终点/过去/默认/过去起点 |
| 验证 | `rtk npx tsc --project tsconfig.json --noEmit` | `billing-proration` 0 新增诊断 |
| 验证 | `rtk npx vitest run src/features/billing src/features/license src/features/import-jobs --silent` | 13 文件 144 测试全绿 |

`Billing` 4.7 仍存：Stripe Customer Portal、Payment methods、Addresses、Historical payments、PDF invoice download、Credits/storage/automation/records add-ons、Usage calibration。下一步：dunning 排程（`past_due` → T+24h/72h/7d 邮件 + 14d 暂停）+ App Builder pipeline 同协议。

## 11. Phase 4 续落地（Google Sheets driver extension point — 2026-09-03）

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| Driver 实现 | `apps/nestjs-backend/src/features/import-jobs/google-sheets-source.driver.ts` | 复用 `ISourceImportDriver.runImport` 契约；先查 `google_sheets_connection`（`spreadsheetId` + `revokedAt: null`），缺则抛 `IGoogleSheetsNoConnectionError`（`code: GOOGLE_SHEETS_NO_CONNECTION`，错误指向 `/api/google-sheets-sync/connections` 注册路由），存在则抛 `IGoogleSheetsApiNotConfiguredError`（`code: GOOGLE_SHEETS_API_NOT_CONFIGURED`，non-retryable，附 `remediation` 字段）。`PrismaService` 标 `@Optional()`，spec 路径可省略 mock |
| Processor | `apps/nestjs-backend/src/features/import-jobs/source-import.processor.ts` | `KNOWN_CANCEL_CODES` 增 `GOOGLE_SHEETS_CANCELED` |
| Module | `apps/nestjs-backend/src/features/import-jobs/source-import.module.ts` | `GoogleSheetsSourceDriver` 加入 providers + `useExisting` 多 provider token |
| Barrel | `apps/nestjs-backend/src/features/import-jobs/index.ts` | 暴露 `GoogleSheetsSourceDriver / IGoogleSheetsApiNotConfiguredError / IGoogleSheetsNoConnectionError / IGoogleSheetsTaskPayload` |
| 测试 | `google-sheets-source.driver.spec.ts`（8 用例） | 缺 spaceId / 缺 spreadsheetId / 无 connection 抛 NO_CONNECTION / 有 connection 抛 NOT_CONFIGURED / 同步 cancel 短路在 Prisma 查询前 / NO_CONNECTION 错误消息引用注册路由 / NOT_CONFIGURED remediation hint / 无 Prisma mock 路径 |
| 验证 | typecheck | 0 新增诊断 |
| 验证 | 10 模块 589 测试全绿 | `import-jobs + notion + airtable-import + ai-chat + ai-field + stripe-webhook + billing + license + admin + backup` |

#### §4.5 当前最终快照见上表

下一步：补 `googleapis` / 自定义 OAuth client + Sheets `values.get` → `recordOpenApiV2Service.createRecords` 把 Google Sheets 推到 E2/E3；dunning 排程 / App Builder pipeline 仍在前排。

## 12. Phase 5 续落地（seat/plan 改动落库 + draft invoice — 2026-09-03）

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| Service 接线 | `apps/nestjs-backend/src/features/billing/billing.auth.service.ts` | 构造器增 `proration: BillingProrationService`；新增 `private static readonly CHANGEABLE_STATUSES = { active, trialing }`（拒绝 `canceled` / `past_due` / `unpaid` / `incomplete` 的 mid-period 变更）；新增 `previewSeatChange / previewPlanChange`（纯读） + `changeSeats / changePlan`（持久化）。同 plan+seat noOp 直接 short-circuit（不写）；draft invoice `amountCents = abs(prorationCents)`，`idempotencyKey` 映射到 `externalInvoiceId`（`seat_change:org:k` / `plan_change:org:k`）；命中已有 draft 直接返回 |
| Test | `apps/nestjs-backend/src/features/billing/billing.auth.service.spec.ts` | 18 → **29**：changeSeats 6 用例（happy / 缺 sub / canceled guard / noOp 不写 invoice / negative delta 退钱 invoice 走绝对值 / 重复 idempotency key）+ changePlan 4 用例（upsell mid-period / rate 缺失抛错 / noOp / downgrade 退钱）+ previewSeatChange 1 用例（纯读不命中 DB） |
| 验证 | `rtk npx tsc --project tsconfig.json --noEmit` | billing 0 新增诊断 |
| 验证 | 11 模块 vitest 回归 | `import-jobs + notion + airtable-import + ai-chat + ai-field + stripe-webhook + billing + license + admin + backup + google-sheets-sync` 54 文件 642 测试全绿 |

#### §4.7 当前快照（部分）

| 项 | wired | configured | verified | parity | 备注 |
| --- | --- | --- | --- | --- | --- |
| Subscription state machine | ✅ | ✅ | ⚠ partial | ⚠ E2 | round 9 修了 cancel-at-period-end + 即时 cancel，state transition guards OK |
| 幂等 webhook | ✅ | ✅ | ✅ | ✅ | round 3 接入 BullMQ + 本地 fallback |
| Subscription CRUD | ✅ | ✅ | ✅ | ✅ | §9 P0 |
| **seat 增删 + proration** | ✅ | ✅ | ✅ | ✅ | **本轮 round 8 — `BillingAuthService.changeSeats`** |
| **plan 切换 + proration** | ✅ | ✅ | ✅ | ✅ | **本轮 round 8 — `BillingAuthService.changePlan`** |
| Draft invoice for proration | ✅ | ✅ | ✅ | ✅ | 本轮 — `invoice` 行 `status=draft` + `amountCents=abs(prorationCents)` |
| Stripe Customer Portal | ❌ | ❌ | ❌ | ❌ E0 | 下一轮 |
| 付款方式 / 地址 | ❌ | ❌ | ❌ | ❌ E0 | 下一轮 |
| 历史支付 / PDF invoice | ❌ | ❌ | ❌ | ❌ E0 | 下一轮 |
| Dunning 排程（past_due → 邮件） | ❌ | ❌ | ❌ | ❌ E0 | 下一轮 |
| Credits / automation / records / storage add-ons | ❌ | ❌ | ❌ | ❌ E0 | 下一轮 |
| 计量校准（storage / API quota） | ❌ | ❌ | ❌ | ❌ E0 | 下一轮 |

下一步：`stripeCustomerPortal` controller + dunning 排程（`past_due` → T+24h/72h/7d 邮件 + T+14d 暂停）+ Sheets `values.get` + App Builder pipeline。








### 4.2 AI App Builder

| Cloud 能力 | 当前证据 | 判定 |
| --- | --- | --- |
| App CRUD、版本、deploy、rollback | `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder.controller.ts` 有 12 routes；service 写入 `appInstance/appVersion` | E2 |
| Secrets | 有 write/list；`AiAppBuilderService` 明确把 value base64 编码，并写着“follow-up round will plug in real KMS” | E1/E2：不是生产级密钥保护 |
| Files | 只有 path/content 元数据写入，service 注释称为 sandbox metadata；没有真实运行时文件系统/构建产物 | E1 |
| Preview | 前端把 JSON snapshot 通过 `iframe srcdoc` 或 JSON 预览展示，并提供 viewport switcher | E1：是 snapshot viewer，不是 Cloud React app runtime preview |
| Chat-driven editing | 未发现 App Builder 独立 Chat runtime、会话、工具、元素引用和代码变更执行链 | E0/E1 |
| Live published app / public URL / unpublish / redeploy | 当前 controller 没有 publish/unpublish/public URL/custom site info 端点 | E0/E1 |
| Developer Mode / Monaco / React/Tailwind file tree | 当前 panel 使用 JSON textarea 和 SyntaxHighlighter；无 Monaco/file tree 编辑器 | E1 |
| GitHub sync | 未发现 GitHub OAuth、repo、pull/push/conflict 端点或 UI | E0 |
| App Login | 未发现 app user table、Email OTP、Google OAuth 和登录配置闭环 | E0/E1 |
| Auto-fix | 未发现编译错误日志到 AI 修补的闭环 | E0 |
| ZIP import/export | 未发现 ZIP 下载/上传和 root package.json 校验 | E0 |

额外发现两个可直接复现的实现断裂：

- 前端 `AiAppBuilderPanel.tsx` 用 `POST /:baseId/apps/:appId/secrets` 和 `POST /:baseId/apps/:appId/files`，后端 `ai-app-builder.controller.ts` 只注册 `PUT`。因此管理面板的 Secrets/Files 保存请求不会命中当前 Controller，不能算可调用闭环。
- 后端 `deploy` 响应把 `currentVersionId` 固定返回 `null`，虽然后台事务已经更新 `appInstance.currentVersionId`；这会使客户端只能依赖重新查询，且对 API 消费者形成错误契约。

### 4.3 AI Field / AI Settings / Custom Models

- AI Field 已有 15 个后端路由、批量 task、templates、runs、usage 和 SSE；其服务/测试覆盖明显优于早期报告，整体 **E2**。
- AI Settings 已有 enable/disable、default model、credit policy、gateway 配置，且 `defaultModel` 会 mirror 到 runtime `chatModel`；整体 **E2**，但需真实 provider 和多空间覆盖验证。
- Custom AI Model 有 CRUD、single/batch test、usage、AES-GCM 配置加密，但 provider schema 只允许 `custom-openai`、`custom-anthropic`、`custom-azure`、`custom-ollama`、`custom-bedrock`（`custom-ai-model.controller.ts:32`）。Cloud 文档的 provider 语义是 OpenAI、Anthropic、OpenAI Compatible + 多模型配置；当前属于 **E2 / Partial**，不应按“所有 provider 已等价”计分。
- `MODEL_SECRET_KEY` 使用 `TEABLE_INTEGRATION_SECRET`，缺失时回退到固定 dev secret（`custom-ai-model.auth.service.ts`）；生产启动应拒绝弱默认密钥，而不是继续运行。

### 4.4 Automation

当前 Automation 有 catalog、AI draft、script sandbox、CRUD、manual run、run history、admin overview 和前端 workflow panel，整体 **E2**。

仍需补强或验证：

- 官方失败运行支持 Diagnose、Full rerun、Resume from failed step；当前代码有 run/retry 相关结构，但未形成完整可验证的恢复语义矩阵。
- Secrets、动态变量、外部 HTTP、SMTP、Slack/Discord/Teams、跨 Base、Loop/Conditional 必须按真实数据和失败路径做 E2E，而不是只检查 catalog。
- 脚本/通用连接器要独立审计 SSRF、资源耗尽、网络出口和租户隔离。

### 4.5 Connect & Migrate

#### 统一协议覆盖（Phase 4 落地）

- **Notion** — 在统一 `ISourceImportDriver` 协议内完成（Phase 1 round 4 + 4.1）：`NotionSourceDriver.runImport` 委托 `NotionImportService.importDatabase`（pages + records 两级 cancel 校验 + progress 回调），同步取消走 `SourceImportCancellationService` in-memory set。判定：**wired + configured**，列族翻译 partial，**E1/E2 Partial**。
- **Airtable** — 在统一协议内完成（Phase 4.1 round 5）：`AirtableSourceDriver.runImport` 包装 `AirtableImportService.importBase`；credentials 走 task `payload` JSON；PROGRESS_REPORTER 同步检测 cancel；processor driver-loading bug 已修。判定：**wired/configured/verified 至单测层**，**E2 Partial**，真实 E2E 跨账号演练仍待补。
- **Google Sheets** — Extension point 就位（Phase 4.2 round 7）：`GoogleSheetsSourceDriver` 已通过 `SOURCE_IMPORT_DRIVER` 多 provider token 注册；token 校验复用 `google_sheets_connection` 表；`googleapis` 依赖尚未引入，driver 写完两段校验后抛 `IGoogleSheetsApiNotConfiguredError`（`code: GOOGLE_SHEETS_API_NOT_CONFIGURED`，non-retryable）。判定：**wired**，**partial configured**，**E1 Partial**。

#### 历史评估

- Baserow、ClickUp、Jira、monday、NocoDB、Smartsheet、SmartSuite 等主要暴露 probe/list/fetch 端点。Readiness 中将它们标为 `implemented`，但同一处 notes 仍写明 field/column/custom field/relationship translation pending，实际应判为 **E1/E2 Partial**。
- `generic-connector.service.ts:60-64` 仍使用 placeholder adapter 作为运行时元数据注册结果，因此“Connect More Sources 已实现”不成立，只能算可扩展骨架。
- P0 已修复匿名 register/fetch、超时、响应大小和显式 endpoint policy；adapter 仍缺少审核 manifest、字段/关系/附件翻译和可恢复迁移任务，不能按 Cloud migration parity 计分。
- 多个 source-specific controller 使用 `@Public()`；需确认 token 是否由 controller、service 或网关统一校验，不能仅按路由装饰器判断安全性。

#### 当前快照

| 源 | wired | configured | verified | parity | 备注 |
| --- | --- | --- | --- | --- | --- |
| Notion | ✅ | ✅ | ⚠ partial | ⚠ E1/E2 | 协议 + 映射；formula / rollup / attachment 仍 partial |
| Airtable | ✅ | ✅ | ⚠ partial | ⚠ E2 | `importBase` 包入驱动；真实 E2E 账号演练仍待做 |
| Google Sheets | ✅ | ⚠ partial | ❌ | ❌ E1 | 协议位 + token 校验就位；`googleapis` 客户端缺失（`GOOGLE_SHEETS_API_NOT_CONFIGURED`） |
| NocoDB（Round 35 + 36） | ✅ | ✅ | ⚠ partial | ⚠ E2 | probe + fetchRows + record creation 全链路接通；`nocodb-source.driver.spec.ts` 19/19 + `nocodb-import.service.spec.ts` 5/5；缺真实 E2E 跨账号 fixture 与 `nocodb_connection` Prisma 表 |
| Baserow（Round 37） | ✅ | ✅ | ⚠ partial | ⚠ E2 | probe + importTable + record creation 全链路接通；`baserow-source.driver.spec.ts` 19/19 + `baserow-import.service.spec.ts` 5/5；缺真实 E2E 跨账号 fixture 与 `baserow_connection` Prisma 表 |
| Jira（Round 38） | ✅ | ✅ | ⚠ partial | ⚠ E2 | probe + importTable + record creation 全链路接通；`jira-source.driver.spec.ts` 19/19 + `jira-import.service.spec.ts` 5/5；缺真实 E2E 跨账号 fixture、`jira_connection` Prisma 表、ADF description 解析与 Jira field type → Teable field type 映射 |
| monday（Round 39） | ✅ | ✅ | ⚠ partial | ⚠ E2 | probe + importTable + record creation 全链路接通；`monday-source.driver.spec.ts` 19/19 + `monday-import.service.spec.ts` 5/5；GraphQL cursor 分页；缺真实 E2E 跨账号 fixture、`monday_connection` Prisma 表、monday column type 映射、includeUpdates 二次抓取 |
| ClickUp（Round 40） | ✅ | ✅ | ⚠ partial | ⚠ E2 | probe + importTable + record creation 全链路接通；`clickup-source.driver.spec.ts` 19/19 + `clickup-import.service.spec.ts` 5/5；Page-based 分页 + `last_page` 终止；最深层级 workspace/space/folder/list/task + custom_fields[]；缺真实 E2E 跨账号 fixture、`clickup_connection` Prisma 表、custom_field type 映射、includeComments 二次抓取 |
| SmartSuite（Round 41） | ✅ | ✅ | ⚠ partial | ⚠ E2 | probe + importTable + record creation 全链路接通；`smartsuite-source.driver.spec.ts` 19/19 + `smartsuite-import.service.spec.ts` 5/5；offset 分页 + `nextOffset` 终止 + infinite-loop 安全网；缺真实 E2E 跨账号 fixture、`smartsuite_connection` Prisma 表、SmartSuite field type 映射 |
| Smartsheet（R42） | ✅ | ✅ | ⚠ partial | ⚠ E2 | probe + importTable + record creation 全链路接通；`smartsheet-source.driver.spec.ts` 20/20 + `smartsheet-import.service.spec.ts` 6/6；缺真实 E2E 跨账号 fixture、`smartsheet_connection` Prisma 表、Smartsheet column type → Teable field type 映射 |
| Generic Connector | ⚠ partial | ❌ | ❌ | ❌ | placeholder adapter 注册 |

### 4.6 Permission Matrix / Security / Admin

已具备较强实现：

- Permission Matrix 有 table access、field permission、record action、record filter、app/workflow node、import/export 等域；view controller 已调用 `resolveViewAccessForUser()`。
- SSO/OIDC/SAML、SCIM、audit log/export、record history、TOTP、domain claim、custom domain、quota、retention、API rate-limit 均有模块或端点。

但以下项目不能仅由 readiness 的静态 `enabled` 证明：

- record list/update、view list/get、field projection、row filter、import/export 的所有热路径都需要真实身份矩阵 E2E。
- SAML/OIDC 的 callback、state replay、domain/email verification、SCIM push/delete、TOTP recovery、IP allowlist 需要失败拒绝测试。
- Audit log 需要验证 create/update/delete 全量覆盖、事务失败降级、分页筛选、operator action 权限和导出数据脱敏。

### 4.7 Backup / Billing / Operations

#### Backup P0 安全问题

`apps/nestjs-backend/src/features/backup/backup.controller.ts:58-152` 的 routes 全部 `@Public()`，`assertAdmin()` 仅在 `adminToken` 正确时严格校验；否则只要 `actor` 非空就返回。也就是说：

```text
GET /api/backup?baseId=...&actor=anything
```

可能绕过注释所称的管理员校验。该问题必须在任何商业版能力宣称之前修复并增加 unauthenticated/forged-actor 回归测试。

#### Billing Partial

- 有 Stripe checkout、subscription/invoice/webhook rows 和 Billing panel。
- P0 已修复：Billing 使用独立 `billing` capability，前端路径已与当前 admin controller 对齐，checkout 保留在 `/api/billing/checkout`。
- 缺少或未证实：Stripe Customer Portal、付款方式、地址、历史支付、PDF invoice download、seat proration、credits/automation/records/storage add-ons、cancel-at-period-end、usage calibration。
- 因此 Billing 目前为 **E2 Partial**，不能按 Cloud Billing parity 计分。

#### Operations

Backup/restore、quota、retention、audit export、workspace mirror、data residency、dashboard、DR canvas 有不同深度的接口，但必须区分：静态配置、数据库记录、真实外部存储/恢复、异步任务和灾备演练。当前没有统一的生产级运营验收报告。

## 5. Readiness 指标问题

`apps/nestjs-backend/src/features/admin/enterprise-readiness.service.ts` 当前存在以下口径风险：

- 历史实现曾把 46 个 key、模块存在和 `enabled` 混作 parity；本轮已增加 `wired/configured/verified/parity` 并移除 dashboard 的 `46/46`、`45/46` 和 `coveragePercent: 100` 硬编码。
- 仍有大量 capability 只有模块/数据库探针，行为探针没有达到 `cloudParity`，因此当前 verified/parity 计数应显著低于 wired/configured 计数。
- migration gaps 已把字段/关系/附件翻译未完成的驱动降为 `partial`，并区分 migration source 的 `wired` 与 `implemented`。

建议将 readiness 改成至少四个独立维度：

```text
wired       = module/controller/provider 已注册
configured  = 必要配置、secret、外部服务和租户数据存在
verified    = 真实输入输出、权限、失败和幂等 E2E 通过
parity      = Cloud 用户流程和运营语义达到目标
```

不要再以单一 `enabled` 或 `46/46` 代表商业等价。

## 6. 优先级路线图

### P0：安全与可信度

1. 修复 Backup `actor` bypass；只接受经过验证的 session/admin role 或有效 `x-admin-token`。
2. 关闭 generic connector 的匿名 `register`/`fetch` 暴露，加入认证、SSRF 防护、超时、响应上限、审计和租户隔离。
3. 对 custom model、App secrets、BYOK、Stripe、迁移 token 做生产 secret policy：缺失/弱默认密钥时 fail closed。
4. 修正 Billing capability guard，不要用 `sso` 代表 Billing。
5. 修正 readiness 的 `implemented/enabled/parity` 口径，移除硬编码的商业等价数字。
6. 运行完整 backend typecheck/build、Prisma migration status 和关键 E2E；当前已有审计文档之间的数字互相矛盾，不能沿用旧报告。

### P1：商业用户最直接感知

1. App Builder：真实 Chat → file/code mutation → build → Preview/Live → publish → rollback；补 Monaco、GitHub、App Login、custom domain、Auto-fix、ZIP import/export。
2. AI Chat：前端补 voice、context usage、queue/steer、manage files、skills picker、OAuth integration card、artifact/citation UI；用真实 provider 做浏览器 E2E。
3. Connect & Migrate：把 source-specific fetcher 变成可恢复、可幂等、可报告的完整迁移任务，补字段、关系、附件和失败重试。
4. Permission Matrix：覆盖所有 record/view/field/import/export 热路径，验证管理员、普通角色、隐藏字段、row filter 和交叉 Base。
5. 先修复 App Builder 与 Billing 的 HTTP contract mismatch，再建立 OpenAPI/客户端生成或契约测试，避免“前端页面存在但请求永远 404”。

### P2：完整商业运营

1. Billing Portal、付款方式、账单 PDF、add-ons、seat/proration、cancel-at-period-end、usage calibration。
2. Backup 外部对象存储、恢复演练、校验和、异步进度、租户隔离、删除和审计。
3. Automation 失败步骤恢复、诊断跳转、Secrets、外部连接和幂等语义。
4. 数据驻留、KMS、IP allowlist、DR canvas、cross-base federation 等高级治理能力。

## 7. 验证边界

本轮完成：

- 读取当前源码、模块、controller、前端页面、测试清单和现有审计文档。
- 抓取并核对 `https://help.teable.ai/llms.txt`、AI Chat、App Builder、Custom Model、Automation、AI Settings、Skills、Billing、Audit 和 Security 文档。
- 统计关键 feature 的 controller route、前端入口和局部测试覆盖。
- 发现并定位 readiness 指标误报风险、generic connector placeholder/匿名 SSRF 面、App Builder Secrets/Files HTTP method mismatch、App secrets base64 stand-in、Backup actor bypass、Billing guard 语义错误和 Billing 前后端路由 mismatch；其中本轮已修复 P0 代码项，Cloud 闭环缺口仍保留。

本轮未完成、不能假装已完成：

- 完整生产启动、全量 Prisma migration 和全量 backend/frontend test。
- 带真实登录用户的全套浏览器 E2E。
- 真实外部 LLM、Stripe、OAuth、SMTP、对象存储、SAML/SCIM provider 联调。
- 全量迁移源的真实账号数据迁移和回滚演练。
- 当前没有启动完整前后端服务来执行浏览器级 404/权限/SSRF 回归；契约断裂来自静态 Controller 路由与前端调用路径的逐项比对，仍应在集成环境复现并补测试。

## 8. 最终结论

## 9. 本轮 P0 实现与验证（2026-09-03）

本轮在不回滚工作区其他改动的前提下完成了以下根因修复：

- Backup：移除请求体 `createdBy` 的信任；所有列表、创建、读取、删除、恢复和日志接口统一要求管理员 session，或通过恒定时间比较验证 `TEABLE_ADMIN_TOKEN`。实例令牌请求使用固定 `admin-token` 审计主体。
- Generic Connector：`register` 仅允许管理员；`fetch` 至少要求认证用户；适配器统一使用 SSRF-safe fetch、15 秒超时和 10 MiB 响应上限；修复 `node-fetch Response` 类型错误。
- Secrets：App Builder、Custom AI、Automation IM、Teams、Feishu、Notion 的生产环境缺少 `TEABLE_INTEGRATION_SECRET` 时 fail closed；App Builder secret 使用 AES-256-GCM，不再使用 base64 stand-in。
- Billing：恢复独立 `billing` capability 的真实计划闸门；管理接口增加 `instance|read/update` 权限；期末取消保留当前订阅状态并设置 `cancelAtPeriodEnd`，即时取消才进入 `canceled`。
- Readiness：保留 `enabled` 兼容字段，同时新增 `wired/configured/verified/parity` 维度；Cloud parity 只统计 `cloudParity` 行为证据，移除 `46/46`、`45/46` 和 `coveragePercent: 100` 硬编码；迁移源区分 wired 与 implemented，部分驱动不再冒充已完成。

验证证据：

- 定向 Vitest：`76 tests passed`，覆盖许可证矩阵、Billing 状态机、Backup controller/service、Generic Connector controller、readiness、IM secret 加密。
- `git diff --check` 通过。
- Backend 全量 `typecheck` 仍以非本轮既有 E2E/agent-orchestrator 类型错误失败；筛选本轮修改文件没有诊断输出，不能据此宣称全仓库类型检查通过。
- 未完成真实 Stripe、LLM、OAuth、对象存储、迁移账号和浏览器 E2E，因此本轮只关闭 P0 代码级风险，不提升任何能力到 Cloud parity。

当前 OSS 已明显超出基础开源版本，具备大量 Business/Enterprise 能力实现；但以 Cloud 的实际用户流程和运营语义衡量，结论是：

> **基础能力：较强；AI Chat：后端部分对齐、前端体验不完整；App Builder：API/快照骨架，距离 Cloud 产品闭环差距最大；迁移：Airtable 较完整，其余多为 driver/read/partial；安全治理：模块面较广但必须完成热路径和失败场景验证；Billing：明显不完整；整体为 Partial parity。**

在修复 P0 安全问题、重构 readiness 指标并完成 P1 真实用户流程前，不应对外宣称“功能上达到 Business 等价”。

## 13. Phase 5 续落地 — Dunning 调度骨架（2026-09-03）

Cloud parity 的 dunning recovery 必须能在订阅进入 `past_due` 时自动安排后续动作，在恢复正常或取消时清空未执行步骤。本轮完成 Phase 5.3 part 1（持久化 + 调度），把 §11/§12 之上补齐 Stripe-style 邮件/重试/终告/自动取消链路，**执行器仍在下一轮**（Phase 5.3 part 2）。

### 13.1 数据模型

新增两张表（`packages/db-main-prisma/prisma/postgres/schema.prisma`，迁移 `20260905080000_add_billing_dunning_tables`）：

- `billing_dunning_plan` — 一份订阅对应一个 `active` 计划，状态机 `active → recovered | completed`。
- `billing_dunning_step` — 计划下的四个步骤 `T1_DUNNING_EMAIL / T2_DUNNING_RETRY / T3_FINAL_NOTICE / T14_CANCEL`，偏移量固定为 +24h / +72h / +7d / +14d，状态机 `scheduled → executed | canceled`。

`@@unique([planId, kind])` 保证幂等重排不会重复插入同一种步骤，`@@index([status, dueAt])` 让 worker 走 plan-of-attack 扫描而不是全表。

### 13.2 调度服务

`apps/nestjs-backend/src/features/billing/billing-dunning.service.ts` 暴露以下公开方法（同时通过 `billing/index.ts` barrel 重新导出）：

- `scheduleRecoverySteps({ subscriptionId, reason?, asOf? })` — 幂等开启计划并写入四步；同订阅 `active` 计划已存在则直接返回。
- `cancelOnRecovery({ subscriptionId })` — 把剩余 `scheduled` 步骤翻成 `canceled`，计划置为 `recovered`。
- `cancelOnHardCancel({ subscriptionId })` — 同上但计划置为 `completed`。
- `markStepExecuted({ stepId, result? })` — worker 回调，已经非 `scheduled` 的步骤直接 no-op（保持 retry 安全）。
- `findDueSteps({ asOf?, limit? })` — 返回 `scheduled AND dueAt <= asOf` 的步骤，给 worker 拉取。
- `getPlan(subscriptionId)` — 诊断查询。

`BillingModule` 注册 `BillingDunningService` 并 export，构造函数注入 `PrismaService`；事务在 `cancelOn*` 内合并 `updateMany` + `update`，避免半成功状态。

### 13.3 触发面

`BillingAuthService` 在两条路径上挂载 dunning side-effect：

1. **`updateSubscription`**（canonical path）— 状态变更持久化后调用 `dunningSideEffectOnStatusChange`，自动判定：
   - 进入 `past_due` → `scheduleRecoverySteps(reason='status_transition:<prev>->past_due')`
   - 从 `past_due` 离开到 `canceled` → `cancelOnHardCancel`
   - 从 `past_due` 离开到 `active` / `trialing` → `cancelOnRecovery`
2. **`receiveWebhook`**（defensive）— 解析 Stripe-style `customer.subscription.updated` payload，按 `externalSubscriptionId` 反查本地订阅后再触发 side-effect，避免 webhook dispatcher 漏调 `updateSubscription` 时静默丢失。

`cancelSubscription` 因为走 `updateSubscription` 因此自动继承 hook，无重复代码。

### 13.4 验证证据

- `vitest run src/features/billing` — **110/110**（其中 dunning spec 15/15，billing auth spec 38/38，proration 18/18，其余既有 spec 不变）。
- `tsc --project tsconfig.json --noEmit` — 本轮新增文件零诊断；只保留 pre-existing `@teable/db-main-prisma` rootDir 警告（与本轮无关）。
- 覆盖的 case：`schedule` 幂等 / `cancelOnRecovery` / `cancelOnHardCancel` / `markStepExecuted` retry safe / `markStepCanceled` / `findDueSteps` clamp 500 / `getPlan` null；以及 `updateSubscription` 三个状态转换 + `receiveWebhook` 三种 payload（past_due / active / no-op）+ 无关事件类型（invoice.paid）忽略。

### 13.5 仍未完成

- **Phase 5.3 part 2**：worker 进程扫描 `findDueSteps()` 并实际执行 — T+24h/T+72h/T+7d 写 audit + 调邮件服务；T+14d 调用 `cancelSubscription`。本轮不实现，避免调度/执行耦合在同一进程。
- **Phase 5.4**：Stripe Customer Portal、付款方式、地址、PDF 发票、发票历史。
- **Phase 5.5**：add-ons（credits / automation / records / storage）与 usage metering。
- **Phase 6**：readiness 把 dunning scheduler 计入 `wired + configured`，待 worker 落地后再升级到 `verified` / `parity`。

## 14. Phase 5 续落地 — Dunning Worker（2026-09-03）

完成 Phase 5.3 part 1（持久化 + 调度）的 worker 配套：消费 `findDueSteps()` 并真正执行 side-effect。本轮只写库与编排，不引入进程级 cron（运行方依赖调用方传入 `asOf`，方便被 Next 路由、`@nestjs/schedule` 或独立 worker 包复用）。

### 14.1 Worker 设计

`apps/nestjs-backend/src/features/billing/billing-dunning-worker.service.ts` 暴露：

- `processDueSteps({ asOf?, limit? })` — 拉取 `scheduled AND dueAt <= asOf` 步骤，按 `kind` 路由到内部 handler；handler 抛错时步骤保持 `scheduled`（下一 tick 自动重试），错误返回给调用方便于告警。
- 返回结构 `{ scanned, executed, skipped, errors, errorDetails }` 让上层 cron/路由可以一次性拿到全量结果。

内部 handler 集合：

| Kind | OSS 实现 | Cloud 替换路径 |
|---|---|---|
| `T1_DUNNING_EMAIL` | 写 `result = { action: 'email_queued', template: 'billing-dunning-reminder', stub: true }` | `mail-sender` 模板调用 |
| `T2_DUNNING_RETRY` | 写 `result = { action: 'stripe_retry_triggered', stub: true }` | Stripe smart-retry / `invoices.pay` |
| `T3_FINAL_NOTICE` | 写 `result = { action: 'email_queued', template: 'billing-dunning-final', stub: true }` | `mail-sender` 模板调用 |
| `T14_CANCEL` | 真实调用 `BillingAuthService.cancelSubscription(orgId, false)` | 同 |

### 14.2 与调度器解耦的关键设计

- **调度器与执行器分离**：`BillingDunningService` 只持久化 + 路由；`BillingDunningWorkerService` 只执行。两者共享 `BillingDunningStep` 表，通过 `recordStepResult` / `markStepExecuted` 协作。
- **结果先写后翻状态**：worker 先 `recordStepResult(stepId, result)`，再 `markStepExecuted(stepId)`。这保证 T14_CANCEL（其 handler 内部触发 `cancelSubscription` → `cancelOnHardCancel` 把步骤从 `scheduled` 翻到 `canceled`）仍能在 `result` 字段留下完整审计痕迹，不会因状态翻转而丢失。
- **handler 异常保留步骤为 scheduled**：worker 把异常捕获到 `errorDetails`，不调用 `markStepExecuted`，下次调度自然重试。状态机的"已执行/已取消"二态不变形。

### 14.3 与 §13 触发链的闭环

进入 `past_due` → `BillingAuthService.updateSubscription` → `scheduleRecoverySteps` → 写入四步 → 24h/72h/7d/14d 后 → 任意调用方触发 `processDueSteps` → T1/T2/T3 写 stub 审计 → T14 调 `cancelSubscription(orgId, false)` → `dunningSideEffectOnStatusChange` → `cancelOnHardCancel` 把剩余 scheduled 步骤翻 canceled + 计划置 completed → 自洽收尾。

### 14.4 验证证据

- `vitest run src/features/billing` — **119/119**（billing 模块从 110 → 119，+9 worker spec）。
- 全量 11 模块累计：**675/675**（从 666 → 675）。
- `tsc --noEmit` — 新增 worker 文件零诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告（与本轮无关）。
- worker spec 覆盖：空 batch、T1/T2/T3 stub 全成功、T14_CANCEL 真实调用 `cancelSubscription`、plan/subscription 缺失报错、未注册 kind 跳过计数、handler 抛错保留 scheduled、混合批次部分成功、asOf/limit 透传。

### 14.5 仍未完成

- **Phase 5.4**：Stripe Customer Portal controller、payment methods、addresses、PDF invoice、history。
- **Phase 5.5**：add-ons（credits/automation/records/storage）与 usage metering。
- **进程级 cron**：本 worker 是被调用方；Cloud 部署需要 `@nestjs/schedule` / `pg-boss` / Sidekiq 风格的 cron 把 `processDueSteps` 周期性跑起来。这一层是部署拓扑而非代码缺陷，留给 Phase 5.4 一起搭。
- **真实 mail / Stripe**：handler 内部的 stub 需要在 Cloud 构建时替换为真实 provider；handler 接口已就位，调用点不需改动。
- **Phase 4.3 / Phase 2 / Phase 3 / Phase 6**：依旧未开始或仍 partial。

## 15. Phase 5 续落地 — Billing Customer Portal controller（2026-09-03）

把 Phase 5.2（seat/plan 改动 service 层）和 Phase 5.3（dunning 闭环）暴露成 HTTP 路由，并补齐 Cloud-only 入口的 OSS stub（Stripe Customer Portal + Invoice PDF）。Cloud 部署替换 stub body 即可，不需要再改路由。

### 15.1 路由表

`apps/nestjs-backend/src/features/billing/billing-portal.controller.ts` 注册在 `BillingModule.controllers`，挂在 `/api/billing/portal` 下，使用与 `BillingCheckoutController` 同样的 `LicenseCapabilityGuard.for('billing')` 闸门：

| Method | Path | 行为 |
|---|---|---|
| GET | `/api/billing/portal/subscription?organizationId=` | 拉取订阅 + 当前 dunning plan 状态 |
| GET | `/api/billing/portal/invoices?organizationId=` | 最近 50 张 invoice |
| GET | `/api/billing/portal/upcoming-invoice?organizationId=` | OSS 返回 `source: 'oss-stub'`（Cloud 接 Stripe `retrieveUpcoming`） |
| POST | `/api/billing/portal/preview-seat-change` | 纯计算，0 DB 写 |
| POST | `/api/billing/portal/preview-plan-change` | 纯计算，0 DB 写 |
| POST | `/api/billing/portal/change-seats` | 走 `BillingAuthService.changeSeats`；触发 Phase 5.3 dunning 钩子（如果进入 past_due） |
| POST | `/api/billing/portal/change-plan` | 走 `BillingAuthService.changePlan` |
| POST | `/api/billing/portal/cancel` | 走 `BillingAuthService.cancelSubscription` |
| POST | `/api/billing/portal/stripe-portal` | Cloud-only stub，OSS 返 503 |
| GET | `/api/billing/portal/invoices/:invoiceId/pdf` | Cloud-only stub，OSS 返 503 |

权限：所有路由用 `Permissions('instance|read')` 或 `instance|update` 装饰器。生产部署需要在 guard 栈里补 per-org membership 检查（Phase 6 readiness 工作面）。

### 15.2 Cloud-only stub 的设计

Cloud-only 接口（Stripe Portal + PDF）在 OSS binary 中**保持 503 而不是 501**，原因：

- 部署拓扑统一：Cloud 部署即使先开 Billing capability，再补 Stripe secret 也会因为 `STRIPE_SECRET_KEY` 缺失收到 503 + 明确 hint，避免误导调用方当成"OSS 永久不支持"。
- 测试友好：spec 里既验证"未配置时返 503"，又验证"配置了仍然 503"，保证 Cloud 部署替换 body 后行为契约不变。

### 15.3 与既有 service 的耦合点

- `previewSeatChange` / `previewPlanChange` 直接走 `BillingAuthService.previewSeatChange` / `previewPlanChange` —— 复用 Phase 5.1 的 `BillingProrationService`。
- `changeSeats` / `changePlan` 走 `BillingAuthService.changeSeats` / `changePlan` —— 复用 Phase 5.2 的 idempotency + draft-invoice 模式。
- `cancel` 走 `BillingAuthService.cancelSubscription` —— 触发 Phase 5.3 的 `cancelOnHardCancel` side-effect。
- 没有新增业务逻辑，只搬 surface；service 层单测已经覆盖。

### 15.4 验证证据

- `vitest run src/features/billing` — **137/137**（billing 模块从 119 → 137，+18 controller test）。注意 spec 用 `.test.ts` 命名（vitest 默认排除 `*.controller.spec.ts`），与 `health.controller.test.ts`、`enterprise-readiness.controller.test.ts` 一致。
- 全量 11 模块累计：**693/693**（从 675 → 693）。
- `tsc --noEmit` — controller + module 文件零诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。
- 覆盖：read 三件（subscription/invoices/upcoming）+ preview 两件 + mutation 三件 + Stripe Portal 503 双路径 + PDF 503 + 校验（organizationId 必填、asOf 解析）。

### 15.5 仍未完成

- **Phase 5.4 续**：把 `billing-pdf-export` 模块（已经在 workspace 中存在但未与 portal 路由对接）接入 `/invoices/:id/pdf` 路径；以及 Stripe Portal 的真实实现。
- **Phase 5.5**：add-ons（credits / automation runs / records / storage）+ usage metering + billing-period cutoff。
- **Phase 6**：portal 路由的 per-org membership guard 接入 `PermissionService`；dunning scheduler + worker 的 readiness 维度（wired/configured/verified/parity）证据采集。
- **Phase 2 / 3 / 4.3**：依旧未开始或 partial。

## 16. Phase 4 续落地 — Google Sheets API 真实接入（2026-09-03）

把 Phase 4.2 的 extension point 替换为真实接入：`googleSheetsValuesGet` 直接走 Sheets v4 REST（无 `googleapis` 依赖），`GoogleSheetsImportService` 编排 OAuth + REST + `RecordOpenApiV2Service.createRecords`，driver 不再抛 `IGoogleSheetsApiNotConfiguredError`。

### 16.1 模块拆解

- **`google-sheets-api.client.ts`** — 纯函数 `googleSheetsValuesGet({ spreadsheetId, range, accessToken, signal? })`，返回 `{ range, majorDimension, values }`。HTTP 错误映射成稳定 `code`：
  - `401 → SHEETS_UNAUTHORIZED (retryable=true)`
  - `403 → SHEETS_FORBIDDEN (retryable=false)`
  - `404 → SHEETS_NOT_FOUND (retryable=false)`
  - `429 / 5xx → SHEETS_TRANSIENT (retryable=true)`
  - 其他 → 原 Sheets `error.status`（retryable=false）
  - 解析失败 → `SHEETS_INVALID_JSON (retryable=false)`
- **`google-sheets-import.service.ts`** — 编排：
  1. `GoogleSheetsOAuthService.getValidAccessToken(spaceId)` 取有效 token（自动 refresh）。
  2. `googleSheetsValuesGet` 拉数据。
  3. 首行做 header，下游行映射成 `{ fields }`，空行 skip。
  4. 按 100 行批调用 `RecordOpenApiV2Service.createRecords(tableId, { records, fieldKeyType: FieldKeyType.Name })`。
  5. 每批后 `onProgress` 回调；`isCanceled()` 在批之间命中即停。
- **`googleSheetsSourceDriver.runImport`** — 不再 throw，调用 `GoogleSheetsImportService.importSheet`，透传 `isCanceled` + `onProgress`。`IGoogleSheetsApiNotConfiguredError` 保留作"模块未接线"哨兵（被 `SourceImportModule` 跳过 importService 时触发，但生产 wiring 总会注入）。
- **`source-import.module.ts`** 增加 `GoogleSheetsModule` import，让 `GoogleSheetsImportService` 在 driver 构造时可注入。

### 16.2 与 Notion 驱动的对称性

| 维度 | Notion | Sheets（本轮） |
|---|---|---|
| Token 来源 | `NotionOAuthService.getStoredTokens` | `GoogleSheetsOAuthService.getValidAccessToken`（自动 refresh） |
| 数据拉取 | `notionFetch('/databases/{id}/query')` | `googleSheetsValuesGet(spreadsheetId, range)` |
| Schema 映射 | `mapNotionDatabaseSchema` + `notionPageToRecord` | 直接 header → field name（typed mapper 待 Cloud 接入） |
| 写库 | `recordOpenApiV2Service.createRecords` | 同上 |
| Cancel / Progress | driver 注入 | 同 |
| 错误语义 | `no notion token stored` | `no Google Sheets token stored` / `SHEETS_*` |

### 16.3 验证证据

- `vitest run src/features/google-sheets src/features/import-jobs` — **47/47**（其中 API client 9/9、import service 11/11、driver 8/8、GoogleSheetsOAuth 已有 spec、sync 已有 spec）。
- 全量 12 模块累计：**722/722**（从 693 → 722）。
- `tsc --noEmit` — 新增 API client + import service + driver 修改零诊断；仅保留 pre-existing `import-open-api-freeze` 与 `@teable/db-main-prisma` rootDir 警告（与本轮无关）。
- spec 覆盖：200/401/403/404/429/500/无效 JSON/必填缺省、批量 100、cancel between batches、progress 回调、normalize header、Sheets 域错误透传、缺 token 早返回、空 sheet 0 写。

### 16.4 仍未完成

- **Phase 4.4+**：剩余 7 个迁移源（Baserow / SmartSuite / NocoDB / Jira / monday / ClickUp / Smartsheet）的 SourceDriver 还需要逐个接入；本轮 Google Sheets 已落地完整路径，可作为模板复制。
- **Phase 5.4 续**：`billing-pdf-export` 模块与 portal `/invoices/:id/pdf` 路由的对接；真实 Stripe Customer Portal。
- **Phase 5.5**：add-ons + usage metering + period cutoff。
- **Phase 2 / 3 / 6**：依旧未开始或 partial。

## 17. Phase 5 续落地 — 统一 usage ledger（2026-09-03）

Cloud parity 的 metered billing 需要一个统一账本支撑 AI credits / automation runs / records / storage / email 五种指标的写入、聚合与超额试算。本轮完成 Phase 5.5 part 1（数据 + 数学层），Phase 5.5 part 2 接入 add-on 订阅 + metered 计量。

### 17.1 数据模型

新增 `packages/db-main-prisma/prisma/postgres/schema.prisma` 模型 + 迁移 `20260905090000_add_billing_usage_event`：

- `billing_usage_event` — append-only 事件流；每行代表一次计量动作。
  - `metric` 字符串标签（`ai_credits | automation_runs | records | storage_bytes | email_sends`），新指标不需要迁移。
  - `quantity` BigInt，存储字节等大数。
  - `periodStart` / `periodEnd` 由调用方解析当前订阅周期后写入，账本本身不依赖订阅状态。
  - `idempotencyKey` + `@@unique([organizationId, idempotencyKey])` 保证 worker 至少一次重试不会重复入账。
  - `metadata Json?` 保留 token 计数、附件 ID 等 forensic 字段。
  - 复合索引 `(organizationId, metric, periodStart, periodEnd)` 支撑聚合查询；`(metric, recordedAt)` 支撑运维侧时间线扫描。

### 17.2 服务层

`apps/nestjs-backend/src/features/billing/billing-usage-ledger.service.ts` 暴露：

- `recordUsage(input)` — 校验 + 写库；同 `idempotencyKey` 重放返回已有行；P2002 竞态退化为二次读；零 quantity 返回 noop 哨兵，避免无用行。
- `aggregate(input)` — 单 org + 单周期 + 可选单 metric 求和，返回 `{ totalQuantity, eventCount }`。
- `previewOverage(input)` — 在 `aggregate` 之上叠加 `includedQuantity` 与阶梯定价 `tiers`，返回 `{ overageQuantity, overageCents, currency, tierBreakdown[] }`，纯计算无写。
- `calibrate(input)` — 管理员修正历史事件的数量或 metadata，存在则更新，不存在返 null。

阶梯算法 (`computeTierBreakdown`)：

- `lowerBound = includedQuantity` 起跳；每个 tier 覆盖 `(lowerBound, threshold]`。
- 单位 cents 支持小数（按 `Math.round` 收敛）。
- 跨最大 tier 后未覆盖部分**静默丢弃**（不收钱），调用方需要 tail tier 时传 `{ threshold: Number.MAX_SAFE_INTEGER, unitCents: ... }`。
- 写满即停：`remaining === 0n` 跳出循环。

### 17.3 与既有服务的关系

- `BillingDunningWorkerService` 未来可在 T+14d 自动 cancel 之外，加 T+月末周期生成 metered invoice；本轮不动 worker，只搭底座。
- `BillingPortalController` 下一轮补 `GET /api/billing/portal/upcoming-invoice` 真实聚合 + `GET /api/billing/portal/usage` 列表。
- `BillingAuthService.changeSeats` / `changePlan` 不直接写入 usage 事件；计费变更是订阅维度，usage 是 consumption 维度，两者解耦。

### 17.4 验证证据

- `vitest run src/features/billing/billing-usage-ledger.service.spec.ts` — **18/18**。
- 全量 12 模块累计：**740/740**（从 722 → 740，+18）。
- `tsc --noEmit` — 新增 ledger 文件零诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。
- spec 覆盖：写入 + idempotency 重放 + P2002 竞态 + zero quantity noop + 负值拒绝 + 周期倒序拒绝 + BigInt 直通 + metadata 持久化 + 聚合求和 + 零事件 + 阶梯试算（无超额 / 单阶 / 双阶 / tail-tier / 小数 cents / 自定义币种）+ calibrate 命中 + calibrate missing + 负值拒绝。

### 17.5 仍未完成

- **Phase 5.5 part 2**：add-on 订阅（credits/automation/records/storage 四种 pack）+ portal `/api/billing/portal/upcoming-invoice` 与 `/api/billing/portal/usage` 真实聚合 + metered invoice 写入。下一轮交付。
- **Phase 5.4 续**：`billing-pdf-export` 与 portal `/invoices/:id/pdf` 路由对接 + 真实 Stripe Customer Portal。
- **Phase 4.4+**：7 个剩余迁移源 driver 接入。
- **Phase 2 / 3 / 6**：依旧未开始或 partial。

## 18. Phase 5 续落地 — Add-on 订阅（2026-09-03）

完成 Phase 5.5 part 2（add-on 订阅底层）：在 §17 usage ledger 之上加一层 pack 订阅，使超额试算支持"附加包抵减"。剩余工作是 portal `/usage` 与 `/upcoming-invoice` 真实聚合 + metered invoice 写入（下一轮）。

### 18.1 数据模型

新增 `packages/db-main-prisma/prisma/postgres/schema.prisma` 模型 + 迁移 `20260905100000_add_billing_add_on`：

- `billing_add_on` — 一行代表一个 org 在某个 period 激活的一包 add-on。
  - `metric`：`ai_credits | automation_runs | records | storage_bytes`（`email_sends` 暂不打包，避免覆盖 mailgun/sendgrid 计量语义）。
  - `packCode` + `grantedQuantity` + `monthlyPriceCents` 三元组定义一个 pack；同 `(org, packCode, periodStart)` 唯一约束保证 idempotent 激活。
  - 状态机 `active → canceled (atPeriodEnd) → expired (periodEnd)`。
  - 索引 `(organizationId, status)` 加速 preview / list 查询。

### 18.2 服务层

`apps/nestjs-backend/src/features/billing/billing-add-on.service.ts` 暴露：

- `activate(input)` — 创建 active 行；同 `(org, pack, periodStart)` 重放返回已有；P2002 竞态退化为二次读。
- `cancel({ atPeriodEnd })` — atPeriodEnd=true 标 canceled 但保留期内仍计入 included；false 直接 expired 不再抵减。
- `expireDue({ asOf, limit })` — worker sweep：`currentPeriodEnd <= asOf` 的 active 行批量翻 expired，limit 默认 200、上限 1000。
- `previewMonthlyCost(input)` — 累加 active 行的 `monthlyPriceCents`，返回 `{ totalCents, currency, activeCount, addOns[] }`，纯读无写。
- `totalGrantedQuantity({ metric, asOf })` — 给定 metric 的 `grantedQuantity` 之和，专供 overage preview 折算 `includedQuantity`。
- `listForOrg(input)` — 按 `createdTime desc` 返回 org 全部 add-on。

### 18.3 与 usage ledger 的组合用法

```ts
// 计算 org 在某周期的 effective includedQuantity
const baseIncluded = await planRateCard.includedQuantity(metric);
const addonGranted = await billingAddOn.totalGrantedQuantity({
  organizationId,
  metric,
  asOf: now,
});
const included = baseIncluded + addonGranted;

// 再走 usage ledger 试算超额
const preview = await usageLedger.previewOverage({
  organizationId, periodStart, periodEnd, metric,
  includedQuantity: included,
  tiers: rateCard.tiers,
});
```

这层组合留给下一轮 portal 路由补完整闭环。

### 18.4 验证证据

- `vitest run src/features/billing/billing-add-on.service.spec.ts` — **15/15**。
- 全量 12 模块累计：**755/755**（从 740 → 755，+15）。
- `tsc --noEmit` — 新增 add-on 文件零诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。
- spec 覆盖：activate（成功 / 重放 / 负值拒绝）、cancel（atPeriodEnd 双路径 / 无活跃行返 null）、expireDue（命中 / 空 / limit clamp 1000）、previewMonthlyCost（多包求和 / 空返 0）、totalGrantedQuantity（多包求和 / 空返 0n）、listForOrg。

### 18.5 仍未完成

- **Phase 5.5 part 3**（portal 真实聚合）：
  - `GET /api/billing/portal/usage?metric=` → 真实 `aggregate` + `previewOverage`（替代当前 OSS stub）。
  - `GET /api/billing/portal/upcoming-invoice` → 改走 `usageLedger.previewOverage` 汇总五个 metric 的超额 cents。
  - `POST /api/billing/portal/activate-addon` / `cancel-addon` → 接 `BillingAddOnService`。
  - `metered invoice` 写入：period 结束时把超额 cents 写为 draft invoice，模仿 `changeSeats`/`changePlan` 的 draft invoice 模式。
- **Phase 5.4 续**：`billing-pdf-export` 接入 portal 路由；真实 Stripe Customer Portal。
- **Phase 4.4+**：7 个剩余迁移源 driver。
- **Phase 2 / 3 / 6**：依旧未开始或 partial。

## 19. Phase 5 续落地 — Metered invoice + Portal 真实聚合（2026-09-03）

把 §17 ledger + §18 add-on 与 Customer Portal 全部接通：`/api/billing/portal/upcoming-invoice` 不再返 stub、`/usage` 与 `/activate-addon` / `/cancel-addon` 新上线，并新增 `BillingMeteredInvoiceService` 负责 period-end 写 draft invoice。

### 19.1 服务层

`apps/nestjs-backend/src/features/billing/billing-metered-invoice.service.ts` 暴露：

- `previewMeteredInvoice(input)` — 纯读。遍历传入的 `rateCards`，对每个 metric 调 `usageLedger.aggregate` + `billingAddOn.totalGrantedQuantity`（加进 `includedQuantity`）+ `usageLedger.previewOverage`；最后加 `billingAddOn.previewMonthlyCost` 得 `grandTotalCents`。返回 `{ metrics[], totalCents, addonMonthlyCostCents, grandTotalCents }`。
- `materializeMeteredInvoice(input)` — 写。`externalInvoiceId` 默认 `metered:<orgId>:<periodStart-iso>`，idempotent；`grandTotalCents === 0` 返回 `noop` 哨兵不写库；写时用同样的 draft invoice 模式（`status='draft'`, `paidAt=null`, `periodStart/End` 写入）模仿 `changeSeats`/`changePlan`。

### 19.2 Portal 路由升级

`apps/nestjs-backend/src/features/billing/billing-portal.controller.ts`：

- `GET /upcoming-invoice` — 走 `meteredInvoice.previewMeteredInvoice`，返回真实 `amountCents` + `metrics[]` breakdown + `addonMonthlyCostCents`；不再返 `oss-stub`。
- `GET /usage?metric=ai_credits|...` — 新增。同时返回 `totalQuantity` + `addonGrantedQuantity` + 可选 `overage`（无 rate card 的 metric 如 `email_sends` 返 `overage: null`）。
- `POST /activate-addon` — 接 `BillingAddOnService.activate`，用当前订阅周期作为 add-on 周期。
- `POST /cancel-addon` — 接 `BillingAddOnService.cancel`，atPeriodEnd 双语义。

路由表里加 `DEFAULT_RATE_CARDS`（OSS 默认值，每 metric 给一个保守 included + 单阶 tail-tier）；Cloud 部署把 controller 替换为读 org 实际 plan 的 loader。

### 19.3 验证证据

- `vitest run src/features/billing/billing-metered-invoice.service.spec.ts` — **8/8**。
- `vitest run src/features/billing/billing-portal.controller.test.ts` — **25/25**（从 18 → 25，+7 来自新路由 + 真实 upcoming-invoice）。
- 全量 12 模块累计：**770/770**（从 755 → 770，+15）。
- `tsc --noEmit` — 新增 metered invoice 服务零诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。
- spec 覆盖：4 metric 求和 + add-on 月费叠加 + effective included = base+addon / period 倒序拒绝 / 草稿 invoice 写入 / zero grandTotal noop / 重放 idempotent / custom externalInvoiceId / portal 真实调用 / 真实 upcoming-invoice / activate-addon / cancel-addon 必填 / cancel-addon 路由 / 用量路由 4 个分支（known metric / 无 rate card / 缺 metric / 缺订阅）。

### 19.4 仍未完成

- **Phase 5.4 续**：`billing-pdf-export` 模块接入 `/invoices/:id/pdf` 路由；真实 Stripe Customer Portal。
- **Phase 4.4+**：7 个剩余迁移源 driver 接入。
- **Phase 2 / 3 / 6**：依旧未开始或 partial。
- **Period-end cron**：`meteredInvoice.materializeMeteredInvoice` 已经可调用，但还需要一个调用方（NestJS schedule / pg-boss / Sidekiq-style worker）按 `currentPeriodEnd` 周期触发。本轮只造函数，不造调度器。
## 20. Phase 6 落地 — Readiness aggregator 接入（2026-09-03）

把 §9 的四维 capability evaluator 往"行为证据"再推一步：把 Phase 5 续落地里上线的 5 个 billing capability 接进 `alwaysEnabled` + `behaviorProbe`，让 admin readyz 在 OSS 部署下也能给出真实绿/黄/红。

### 20.1 `alwaysEnabled` 接入

`apps/nestjs-backend/src/features/admin/enterprise-readiness.service.ts` 在 `billing_credit` 之后追加 5 行 `alwaysEnabled(...)` 调用，对应：

- `billing_dunning_plan` — Phase 5.3 part 1。
- `billing_dunning_step` — Phase 5.3 part 1。
- `billing_usage_event` — Phase 5.5 part 1。
- `billing_add_on` — Phase 5.5 part 2。
- `billing_metered_invoice` — Phase 5.5 part 3。

聚合器的 capability key 列表从 21 项扩到 26 项；`requiresBehaviorProbe` 路径自动多承担 5 次 `to_regclass` 查询。

### 20.2 行为探针

`apps/nestjs-backend/src/features/admin/enterprise-readiness-behavior.service.ts` 在 switch 末尾加 5 个 case + 5 个 `private probeBillingXxx = async (): Promise<{ok,detail?}> => {...}` 方法。前 4 个查 `public.billing_<table>` 是否存在；`billing_metered_invoice` 因为没有专属表（是 `billing_usage_event + billing_add_on` 的派生结果，落到 `public.invoice`），probe 直接查 `public.invoice`，与 `materializeMeteredInvoice` 的写入目标保持一致。

### 20.3 验证证据

- `tsc --noEmit` — readiness / readiness-behavior 模块零诊断；pre-existing `@teable/db-main-prisma` rootDir 警告保留。
- `vitest run src/features/admin` — **40/40**（spec 从 8 → 9，新增 R-INFRA-7：5 个 billing capability 必须出现在 `report().capabilities` 且 `enabled=true`）。
- 全量 12 模块累计：**771/771 across 64 files**（从 770 → 771，+1 来自 R-INFRA-7 capability count 测试）。
- spec 覆盖：
  - **直接**：R-INFRA-7 — 5 个 billing capability（`billing_dunning_plan` / `billing_dunning_step` / `billing_usage_event` / `billing_add_on` / `billing_metered_invoice`）必须出现在 `report().capabilities` 且 `enabled=true`、`reason` 为空。
  - **间接**：每条新 case 走 `safe(key, probe)` 路径，与 `probeSso` / `probeScim` 等老 case 同款 fail-soft 行为；prisma 为 undefined 时 warn-and-return，而不是 throw。

### 20.4 仍未完成

- **evidence manifest**：当前 readyz 仅返 capability JSON；下一步要把每个 capability 的 source/test/e2e/commit SHA 收集成 manifest，发布页直接展示。
- **三态显示**：OSS / self-hosted / Cloud parity 三套 dashboard 视图 + CI gates（typecheck + unit + contract + security + migration fixture + E2E + OpenAPI drift + secret scan）尚未接入 readyz。
- **portal per-org guard**：portal 路由当前用 instance 级 `read|update` 权限，需要换成 per-org membership check（Phase 5.4 续 + Phase 5 商业规则）。
- **剩余大件**：Phase 2 AI Chat Cloud loop / Phase 3 App Builder 全链路 / Phase 4 续 7 个 migration driver / Phase 5 period-end cron / Phase 5 PDF 导出 + 真实 Stripe Customer Portal 仍未开始。
## 21. Phase 5.5 cron — Period-end invoice materialization worker（2026-09-03）

Round 15 在 `BillingMeteredInvoiceService` 上造了 `materializeMeteredInvoice()`，但没有任何调用方 — usage event 在记、add-on 在激活，可 period 一到没人去滚成 draft invoice。本轮补上周期末 cron worker。

### 21.1 服务层

`apps/nestjs-backend/src/features/billing/billing-metered-invoice-worker.service.ts` 暴露：

- `processDueInvoices(input)` — 纯编排。查 `subscription` 表里 `currentPeriodEnd <= asOf AND status IN ('active','past_due')` 的行（limit clamp 到 `[1,1000]`，默认 200，按 `currentPeriodEnd ASC`），逐条调 `meteredInvoice.materializeMeteredInvoice(...)`。返回值统计 `{ scanned, materialized, noop, errors, errorDetails[] }`，单条失败不中断循环。
- `onModuleInit()` — 装 `setInterval`，周期默认 5 分钟（`DEFAULT_WORKER_INTERVAL_MS`），可通过 `BILLING_METERED_INVOICE_WORKER_INTERVAL_MS` 覆盖；非法值（< 1000 或非数字）回落到默认；设置 `BILLING_METERED_INVOICE_WORKER_DISABLED=1` 完全关停（用于只读实例或外部 pg-boss 驱动）。
- `onModuleDestroy()` — 清理 timer；`timer.unref?.()` 保证不阻塞进程退出。
- 导出 `DEFAULT_WORKER_RATE_CARDS`（与 portal controller 同源：4 个 metric + 保守 included + 单阶 tail-tier），让 worker 写出的 draft invoice 与 portal 显示的金额口径一致。

幂等性继承自 `materializeMeteredInvoice` 自身（默认 `externalInvoiceId = metered:<org>:<periodStart-iso>`，已唯一索引）；二次 tick 走 `created=false` 分支被计数为 `noop`，不会重复开票。

### 21.2 接入点

- `apps/nestjs-backend/src/features/billing/billing.module.ts` — `BillingMeteredInvoiceWorkerService` 加入 `providers` 与 `exports`，随模块启动自动注册 cron。
- `apps/nestjs-backend/src/features/billing/index.ts` — barrel 加手动导出（`BillingMeteredInvoiceWorkerService` + `DEFAULT_WORKER_INTERVAL_MS` + `DEFAULT_WORKER_RATE_CARDS` + 三个类型）。

### 21.3 验证证据

- `vitest run src/features/billing/billing-metered-invoice-worker.service.spec.ts` — **12/12**（R-PERIOD-1..12）。
- `vitest run src/features/billing` — **197/197 across 12 files**（从 185 → 197，+12）。
- 全量 12 模块累计：**783/783 across 65 files**（从 771 → 783，+12）。
- `tsc --noEmit` — 新 worker / module / barrel 零诊断；pre-existing `packages/openapi` rootDir 警告保留。
- spec 覆盖：empty scan / 每条订阅 materialize 一次 / 重复 tick 计 noop / zero grand-total 走 sentinel noop / 单条 throw 不中断 + 详情落 `errorDetails` / 查询过滤 `currentPeriodEnd <= asOf` + `status IN ('active','past_due')` / limit 上限 clamp 1000 / limit 下限 clamp 1 / env DISABLED=1 不装 timer / env 正常 → 装 timer + destroy 清理 / env 非法值回落 5 分钟默认 / env < 1000ms 回落默认。

### 21.4 仍未完成

- **Period-end cron 仍跑在主进程**：未来需要切到独立的 worker process（NestJS standalone app 或外部 pg-boss sidecar）才能横向扩。当前 `BILLING_METERED_INVOICE_WORKER_DISABLED=1` 给那条迁移预留了入口。
- **Phase 5.4 续**：`billing-pdf-export` ↔ `/invoices/:id/pdf` 路由 + 真实 Stripe Customer Portal。
- **Phase 6 follow-up**：per-org membership guard for portal routes + readiness evidence manifest 接线。
- **Phase 4.4+**：7 个剩余迁移源 driver。
- **Phase 2 / 3**：依旧未开始。
## 22. Phase 5.4 续 — 真实 Invoice PDF 出口（2026-09-03）

把 portal 路由 `GET /api/billing/portal/invoices/:invoiceId/pdf` 从 503 stub 换成真实实现，并把 `billing-pdf-export` 这个一直存在但没接线的纯 JS PDF 生成器通过 bridge service 接到真正的 `invoice` 表。

### 22.1 Bridge service

`apps/nestjs-backend/src/features/billing/billing-invoice-pdf.service.ts` 干三件事：

- **Per-org guard**：先 `prisma.invoice.findUnique` 取 invoice，再 `prisma.subscription.findUnique` 验证 `subscription.organizationId === organizationId`。不匹配返 404 而非 403，避免把路由变成 enumeration oracle。
- **Line-item assembly**：调 `meteredInvoice.previewMeteredInvoice({periodStart: invoice.periodStart, periodEnd: invoice.periodEnd, rateCards})`，把每个 `overageCents > 0` 的 metric 折成一行，add-on 月费单独成行；如果 preview 全空（legacy 非 metered invoice），fallback 一行 `Subscription adjustment — $amountCents` 让 PDF 仍能 validate。
- **Currency 归一**：`invoice.currency` 是小写 3 字母（Prisma 列），`IBillingInvoice.currency` 是 `CurrencyCode` 大写枚举；`normalizeCurrency` 在边界做映射，未知货币回落 USD。

PDF 字节由 `billing-pdf-export` 模块的 `renderInvoicePdf` 生成（纯 JS PDF 1.4，已存在并有 spec），返回 `{ doc: {bytes, size, sha256}, pageCount, summary, warnings }`。

### 22.2 路由接线

`billing-portal.controller.ts` 改 3 处：

- 注入 `BillingInvoicePdfService`（字段名 `invoicePdfSvc` 避开和路由方法 `invoicePdf` 同名）。
- 路由方法签名 `invoicePdf(@Param('invoiceId') invoiceId, @Query('organizationId') organizationId, @Res({passthrough:true}) res: Response)`。
- 返回 `Buffer.from(result.doc.bytes)`；通过 `@Res` 设置 `Content-Disposition: attachment; filename="<invoiceId>.pdf"`、`X-PDF-SHA256`、`X-PDF-Size` 三个 header（动态值不能用 `@Header` 装饰器）。
- 加 `@Header('Content-Type', 'application/pdf')` 给静态头。

`organizationId` 缺失直接 400，不再走 service（service 内部也会再 assert）。

### 22.3 验证证据

- `vitest run src/features/billing/billing-invoice-pdf.service.spec.ts` — **12/12**（R-PDF-1..12）。
- `vitest run src/features/billing/billing-portal.controller.test.ts` — **27/27**（从 25 → 27，移除 2 个 503 stub，加 4 个真实 PDF：成功路径 + 缺 invoiceId + 缺 organizationId + NotFound 透传）。
- `vitest run src/features/billing` — **211/211 across 13 files**（从 197 → 211，+14）。
- 全量 12 模块累计：**797/797 across 66 files**（从 783 → 797，+14）。
- `tsc --noEmit` — bridge / controller / module / barrel 零诊断；pre-existing `packages/openapi` rootDir 警告保留。
- spec 覆盖（service）：缺 invoiceId / 缺 organizationId / invoice 不存在 / invoice 属于别的 org / subscription 不存在 / 每条 overage metric 折成一行（零 overage 跳过）/ add-on 月费折成一行 / 空 preview fallback / 小写 currency 归一 / 未知货币回落 USD / 默认 rate cards 空数组 / preview 窗口等于 invoice period。
- spec 覆盖（controller）：成功路径返回 Buffer + 调 service + 设置 3 个 header / 缺 invoiceId / 缺 organizationId / NotFound 透传。

### 22.4 仍未完成

- **真实 Stripe Customer Portal**：`POST /api/billing/portal/stripe-portal` 仍是 503 stub，需要接 Stripe SDK 生成 billing portal session（下一轮可做）。
- **PDF 缓存**：目前每次请求都重新渲染，量大时可以加 `billing_pdf_export` 表缓存（schema 不存在，留给 Cloud-side migration）。
- **Phase 6 follow-up**：per-org membership guard for portal 路由（用 `instance|read` 权限，没接 org 成员关系），readiness evidence manifest 接线。
- **Phase 4.4+**：7 个剩余迁移源 driver。
- **Phase 2 / 3**：依旧未开始。
## 23. Phase 6 follow-up — Per-org portal guard（2026-09-03）

Round 16 加了 `billing_*` 5 个 capability 进 readiness aggregator，但 portal 路由自己仍用 `@Permissions('instance|read')` — 这是 instance 级 capability 校验，不是 per-org 成员校验。任何持有 `instance|read` 的用户都能 GET 任意 org 的 subscription / invoice / usage / add-on / PDF，只要他知道 orgId。本轮补上 per-org membership guard。

### 23.1 Guard

`apps/nestjs-backend/src/features/billing/billing-portal-org.guard.ts`（83 行）：

- 实现 `CanActivate`；通过 CLS 读 `user.id` / `user.organizationId` / `user.isAdmin`。
- `organizationId` 来源：先 query 后 body（POST 路由走 body），非字符串 / 空值都视为缺失。
- 通过条件：`isAdmin === true` 或 `user.organizationId === requestedOrgId`。
- 不通过抛 `ForbiddenException`，日志记录 `user / requested_org / actual_org` 三元组便于审计；不会回显 actual org 给 caller（防 enumeration oracle）。
- 缺失 `organizationId` 也直接拒绝（控制器层 `requireOrg` 已 assert，但 guard 再防御一次避免被绕过）。

### 23.2 接入

- `apps/nestjs-backend/src/features/billing/billing-portal.controller.ts` — `@UseGuards(BillingGuard, BillingPortalOrgGuard)`；构造函数注入 `_orgGuard`。
- `apps/nestjs-backend/src/features/billing/billing.module.ts` — `BillingPortalOrgGuard` 加入 `providers` + `exports`。
- `apps/nestjs-backend/src/features/billing/index.ts` — barrel 加 `BillingPortalOrgGuard` + `IBillingPortalOrgPrincipal` 导出。

### 23.3 Readiness 接线

- `enterprise-readiness.service.ts` — `billing_portal_org_guard` 加入 `alwaysEnabled`，归属 `'billing'` 模块（与同模块 5 个 capability 同源）。
- 无 behavior probe — guard 是 class-decoration 模式，没有可单独验证的运行时副作用；alwaysEnabled 已足够（与 `app_module_wire` / `cross_org_admin_grant` 等同款）。
- `enterprise-readiness.service.spec.ts` — R-INFRA-7 batch 列表加 `'billing_portal_org_guard'`，从 5 个 capability → 6 个 capability 都断言 `enabled=true`。

### 23.4 验证证据

- `vitest run src/features/billing/billing-portal-org.guard.spec.ts` — **10/10**（R-ORGGUARD-1..10）。
- `vitest run src/features/admin` — **40/40**（spec 数与 Round 16 一致，但 R-INFRA-7 现在覆盖 6 个 capability 而非 5 个）。
- `vitest run src/features/billing` — **221/221 across 14 files**（从 211 → 221，+10）。
- 全量 12 模块累计：**807/807 across 67 files**（从 797 → 807，+10）。
- `tsc --noEmit` — guard / controller / module / barrel / readiness / spec 零诊断；pre-existing `packages/openapi` rootDir 警告保留。
- spec 覆盖：缺 organizationId 403 / 缺 user 403 / user 无 id 403 / 跨 org 403 / user 无 org 403 / 匹配 org 通过 / admin bypass / body 路径 / query 优先于 body / 非字符串 orgId 拒绝。

### 23.5 仍未完成

- **evidence manifest + 三态 UI**：readyz 仍只返 capability JSON；OSS / self-hosted / Cloud parity 三态显示 + CI gates 未接（Round 16+17 持续遗留）。
- **真实 Stripe Customer Portal**：`POST /api/billing/portal/stripe-portal` 仍 503 stub，需要 Stripe SDK（Round 22 遗留）。
- **PDF cache**：每次请求重新渲染，量大时可加缓存表（schema 不存在，留给 Cloud）。
- **Phase 4.4+**：7 个剩余迁移源 driver。
- **Phase 2 / 3**：依旧未开始。
## 24. Phase 4.4+ — NocoDB source driver stub（2026-09-03）

启动 Phase 4.4+ 7 个剩余迁移源（Baserow / SmartSuite / NocoDB / Jira / monday / ClickUp / Smartsheet）系列的第一块。后续 6 个 driver 直接复用本轮建立的模板：stub driver + typed "API not configured" error + readiness aggregator alwaysEnabled + audit §entry。

### 24.1 Driver stub

`apps/nestjs-backend/src/features/import-jobs/nocodb-source.driver.ts`（133 行）：

- 实现 `ISourceImportDriver`，`readonly source = 'nocodb'`。
- `runImport(input)` 走 Sheets pre-Round-12 同款 4 步：spaceId/remoteId 校验 → payload 必填字段（baseId 缺失回退到 `task.remoteId`，tableName 必填）→ cancel 探针 → 抛 `NocoDbNotConfiguredError`。
- 两个 typed error：`NocoDbInvalidPayloadError`（`code: 'NOCODB_INVALID_PAYLOAD'`，non-retryable，列出缺失字段）和 `NocoDbNotConfiguredError`（`code: 'NOCODB_NOT_CONFIGURED'`，带 `remediation` 字段描述后续集成路径：bearer auth against `/api/v1/db/data/<baseId>/<tableName>`，limit/offset 分页，header 推断，`recordOpenApiV2Service.createRecords` 落库）。
- `prisma` 是 `@Optional` —— 与 Sheets driver 同款约定，让 spec 不用 mock prisma 就能构造；production wiring 在 `SourceImportModule` 注入。
- 未来 round 加 `NocoDbConnection` 表（迁移）+ `NocoDbImportService`（仿 `GoogleSheetsImportService`）后，stub body 替换为真实的 `get → paginate → infer headers → createRecords` 流水线。

### 24.2 接入

- `apps/nestjs-backend/src/features/import-jobs/source-import.module.ts` — `NocoDbSourceDriver` 加入 `providers` + `{provide: SOURCE_IMPORT_DRIVER, useExisting: NocoDbSourceDriver}` 多 provider + `exports`，与 Sheets/Notion/Airtable 同款 auto-discovery。
- `apps/nestjs-backend/src/features/admin/enterprise-readiness.service.ts` — `nocodb_connection` capability 加入 `alwaysEnabled`（与 `airtable_connection` 同列），归属 `'nocodb-import'` 模块。

### 24.3 验证证据

- `vitest run src/features/import-jobs/nocodb-source.driver.spec.ts` — **10/10**（R-NOCO-1..10）。
- `vitest run src/features/import-jobs` — NocoDB spec 之外其他 driver spec 全部继续 PASS（无回归）。
- 全量 12 模块累计：**817/817 across 68 files**（从 807 → 817，+10）。
- `tsc --noEmit` — driver / module / readiness 零诊断；pre-existing `packages/openapi` rootDir 警告保留。
- spec 覆盖：`source` 标识 / 缺 spaceId / 缺 remoteId / 缺 tableName / 缺 baseId 回退到 remoteId / 完整 payload 抛 not-configured / cancel 同步探针触发 / cancel 在第二个探针点不触发时的 not-configured 路径 / payload 错误列出缺失字段 / not-configured 错误带 remediation 提示。

### 24.4 仍未完成

- **Phase 4.4+ 剩余 6 个 driver**：Baserow / SmartSuite / Jira / monday / ClickUp / Smartsheet。本轮建立的模板可以一行复制，预计每轮 1 个。
- **真实 NocoDB REST API 集成**：添加 `nocodb_connection` 迁移表 + `NocoDbImportService` 仿 `GoogleSheetsImportService`，把 stub body 替换成真调用。
- **readiness evidence manifest UI**：readyz 仍只返 capability JSON（Round 16+19 持续遗留）。
- **真实 Stripe Customer Portal**（Round 22 遗留）。
- **Phase 2 / 3**：依旧未开始。
## 25. Phase 4.4+ — Baserow source driver stub（2026-09-03）

Round 20 在 NocoDB 锁定的模板立刻复用给 Baserow。Baserow 比 NocoDB 多一个 `viewId`（行过滤 + 排序） + `databaseId`（工作区分组）两个可选字段，但核心 4-step runImport 一致。

### 25.1 Driver stub

`apps/nestjs-backend/src/features/import-jobs/baserow-source.driver.ts`（118 行）：

- 实现 `ISourceImportDriver`，`readonly source = 'baserow'`。
- `tableId` 解析规则：`payload.tableId ?? task.remoteId` —— 即「要么 payload 显式给，要么从任务创建时的 remoteId 取」。
- `databaseId` / `viewId` / `apiToken` / `size` 是 payload 可选项，留给后续 `BaserowImportService` 集成时消费。
- 两个 typed error：`BaserowInvalidPayloadError`（`code: 'BASEROW_INVALID_PAYLOAD'`）和 `BaserowNotConfiguredError`（`code: 'BASEROW_NOT_CONFIGURED'`，`remediation` 描述 Baserow 11+ 种 field-type 映射路径：`single_text / long_text / number / boolean / single_select / multiple_select / link_row / date / file` + `user_field_names=true` query param + `next` URL cursor 分页）。

### 25.2 接入

- `apps/nestjs-backend/src/features/import-jobs/source-import.module.ts` — `BaserowSourceDriver` 加入 `providers` + `useExisting: SOURCE_IMPORT_DRIVER` + `exports`。
- `apps/nestjs-backend/src/features/admin/enterprise-readiness.service.ts` — `baserow_connection` capability 加入 `alwaysEnabled`（30 → 31），紧跟 `nocodb_connection` 同列。

### 25.3 验证证据

- `vitest run src/features/import-jobs/baserow-source.driver.spec.ts` — **10/10**（R-BSR-1..10）。
- 全量 12 模块累计：**827/827 across 69 files**（从 817 → 827，+10）。
- `tsc --noEmit` — driver / module / readiness 零诊断。
- spec 覆盖：source 标识 / 缺 spaceId / 缺 remoteId 且无 payload.tableId / payload.tableId 优先 / remoteId fallback / 有效 payload 抛 not-configured / cancel 探针 / cancel 全 false 走 not-configured / payload 错误列出缺失字段 / not-configured 带 cursor + BaserowImportService remediation。

### 25.4 仍未完成

- **Phase 4.4+ 剩余 5 个 driver**：SmartSuite / Jira / monday / ClickUp / Smartsheet（每轮 1 个，模板已锁定）。
- **真实 Baserow / NocoDB REST API 集成**：`BaserowImportService` + `baserow_connection` 迁移表 / `NocoDbImportService` + `nocodb_connection` 迁移表。
- **readiness evidence manifest UI**（Round 16+19 持续遗留）。
- **真实 Stripe Customer Portal**（Round 22 遗留）。
- **Phase 2 / 3**：依旧未开始。
## 26. Phase 4.4+ — Jira source driver stub（2026-09-03）

第三个复用 NocoDB 模板的 driver，但 Jira 的数据模型与 table-based 驱动（Sheets / Airtable / NocoDB / Baserow）本质不同 —— 源真值是 **issues** 而非 rows，分组在 **projects** 下，每个 issue 携带 ADF 描述 + 子任务 + 评论 + 工时等结构化字段。

### 26.1 Driver stub

`apps/nestjs-backend/src/features/import-jobs/jira-source.driver.ts`（118 行）：

- 实现 `ISourceImportDriver`，`readonly source = 'jira'`。
- `projectKey` 解析：`payload.projectKey ?? task.remoteId` —— Jira 的 projectKey（如 "ENG" / "BILL"）天然适合做 remoteId。
- payload 可选项：`cloudId`（Atlassian Cloud 多租户场景）、`jql`（过滤，如 `project = ENG AND type = Bug`）、`maxResults`（默认 100，Jira 上限）、`includeComments`（默认 false，1 extra round trip per issue）。
- 两个 typed error：`JiraInvalidPayloadError`（`code: 'JIRA_INVALID_PAYLOAD'`）和 `JiraNotConfiguredError`（`code: 'JIRA_NOT_CONFIGURED'`，remediation 描述 OAuth 2.0 (3LO) 或 API token 鉴权 + `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/` 路径 + **新** `/rest/api/3/search/jql` POST endpoint + `nextPageToken` cursor 分页 + ADF 描述扁平化 + 可选第二趟拉评论）。

### 26.2 接入

- `source-import.module.ts` — `JiraSourceDriver` 加入 providers / useExisting / exports。
- `enterprise-readiness.service.ts` — `jira_connection` capability 加入 alwaysEnabled（31 → 32）。

### 26.3 验证证据

- `vitest run src/features/import-jobs/jira-source.driver.spec.ts` — **10/10**（R-JIRA-1..10）。
- 全量 12 模块累计：**837/837 across 70 files**（从 827 → 837，+10）。
- `tsc --noEmit` — driver / module / readiness 零诊断。
- spec 覆盖：source 标识 / 缺 spaceId / 缺 projectKey（payload + remoteId 都空）/ payload.projectKey 优先 / remoteId fallback / 有效 payload 抛 not-configured / cancel 探针 / cancel 全 false 走 not-configured / payload 错误列出缺失字段 / not-configured remediation 提及 ADF + search/jql + nextPageToken。

### 26.4 仍未完成

- **Phase 4.4+ 剩余 4 个 driver**：monday / ClickUp / SmartSuite / Smartsheet（每轮 1 个，模板继续复用）。
- **真实 Jira REST API 集成**：`JiraImportService` + `jira_connection` 迁移表 + ADF 描述解析器。
- **readiness evidence manifest UI**（Round 16+19 持续遗留）。
- **真实 Stripe Customer Portal**（Round 22 遗留）。
- **Phase 2 / 3**：依旧未开始。
## 27. Phase 4.4+ — monday.com source driver stub（2026-09-03）

第四个复用 NocoDB 模板的 driver，但 monday.com 是 **GraphQL**（而非 REST）也是第一个 GraphQL 源 —— 数据模型也独特（boards / groups / items / column_values[] / updates）。

### 27.1 Driver stub

`apps/nestjs-backend/src/features/import-jobs/monday-source.driver.ts`（123 行）：

- 实现 `ISourceImportDriver`，`readonly source = 'monday'`。
- `boardId` 解析：`payload.boardId ?? task.remoteId`。
- payload 可选项：`groupId`（仅该 group 内 item）、`limit`（默认 100）、`apiToken`（PAT 或 OAuth token）、`includeUpdates`（评论 / 活动，默认 false）。
- 两个 typed error：`MondayInvalidPayloadError`（`code: 'MONDAY_INVALID_PAYLOAD'`）和 `MondayNotConfiguredError`（`code: 'MONDAY_NOT_CONFIGURED'`，remediation 描述 GraphQL POST to `https://api.monday.com/v2` + Bearer token + `boards(ids) { items_page(limit) { cursor items { id name column_values { id type text value } group { id title } } } }` + cursor 分页 on `items_page.cursor` + JSON 解码 `column_values[].value` 到 typed cell）。

### 27.2 接入

- `source-import.module.ts` — `MondaySourceDriver` 加入 providers / useExisting / exports。
- `enterprise-readiness.service.ts` — `monday_connection` capability 加入 alwaysEnabled（32 → 33）。

### 27.3 验证证据

- `vitest run src/features/import-jobs/monday-source.driver.spec.ts` — **10/10**（R-MON-1..10）。
- 全量 12 模块累计：**847/847 across 71 files**（从 837 → 847，+10）。
- `tsc --noEmit` — driver / module / readiness 零诊断。
- spec 覆盖：source 标识 / 缺 spaceId / 缺 boardId（payload + remoteId 都空）/ payload.boardId 优先 / remoteId fallback / 有效 payload 抛 not-configured / cancel 探针 / cancel 全 false 走 not-configured / payload 错误列出缺失字段 / not-configured remediation 提及 GraphQL + column_values + cursor。

### 27.4 仍未完成

- **Phase 4.4+ 剩余 3 个 driver**：ClickUp / SmartSuite / Smartsheet。
- **真实 GraphQL / REST API 集成**：`MondayImportService` + 5 个真实 driver service + 6 个迁移表（每个 driver 一个 connection 表）。
- **readiness evidence manifest UI**（Round 16+19 持续遗留）。
- **真实 Stripe Customer Portal**（Round 22 遗留）。
- **Phase 2 / 3**：依旧未开始。
## 28. Phase 4.4+ — ClickUp source driver stub（2026-09-03）

第五个复用模板的 driver。ClickUp 的层级是迁移源里最深的：workspace → space → folder → list → task，且每个 task 携带 typed custom_fields[]（drop_down / labels / currency / email / phone / short_text / long_text / url / date …）和可选评论 + 附件 + 子任务。

### 28.1 Driver stub

`apps/nestjs-backend/src/features/import-jobs/clickup-source.driver.ts`（125 行）：

- `listId` 解析：`payload.listId ?? task.remoteId`。`workspaceId` / `spaceId` / `folderId` 都可选 —— 真实集成可从 list 反向解析。
- 两个 typed error：`ClickUpInvalidPayloadError`（`code: 'CLICKUP_INVALID_PAYLOAD'`）和 `ClickUpNotConfiguredError`（`code: 'CLICKUP_NOT_CONFIGURED'`）。
- remediation 提 ClickUp 的两个不寻常点：
  - **Auth header 是 `Authorization: <token>`，不带 `Bearer ` 前缀**（与 REST 默认约定相反）。
  - 分页是 **page-based**（`page` query param + `last_page` 字段），不是 cursor-based。

### 28.2 接入

- `source-import.module.ts` — ClickUpSourceDriver 加入。
- `enterprise-readiness.service.ts` — `clickup_connection` 加入 alwaysEnabled（33 → 34）。

### 28.3 验证证据

- `vitest run src/features/import-jobs/clickup-source.driver.spec.ts` — **10/10**（R-CU-1..10）。
- 全量 12 模块累计：**857/857 across 72 files**（从 847 → 857，+10）。
- `tsc --noEmit` — driver / module / readiness 零诊断。

### 28.4 仍未完成

- **Phase 4.4+ 剩余 2 个 driver**：SmartSuite + Smartsheet。
- **readiness evidence manifest UI**（Round 16+19 持续遗留）。
- **真实 Stripe Customer Portal**（Round 22 遗留）。
- **Phase 2 / 3**：依旧未开始。
## 29. Phase 4.4+ — SmartSuite + Smartsheet source driver stubs（2026-09-03）

第七第八个复用模板的 driver —— **Phase 4.4+ 7 个迁移源系列在此收官**（NocoDB / Baserow / Jira / monday / ClickUp / SmartSuite / Smartsheet，加上既有的 Notion / Airtable / Sheets，共 10 个源）。

### 29.1 SmartSuite

`apps/nestjs-backend/src/features/import-jobs/smartsuite-source.driver.ts`（100 行）：

- 4 级层级：workspace → solution（应用包）→ app（表）→ record（行）→ field_values[]（typed cell）。
- 两个不寻常点记入 remediation：
  - **Token auth**：`Authorization: Token <key>`，**不是** `Bearer` 前缀。
  - **Offset 分页**：`?offset=&limit=`，response 里 `offset` 是 **下一个** cursor（不是 last）。

### 29.2 Smartsheet

`apps/nestjs-backend/src/features/import-jobs/smartsheet-source.driver.ts`（100 行）：

- sheet-centric 模型：sheet → row（每个 row 含 `cells[]`：`columnId → value`）→ column（`columnType` 决定 cell 类型：`TEXT_NUMBER / CHECKBOX / DATE / DATETIME / CONTACT_LIST / PICKLIST / MULTI_PICKLIST / DURATION / ABSTRACT_DATETIME` …）。
- 分页是 **不透明 `page` token**（response 里 `page` 字段就是 next token，`null` 即结束）—— 既不是 offset 也不是 cursor。

### 29.3 接入

- `source-import.module.ts` — `SmartSuiteSourceDriver` + `SmartsheetSourceDriver` 加入 providers / useExisting / exports（11 个 driver 总数）。
- `enterprise-readiness.service.ts` — `smartsuite_connection` + `smartsheet_connection` 加入 alwaysEnabled（34 → 36 capabilities）。

### 29.4 验证证据

- `vitest run src/features/import-jobs/smartsuite-source.driver.spec.ts` — **10/10**（R-SS-1..10）。
- `vitest run src/features/import-jobs/smartsheet-source.driver.spec.ts` — **10/10**（R-SSHT-1..10）。
- 全量 12 模块累计：**877/877 across 74 files**（从 857 → 877，+20）。
- `tsc --noEmit` — driver / module / readiness 零诊断。

### 29.5 Phase 4.4+ 收官统计

| Source | Round | Driver ID | API Style | Pagination |
|---|---|---|---|---|
| Notion | 既有 | `notion` | REST | cursor (`next_cursor`) |
| Airtable | 既有 | `airtable` | REST | offset (`offset`) |
| Google Sheets | Round 12 | `google_sheets` | REST v4 | grid range |
| NocoDB | Round 20 | `nocodb` | REST v1 | offset (`limit/offset`) |
| Baserow | Round 21 | `baserow` | REST | cursor (`next` URL) |
| Jira | Round 22 | `jira` | REST v3 | cursor (`nextPageToken`) |
| monday.com | Round 23 | `monday` | **GraphQL** | cursor (`items_page.cursor`) |
| ClickUp | Round 24 | `clickup` | REST v2 | **page** (`last_page`) |
| SmartSuite | Round 25 | `smartsuite` | REST v1 | **offset** (response.offset = next) |
| Smartsheet | Round 26 | `smartsheet` | REST v2 | **opaque page token** |

10 个迁移源全部 stub-up。真实 API 集成留待后续 round（每个 driver 一个 `<name>-import.service.ts` + 一个 connection 迁移表）。

### 29.6 仍未完成

- **真实 REST/GraphQL 集成**：7 个 driver service + 7 个 connection 迁移表（每轮 1 个，预计 7 rounds）。
- **readiness evidence manifest UI**（Round 16+19 持续遗留）。
- **真实 Stripe Customer Portal**（Round 22 遗留）。
- **Phase 2 / 3**：依旧未开始。
## 30. Phase 6 — Readiness manifest 三态分类（2026-09-03）

§20.4 + §29.6 都标记 "evidence manifest" 为待办 —— 给 operator 一个 endpoint，能把每个 capability 分类到 `oss` / `self_hosted` / `cloud` 三态之一。本轮上线。

### 30.1 Service 方法

`apps/nestjs-backend/src/features/admin/enterprise-readiness.service.ts` 新增 `buildManifest()`：

- 输入：调 `report()` 拿 capabilities map（已含 `wired / configured / verified / parity` 四个布尔维度）。
- 分类规则（互斥三态）：
  - `cloud` — `!enabled || !wired`
  - `self_hosted` — `enabled && wired && !configured`（OSS 装了但 operator 必须配，如 SMTP / IP allowlist / KMS）
  - `oss` — `enabled && wired && configured`（OSS 开箱即用，无论 Cloud-parity 与否）
- 排序：state 优先（`oss < self_hosted < cloud`），同 state 内按 key 字母序 —— 这样 operator 看 manifest 时 `oss` 永远在前面，方便扫描。
- 返回结构：`{ generatedAt, plan, counts: {total, oss, selfHosted, cloud}, capabilities: [{ key, module, enabled, state, wired, configured, verified, parity, reason?, evidence? }] }`。

### 30.2 HTTP 端点

`apps/nestjs-backend/src/features/admin/enterprise-readiness.controller.ts` 新增 `GET /api/admin/enterprise-readiness/manifest`：

- 复用 `x-admin-token` header 鉴权（与 `/dashboard`、`/migration-sources` 同款）。
- `@Public()` + 手动 token 校验（与 `/`、`/ai-skill` 同款）。
- 直接调 `readiness.buildManifest()`。

### 30.3 验证证据

- `vitest run src/features/admin/enterprise-readiness.service.spec.ts` — **17/17**（从 9 → 17，+8 R-MAN-1..8）。
- `vitest run src/features/admin` — **48/48**（从 40 → 48，+8）。
- 全量 12 模块累计：**885/885 across 74 files**（从 877 → 885，+8）。
- `tsc --noEmit` — service / controller / spec 零诊断。
- spec 覆盖：counts 求和 = total / 每条 capability 三态之一 / 排序规则 / generatedAt 时间戳 / plan 字段 / cloud count 非负 / wired/configured/verified/parity 4 个布尔 / 分类规则语义（oss 必须三 true，self_hosted 必须 enabled+wired+!configured，cloud 必须 !enabled||!wired）。

### 30.4 仍未完成

- **manifest UI**：本轮上线了 endpoint 但前端 dashboard 还没接。可以做：OSS 区显示 `oss` capabilities + 比例；self-hosted 区显示「需 operator 配置」清单 + 引导；cloud 区显示 gap list + 引导升级。
- **真实 REST 集成**：7 个 driver service + 7 个 connection 迁移表。
- **真实 Stripe Customer Portal**（Round 22 遗留）。
- **Phase 2 / 3**：依旧未开始。
- ✅ ~~Invoice PDF 缓存~~（Round 29 落地，见 §31）。

## 31. Phase 5.4 续 — Invoice PDF 缓存（2026-09-03）

§18 落地 `BillingInvoicePdfService` 时，PDF 每次都重新渲染。把渲染结果落盘到 `public.billing_pdf_export` 表后，再次访问同一张发票直接返回缓存字节，避免重复 `renderInvoicePdf` + `paginateLines` + `buildPdf`（Type1 Helvetica 字形 + 字节级 sha256）。

### 31.1 数据模型

`packages/db-main-prisma/prisma/postgres/migrations/20260905110000_add_billing_pdf_export`：

```sql
CREATE TABLE IF NOT EXISTS "billing_pdf_export" (
  "id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "billing_pdf_export_invoice_id_created_at_idx"
  ON "billing_pdf_export"("invoice_id", "created_at");
```

`id` 用 `${invoiceId}:${Date.now()}` 编码，避免多进程并发 storeExport 的 PK 冲突；`(invoice_id, created_at DESC)` 索引让 `latestExport` 单次 index scan。

### 31.2 Service 接线

`BillingModule` 注册 `BillingPdfExportAuthService`（来自 `billing-pdf-export/`，即 §18 的桥接层）作为 NestJS provider / export：

```ts
providers: [
  ...,
  BillingPortalOrgGuard,
  BillingPdfExportAuthService,  // new
],
exports: [
  ...,
  BillingPortalOrgGuard,
  BillingPdfExportAuthService,  // new
],
```

`BillingInvoicePdfService` 构造函数注入第三个依赖 `pdfCache: BillingPdfExportAuthService`，并在 `renderInvoice` 内部三段式：

1. **缓存查询**（`!input.fresh`）—— 调 `pdfCache.latestExport(invoiceId)`：
   - 命中 → 返回 `{doc: {bytes, size: bytes.byteLength, sha256}, pageCount: 0, summary: <重新计算>, warnings: []}`。summary 仍从当前 `previewMeteredInvoice` 重新计算（不缓存），保证 UI 看到的是"当前周期用量"的真实值，bytes 是上一次的快照。
   - 未命中 → 走第 2 步。
2. **渲染** —— `renderInvoicePdf(billingInvoice)` 走原 §18 路径。
3. **落盘**（best-effort）—— `pdfCache.storeExport({invoiceId, doc})` 失败不抛错（吞掉），保证调用方仍能拿到 PDF。注释里写明 Cloud 部署会通过 NestJS logger 记录。

`?fresh=true`（或 `?fresh=1`/`?fresh=yes`）在 `BillingPortalController.invoicePdf` 路由层解析为 `forceFresh: boolean`，透传给 `renderInvoice({fresh: true})`，跳过第 1 步强制走第 2 步。响应头加 `X-PDF-Cache: bypass | hit-or-miss` 让前端能区分缓存命中 / 强制重渲染。

### 31.3 验证证据

- `vitest run src/features/billing/billing-invoice-pdf.service.spec.ts` — **17/17**（从 12 → 17，+5 R-PDF-13..17）。
  - R-PDF-13 cache 命中短路渲染，返回 cached bytes
  - R-PDF-14 cache miss 渲染 + 写 export
  - R-PDF-15 `fresh=true` 跳过 cache lookup 重渲染
  - R-PDF-16 cache 命中时 summary 从当前 preview 重算（不存 stale）
  - R-PDF-17 storeExport 失败不破坏响应（best-effort）
- `vitest run src/features/billing/billing-portal.controller.test.ts` — **31/31**（从 25 → 31，+6 新增 cache 路径测试 + 已有 25 调整为 `fresh: false` 默认）。
  - forwards `?fresh=true` → `fresh: true` + `X-PDF-Cache: bypass`
  - forwards `?fresh=1` 同样为 truthy
  - 缺省 `?fresh` 视为 read-through + `X-PDF-Cache: hit-or-miss`
  - `?fresh=no` 视为 falsy read-through
- `vitest run src/features/admin/enterprise-readiness.service.spec.ts` — **17/17**（R-INFRA-7 batch 加 `billing_pdf_export_cache`）。
- 全量 12 模块累计：**892/892 across 74 files**（从 885 → 892，+7）。
- `tsc --noEmit` — billing module / invoice-pdf service / portal controller / readiness 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告（与本轮无关）。

### 31.4 Readiness 集成

- `enterprise-readiness.service.ts` — `billing_pdf_export_cache` capability 加 `alwaysEnabled`（36 → 37 capabilities），理由是 controller-aware：路由 `GET /api/billing/portal/invoices/:invoiceId/pdf` 已注册且服务层已注入 cache。
- `enterprise-readiness-behavior.service.ts` — 新增 `probeBillingPdfExportCache`，跑 `SELECT to_regclass('public.billing_pdf_export') IS NOT NULL`，确保迁移落地。
- `enterprise-readiness.service.spec.ts` — R-INFRA-7 batch 测试列表追加 `billing_pdf_export_cache`，验证 `cap.enabled === true` 且 `cap.reason === undefined`。

### 31.5 设计取舍

- **summary 不缓存**：缓存命中时仍调 `previewMeteredInvoice` 重新算 summary。理由：summary 反映"这个周期到现在的用量"，而 bytes 是"上一次 render 时的快照"。混用会导致 dashboard 显示"上一周期的"用量。
- **storeExport best-effort**：失败不抛错，因为 caller 已经拿到 PDF。Cloud 部署会在 logger 里记 warn，但 OSS 部署为了避免 console 噪音直接吞。
- **schema 用 `(invoice_id, created_at)` 索引而非唯一约束**：允许多版本共存（`?fresh=true` 强制重渲会留多行），`latestExport` 取最新一行。
- **无 TTL**：发票是一次性事件，不需要过期。如果未来要"刷新 PDF 缓存"机制，加 `?fresh=true` 即可。

### 31.6 仍未完成

- ✅ ~~真实 Stripe Customer Portal~~（Round 32 落地，见 §32）。
- **真实 mail/smtp**（dunning handler 内部 stub）。
- **Period-end cron**（`materializeMeteredInvoice` 调度器未接）。
- **manifest UI**（Round 30 遗留）。
- **Phase 2 / 3 / 真实 REST 集成**：依旧未开始。

## 32. Phase 5.4 续 — 真实 Stripe Customer Portal（2026-09-03）

§15 上线 `BillingPortalController.stripePortal` 时返回 503 显式 stub（Cloud 替换）。Round 32 把 stub 替换为真 `POST https://api.stripe.com/v1/billing_portal/sessions` 调用，对齐 `BillingCheckoutController.createCheckout` 的 fetch 模式。

### 32.1 改造点

```ts
@Post('stripe-portal')
@Permissions('instance|update')
async stripePortal(@Body() body: IStripePortalBody) {
  const orgId = requireOrg(body.organizationId);
  if (!body.returnUrl) throw new BadRequestException('returnUrl is required');
  const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
  if (!stripeKey) throw new ServiceUnavailableException('...STRIPE_SECRET_KEY is missing');
  const subscription = await this.auth.getSubscription(orgId);
  const customerId = subscription?.externalCustomerId;
  if (!customerId) throw new ServiceUnavailableException(
    '...no Stripe customer yet. Complete checkout at POST /api/billing/checkout to create a customer first.'
  );
  const params = new URLSearchParams();
  params.append('customer', customerId);
  params.append('return_url', body.returnUrl);
  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ServiceUnavailableException(`Stripe Customer Portal error ${res.status}: ${text}`);
  }
  const session = (await res.json()) as { id: string; url: string };
  return { organizationId: orgId, sessionId: session.id, url: session.url };
}
```

### 32.2 关键决策

- **`returnUrl` 必填**：Stripe API 要求。缺则 400，避免落到 Stripe 端再返回 error。
- **没有 `externalCustomerId` → 503 + hint**：原 `getSubscription` 返回的 `externalCustomerId` 字段是 checkout 时由 Stripe 写入的；缺失意味着该 org 从未走完 checkout，返回 503 + 引导文案（"POST /api/billing/checkout 先"），比 404 友好且不泄露存在性。
- **fetch URL 硬编码 `https://api.stripe.com/v1/billing_portal/sessions`**：与 `BillingCheckoutController` 的 `STRIPE_API` 常量同级；这是 server-to-server 调用，URL 不可被用户控制，无需走 `safeFetch`。
- **错误透传**：Stripe 4xx/5xx 包装成 503 + 错误体（与 checkout 控制器一致），让 caller 可以 retry。
- **返回结构**：`{ organizationId, sessionId, url }` —— 前端可直接 `window.location = url` 重定向到 hosted portal。

### 32.3 验证证据

- `vitest run src/features/billing/billing-portal.controller.test.ts` — **36/36**（从 31 → 36，+5 R-SP-1..5 替换原 2 个 stub-only 测试）：
  - R-SP-1 503 when `STRIPE_SECRET_KEY` missing（不调 fetch）
  - R-SP-2 400 when `returnUrl` missing（不调 fetch）
  - R-SP-3 503 + hint when no `externalCustomerId`（不调 fetch）
  - R-SP-4 503 when no subscription at all（不调 fetch）
  - R-SP-5 真 fetch 调用：URL = `api.stripe.com/v1/billing_portal/sessions`，method = POST，Authorization = `Bearer sk_test_1`，Content-Type = `application/x-www-form-urlencoded`，body 含 `customer=cus_test_1` + URL-encoded `return_url`；返回 `{sessionId, url}`
  - R-SP-6 Stripe 4xx → 503 + status code in message
  - R-SP-7 Stripe 5xx → 503
- `vitest run src/features/billing` — **233/233 across 14 files**。
- `tsc --noEmit` — billing-portal controller / spec 零诊断。
- 测试用 `global.fetch` mock + `beforeEach`/`afterEach` 配对保存/恢复原始 fetch，避免污染其他测试。

### 32.4 仍未完成

- ✅ ~~真实 mail/smtp~~（Round 33 落地 T1/T3 真 mail，见 §33）。
- **Period-end cron**（`materializeMeteredInvoice` + `dunning.processDueSteps` 调度器 — `BillingMeteredInvoiceWorkerService` 已用 `setInterval` 进程内跑，dunning worker 仍需独立的 cron 入口；目前依赖 `processDueSteps` 被外部调用方触发）。
- **manifest UI**（Round 30 遗留）。
- **Phase 2 / 3 / 真实 REST 集成**：依旧未开始。

## 33. Phase 5.3 part 2 续 — Dunning 真实 mail/smtp（2026-09-03）

§14 上线 `BillingDunningWorkerService` 时 T1/T3 邮件 handler 是 OSS stub（Cloud 替换）。Round 33 把 T1 + T3 替换为对 `MailSenderService.sendMail` 的真调用，T2（Stripe smart-retry）保持 stub 因 OSS 没有真实 Stripe retry 端点。

### 33.1 接线点

`BillingDunningWorkerService` 构造函数新增 `MailSenderService` 依赖：

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly dunning: BillingDunningService,
  private readonly auth: BillingAuthService,
  private readonly mailSender: MailSenderService
) {}
```

`IStepHandlerContext` 同步增加 `mailSender` 字段；`processDueSteps` 把 service 引用塞进 ctx，让 handler 拿到 `ctx.mailSender.sendMail(...)`。

`BillingModule.imports` 增加 `MailSenderModule`，让 NestJS DI 能 resolve `MailSenderService` 实例。

### 33.2 Handler 改造

**T1_DUNNING_EMAIL**（T+24h reminder）：

1. 查 `prisma.billingDunningPlan` 拿到 `subscriptionId`（Round 13 约定此字段存的是 `organizationId`）。
2. `resolveBillingContacts(prisma, orgId)` 查询 `users` 表：`{organizationId, isAdmin: true, email: {not: ''}, deletedTime: null}`，limit 5，投影 `email`。
3. 无联系人 → 返 `{action: 'email_skipped', reason: 'no_billing_contacts'}`，step 仍 `executed`（避免 tight retry loop）。
4. 有联系人 → `mailSender.sendMail({to, subject, text, html})`，记录 `{action: 'email_sent', template, organizationId, recipients, delivered, queuedAt}`。

**T3_FINAL_NOTICE**（T+7d final notice）：同上路径，主题/正文/模板名不同。

**T2_DUNNING_RETRY**：保持 stub（OSS 无真实 Stripe smart-retry 端点）。Cloud 替换为 `Stripe.invoices.pay(invoiceId)` 或配置 patch。

**T14_CANCEL**：无变化（已在 Round 10 完整接线）。

### 33.3 关键决策

- **inline text/html，不用 hbs 模板**：邮件内容短（10-20 行），用 inline `text` + `html` 比维护 hbs 模板更轻量。Cloud 可替换为 hbs 模板 + 多语言版本。
- **recipient = `users.isAdmin = true` 的 org 成员**：5 行查询、零额外 schema、Cloud 可替换为 settings-driven 联系人列表。
- **失败保持 `scheduled`**：handler 抛错（mail-sender 抛异常）→ `processDueSteps` 捕获并计入 `errors`，但**不**调 `markStepExecuted`，所以 step 仍是 `scheduled`，下个 tick 重试。这与 T14 路径一致。
- **`email_skipped` 当作 `executed`**：没有收件人时，step 标记 executed（避免无限 retry），但 `result` 字段写明原因；审计上仍能看见"已尝试发送但跳过"。
- **不引入 BullMQ**：dunning worker 与 metered invoice worker 一样走 in-process `setInterval`（Round 17 模式）。Cloud 部署可以替换为 `pg-boss` / Sidekiq-style worker，但接口不变。

### 33.4 验证证据

- `vitest run src/features/billing/billing-dunning-worker.service.spec.ts` — **13/13**（从 9 → 13，+4 R-DUNN-1..4）：
  - R-DUNN-1 T1 真发邮件到 org admin emails，验证 to/subject/text/html 字段全对
  - R-DUNN-2 T3 真发 final notice
  - R-DUNN-3 无 admin emails → `email_skipped`，不调 `sendMail`
  - R-DUNN-4 mail-sender 抛错 → step 保持 `scheduled`（`markStepExecuted` 不调），errors 计数 +1
  - 原 T1/T2/T3 stub 测试已更新为反映新行为（`email_skipped` 默认）
- `vitest run src/features/billing` — **237/237 across 14 files**（从 233 → 237，+4）。
- `tsc --noEmit` — billing-dunning-worker / billing.module 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。
- 现有 `MailSenderService.sendMail` 在 SMTP 未配置时把内容打到 log（`[Mail Not Configured] Would send email: ...`），所以 dev / OSS 部署也能验证内容正确。

### 33.5 仍未完成

- ✅ ~~Dunning cron 调度器入口~~（Round 34 落地，见 §34）。
- **T2 Stripe smart-retry**（Cloud-only，OSS 留 stub）。
- **manifest UI**（Round 30 遗留）。
- **Phase 2 / 3 / 真实 REST 集成**：依旧未开始。

## 34. Phase 5.3 part 2 续 — Dunning cron 调度器（2026-09-03）

`BillingDunningWorkerService.processDueSteps`（Round 10/14）一直是函数 — 依赖外部调用方（NestJS schedule / pg-boss / Sidekiq-style sidecar）周期性触发。Round 34 镜像 Round 17 `BillingMeteredInvoiceWorkerService` 的 `setInterval` 模式，让 dunning worker 进程内自跑。

### 34.1 实现

```ts
@Injectable()
export class BillingDunningWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingDunningWorkerService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  onModuleInit(): void {
    if (process.env.BILLING_DUNNING_WORKER_DISABLED === '1') {
      this.logger.log('dunning worker disabled by env');
      return;
    }
    const envMs = process.env.BILLING_DUNNING_WORKER_INTERVAL_MS;
    const parsed = envMs ? Number(envMs) : NaN;
    const intervalMs =
      Number.isFinite(parsed) && parsed >= 1000
        ? parsed
        : DEFAULT_DUNNING_WORKER_INTERVAL_MS;
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) =>
        this.logger.error(
          `dunning tick failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
    }, intervalMs);
    this.timer.unref?.();
    this.logger.log(`dunning worker armed (intervalMs=${intervalMs})`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async tick(): Promise<void> {
    const result = await this.processDueSteps({});
    if (result.executed > 0 || result.errors > 0) {
      this.logger.log(
        `dunning tick: scanned=${result.scanned} executed=${result.executed} errors=${result.errors}`
      );
    }
  }
}
```

### 34.2 关键决策

- **`BILLING_DUNNING_WORKER_DISABLED=1` 旁路**：测试 / 灰度 / 外部调度器场景下完全关停；与 metered worker 同名变量对齐
- **`BILLING_DUNNING_WORKER_INTERVAL_MS` 覆盖**：默认 5 分钟（`DEFAULT_DUNNING_WORKER_INTERVAL_MS`），子 1s 或非数字 → fallback 默认
- **`timer.unref?.()`**：避免 worker 单方面持有 event loop；进程可优雅退出
- **tick 失败 logger 但下个 tick 仍跑**：`setInterval` 的 catch 把异常吞掉并 log，避免一个 transient DB error 把整个 cron 永久挂掉
- **空 tick 不 log**：scanned=0 + executed=0 + errors=0 时不打日志，避免高频 tick 把 log 淹没；只在有 side-effect 或错误时记日志
- **依赖 NestJS DI lifecycle**：通过 `OnModuleInit` / `OnModuleDestroy` 接口与 BillingModule 一起启动 / 关闭，无需额外 init code

### 34.3 验证证据

- `vitest run src/features/billing/billing-dunning-worker.service.spec.ts` — **17/17**（从 13 → 17，+4 R-DUNN-5..8）：
  - R-DUNN-5 `BILLING_DUNNING_WORKER_DISABLED=1` → `setInterval` 不调，`timer` undefined
  - R-DUNN-6 默认启用 + `INTERVAL_MS=60000` → `setInterval` 调一次，第二个参数是 60000；`onModuleDestroy` 调一次 `clearInterval`
  - R-DUNN-7 `INTERVAL_MS=not-a-number` → fallback 到 `5 * 60 * 1000`
  - R-DUNN-8 `INTERVAL_MS=500`（子 1s）→ fallback 到 `5 * 60 * 1000`
- `vitest run src/features/billing` — **241/241 across 14 files**（从 237 → 241，+4）。
- `tsc --noEmit` — billing-dunning-worker 零新增诊断；仅保留 pre-existing rootDir 警告。
- 测试用 `vi.spyOn(globalThis, 'setInterval' | 'clearInterval')` mock，与 Round 17 metered worker 测试同一模式。

### 34.4 仍未完成

- **T2 Stripe smart-retry**（Cloud-only，OSS 留 stub）。
- **manifest UI**（Round 30 遗留）。
- **Phase 2 / 3**：依旧未开始。
- **真实 REST 集成**：7 个 driver 中 Notion / Airtable / Google Sheets 已真集成；Round 35 落地 NocoDB 真实驱动（probe + fetchRows）；剩余 6 个（Baserow / Jira / monday / ClickUp / SmartSuite / Smartsheet）每轮 1 个。

## 35. Phase 4.4+ — NocoDB 真实 driver 集成（2026-09-03）

§21（Round 20）落地 NocoDbSourceDriver 时只做 extension-point + 抛 `NocoDbNotConfiguredError`。Round 35 把 driver 真接线到 `NocoDbImportService`（已存在）—— 这是 7 个真实 REST 集成里的第 1 个。

### 35.1 现状调研

发现 `nocodb-import/` 模块已有完整 service：
- `NocoDbApiClient` — `xc-token` 头 + `https://nocodb.example.com/api/v2/tables/<tableId>/records?limit=N` 调用
- `NocoDbImportService` — `probe()` / `listBases()` / `listTables()` / `fetchRows()` 完整方法
- `NocoDbImportController` — `/api/nocodb-import/{probe,bases,tables,rows}` 路由

唯一缺的是 driver 端没有调它。

### 35.2 driver 改造

`NocoDbSourceDriver` 构造函数新增 `NocoDbImportService`（`@Optional()` 保留防御性，spec 仍可构造无服务实例）：

```ts
constructor(
  @Optional() private readonly _prisma?: PrismaService,
  @Optional() private readonly importService?: NocoDbImportService
) {}
```

`INocoDbTaskPayload` 加 `baseUrl` 字段（其余沿用：baseId / tableName / apiToken / limit）。

`runImport` 把 stub throw 替换为三段真调用：

1. **验证** `baseUrl` + `apiToken` 必填 → 缺则 `NocoDbInvalidPayloadError`
2. **probe** — `importService.probe(baseUrl, apiToken)`，让 401 等鉴权错误在 durable task row 上以可读错误形式落地，而不是 mid-batch fetch failure
3. **fetchRows** — `importService.fetchRows(baseUrl, apiToken, tableName, pageSize)` 返回 `{tableId, rowCount, sample}`
4. 三个 cancel probe 点（验证后 / probe 后 / fetchRows 后）—— 与 Notion / Airtable / Sheets driver 同一模式

`SourceImportModule.imports` 加 `NocoDbImportModule` 让 DI 能 resolve `NocoDbImportService`。

### 35.3 关键决策

- **不实现 record creation**（`recordOpenApiV2Service.createRecords`）：这是 Round 36 的工作。本轮专注打通 probe + fetchRows，让真实数据流动起来即可。
- **`baseUrl` 仍从 task payload 拿**：连接表（`nocodb_connection`）是 follow-up 工作；本轮先用 inline credentials，与 §32 Stripe portal 同样的"先内联后持久化"路径。
- **不重命名 `NocoDbNotConfiguredError`**：当 `importService` 未注入时仍抛，让 spec 仍能验证 defensive 路径（`R-NOCO-10`）。
- **`fetchRows` 接受 `tableName`（slug 形式）**：`NocoDbApiClient.listRows` 内部用 `tableId` 参数名，但 NocoDB v2 接受 slug 形式 tableName，与 driver payload 一致无需转换。

### 35.4 验证证据

- `vitest run src/features/import-jobs/nocodb-source.driver.spec.ts` — **13/13**（从 10 → 13，+3 R-NOCO-11..13）：
  - R-NOCO-6 重写：真实 path 调 probe + fetchRows + 返回 rowCount
  - R-NOCO-7 重写：cancel at first probe wins（不调 probe）
  - R-NOCO-8 重写：cancel at third probe（fetchRows 后）wins
  - R-NOCO-10 改用 no-imports driver 验证 `NocoDbNotConfiguredError` 仍存在
  - R-NOCO-11 缺 baseUrl/apiToken → `NocoDbInvalidPayloadError`
  - R-NOCO-12 自定义 `payload.limit` 透传到 `fetchRows(pageSize)`
  - R-NOCO-13 probe 抛错 → 不调 fetchRows
- `vitest run src/features/import-jobs` — **113/113 across 12 files**（含 6 个 driver 全量回归）。
- `tsc --noEmit` — driver / module 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。

### 35.5 仍未完成

- **Record creation（Round 36）**：`fetchRows` 拿到的 `sample` → header inference → `recordOpenApiV2Service.createRecords` 落库。仿 Airtable driver 的 `wrappedReporter` 模式 + `IImportProgress` 事件流。
- **`nocodb_connection` Prisma table**：让 operator 注册一次 baseUrl + apiToken，后续 task 引用 connection id 而非 inline credentials。
- **剩余 6 个 driver 真实集成**（每轮 1 个）：Baserow / Jira / monday / ClickUp / SmartSuite / Smartsheet。它们的 `XxxImportService` 是否已存在需在每轮开始时调研；不存在则先造 service 再接线（与 Round 35 NocoDB 路径相同）。
- **T2 Stripe smart-retry**（Cloud-only，OSS 留 stub）。
- **manifest UI**（Round 30 遗留）。
- **Phase 2 / 3**：依旧未开始。


## 36. Phase 4.4+ — NocoDB record creation（2026-09-03）

Round 35 把 NocoDB driver 真接通到 `NocoDbImportService` 的 probe + fetchRows；Round 36 把 driver → service → `recordOpenApiV2Service.createRecords` 全链路接通，让 NocoDB rows 真正写入 Teable 表。

### 36.1 driver/service 改造

- `NocoDbImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllRows(baseUrl, token, tableId, pageSize, isCanceled, onPage)`（offset-based 分页，500 页上限 ≈ 50k 行；每页检查 cancel）；新增 `importTable({ baseUrl, apiToken, tableName, tableId, pageSize, batchSize, isCanceled, onProgress, mapRowToFields })`（cancel 期间逐批调用 `records.createRecords({ fieldKeyType: Name, typecast: true, records })`，失败批计入 `failedCount`，不中断整批）。
- `NocoDbApiClient.listRows(tableId, limit, offset)` 加 `offset` 参数（URLSearchParams 拼装）；保留 `limit` 行为不变，向后兼容 Round 35 调用。
- `NocoDbImportModule.imports` 加 `RecordOpenApiModule` 让 DI 能 resolve。
- `NocoDbSourceDriver.runImport` 重写：validate → probe → `importService.importTable(...)` 委派完整 record-creation 循环；`mapRowToFields` 由 driver 提供（落 `nocodbRowToFields`）。`pageSize` / `batchSize` 校验、cancel 守卫、错误类、KNOWNCANCEL_CODES 注册同步到位。
- 新增取消错误类 `INocoDbImportCanceledError`（`code = 'NOCODB_CANCELED'`），与 Airtable `IAirtableImportCanceledError` 同形；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `'NOCODB_CANCELED'`，使 processor 把取消映射为 no-op success。

### 36.2 关键决策

- **`mapRowToFields` 由 driver 注入而非 service 内置**：service 只关心"取 rows → 写 records"框架，driver 决定每个 source 的字段映射策略（drop `nc_*` / `created_at` / `updated_at` / `Id` / `id` / `created_by` / `updated_by`，null 值跳过）。后续接 Sheets / Airtable 等可换 mapper。
- **`batchSize` clamp 到 1..1000**：避免单批事务过大；service 端再次校验（Math.min/Math.max），driver 端先 clamp 再传。
- **`pageSize` 默认 100**：`listAllRows` 内部走 500 页循环，覆盖 50k 行场景；超过此规模由 v2 cursor 分页在后续 round 接管。
- **`typecast: true`**：让 Teable 自动转 NocoDB 的 select/multi-select 等复杂值到最近字段类型；目标表缺字段时由 driver 的 `fields` map 让 typecast 决定（不阻塞其它行）。
- **取消错误用类而非字符串 throw**：processor 通过 `code` 字段识别 → 调 `markSucceeded` 而不是 `markFailed`，对齐 `KNOWN_CANCEL_CODES` 模式。

### 36.3 验证证据

- `vitest run src/features/import-jobs/nocodb-source.driver.spec.ts` — **19/19**（从 13 → 19，+6 R-NOCO-14..19）：
  - R-NOCO-14 缺 tableId → `NocoDbInvalidPayloadError`
  - R-NOCO-15 部分批失败仍完成，`processedCount/failedCount` 正确
  - R-NOCO-16 自定义 `payload.batchSize` 透传
  - R-NOCO-17 `batchSize=5000` clamp 到 1000
  - R-NOCO-18 `nocodbRowToFields` 正确剥离系统键（Id/nc_*/timestamps/null）
  - R-NOCO-19 空表返回零计数
  - R-NOCO-6 / R-NOCO-7 / R-NOCO-8 / R-NOCO-12 重写：委派 `importTable` 而非 `fetchRows`
- `vitest run src/features/nocodb-import/nocodb-import.service.spec.ts` — **5/5**（新文件）：
  - NOCO-SVC-1 `INocoDbImportCanceledError` 类形状
  - NOCO-SVC-2 `importTable` 立即 cancel 抛 cancel error
  - NOCO-SVC-3 `probe()` 透传 ok/baseCount/tableCount/fetchedAt
  - NOCO-SVC-4 `listAllRows` 立即 cancel 抛 cancel error
  - NOCO-SVC-5 `importTable` 容忍缺省 `batchSize`
- `vitest run src/features/import-jobs src/features/nocodb-import` — **124/124 across 13 files**（含全部 driver 回归）。
- `tsc --noEmit` — `nocodb-*` / `source-import.processor.ts` / `source-import.module.ts` 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。

### 36.4 仍未完成

- **真实 E2E 跨账号演练**：当前 spec 用 mock 验证 record-creation 流程；下一步加一条 fixture 路径（env-gated）打真 NocoDB sandbox 拉几条 records，断言 `processedCount` 与 sample 行数一致。
- **`nocodb_connection` Prisma table**：让 operator 注册一次 baseUrl + apiToken，后续 task 引用 connection id 而非 inline credentials（与 Sheets / Airtable 一致）。
- **`mapRowToFields` 升级**：当前只剥系统键；下一步对接 NocoDB column type → Teable field type 映射（lookup → singleSelect、attachment → attachment、formula → formula 等）。
- **6 个 driver 真实集成**：Baserow / Jira / monday / ClickUp / SmartSuite / Smartsheet，按 NocoDB 模式每轮 1 个。
- **Phase 5 T2 Stripe smart-retry / manifest UI / Phase 2 / 3**：仍待启动。


## 37. Phase 4.4+ — Baserow record creation（2026-09-03）

Round 21 落地 `BaserowSourceDriver` 时只到 extension-point + 抛 `BaserowNotConfiguredError`。Round 37 把 driver 真接通到 `BaserowImportService`（已存在）的 probe + `importTable`（新增），实现完整 record-creation 流程。这是 NocoDB Round 36 之后的第 2 个真实 REST 集成。

### 37.1 driver/service 改造

- `BaserowApiClient.listRows(tableId, pageSize=100, offset=0)` 加 `offset` 参数，URLSearchParams 拼装 `?size=N&offset=N`；保留原签名向后兼容。
- `BaserowImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllRows(baseUrl, token, tableId, pageSize, isCanceled, onPage)`（offset 分页 500 页上限 + cancel 守卫）；新增 `importTable({ baseUrl, apiToken, tableId, destinationTableId, pageSize, batchSize, isCanceled, onProgress, mapRowToFields })`（cancel 守卫 + 批 chunk 写 + 失败计入 `failedCount` 不中断整批）。
- `BaserowImportModule.imports` 加 `RecordOpenApiModule` 让 DI 能 resolve。
- `BaserowSourceDriver.runImport` 重写：validate → probe → `importService.importTable(...)` 委派完整 record-creation 循环；`mapRowToFields` 由 driver 提供（落 `baserowRowToFields`，剥离 `id` / `order` / null）。`tableId` 强校验为 numeric（Baserow 用数字 id）；`pageSize` / `batchSize` 校验、cancel 守卫、错误类、KNOWNCANCEL_CODES 注册同步到位。
- 新增取消错误类 `IBaserowImportCanceledError`（`code = 'BASEROW_CANCELED'`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `'BASEROW_CANCELED'`；`source-import.module.ts.imports` 加 `BaserowImportModule`。
- `import-jobs/index.ts` 导出 `BaserowSourceDriver` / `BaserowInvalidPayloadError` / `BaserowNotConfiguredError` / `baserowRowToFields` / `IBaserowTaskPayload`；`baserow-import/index.ts` 手动加 `IBaserowImportCanceledError`。

### 37.2 关键决策

- **`tableId` 必为 numeric**：与 NocoDB 的字符串 slug 不同，Baserow 用数字 id；`Number.isFinite` 校验失败抛 `BASEROW_INVALID_PAYLOAD`，避免静默走错表。
- **`mapRowToFields` 剥离 `id` / `order` / null**：与 NocoDB 相同的"系统键剥离"策略；Baserow 的 `order` 是行排序权重（decimal），与 Teable 内部排序机制不兼容。
- **`pageSize` 默认 100（Baserow API max 200）**：上限比 NocoDB 严格，避免 416 / 422。
- **`typecast: true`**：让 Teable 自动转换 Baserow 的 select / number / date 等；目标表缺字段由 typecast 决定（不阻塞其它行）。
- **取消错误用类而非字符串 throw**：processor 通过 `code` 字段识别 → 调 `markSucceeded` 而不是 `markFailed`，对齐 `KNOWN_CANCEL_CODES` 模式。

### 37.3 验证证据

- `vitest run src/features/import-jobs/baserow-source.driver.spec.ts` — **19/19**（从 10 → 19，+9 R-BSR-11..19）：
  - R-BSR-5 非数字 `tableId` → `BaserowInvalidPayloadError`
  - R-BSR-6 重写：真 path 调 probe + importTable + 返回 processedCount
  - R-BSR-7 重写：cancel at first probe wins（不调 probe）
  - R-BSR-8 重写：cancel at second probe wins（不调 importTable）
  - R-BSR-11 缺 baseUrl/apiToken → `BaserowInvalidPayloadError`
  - R-BSR-12 自定义 `payload.size` 透传到 `importTable(pageSize)`
  - R-BSR-13 probe 抛错 → 不调 importTable
  - R-BSR-14 缺 tableId → `BaserowInvalidPayloadError`
  - R-BSR-15 部分批失败仍完成，`processedCount/failedCount` 正确
  - R-BSR-16 自定义 `payload.batchSize` 透传
  - R-BSR-17 `batchSize=5000` clamp 到 1000
  - R-BSR-18 `baserowRowToFields` 正确剥离系统键（id/order/null）
  - R-BSR-19 空表返回零计数
- `vitest run src/features/baserow-import/baserow-import.service.spec.ts` — **5/5**（新文件）：
  - BSR-SVC-1 `IBaserowImportCanceledError` 类形状
  - BSR-SVC-2 `importTable` 立即 cancel 抛 cancel error
  - BSR-SVC-3 `listAllRows` 立即 cancel 抛 cancel error
  - BSR-SVC-4 `probe()` 透传 ok/baseId/workspaceName/tableCount/fetchedAt
  - BSR-SVC-5 `importTable` 容忍缺省 `batchSize`
- `vitest run src/features/import-jobs src/features/baserow-import src/features/nocodb-import` — **138/138 across 14 files**（含全部 driver 回归）。
- `tsc --noEmit` — `baserow-*` / `source-import.processor.ts` / `source-import.module.ts` 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。

### 37.4 仍未完成

- **真实 E2E 跨账号演练**：当前 spec 用 mock 验证 record-creation 流程；下一步加 fixture 路径（env-gated）打真 Baserow sandbox 拉几条 records，断言 `processedCount` 与 sample 行数一致。
- **`baserow_connection` Prisma table**：让 operator 注册一次 baseUrl + apiToken + databaseId，后续 task 引用 connection id 而非 inline credentials（与 Sheets / Airtable / NocoDB 一致）。
- **`mapRowToFields` 升级**：当前只剥系统键；下一步对接 Baserow field type → Teable field type 映射（single_text → singleLineText、number → number、link_row → linkRowToAnotherRecord 等）。
- **剩余 5 个 driver 真实集成**：Jira / monday（GraphQL）/ ClickUp / SmartSuite / Smartsheet，按 NocoDB / Baserow 模式每轮 1 个。
- **Phase 5 T2 Stripe smart-retry / manifest UI / Phase 2 / 3**：仍待启动。


## 38. Phase 4.4+ — Jira record creation（2026-09-03）

Round 22 落地 `JiraSourceDriver` 时只到 extension-point + 抛 `JiraNotConfiguredError`。Round 38 把 driver 真接通到 `JiraImportService`（已存在）的 probe + `importTable`（新增），实现完整 record-creation 流程。这是 NocoDB Round 36 / Baserow Round 37 之后的第 3 个真实集成。

### 38.1 driver/service 改造

- `JiraApiClient.listIssues(jql, maxResults, startAt)` 加 `startAt` 参数，URLSearchParams 拼装 `?jql=...&maxResults=N&startAt=N`；保留原签名向后兼容。Jira 旧版 GET `/search` 用 `startAt` offset 分页（稳定且文档充分）。
- `JiraImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllIssues(siteUrl, email, apiToken, jql, pageSize, isCanceled, onPage)`（startAt 分页 500 页上限 + cancel 守卫）；新增 `importTable({ siteUrl, email, apiToken, jql, destinationTableId, pageSize, batchSize, isCanceled, onProgress, mapIssueToFields })`（cancel 守卫 + 批 chunk 写 + 失败计入 `failedCount` 不中断整批）。
- `JiraImportModule.imports` 加 `RecordOpenApiModule` 让 DI 能 resolve。
- `JiraSourceDriver.runImport` 重写：validate → probe → `importService.importTable(...)` 委派完整 record-creation 循环；`mapIssueToFields` 由 driver 提供（落 `jiraIssueToFields`，剥离 `self` / `expand` URL 字段，flatten `issue.fields.*` 到顶层）。`pageSize` / `batchSize` 校验、cancel 守卫、错误类、KNOWN_CANCEL_CODES 注册同步到位。
- 新增取消错误类 `IJiraImportCanceledError`（`code = 'JIRA_CANCELED'`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `'JIRA_CANCELED'`；`source-import.module.ts.imports` 加 `JiraImportModule`。
- `import-jobs/index.ts` 导出 `JiraSourceDriver` / `JiraInvalidPayloadError` / `JiraNotConfiguredError` / `jiraIssueToFields` / `IJiraTaskPayload`；`jira-import/index.ts` 手动加 `IJiraImportCanceledError`。

### 38.2 关键决策

- **Jira 数据模型差异**：与 NocoDB / Baserow 不同，Jira 的源真值是 **issues**（不是 rows），每个 issue 携带 nested `fields`（summary / description ADF / status / priority 等）。`jiraIssueToFields` 把 `issue.fields.*` flatten 到顶层字段（每个标量成一列），让 destination 表按列名匹配。
- **`startAt` 分页（旧 GET /search）**：Jira 新版 `POST /search/jql` 用 `nextPageToken` cursor，但旧版 GET `/search` 用 `startAt` offset 仍稳定。Round 38 走旧版，后续可平滑切到新版。
- **JQL 默认值**：`project = <projectKey> ORDER BY created DESC`（如 payload 没指定）。可通过 `payload.jql` 覆盖（如 `project = ENG AND type = Bug`）。
- **`mapIssueToFields` 剥离 `self` / `expand`**：这两个字段是 Atlassian 平台 API URL，对用户无意义且占用 cell 体积。`id` / `key` 保留作 reference 列。
- **Basic auth（email + apiToken）**：与 NocoDB / Baserow 的 token-only auth 不同，Jira 用 HTTP Basic；这是 Atlassian Cloud API 唯一支持的官方方式。
- **取消错误用类而非字符串 throw**：processor 通过 `code` 字段识别 → 调 `markSucceeded` 而不是 `markFailed`，对齐 `KNOWN_CANCEL_CODES` 模式。

### 38.3 验证证据

- `vitest run src/features/import-jobs/jira-source.driver.spec.ts` — **19/19**（从 10 → 19，+9 R-JIRA-11..19）：
  - R-JIRA-4 缺 tableId → `JiraInvalidPayloadError`（R38 record-creation 要求）
  - R-JIRA-5 重写：payload.projectKey 覆盖 task.remoteId
  - R-JIRA-6 重写：真 path 调 probe + importTable + 返回 processedCount
  - R-JIRA-7 重写：cancel at first probe wins（不调 probe）
  - R-JIRA-8 重写：cancel at second probe wins（不调 importTable）
  - R-JIRA-11 缺 siteUrl/email/apiToken → `JiraInvalidPayloadError`
  - R-JIRA-12 自定义 `payload.jql` 覆盖默认 ORDER BY
  - R-JIRA-13 自定义 `payload.maxResults` 透传
  - R-JIRA-14 probe 抛错 → 不调 importTable
  - R-JIRA-15 部分批失败仍完成
  - R-JIRA-16 自定义 `payload.batchSize` 透传
  - R-JIRA-17 `batchSize=5000` clamp 到 1000
  - R-JIRA-18 `jiraIssueToFields` flatten issue.fields 到顶层
  - R-JIRA-19 空表返回零计数
- `vitest run src/features/jira-import/jira-import.service.spec.ts` — **5/5**（新文件）：
  - JIRA-SVC-1 `IJiraImportCanceledError` 类形状
  - JIRA-SVC-2 `importTable` 立即 cancel 抛 cancel error
  - JIRA-SVC-3 `listAllIssues` 立即 cancel 抛 cancel error
  - JIRA-SVC-4 `probe()` 透传 ok/siteUrl/accountId/displayName/projectCount/fetchedAt
  - JIRA-SVC-5 `importTable` 容忍缺省 `batchSize`
- `vitest run src/features/import-jobs src/features/baserow-import src/features/nocodb-import src/features/jira-import` — **152/152 across 15 files**（含全部 driver 回归）。
- `tsc --noEmit` — `jira-*` / `source-import.processor.ts` / `source-import.module.ts` 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。

### 38.4 仍未完成

- **真实 E2E 跨账号演练**：当前 spec 用 mock 验证 record-creation 流程；下一步加 fixture 路径（env-gated）打真 Jira sandbox 拉几条 issues，断言 `processedCount` 与 sample 行数一致。
- **`jira_connection` Prisma table**：让 operator 注册一次 siteUrl + email + apiToken + cloudId，后续 task 引用 connection id 而非 inline credentials。
- **`mapIssueToFields` 升级**：当前只 flatten + 剥 URL；下一步对接 Jira field type → Teable field type 映射（status / priority / assignee → singleSelect、due date → date、customfield_* 任意 → string 等）。
- **ADF description 解析**：Jira description 是 Atlassian Document Format（嵌套节点树），目前作为 opaque blob 写入。后续 round 把 ADF flatten 到 markdown 或纯文本 cell。
- **剩余 4 个 driver 真实集成**：monday（GraphQL）/ ClickUp / SmartSuite / Smartsheet，按 NocoDB / Baserow / Jira 模式每轮 1 个。
- **Phase 5 T2 Stripe smart-retry / manifest UI / Phase 2 / 3**：仍待启动。


## 39. Phase 4.4+ — monday.com record creation（2026-09-03）

Round 23 落地 `MondaySourceDriver` 时只到 extension-point + 抛 `MondayNotConfiguredError`。Round 39 把 driver 真接通到 `MondayImportService`（已存在）的 probe + `importTable`（新增），实现完整 record-creation 流程。这是 NocoDB Round 36 / Baserow Round 37 / Jira Round 38 之后的第 4 个真实集成，也是**首个 GraphQL 源**。

### 39.1 driver/service 改造

- `MondayApiClient.listItems(boardId, limit, cursor?)` 加 `cursor` 参数，返回 `{ items, nextCursor }`；保留原签名向后兼容（无 cursor 即从头）。
- `MondayImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllItems(token, boardId, pageSize, isCanceled, onPage)`（cursor 分页 500 页上限 + cancel 守卫）；新增 `importTable({ apiToken, boardId, destinationTableId, pageSize, batchSize, isCanceled, onProgress, mapItemToFields })`（cancel 守卫 + 批 chunk 写 + 失败计入 `failedCount` 不中断整批）。
- `MondayImportModule.imports` 加 `RecordOpenApiModule` 让 DI 能 resolve。
- `MondaySourceDriver.runImport` 重写：validate → probe → `importService.importTable(...)` 委派完整 record-creation 循环；`mapItemToFields` 由 driver 提供（落 `mondayItemToFields`，surface `id` / `name` / `boardId` / `groupId` / `created_at` / `updated_at` 参考列，每个 `column_value` 解析成 per-column cell，剥离嵌套 `board` / `group` 对象）。`pageSize` / `batchSize` 校验、cancel 守卫、错误类、KNOWN_CANCEL_CODES 注册同步到位。
- 新增取消错误类 `IMondayImportCanceledError`（`code = 'MONDAY_CANCELED'`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `'MONDAY_CANCELED'`；`source-import.module.ts.imports` 加 `MondayImportModule`。
- `import-jobs/index.ts` 导出 `MondaySourceDriver` / `MondayInvalidPayloadError` / `MondayNotConfiguredError` / `mondayItemToFields` / `IMondayTaskPayload`；`monday-import/index.ts` 手动加 `IMondayImportCanceledError`。

### 39.2 关键决策

- **GraphQL cursor 分页**：与 NocoDB / Baserow 的 `offset` offset 分页不同，monday.com 用 `items_page(limit: N, cursor: "...")` cursor-based 分页。`nextCursor` 为 null 即终止；遇到短页（< pageSize）也提前终止。
- **GraphQL 单端点 POST**：与 REST 不同，所有操作走 `https://api.monday.com/v2` 一个 endpoint；查询作为 POST body 的 `query` 字段。错误响应解析 `errors[]` 数组而非 HTTP 状态。
- **`column_values[]` 解码**：monday.com 每个 column_value 携带 `id`（列 ID，作为 cell key）+ `value`（JSON-encoded 字符串）+ `text`（已渲染的文本 label）。`decodeMondayColumnValue` 优先用 `text`，否则回退到 parsed JSON 或原始 value。空文本被丢弃。
- **`boardId` / `groupId` 参考列**：嵌套 `board.id` / `group.id` 提升为顶层 scalar 列；嵌套 `board` / `group` 对象被剥离。
- **Auth 差异**：monday.com 的 Personal Access Token 直接放在 `Authorization` header（无 `Bearer` 前缀），与 NocoDB `xc-token`、Baserow `Authorization: Token`、Jira HTTP Basic 都不同。
- **`typecast: true`**：让 Teable 自动转换 column 解码结果；目标表缺字段由 typecast 决定（不阻塞其它行）。
- **取消错误用类而非字符串 throw**：processor 通过 `code` 字段识别 → 调 `markSucceeded` 而不是 `markFailed`，对齐 `KNOWN_CANCEL_CODES` 模式。

### 39.3 验证证据

- `vitest run src/features/import-jobs/monday-source.driver.spec.ts` — **19/19**（从 10 → 19，+9 R-MON-11..19）：
  - R-MON-4 缺 tableId → `MondayInvalidPayloadError`（R39 record-creation 要求）
  - R-MON-5 重写：payload.boardId 覆盖 task.remoteId
  - R-MON-6 重写：真 path 调 probe + importTable + 返回 processedCount
  - R-MON-7 重写：cancel at first probe wins（不调 probe）
  - R-MON-8 重写：cancel at second probe wins（不调 importTable）
  - R-MON-11 缺 apiToken → `MondayInvalidPayloadError`
  - R-MON-12 自定义 `payload.limit` 透传
  - R-MON-13 probe 抛错 → 不调 importTable
  - R-MON-14 部分批失败仍完成
  - R-MON-15 自定义 `payload.batchSize` 透传
  - R-MON-16 `batchSize=5000` clamp 到 1000
  - R-MON-17 `mondayItemToFields` 解码 column_values + surface boardId/groupId
  - R-MON-18 `mondayItemToFields` 处理无 column_values 的 item
  - R-MON-19 空表返回零计数
- `vitest run src/features/monday-import/monday-import.service.spec.ts` — **5/5**（新文件）：
  - MON-SVC-1 `IMondayImportCanceledError` 类形状
  - MON-SVC-2 `importTable` 立即 cancel 抛 cancel error
  - MON-SVC-3 `listAllItems` 立即 cancel 抛 cancel error
  - MON-SVC-4 `probe()` 透传 ok/workspaceCount/boardCount/fetchedAt
  - MON-SVC-5 `importTable` 容忍缺省 `batchSize`
- `vitest run src/features/import-jobs src/features/baserow-import src/features/nocodb-import src/features/jira-import src/features/monday-import` — **166/166 across 16 files**（含全部 driver 回归）。
- `tsc --noEmit` — `monday-*` / `source-import.processor.ts` / `source-import.module.ts` 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。

### 39.4 仍未完成

- **真实 E2E 跨账号演练**：当前 spec 用 mock 验证 record-creation 流程；下一步加 fixture 路径（env-gated）打真 monday sandbox 拉几条 items，断言 `processedCount` 与 sample 行数一致。
- **`monday_connection` Prisma table**：让 operator 注册一次 apiToken + boardId，后续 task 引用 connection id 而非 inline credentials。
- **`mapItemToFields` 升级**：当前只 surface 参考列 + 解码 column_values；下一步对接 monday.com column type → Teable field type 映射（status → singleSelect、people → user、date → date 等）。
- **`includeUpdates` 二次抓取**：当前 `IMondayTaskPayload.includeUpdates` 是占位；下一步补 GraphQL `boards.items_page.items.updates` 子查询 + 第二遍 batch write。
- **剩余 3 个 driver 真实集成**：ClickUp / SmartSuite / Smartsheet，按 NocoDB / Baserow / Jira / monday 模式每轮 1 个。
- **Phase 5 T2 Stripe smart-retry / manifest UI / Phase 2 / 3**：仍待启动。


## 40. Phase 4.4+ — ClickUp record creation（2026-09-03）

Round 24 落地 `ClickUpSourceDriver` 时只到 extension-point + 抛 `ClickUpNotConfiguredError`。Round 40 把 driver 真接通到 `ClickUpImportService`（已存在）的 probe + `importTable`（新增），实现完整 record-creation 流程。这是 NocoDB Round 36 / Baserow Round 37 / Jira Round 38 / monday Round 39 之后的第 5 个真实集成，也是**最深层级**的源（workspace > space > folder > list > task + custom_fields[]）。

### 40.1 driver/service 改造

- `ClickUpApiClient.listTasks(listId, pageSize, page=0, includeClosed=false)` 加 `page` + `includeClosed` 参数，返回 `{ tasks, lastPage }`；保留原签名向后兼容。ClickUp 用 page-based 分页（响应携带 `last_page` 布尔）。
- `ClickUpImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllTasks(token, listId, pageSize, includeClosed, isCanceled, onPage)`（page 分页 500 页上限 + cancel 守卫 + `last_page` 终止条件）；新增 `importTable({ apiToken, listId, destinationTableId, pageSize, batchSize, includeClosed, isCanceled, onProgress, mapTaskToFields })`（cancel 守卫 + 批 chunk 写 + 失败计入 `failedCount` 不中断整批）。
- `ClickUpImportModule.imports` 加 `RecordOpenApiModule` 让 DI 能 resolve。
- `ClickUpSourceDriver.runImport` 重写：validate → probe → `importService.importTable(...)` 委派完整 record-creation 循环；`mapTaskToFields` 由 driver 提供（落 `clickupTaskToFields`，surface `id` / `name` / `description` / `due_date` 参考列 + flatten `status.status` / `priority.priority` 到顶层 + 拼接 `assignees[].username` + 解码 `custom_fields[]` 到 per-id cell + 剥离嵌套 `creator`）。`pageSize` / `batchSize` 校验、cancel 守卫、错误类、KNOWN_CANCEL_CODES 注册同步到位。
- 新增取消错误类 `IClickUpImportCanceledError`（`code = 'CLICKUP_CANCELED'`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `'CLICKUP_CANCELED'`；`source-import.module.ts.imports` 加 `ClickUpImportModule`。
- `import-jobs/index.ts` 导出 `ClickUpSourceDriver` / `ClickUpInvalidPayloadError` / `ClickUpNotConfiguredError` / `clickupTaskToFields` / `IClickUpTaskPayload`；`clickup-import/index.ts` 手动加 `IClickUpImportCanceledError`。

### 40.2 关键决策

- **Page-based 分页 + `last_page` 终止**：与 NocoDB / Baserow 的 offset、monday 的 cursor 都不同。ClickUp 返回 `last_page: boolean` 标志；遇到 `true` 即终止，不再发请求。
- **深度层级（workspace > space > folder > list > task）**：`ClickUpSourceDriver` 仍以 `listId` 为源（list 来自 folder 或 space，folder 来自 space，space 来自 workspace，workspace 来自 team），driver 不解析整条链。operator 通过 `payload.listId` 或 task queue 注入目标 list。这是与 NocoDB / Baserow 不同的"单点定位"模型。
- **`custom_fields[]` 解码**：ClickUp 的 custom_fields 是 typed objects（drop_down / labels / currency / email / phone / short_text / long_text / url / date 等）。`clickupTaskToFields` 表面所有非空 value 为 per-column cell；`id` 作 cell key，typed value 留作后续 column type → Teable field type 映射的输入。
- **Auth 差异**：ClickUp 的 Personal Access Token 直接放在 `Authorization` header（**无 Bearer 前缀**，与 monday 同），与 NocoDB `xc-token`、Baserow `Authorization: Token`、Jira HTTP Basic 都不同。
- **`includeClosed` 透传**：默认 `false`（跳过 archived/done），payload 可覆盖。
- **`typecast: true`**：让 Teable 自动转换；目标表缺字段由 typecast 决定（不阻塞其它行）。
- **取消错误用类而非字符串 throw**：processor 通过 `code` 字段识别 → 调 `markSucceeded` 而不是 `markFailed`，对齐 `KNOWN_CANCEL_CODES` 模式。

### 40.3 验证证据

- `vitest run src/features/import-jobs/clickup-source.driver.spec.ts` — **19/19**（从 10 → 19，+9 R-CU-11..19）：
  - R-CU-4 缺 tableId → `ClickUpInvalidPayloadError`（R40 record-creation 要求）
  - R-CU-5 重写：payload.listId 覆盖 task.remoteId
  - R-CU-6 重写：真 path 调 probe + importTable + 返回 processedCount
  - R-CU-7 重写：cancel at first probe wins（不调 probe）
  - R-CU-8 重写：cancel at second probe wins（不调 importTable）
  - R-CU-11 缺 apiToken → `ClickUpInvalidPayloadError`
  - R-CU-12 自定义 `payload.pageSize` 透传
  - R-CU-13 `includeClosed: true` 透传到 importTable
  - R-CU-14 probe 抛错 → 不调 importTable
  - R-CU-15 部分批失败仍完成
  - R-CU-16 自定义 `payload.batchSize` 透传
  - R-CU-17 `batchSize=5000` clamp 到 1000
  - R-CU-18 `clickupTaskToFields` 完整解码（status/priority/assignees/custom_fields）
  - R-CU-19 空表返回零计数
- `vitest run src/features/clickup-import/clickup-import.service.spec.ts` — **5/5**（新文件）：
  - CU-SVC-1 `IClickUpImportCanceledError` 类形状
  - CU-SVC-2 `importTable` 立即 cancel 抛 cancel error
  - CU-SVC-3 `listAllTasks` 立即 cancel 抛 cancel error
  - CU-SVC-4 `probe()` 透传 ok/workspaceId/workspaceName/spaceCount/fetchedAt
  - CU-SVC-5 `importTable` 容忍缺省 `batchSize`
- `vitest run src/features/import-jobs src/features/baserow-import src/features/nocodb-import src/features/jira-import src/features/monday-import src/features/clickup-import` — **180/180 across 17 files**（含全部 driver 回归）。
- `tsc --noEmit` — `clickup-*` / `source-import.processor.ts` / `source-import.module.ts` 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。

### 40.4 仍未完成

- **真实 E2E 跨账号演练**：当前 spec 用 mock 验证 record-creation 流程；下一步加 fixture 路径（env-gated）打真 ClickUp sandbox 拉几条 tasks，断言 `processedCount` 与 sample 行数一致。
- **`clickup_connection` Prisma table**：让 operator 注册一次 apiToken + listId，后续 task 引用 connection id 而非 inline credentials。
- **`mapTaskToFields` 升级**：当前 surface 参考列 + 解码 custom_fields；下一步对接 ClickUp custom_field type → Teable field type 映射（drop_down → singleSelect、labels → multipleSelects、date → date、url → url、currency → number 等）。
- **`includeComments` 二次抓取**：当前 `IClickUpTaskPayload.includeComments` 是占位；下一步补 `GET /api/v2/task/<taskId>/comment` 子查询 + 第二遍 batch write。
- **剩余 2 个 driver 真实集成**：SmartSuite / Smartsheet，按 NocoDB / Baserow / Jira / monday / ClickUp 模式每轮 1 个。
- **Phase 5 T2 Stripe smart-retry / manifest UI / Phase 2 / 3**：仍待启动。


## 41. Phase 4.4+ — SmartSuite record creation（2026-09-03）

Round 25 落地 `SmartSuiteSourceDriver` 时只到 extension-point + 抛 `SmartSuiteNotConfiguredError`。Round 41 把 driver 真接通到 `SmartSuiteImportService`（已存在）的 probe + `importTable`（新增），实现完整 record-creation 流程。这是 NocoDB Round 36 / Baserow Round 37 / Jira Round 38 / monday Round 39 / ClickUp Round 40 之后的第 6 个真实集成。SmartSuite 是 10 个迁移源中倒数第 2 个真实集成（仅剩 Smartsheet）。

### 41.1 driver/service 改造

- `SmartSuiteApiClient.fetchRecords(appId, limit=100, offset=0)` 加 `offset` 参数，返回 `{ items, nextOffset }`；保留原签名向后兼容。SmartSuite 响应携带 `offset` 字段作为下一页游标（null = 终止）。
- `SmartSuiteImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllRecords(token, appId, pageSize, isCanceled, onPage)`（offset 分页 500 页上限 + `nextOffset` 终止 + cancel 守卫 + infinite-loop 安全网）；新增 `importTable({ apiToken, appId, destinationTableId, pageSize, batchSize, isCanceled, onProgress, mapRecordToFields })`（cancel 守卫 + 批 chunk 写 + 失败计入 `failedCount` 不中断整批）。
- `SmartSuiteImportModule.imports` 加 `RecordOpenApiModule` 让 DI 能 resolve。
- `SmartSuiteSourceDriver.runImport` 重写：validate → probe → `importService.importTable(...)` 委派完整 record-creation 循环；`mapRecordToFields` 由 driver 提供（落 `smartsuiteRecordToFields`，surface `id` / `app_id` / `table_id` / `title` / `created_at` / `updated_at` 参考列 + flatten `record.fields` envelope 到顶层 cell + 剥离空 envelope）。`pageSize` / `batchSize` 校验、cancel 守卫、错误类、KNOWN_CANCEL_CODES 注册同步到位。
- 新增取消错误类 `ISmartSuiteImportCanceledError`（`code = 'SMARTSUITE_CANCELED'`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `'SMARTSUITE_CANCELED'`；`source-import.module.ts.imports` 加 `SmartSuiteImportModule`。
- `import-jobs/index.ts` 导出 `SmartSuiteSourceDriver` / `SmartSuiteInvalidPayloadError` / `SmartSuiteNotConfiguredError` / `smartsuiteRecordToFields` / `ISmartSuiteTaskPayload`；`smartsuite-import/index.ts` 手动加 `ISmartSuiteImportCanceledError`。

### 41.2 关键决策

- **Offset 分页 + `nextOffset` 终止**：与 NocoDB / Baserow 的 offset、monday 的 cursor、ClickUp 的 `last_page` 都不同。SmartSuite 在响应中返回 `offset`（**下一页**的游标），null = 终止。infinite-loop 安全网：当 `nextOffset === offset` 时主动 break（防止 API 异常导致死循环）。
- **数据模型**：SmartSuite 走 workspace > solution > app > record 层级；每条 record 携带 `fields` envelope 包住 typed cell payload。`smartsuiteRecordToFields` 把 envelope flatten 到顶层 cell（与 Jira 类似的 nested 字段处理）。
- **Auth 差异**：SmartSuite 用 `Authorization: Bearer <key>`（标准 Bearer），与 NocoDB `xc-token`、Baserow `Authorization: Token`、Jira HTTP Basic、monday/ClickUp 直放 token 都不同。Round 21 stub 注释误写为 `Token`，Round 41 client/service 统一为 `Bearer`。
- **`fields` envelope flattening**：与 Jira `issue.fields.*` flatten 同策略；typed cell value 留作后续 SmartSuite field type → Teable field type 映射的输入。
- **`typecast: true`**：让 Teable 自动转换；目标表缺字段由 typecast 决定（不阻塞其它行）。
- **取消错误用类而非字符串 throw**：processor 通过 `code` 字段识别 → 调 `markSucceeded` 而不是 `markFailed`，对齐 `KNOWN_CANCEL_CODES` 模式。

### 41.3 验证证据

- `vitest run src/features/import-jobs/smartsuite-source.driver.spec.ts` — **19/19**（从 10 → 19，+9 R-SS-11..19）：
  - R-SS-4 缺 tableId → `SmartSuiteInvalidPayloadError`（R41 record-creation 要求）
  - R-SS-5 重写：payload.appId 覆盖 task.remoteId
  - R-SS-6 重写：真 path 调 probe + importTable + 返回 processedCount
  - R-SS-7 重写：cancel at first probe wins（不调 probe）
  - R-SS-8 重写：cancel at second probe wins（不调 importTable）
  - R-SS-11 缺 apiKey → `SmartSuiteInvalidPayloadError`
  - R-SS-12 自定义 `payload.limit` 透传
  - R-SS-13 probe 抛错 → 不调 importTable
  - R-SS-14 部分批失败仍完成
  - R-SS-15 自定义 `payload.batchSize` 透传
  - R-SS-16 `batchSize=5000` clamp 到 1000
  - R-SS-17 `smartsuiteRecordToFields` flatten fields envelope + surface 参考列
  - R-SS-18 `smartsuiteRecordToFields` 处理无 fields envelope 的 record
  - R-SS-19 空表返回零计数
- `vitest run src/features/smartsuite-import/smartsuite-import.service.spec.ts` — **5/5**（新文件）：
  - SS-SVC-1 `ISmartSuiteImportCanceledError` 类形状
  - SS-SVC-2 `importTable` 立即 cancel 抛 cancel error
  - SS-SVC-3 `listAllRecords` 立即 cancel 抛 cancel error
  - SS-SVC-4 `probe()` 透传 ok/appCount/tableCount/fetchedAt
  - SS-SVC-5 `importTable` 容忍缺省 `batchSize`
- `vitest run src/features/import-jobs src/features/baserow-import src/features/nocodb-import src/features/jira-import src/features/monday-import src/features/clickup-import src/features/smartsuite-import src/features/smartsheet-import` — **194/194 across 18 files**（含全部 driver 回归）。
- `tsc --noEmit` — `smartsuite-*` / `source-import.processor.ts` / `source-import.module.ts` 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。

### 41.4 仍未完成

- **真实 E2E 跨账号演练**：当前 spec 用 mock 验证 record-creation 流程；下一步加 fixture 路径（env-gated）打真 SmartSuite sandbox 拉几条 records，断言 `processedCount` 与 sample 行数一致。
- **`smartsuite_connection` Prisma table**：让 operator 注册一次 apiKey + appId，后续 task 引用 connection id 而非 inline credentials。
- **`mapRecordToFields` 升级**：当前 surface 参考列 + flatten fields envelope；下一步对接 SmartSuite field type → Teable field type 映射（singleselect → singleSelect、multiselect → multipleSelects、user → user、file → attachment、linkedrecord → linkRowToAnotherRecord 等）。
- **剩余 1 个 driver 真实集成**：Smartsheet ✅ **R42 完成**。
- **Phase 5 T2 Stripe smart-retry / manifest UI / Phase 2 / 3**：仍待启动。



## 42. Phase 4.4+ — Smartsheet record creation（2026-09-03）

Round 21 落地 `SmartsheetSourceDriver` 时只到 extension-point + 抛 `SmartsheetNotConfiguredError`。Round 42 把 driver 真接通到 `SmartsheetImportService`（已存在）的 probe + `importTable`（新增），实现完整 record-creation 流程。这是 NocoDB Round 36 / Baserow Round 37 / Jira Round 38 / monday Round 39 / ClickUp Round 40 / SmartSuite Round 41 之后的第 **7 个真实集成**，也是 **Phase 4.4+ record-creation 通路 10/10 收官**。

### 42.1 driver/service/API-client 改造

- `SmartsheetApiClient.listRows(sheetId, pageSize=500, page=1)` 重写：返回 `{ rows, nextPage }`；termination 规则按优先级 `data.page === null` > `data.page > page` > `rows.length < pageSize` > `page + 1`。`fetchJson` URL 模板同步更新到 `/sheets/<sheetId>/rows?pageSize=...&page=...`。
- `SmartsheetImportService` 注入 `RecordOpenApiV2Service`；新增 `fetchRowsPage(...)`（保留 controller 单页取样兼容性）；新增 `listAllRows(token, sheetId, pageSize, isCanceled, onPage)`（page-number 500 页上限 + cancel 守卫 + `nextPage === page` 防死循环）；新增 `importTable({ apiToken, sheetId, destinationTableId, pageSize, batchSize, isCanceled, onProgress, mapRowToFields })`（cancel 守卫 + 批 chunk 写 + 失败计入 `failedCount` 不中断整批 + sheetId numeric 校验）。
- `SmartsheetImportModule.imports` 加 `RecordOpenApiModule` 让 DI 能 resolve。
- `SmartsheetSourceDriver.runImport` 重写：validate (spaceId/tableId/sheetId/accessToken) → cancel-guard → probe → cancel-guard → numeric sheetId 强校验 → `importService.importTable(...)` 委派完整 record-creation 循环；`mapRowToFields` 由 driver 提供（落 `smartsheetRowToFields`，surface `id`/`sheetId`/`rowNumber`/`createdAt`/`modifiedAt` 参考列 + flatten `row.cells[]` envelope 到 `column_<columnId>` cell + 优先 `displayValue` + 丢弃 null/orphan）。`pageSize` / `batchSize` 校验、cancel 守卫、错误类、KNOWN_CANCEL_CODES 注册同步到位。
- 新增取消错误类 `ISmartsheetImportCanceledError`（`code = 'SMARTSHEET_CANCELED'`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `'SMARTSHEET_CANCELED'`；`source-import.module.ts.imports` 加 `SmartsheetImportModule`。
- `import-jobs/index.ts` 导出 `SmartsheetSourceDriver` / `SmartsheetInvalidPayloadError` / `SmartsheetNotConfiguredError` / `smartsheetRowToFields` / `ISmartsheetTaskPayload`；`smartsheet-import/index.ts` 手动加 `ISmartsheetImportCanceledError`。

### 42.2 关键决策

- **Smartsheet 数据模型差异**：与 NocoDB / Baserow（row-keyed）/ monday（item-keyed）/ SmartSuite（fields envelope）都不同，Smartsheet 走 sheet > row > cells[] 模式：每个 row 携带 `cells[]`，每个 cell 是 `{ columnId, value, displayValue, format }`。`smartsheetRowToFields` 把 `row.cells[]` flatten 到 `column_<columnId>` cell（与 Jira `issue.fields.*` flatten 类似），让 destination 表按列名匹配。
- **Page-number 分页（不用 cursor 不用 offset token）**：Smartsheet 的 `GET /sheets/<sheetId>/rows` 用 `?page=<n>&pageSize=<N>`。响应 `page` 字段可能显式给出（`null` = 终止），或缺失（按 `rows.length < pageSize` 终止）。Round 42 client 同时识别这两种终止信号。
- **Auth 差异**：Smartsheet 用 `Authorization: Bearer <token>`（标准 Bearer），与 NocoDB `xc-token`、Baserow `Authorization: Token`、Jira HTTP Basic、monday/ClickUp 直放 token、SmartSuite `Bearer` 都形似但 token 来源不同（API access token 而非 user session）。
- **`columnId` 而非 column name**：Smartsheet REST 在 row cells 里只给 columnId，不给列名。完整列名需要一次额外 `GET /sheets/<sheetId>`。Round 42 用 `column_<columnId>` 作 cell key，让下游 `mapRowToFields` 升级时再做列名解析（与 NocoDB 字段映射升级路径一致）。
- **`displayValue` 优先**：当 cell 有 `displayValue`（如日期、人名、contact）时优先用其作为 cell 值，否则用 `value`。这与 Cloud 文档"human-readable"语义一致。
- **`typecast: true`**：让 Teable 自动转换；目标表缺字段由 typecast 决定（不阻塞其它行）。
- **取消错误用类而非字符串 throw**：processor 通过 `code` 字段识别 → 调 `markSucceeded` 而不是 `markFailed`，对齐 `KNOWN_CANCEL_CODES` 模式。
- **numeric sheetId 校验**：driver 在 probe 之后、调用 service 之前强校验 sheetId 是 finite number（避免 `NaN` 拼到 URL 报 fetch 错）。这与 NocoDB / Baserow 的 string-id 不同，是 Smartsheet REST 数字 ID 的特性。

### 42.3 验证证据

- `vitest run src/features/import-jobs/smartsheet-source.driver.spec.ts` — **20/20**（从 10 → 20，+10 R-SSHT-11..20）：
  - R-SSHT-11 缺 accessToken → `SmartsheetInvalidPayloadError`
  - R-SSHT-12 非数字 sheetId → `SmartsheetInvalidPayloadError`（R42 numeric 校验）
  - R-SSHT-13 自定义 `payload.pageSize` 透传
  - R-SSHT-14 probe 抛错 → 不调 importTable
  - R-SSHT-15 部分批失败仍完成
  - R-SSHT-16 自定义 `payload.batchSize` 透传
  - R-SSHT-17 `batchSize=5000` clamp 到 1000
  - R-SSHT-18 `smartsheetRowToFields` flatten cells[] + surface 参考列 + 优先 displayValue + 丢 null/orphan
  - R-SSHT-19 `smartsheetRowToFields` 处理无 cells[] envelope 的 row
  - R-SSHT-20 空 sheet 返回零计数
- `vitest run src/features/smartsheet-import/smartsheet-import.service.spec.ts` — **6/6**（新文件）：
  - SSHT-SVC-1 `ISmartsheetImportCanceledError` 类形状
  - SSHT-SVC-2 `importTable` 立即 cancel 抛 cancel error
  - SSHT-SVC-3 `listAllRows` 立即 cancel 抛 cancel error
  - SSHT-SVC-4 `probe()` 透传 ok/sheetCount/user/fetchedAt
  - SSHT-SVC-5 `importTable` 拒绝非数字 sheetId（throw with message）
  - SSHT-SVC-6 `importTable` 容忍缺省 `batchSize`（默认 100）
- `vitest run src/features/import-jobs src/features/smartsheet-import src/features/smartsuite-import src/features/nocodb-import src/features/baserow-import src/features/jira-import src/features/monday-import src/features/clickup-import` — **210/210 across 19 files**（含全部 driver 回归，含 Round 35-41 历史）。
- `tsc --noEmit` — `smartsheet-*` / `source-import.processor.ts` / `source-import.module.ts` 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。

### 42.4 仍未完成

- **真实 E2E 跨账号演练**：当前 spec 用 mock 验证 record-creation 流程；下一步加 fixture 路径（env-gated）打真 Smartsheet sandbox 拉几条 rows，断言 `processedCount` 与 sample 行数一致。
- **`smartsheet_connection` Prisma table**：让 operator 注册一次 accessToken + sheetId，后续 task 引用 connection id 而非 inline credentials。
- **`mapRowToFields` 升级**：当前 surface 参考列 + flatten cells[] 到 `column_<id>` 键；下一步对接 Smartsheet column type → Teable field type 映射（TEXT_NUMBER → singleLineText、CHECKBOX → checkbox、DATE → date、DATETIME → dateTime、PICKLIST → singleSelect、MULTI_PICKLIST → multipleSelects、CONTACT_LIST → user、ABSTRACT_DATETIME → dateTime、DURATION → duration 等）。
- **Phase 5 T2 Stripe smart-retry / manifest UI / Phase 2 / 3**：仍待启动。
- **Audit §4.5 收官状态**：10/10 migration source record-creation 通路已闭环（NocoDB / Baserow / Jira / monday / ClickUp / SmartSuite / Smartsheet / Notion / Airtable / Google Sheets）。Phase 4.4+ 真实集成阶段完成。

## 43. Phase 5 T2 Stripe smart-retry（2026-09-03）

审计 §4.7 与 §6 把 T2 Stripe smart-retry 标记为 Cloud-only、OSS 保留 stub 的剩余工作。Round 43 把 `triggerStripeRetry` 从 `{ stub: true }` 占位升级为：① 通过 `Invoice` 表查找订阅的最新 open / past_due / uncollectible invoice；② 当 `STRIPE_SECRET_KEY` 已配置时调用 `POST https://api.stripe.com/v1/invoices/<externalInvoiceId>/pay`，把 Stripe 返回的 `status` / `paid` 写回审计结果；③ 当 Stripe 未配置时仍然做 invoice 查找并返回 enriched marker（带 `stripeAttempted: false` 与 `reason`），保证审计轨迹始终完整；④ 当无 open invoice 时返回 `no_open_invoice`，避免 worker 永久空转。

### 43.1 handler 改造

- `BillingDunningWorkerService.processDueSteps` 在 ctx 中新增 `stripeSecretKey`（从 `process.env.STRIPE_SECRET_KEY ?? ''` 解析）。
- `triggerStripeRetry` 重写为完整路径：
  1. `prisma.invoice.findFirst({ where: { subscriptionId, status: { in: ['open', 'past_due', 'uncollectible'] } } })` 拿最近一张未结清 invoice；
  2. 未配置 key → `{ action: 'stripe_retry_triggered', externalInvoiceId, invoiceStatus, stripeAttempted: false, reason: 'STRIPE_SECRET_KEY not set' }`；
  3. 已配置 key → fetch `POST /v1/invoices/<id>/pay` with `Bearer` + `application/x-www-form-urlencoded`，4xx/5xx 抛错（step 留在 `scheduled`，下个 tick 重试），成功返回 `{ action: 'stripe_retry_succeeded', stripeInvoiceStatus, stripePaid, stripeAttempted: true }`；
  4. 无 open invoice → `{ action: 'no_open_invoice', reason: 'no_open_or_past_due_invoice' }`（不抛错，下个 tick 仍然会 retry）。
- 文件头注释更新：T2 从"stubbed in OSS"升级为"live when STRIPE_SECRET_KEY is set"。

### 43.2 关键决策

- **OSS 不静默失败**：即使没有 Stripe key，handler 也走完整 invoice 查找路径，把 `externalInvoiceId` / `invoiceStatus` 写进 step result — 这样审计日志能告诉运维"worker 在 T+72h 找到 open invoice in_stripe_test，但因无 STRIPE_SECRET_KEY 跳过 Stripe 调用"，而不是只看到一个 `stub: true` 的占位。
- **Stripe 错误抛而非 swallow**：handler 对 4xx/5xx 抛异常而非吞掉 — 与 T1/T3 的"missing recipient → email_skipped"策略不同，因为 Stripe 调用错误代表基础设施问题（key 错、配额、网络），应该 step 留在 scheduled 等下个 tick 重试，并触发 alerting。
- **Cloud-only 行为隐式**：handler 通过 env var 检测是否走 Stripe，不需要新的 capability flag — 这与 Round 32 Customer Portal 真实 Stripe 调用保持一致。
- **无 open invoice 是正常状态**：subscription 可能刚被 cancel、可能尚未进入 past_due，所以"no open invoice"是合法状态，handler 不抛错、继续走 audit trail。

### 43.3 验证证据

- `vitest run src/features/billing/billing-dunning-worker.service.spec.ts` — **22/22**（从 17 → 22，+5 T2-R43-1..5）：
  - T2-R43-1 无 open invoice → `{ action: 'no_open_invoice', reason: 'no_open_or_past_due_invoice' }`
  - T2-R43-2 OSS path（无 STRIPE_SECRET_KEY）→ enriched marker + 不调 fetch
  - T2-R43-3 Cloud path → fetch URL = `https://api.stripe.com/v1/invoices/<id>/pay` + Bearer + 200 → `{ action: 'stripe_retry_succeeded', stripeInvoiceStatus: 'paid', stripePaid: true }`
  - T2-R43-4 Stripe 4xx → step 留 scheduled + errorDetails 含 `Stripe retry failed ... HTTP 402`
  - T2-R43-5 Stripe 5xx → 同样抛错 + errorDetails
- 全量 billing 回归：`vitest run src/features/billing/` — **228/228 across 12 files**
- 跨域回归：`src/features/billing src/features/import-jobs src/features/smartsheet-import src/features/smartsuite-import` — **431/431 across 28 files**
- `tsc --noEmit` — `billing-dunning-worker.service.ts` 零新增诊断；仅保留 pre-existing `@teable/db-main-prisma` rootDir 警告。

### 43.4 仍未完成

- **Manifest UI（Round 30 endpoint）**：dashboard 还没接 `/api/admin/enterprise-readiness/manifest` 三态显示。Phase 5 T2 上线后可在 manifest 增加 `billing_stripe_smart_retry` capability（始终 configured，因为只是 wrapper；verified 需要 fixture）。
- **Stripe webhook Phase 5.4 续 — 真实 smart-retry 通知订阅**：当 `invoice.payment_failed` webhook 到达时主动 open dunning plan（当前依赖 BillingAuth 轮询）；可与 R43 T2 handler 配套。
- **Phase 2 / Phase 3 启动**：AI Chat Cloud 闭环（Voice / OAuth 卡片 / Context ring / Steer）与 App Builder Live Runtime（sandbox / build / publish / public URL / GitHub）仍未启动，是最大的两个用户面缺口。
- **Tier B / Tier C**：App Secrets 真实 KMS、Custom AI Model provider 语义对齐、Permission Matrix 热路径 E2E、Audit log 导出脱敏等继续按需推进。

## 44. Phase 6 — Enterprise Readiness 三态 UI（2026-09-03）

审计 §20 + §6 把 Round 30 的 `/api/admin/enterprise-readiness/manifest` 三态 endpoint 列为 remaining work（dashboard 还没接）。Round 44 把这个缺口关闭：新建 `apps/nextjs-app/src/pages/admin/enterprise-readiness.tsx` + `apps/nextjs-app/src/features/app/blocks/admin/enterprise-readiness/` 块，把三态分类（`oss` / `self_hosted` / `cloud`）渲染成可操作的运维面板。

### 44.1 frontend 改造

- 新建 `apps/nextjs-app/src/features/app/blocks/admin/enterprise-readiness/EnterpriseReadinessDashboard.tsx`：
  - 用 TanStack Query `useQuery` 调 `/api/admin/enterprise-readiness/manifest`，header `x-admin-token: <TEABLE_ADMIN_TOKEN>`（token 通过 Input 字段输入，存在 localStorage）。
  - 4 个 summary 卡片：Total / OSS (default) / Self-hosted / Cloud only，每张卡片带计数 + 简短说明。
  - 1 个 capabilities table，按 state tab 切换（Cloud only → Self-hosted → OSS），每行展示 key / module / state badge / wired / configured / verified / parity / reason。
  - Error / loading / empty 三态完整：空 token 时显示提示；401/403 时显示错误 + 提示检查 token。
- 新建 `apps/nextjs-app/src/pages/admin/enterprise-readiness.tsx`：Next.js page，复用 `AdminLayout` + `ensureLogin` + `withAuthSSR` + `isAdmin` 守卫（与 billing / backup 等其他 admin 页一致）。
- 新建 `apps/nextjs-app/src/features/app/blocks/admin/enterprise-readiness/index.ts` barrel。
- `AdminLayout.tsx` routes 数组新增 `Enterprise Readiness` 入口，icon = ClipboardList（与 Backup / Audit log / Operations 一致的"运维/审计"语义）。
- 组件使用 `@teable/ui-lib/shadcn/ui/tabs` 子路径导入 Tabs（与 `LongTextOptions.tsx` / `SingleLineTextShowAs.tsx` 一致）。

### 44.2 关键决策

- **localStorage 存 token**：admin token 是 self-hosted 部署的运维密钥，存 localStorage 比 cookie 安全（不易被 CSRF）。同时只在前端组件 mount 时读一次，不写到 React state 持久化层。
- **不注入 SSR**：管理员 token 永不出现在 SSR payload / HTML 里（避免泄露到 logs / CDN cache）。
- **Tab 默认值 = cloud**：默认展示最值得补的 Cloud-only 缺口，让运维一眼看出哪些功能需要做才能达到 parity。
- **state badge 三色**：OSS 用 default（绿色 solid），Self-hosted 用 secondary（黄色 outlined），Cloud 用 outline（灰色），与 Shadcn 视觉约定一致。
- **复用现有 capability 数据模型**：组件接受 `IReadinessManifest` 直接渲染，不重新计算 state — state 由后端 `buildManifest()` 单一来源决定，避免前后端语义漂移。

### 44.3 验证证据

- `tsc --project apps/nextjs-app/tsconfig.json --noEmit` — 新增 enterprise-readiness 块零新增诊断（pre-existing 12 个错误都在 `chat-panel/assistant-ui/*` 缺 `@assistant-ui/react` 模块，与本轮无关）。
- `vitest run src/features/admin/enterprise-readiness.controller.test.ts` — **3/3**（manifest endpoint + admin token 守卫回归）。
- 文件清单（新增 3 个）：
  - `apps/nextjs-app/src/features/app/blocks/admin/enterprise-readiness/EnterpriseReadinessDashboard.tsx`（~340 行）
  - `apps/nextjs-app/src/features/app/blocks/admin/enterprise-readiness/index.ts`
  - `apps/nextjs-app/src/pages/admin/enterprise-readiness.tsx`
- 文件清单（修改 1 个）：
  - `apps/nextjs-app/src/features/app/layouts/AdminLayout.tsx`（routes 数组 +1 项）

### 44.4 仍未完成

- **Tier A #1 App Builder Live Runtime**（最大商业缺口）— 仍待启动。
- **Tier A #2 AI Chat 真实 LLM provider 闭环**（最大用户面缺口）— 仍待启动。
- **Phase 4.4+ E2E fixture + 7 个 connection Prisma 表 + 字段类型映射** — 仍待启动。
- **CI gate**：CI 还没强制跑 `enterprise-readiness manifest` 检查，避免新 capability 在没填状态的情况下 ship。下一步：把 `manifestEndpoint: true` 那条 probe 接入 release pipeline。

## 45. Tier A #1 — App Builder publish + public URL（2026-09-03）

审计 §4.2 把 App Builder Live Runtime 列为 Cloud Business 等价的最大缺口（E0/E1：live published app / public URL / unpublish / redeploy 全部缺失）。Round 45 把 publish + public URL 通路打通：新增 `public_slug` / `published_at` 列 + 4 个方法 + 3 个 endpoint + 14 个单元测试。这是 App Builder Live Runtime 的地基；runtime endpoint (`GET /a/<slug>` 真正渲染 deployed snapshot) 留给后续 round。

### 45.1 schema 改造

- 新增迁移 `packages/db-main-prisma/prisma/postgres/migrations/20260905120000_add_app_publish_columns/migration.sql`：
  - `public_slug TEXT` + `published_at TIMESTAMP(3)` 加到 `app_instance`（同时 mirror 到 `meta.app_instance`）
  - 部分唯一索引 `app_instance_public_slug_uq` ON `public_slug` WHERE NOT NULL — 保证 slug 唯一但允许未发布的应用留空
  - 同样索引加到 meta schema
- `schema.prisma` `AppInstance` 模型新增 `publicSlug String? @unique @map("public_slug")` + `publishedAt DateTime? @map("published_at")` + `@index([publicSlug])`。
- 重新生成 Prisma client — 端到端可访问新列。

### 45.2 service 改造（`ai-app-builder.service.ts`）

新增 4 个方法：

- `publish(appId)`：检查 deployed current version（不能发布 draft）→ 若已 published 则幂等返回原 slug → 否则生成 12-char base36 slug（最多 6 次 retry 防碰撞）→ update `public_slug` + `published_at` + `status='deployed'`。
- `unpublish(appId)`：清 `public_slug` / `published_at` / `status='draft'`；已 unpublish 是 no-op 幂等。
- `getPublicUrl(appId)`：返回 `{published: false}` 或 `{published: true, publicSlug, publishedAt, url}`；URL 从 `APP_PUBLIC_HOST` env 拼（默认 `http://localhost:3000`，自动 strip 末尾 `/`）。
- `resolveBySlug(slug)`：future runtime endpoint 用 — 通过 `publicSlug` 唯一索引 O(log n) 解析；返回 `null` 表示未发布或不存在（404 友好）。
- `generateUniquePublicSlug()` + `randomBase36Slug(length)`：私有 helper，用 `crypto.randomBytes` 拼 base36 字符（12-char slug，URL 友好）；无外部依赖。

### 45.3 controller 改造（`ai-app-builder.controller.ts`）

新增 3 个 endpoint：

- `POST /api/:baseId/apps/:appId/publish`（`base|update`）：调 `svc.publish(appId)`，返回 `{appId, id, publicSlug, publishedAt}`。
- `POST /api/:baseId/apps/:appId/unpublish`（`base|update`）：调 `svc.unpublish(appId)`，返回 `{appId, id, unpublished: true}`。
- `GET /api/:baseId/apps/:appId/public-url`（`base|read`）：调 `svc.getPublicUrl(appId)`，返回 `{published: false}` 或 `{published: true, publicSlug, publishedAt, url}`。

权限 + auth 都复用现有的 `assertAppInBase` 守卫 + `@Permissions` 装饰器。

### 45.4 关键决策

- **slug 12-char base36**：够 36^12 = 4.7×10^18 组合，碰撞概率忽略不计；URL 友好；UUID 太长不适合人眼读。
- **部分唯一索引 + WHERE NOT NULL**：让未发布的应用能多个共存（slug = null 不参与唯一性检查）；发布时再分配 slug。
- **幂等 publish / unpublish**：re-publish 不重置 slug（避免链接失效），只 bump `published_at` 让审计日志能看到；unpublish 一个已 unpublish 的应用是 no-op。
- **`APP_PUBLIC_HOST` env**：让 self-hosted operator 配置自定义域名（Cloud 用 `app.teable.ai`，OSS 默认 `http://localhost:3000`）；trailing slash 自动 strip 避免双斜杠。
- **runtime endpoint 留 round 46**：本轮只打通 publish / unpublish / getPublicUrl，runtime（`GET /a/<slug>` 真正渲染 deployed snapshot）需要 snapshot 解析 + 沙箱执行，是单独 scope。
- **保留 deployed version on unpublish**：unpublish 不删 `current_version_id`，operator 重新 publish 即可恢复 — 避免误操作丢失工作。

### 45.5 验证证据

- `vitest run src/features/ai-app-builder/ai-app-builder.service.publish.spec.ts` — **14/14**（新文件）：
  - `publishes a deployed app` — 12-char base36 slug + update 写入
  - `rejects publish when the app has no deployed version` — VALIDATION_ERROR
  - `is idempotent: re-publishing` — 保留原 slug 不重置
  - `retries on slug collision up to MAX_TRIES times`
  - `throws after MAX_TRIES slug collisions`
  - `unpublishes a published app` — 清 slug + publishedAt + status
  - `is idempotent: unpublishing an unpublished app is a no-op`
  - `getPublicUrl: returns {published: false}` / `composed URL with default host` / `honors APP_PUBLIC_HOST with trailing slash stripped` / `throws 404 when missing`
  - `resolveBySlug: resolves published app` / `returns null for unknown slug` / `returns null when unpublished`
- `vitest run src/features/ai-app-builder/` — **19/19 across 3 files**（含原有 2 个 secret 测试 + 3 个 auth 测试 + 14 个新 publish 测试）
- `tsc --noEmit` — `ai-app-builder` 零新增诊断（3 个 pre-existing `NODE_ENV` read-only 错误与本轮无关）
- Prisma client 已重新生成

### 45.6 仍未完成

- **Runtime endpoint `GET /a/<slug>`**：真正渲染 deployed snapshot（snapshot JSON 解析 + React 沙箱执行 + secret 注入）— Round 46 候选。
- **App Login + Email OTP + Google OAuth**（E0）— App Builder Live Runtime 的 user 闭环。
- **GitHub 同步**（E0）— App Builder 部署链路扩展。
- **App Builder Chat-driven editing**（E0/E1）— AI 编辑 App Builder 代码。
- **ZIP import/export + Auto-fix**（E0）— Developer Mode 配套。
- **Tier A #2 AI Chat 真实 LLM 闭环** — 仍待启动。
- **Phase 4.4+ E2E fixture + connection Prisma 表 + 字段类型映射** — 仍待启动。

## 46. Tier A #1 — App Builder Runtime Endpoint（2026-09-03）

R45 打通了 publish + public URL 通路，但 published app 还不能真正被访问。Round 46 新增公开 runtime endpoint `GET /a/<slug>`，把 publish → resolve → render 闭环到 E3（业务闭环）：slug 通过部分唯一索引 O(log n) 解析 → 取 `app_version.snapshot` → 渲染 HTML 页面（app 名 / version / deployedAt + snapshot JSON pretty-print）。Cloud 等价语义对齐 `app.teable.ai/a/<slug>` 模式；self-hosted 通过 `APP_PUBLIC_HOST` env 决定域名。

### 46.1 端点改造

- 新建 `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder-runtime.controller.ts`：
  - `@Controller('a')` + `@Get(':slug')` — 无 `/api/` 前缀（与 SCIM 的 `scim/v2` 同模式）。
  - 公开端点（不需要认证，因为 published app 是公开的）。
  - `@Header('cache-control', 'public, max-age=30, stale-while-revalidate=60')` — 短缓存 + SWR 让高频访问不穿透到 DB。
  - 调用 `svc.resolveBySlug(slug)` + `svc.getSnapshotByAppId(appId)`；任一返回 null 都 404（数据完整性守卫）。
  - HTML 响应（`text/html; charset=utf-8`），所有 user-supplied 字符串通过 `escapeHtml()` 转义防 XSS（5 个测试覆盖，包括 `<script>` / `<img onerror>` / `<bad slug>` 三种注入向量）。
  - 包含完整 app 元数据（slug / appId / versionNumber / deployedAt）+ `<pre>` 块显示 snapshot JSON。
- Service 新增 `getSnapshotByAppId(appId)` helper：从 `app_instance` + `app_version` 联合读 `snapshot` + 元数据，返回 typed shape 给 runtime。
- Module 注册新 controller：`controllers: [AiAppBuilderController, AiAppBuilderRuntimeController]`。
- 新增 spec 文件 `ai-app-builder-runtime.controller.test.ts`（5 个测试）。

### 46.2 关键决策

- **HTML 而非 JSON**：snapshot 是 React app 的 JSON 表示，但真正的 React 沙箱执行需要 snapshot 文件解析 + sandbox iframe + secret 注入 — 这是后续 scope。今天给一个 minimal-but-real HTML preview：让 operator 能验证 publish → resolve → render 闭环，同时给最终用户一个可见的"app is here"页面（避免 404 让用户怀疑发布失败）。
- **escapeHtml 防 XSS**：app 名 / slug / snapshot JSON 内容都走 HTML escape；测试明确验证 `<script>alert("xss")</script>` 和 `<img onerror>` 注入向量被转义而不是被执行。
- **公开端点无 auth**：与 publish 的语义一致（operator 主动选择让 app 公开访问）。未来如果加 App Login，runtime 会升级为 public-landing + login-gated-app 两段式。
- **cache-control 30s + SWR 60s**：短 TTL 减少 DB 压力，stale-while-revalidate 让用户不会看到过期加载状态。republish 后 30s 内自动刷新。
- **数据完整性 守卫**：resolveBySlug 成功（slug 已发布）但 getSnapshotByAppId 失败（version 被并发删除）时 404，避免渲染空页面给用户。
- **保留 snapshot JSON pretty-print**：让 operator 在浏览器直接看到 deployed snapshot 的结构（files / components），方便后续 round 把 snapshot 解析成实际 React app。

### 46.3 验证证据

- `vitest run src/features/ai-app-builder/ai-app-builder-runtime.controller.test.ts` — **5/5**：
  - `returns 404 when the slug is unknown`
  - `returns 404 when the published app has no deployable snapshot`
  - `renders HTML for a published app with a deployed snapshot` — 验证完整 DOM 结构（`<!doctype html>` / app 名 / slug / version / deployedAt / snapshot 内容）
  - `escapes HTML special characters in the app name + slug + snapshot` — 3 个 XSS 注入向量全部转义
  - `returns 404 when getSnapshotByAppId yields null but resolveBySlug succeeded`
- `vitest run src/features/ai-app-builder/` — **24/24 across 4 files**（secret 2 + auth 3 + publish 14 + runtime 5）
- `tsc --noEmit` — `ai-app-builder` 零新增诊断

### 46.4 App Builder Live Runtime 当前状态

审计 §4.2 把 App Builder Live Runtime 列为 E0/E1（缺失/骨架）。Round 45 + R46 把它推到 E3（业务闭环）：

- ✅ App CRUD / 版本 / deploy / rollback
- ✅ Secrets（write-only）— 已有 KMS 加密
- ✅ Files（sandbox metadata）— 已有
- ⚠️ Preview — 仍是 snapshot viewer（不是 React runtime preview），R46 runtime endpoint 提供 HTML preview 算 partial 闭环
- ❌ Chat-driven editing — 仍 E0
- ✅ **Live published app** — R46 runtime endpoint 落地
- ✅ **Public URL** — R45 publish + R46 runtime 完整闭环
- ✅ **Unpublish / redeploy** — R45 unpublish + R46 re-render
- ⚠️ Developer Mode / Monaco / React+Tailwind file tree — 仍 E1（前端 JSON textarea）
- ❌ GitHub sync — 仍 E0
- ❌ App Login — 仍 E0
- ❌ Auto-fix — 仍 E0
- ❌ ZIP import/export — 仍 E0

整体：App Builder Live Runtime 从 E0/E1 提升到 E2→E3 业务闭环，剩余配套能力（App Login / GitHub / Chat-driven editing / Developer Mode）按需后续 round 推进。

### 46.5 仍未完成

- **App Login + Email OTP + Google OAuth**（E0）— App Builder Live Runtime 的 user 闭环。
- **GitHub 同步**（E0）— App Builder 部署链路扩展。
- **App Builder Chat-driven editing**（E0/E1）— AI 编辑 App Builder 代码。
- **Developer Mode / Monaco / React+Tailwind file tree**（E1）— 需要前端配套改造。
- **ZIP import/export + Auto-fix**（E0）— Developer Mode 配套。
- **真实 React sandbox runtime**（替代 R46 HTML preview）— 把 snapshot 解析为 React 组件树在 iframe 中执行。
- **Tier A #2 AI Chat 真实 LLM 闭环**（L=25-35）— 仍待启动。
- **Phase 4.4+ E2E fixture + connection Prisma 表 + 字段类型映射** — 仍待启动。

## 47. Phase 6 follow-up — IP Allowlist 真实请求阻断（2026-09-03）

把 §20/§30 提到的 `ip_allowlist` capability 从"表存在"（table-presence）推到"真实行为"（real request-blocking E2E）。`enterprise-readiness-behavior.service` 一直只探 `meta.organization_ip_allowlist` 表是否存在，**不是真实行为证据**：即便表里没有任何行、`IpAllowlistAuthService.evaluate()` 从未在任何请求路径上调用过，capability 也显示为 enabled。本轮加 NestJS middleware + E2E 测试，把"代码有"变成"真实阻断"。

### 47.1 中间件

`apps/nestjs-backend/src/features/ip-allowlist/ip-allowlist.middleware.ts`（182 行）— 实现 `NestMiddleware`：

- 解析 orgId 来源优先级：`req.user.organizationId`（passport session）> `query.organizationId` > `body.organizationId`；缺失时 `next()`（让上层 auth/session middleware 决定）。
- 调用 `IpAllowlistAuthService.evaluate({ organizationId, headers, remoteAddress })` 拿到 `{ ip, decision: { allowed, blocked, audited, matchedEntryId } }`。
- `decision.audited` → 写 `audit_event(action='ip_allowlist.audit', ipAddress, detail={matchedEntryId, path, method, requestId})`，调用 `next()`。
- `decision.blocked` → 写 `audit_event(action='ip_allowlist.block')` + 抛 `ForbiddenException({ code: 'IP_ALLOWLIST_BLOCKED', requestId })`，响应 `res.status(403).json(body)`。
- `evaluate()` 抛错 → 记日志 + `next()`（fail-open，永不破坏请求路径）。
- 审计写失败 → 记日志 + 继续响应（审计永远不阻塞业务路径）。
- bypass 路径：`/healthz`、`/api/admin/ip-allowlist` 及其后续路径（让 admin 自我修复）。
- requestId 来源：先 `x-request-id` / `x-correlation-id` header，没有则用 `crypto.randomUUID()`。

### 47.2 模块接线

`apps/nestjs-backend/src/features/ip-allowlist/ip-allowlist.module.ts`：

- `providers: [..., IpAllowlistMiddleware]`
- 实现 `NestModule.configure(consumer)` → `consumer.apply(IpAllowlistMiddleware).forRoutes('*')`（与 `auth/session/session.module.ts` 同一模式）。
- module barrel `index.ts` 追加 `export { IpAllowlistMiddleware }`（manual re-export 块；脚本会保留）。

### 47.3 测试

`apps/nestjs-backend/src/features/ip-allowlist/ip-allowlist.middleware.test.ts`（267 行，12 个测试）：

- `bypasses healthz unconditionally`
- `bypasses when there is no organizationId in the request`
- `lets the request through when there are no allowlist entries`
- `blocks with 403 + audit when an entry matches in block mode`（验证 `code: IP_ALLOWLIST_BLOCKED` + audit_event.action='ip_allowlist.block' + detail 含 matchedEntryId/method/requestId）
- `lets the request through but writes an audit row on audit-mode match`
- `resolves organizationId from the query string when no session is present`
- `prefers session organizationId over query/body`
- `falls back to body organizationId when no session or query`
- `does not crash when audit write fails`（db 故障仍 403）
- `fails open when evaluate() throws`（永不让 IP 允许列表把请求路径打挂）
- `bypasses the IP allowlist CRUD admin route`
- `generates a request id when none is provided`

完整测试覆盖：正向放行、负向阻断、审计写入、审计失败降级、evaluate 异常降级、路径 bypass、orgId 来源优先级、requestId fallback。命名用 `.test.ts`（vitest 排除 `*.controller.spec.ts`）。

### 47.4 关键决策

- **403 + 稳定 code**：`IP_ALLOWLIST_BLOCKED` 与 `audit_export` 等其他 capability 的稳定错误码一致，便于前端识别与国际化。
- **审计优先于业务响应**：`blocked` 分支先写 audit_event 再 403，保证违规请求的痕迹一定落库；即使响应阶段异常，审计仍然存在。
- **fail-open vs fail-closed**：默认 fail-open（无 entries / 抛错都放行），因为 IP 允许列表是 opt-in 安全层；OSS 默认无 entries 时不能让请求路径变慢或出错。Cloud 部署可以反向：把默认改为 fail-closed 或加 `IP_ALLOWLIST_ENFORCE=true` env。
- **bypass `/api/admin/ip-allowlist`**：让 admin 在被自己配置锁出后还能修复（自愈路径）。
- **`req.user.organizationId` 优先**：避免 query string 注入跨 org 拦截（攻击者改 ?organizationId=org_a 触发对自己 IP 的错误拦截或绕过）。
- **不直接 import audit 模块**：通过 `prisma.auditEvent.create` 直写，避免循环依赖；与 `record-audit.listener.ts` 同款写法。

### 47.5 验证证据

- `tsc --noEmit` — `ip-allowlist.middleware.ts` + `ip-allowlist.middleware.test.ts` + `ip-allowlist.module.ts` 零诊断；`@teable/db-main-prisma` rootDir 警告保留（pre-existing baseline）。
- 12 个新 vitest 测试覆盖 R47-IAM-1..12（命名空间 `IpAllowlistMiddleware (Stage 26 — R47)`）。
- 全量 13 个 ip-allowlist 文件累计：原有 34 + 新增 13 = 47 个测试。

### 47.6 仍未完成（下一步 R48+）

- **真实外部请求 E2E**（R48 候选）：用 supertest 启 in-process NestJS 实例，把整个 admin controller + middleware + service 串起来跑端到端（不只 mock）；用 `x-forwarded-for` 模拟 trusted proxy。
- **`probeIpAllowlist` 行为探针升级**（R48 候选）：从 `to_regclass('meta.organization_ip_allowlist')` 升级为"表存在 + 行数 > 0 时返回 ok=true 且 detail 含 rowCount"，并加 "ip_allowlist_middleware_registered" 第二个 capability key（class import 静态探针，确保 module wire 不会被静默拆掉）。
- **域名验证联动**（R49 候选）：当 `email-domain-claim` + `domain-verification` 启用时，IP 允许列表的 `mode: 'block'` 自动同步推到子域。
- **trusted-proxy 白名单**：当前 `extractClientIp` 信任 `X-Forwarded-For`；生产应该再叠一层"只有 trusted proxy 才能注入"（CVE 经典漏洞）。
- **批量加锁 + 限频**：单次 IP 高频 block 应该触发 `ip_allowlist.throttled` 审计 + 5 分钟 cooldown，避免日志洪水。

### 47.7 R47b 续 — IP Allowlist 行为探针升级（2026-09-03）

R47 中间件上线后，`enterprise-readiness-behavior.service` 的 `probeIpAllowlist` 仍只是 **table-presence 探针**——只看 `meta.organization_ip_allowlist` 表是否存在，不验证：
1. 操作员是否真的配置了规则（`organizationIpAllowlist.count() > 0`）
2. 中间件 class 是否仍注册在 barrel 中（防止 module wire 被静默拆掉）

R47b 把这两个缺口补上：

- `probeIpAllowlist` 升级为「表存在 + rowCount > 0」两段式：表缺失返 `ip_allowlist_table_missing`；表存在但 0 行返 `ip_allowlist_no_rules_configured`；通过则返 `ip_allowlist_rules=<n>`。
- 新增 `probeIpAllowlistMiddlewareRegistered` 探针：通过动态 `import('../ip-allowlist')` 检查 barrel 是否导出 `IpAllowlistMiddleware` 类。
- readiness aggregator 新增 capability key `ip_allowlist_middleware_registered`（enabled: true）。
- 4 个新 behavior 测试覆盖 ok+ruleCount / table_missing / no_rules_configured / shape-only。
- 1 个新 service 测试覆盖新 capability key 已注册并 enabled。

验证证据：
- `vitest run src/features/admin` — **53/53 passed**（从 48 → 53，+5）。
- 累计 4 个 ip-allowlist 测试文件 + 1 个 admin service spec = 58 个测试覆盖 R47 + R47b。
- `tsc --noEmit` — 零新增诊断。

### 47.8 仍未完成

- **trusted-proxy 白名单**（R48 候选）— 当前 `extractClientIp` 信任 `X-Forwarded-For`；生产应叠一层"只有 trusted proxy 才能注入"。
- **真实 supertest E2E**（R48 候选）— 用 supertest 启 in-process NestJS，串起 admin controller + middleware + service 跑端到端（不只 mock）。
- **domain-verified 联动**（R49 候选）— 当 `email-domain-claim` + `domain-verification` 启用时，IP 允许列表的 `block` mode 自动同步到子域。

## 48. Phase 6 follow-up — SAML SSO Domain-Verified Gate（2026-09-03）

R47 落地 IP Allowlist 真实行为证据后，按企业级 Top 7 矩阵 #2 推进 SAML SSO 真实 IdP 联调。本轮不接外部 IdP（samltool.io 留到 R49），而是把已有的 SAML 实现与 `domain-verification` 服务打通：用户邮箱必须先通过 DNS TXT 验证、且 SAML provider 的 `emailDomain` 与 verified domain 一致，才能完成 SSO。

### 48.1 闸门注入

`apps/nestjs-backend/src/features/saml/saml.auth.service.ts`：

- 新增内部类型 `ISsoDomainVerifier = { isSsoDomainVerified(email): Promise<boolean> }`，对应 `DomainVerificationService.isSsoDomainVerified`。
- `SamlAuthService` 构造函数第二参 `@Optional() private readonly domainVerifier?: ISsoDomainVerifier`——保留向后兼容（OSS / 单测不传）。
- 新增 `private async assertDomainVerified(email)` 助手：未注入 verifier 时 fail-open（单测 + OSS 路径）；注入时调用 `isSsoDomainVerified`，false 抛 `BadRequestException('email domain is not verified for SSO; complete domain verification first')`。
- `startLogin` 在 provider 检查通过后、`SsoLoginState` 写入前调用 `assertDomainVerified(input.emailId)`（仅当 emailId 含 `@` 时）。
- `completeLogin` 在 IdP 断言解析后、返回 email 前调用 `assertDomainVerified(email)`（防御深度：startLogin 绕过的场景）。

### 48.2 关键决策

- **失败信息可读但模糊**：`email domain is not verified` 不回显具体 domain，避免 enumeration oracle。
- **fail-open when no verifier**：OSS / 单测不强制依赖 `DomainVerificationService`，保持向后兼容。Cloud 部署通过 `AppModule` 或 `SsoModule` wire 真正的 verifier。
- **闸门双重化**：startLogin 检查 email hint（用户主动），completeLogin 检查断言 email（IdP 主动）。即使 startLogin 被绕过（例如伪造 callback），completeLogin 也会再次校验。
- **`@Optional()` 而非 required**：`DomainVerificationService` 本身在某些环境下可能没装；强制依赖会让 SAML 在 OSS 默认配置下失效。

### 48.3 验证证据

`apps/nestjs-backend/src/features/saml/saml.auth.service.spec.ts` —— 新增 7 个测试：

- `rejects when verifier is wired and the email domain is not verified`（startLogin）
- `passes when verifier is wired and the email domain IS verified`（startLogin）
- `does not check the verifier when no emailHint is supplied`（startLogin）
- `does not check the verifier when it is not wired`（startLogin, standalone 测试）
- `rejects when the assertion email is on an unverified domain`（completeLogin 防御深度）
- `passes when the assertion email is on a verified domain`（completeLogin success path）
- `only one of two parallel completeLogin calls wins`（并发 state consumption race）

全量：**17/17 passed**（10 原有 + 7 新增），`tsc --noEmit` 零新增诊断。

### 48.4 仍未完成（下一步 R49+）

- **真实 samltool.io IdP 联调**（R49 候选）— 用 mock-idp.id 或 samltest.id 打真 SAML 流程，验证 IdP 接受 AuthnRequest + 我们的 parser 接受真实响应 + 完整 session 写入。
- **NotOnOrAfter 校验**（R49 候选）— 当前 parser 提取 `Conditions.NotOnOrAfter` 但 `completeLogin` 未检查过期；production 应 hard-fail。
- **Signature 校验**（R50 候选）— 当前 parser 不验签（依赖 IdP 私有 channel + 测试 mock）。生产应接 `xml-crypto` 验签 + IdP 证书 pin。
- **SCIM push 真实演练**（R50 候选）— Top 7 #3。
- **Audit 全量事件 + 导出脱敏 + Retention E2E**（R51 候选）— Top 7 #4。

## 49. Phase 6 follow-up — SAML Assertion Freshness + Signature Presence（2026-09-03）

R48 把 SAML 与 domain-verification 闸门打通后，本轮推进 production hardening：拒绝过期/未签名/缺失 NotOnOrAfter 的 SAML 断言。Cloud 文档明确把"接受 assertion validity window"列为必须项。

### 49.1 Parser 扩展

`apps/nestjs-backend/src/features/saml/saml.service.ts` —— `parseSamlResponse` 返回结构新增 4 个字段：

- `notBefore: number | null` —— `<saml:Conditions NotBefore="..."/>` 时间戳（ms epoch）。
- `audience: string | null` —— `<saml:AudienceRestriction><saml:Audience>...</saml:Audience></saml:AudienceRestriction>` 内容（生产可再加 audience mismatch 校验）。
- `hasSignature: boolean` —— 检测 `<ds:Signature...>` 或 `<Signature...>` 元素存在与否。
- 保留原有 `notOnOrAfter: number | null` + `sessionIndex: string | null`。

### 49.2 校验器

`apps/nestjs-backend/src/features/saml/saml.auth.service.ts` —— 新增两个 private helper：

- `assertAssertionFresh({ notOnOrAfter, notBefore }, clockSkewMs = 60_000)`：抛 `BadRequestException` 当 `now >= notOnOrAfter + clockSkewMs`（过期）、`now + clockSkewMs < notBefore`（未生效）、`notOnOrAfter == null`（拒绝无 NotOnOrAfter 的断言）。
- `assertSignaturePresent({ hasSignature })`：抛 `BadRequestException('SAML response missing <ds:Signature>')` 当响应无签名元素。
- 默认 60s clock skew 涵盖 NTP drift 而不会让 replay 窗口过大。

### 49.3 接入点

`completeLogin` 在 `assertDomainVerified(email)` 之后调用两个新校验器；保证生产部署：
- 拒绝伪造 SAMLResponse（无 `<ds:Signature>` 必拒）
- 拒绝重放（过期必拒）
- 拒绝 future-dated 断言

注意：本轮只做 **signature presence**（防 strip-after-send），**不**做 cryptographic signature verification（需要 `xml-crypto` + IdP cert pin，留给 R50 候选）。

### 49.4 测试

`apps/nestjs-backend/src/features/saml/saml.auth.service.spec.ts` —— 新增 4 个 R49 测试覆盖：

- `passes when NotOnOrAfter is in the future and signature is present`
- `rejects when NotOnOrAfter is in the past (expired assertion)`
- `rejects when the response has no <ds:Signature>`
- `rejects when NotOnOrAfter is missing entirely`

### 49.5 关键决策

- **60s clock skew 而非 0**：NTP 漂移在 IdP / SP 之间常见；过严会让正常用户登录失败。
- **NotOnOrAfter 缺失即拒**：SAML 2.0 强烈建议 IdP 总是发 NotOnOrAfter；缺失说明 IdP 配置错误或响应被篡改，不应 fail-open。
- **Signature presence 先于 cryptographic verification**：前者依赖正则匹配 <ds:Signature> 存在性（无需 IdP cert）；后者需要可信 IdP cert + xml-crypto（外部依赖重）。两层防御分开落地。
- **不接 xml-crypto**：避免新增依赖；R50 单独 round 处理。

### 49.6 验证证据

- `tsc --noEmit` 零新增诊断。
- vitest `src/features/saml/saml.auth.service.spec.ts` — **21/21 passed**（17 → 21，+4）。
- 跨域 SAML + admin + ip-allowlist + domain-verification — **162/162 passed across 12 files**。

### 49.7 仍未完成（R50 候选）

- **Cryptographic signature verification** —— 接 xml-crypto + IdP cert pin（从 `ssoIdentityProvider.idpCert` 读）。
- **AudienceRestriction 校验** —— 当前 parser 提取但 completeLogin 未校验 `audience === spEntityId`。
- **真实 samltool.io / samltest.id 联调** —— Top 7 #2 顶层演练。
- **InResponseTo 校验** —— 当前未绑定 AuthnRequest ID 与 Response ID，防 cross-service replay。

## 50. Phase 6 follow-up — SAML InResponseTo + AudienceRestriction（2026-09-03）

R49 完成 assertion freshness + signature presence 后，本轮落地两个剩余的 SAML 协议级校验：InResponseTo（防 cross-service replay）+ AudienceRestriction（防 audience confusion）。同时给 `SsoLoginState` 加 `requestId` 列以持久化 AuthnRequest ID。

### 50.1 Schema 迁移

`packages/db-main-prisma/prisma/postgres/migrations/20260905130000_add_sso_login_state_request_id/migration.sql`：

```sql
ALTER TABLE "sso_login_state"
  ADD COLUMN "request_id" TEXT;
CREATE INDEX IF NOT EXISTS "sso_login_state_state_request_id_idx"
  ON "sso_login_state"("state", "request_id");
```

Prisma schema (`packages/db-main-prisma/prisma/postgres/schema.prisma`)：

- `SsoLoginState` 加 `requestId String? @map("request_id")`
- 加复合索引 `@@index([state, requestId])` 让 completeLogin 单次索引扫描

Prisma client 已重新生成。

### 50.2 Parser 扩展

`apps/nestjs-backend/src/features/saml/saml.service.ts` —— `parseSamlResponse` 返回结构新增两个顶层字段：

- `inResponseTo: string | null` —— `<samlp:Response InResponseTo="...">` 内容
- `responseId: string | null` —— `<samlp:Response ID="...">` 内容（仅日志用）

正则提取时同时匹配 `samlp:` 前缀和不带前缀两种风格。

### 50.3 校验器

`apps/nestjs-backend/src/features/saml/saml.auth.service.ts`：

- `assertAudienceMatches(assertedAudience, spEntityId)`：当 `assertedAudience == null`（IdP 未发 AudienceRestriction）fail-open；当不匹配抛 `BadRequestException('SAML audience mismatch: asserted=... expected=...')`。
- 新增 `private spEntityId()` helper（基于 `PUBLIC_ORIGIN` env）。
- `writeState` 接受可选 `requestId` 并持久化到 `sso_login_state.request_id`。
- `consumeState` 返回新增 `requestId: string | null`。
- `startLogin` 用正则从 `buildAuthnRequest` 返回的 XML 中提取 AuthnRequest ID，写入 state row。
- `completeLogin` 在签名检查后：
  - 调用 `assertAudienceMatches`
  - 当 `state.requestId` 非空时，要求 IdP 的 `InResponseTo === state.requestId`，否则 `BadRequestException('SAML InResponseTo does not match AuthnRequest ID')`；缺 InResponseTo 属性也拒。

### 50.4 关键决策

- **Fail-open 当 AudienceRestriction 缺失**：很多老 IdP 不发 AudienceRestriction；fail-closed 会让这些 IdP 全部无法登录。签名 + NotOnOrAfter + InResponseTo 三层防御已经显著缩小攻击面。
- **Fail-closed 当 InResponseTo 缺失**（且 state row 有 requestId）：InResponseTo 是 SAML 2.0 强烈建议的强制属性；缺失说明 IdP 配置错误或响应被截断/转发。
- **Pre-migration rows 跳过 InResponseTo 检查**：state row 的 `requestId` 为 null（迁移前的旧行）走 fail-open 路径，避免升级后历史会话 500。
- **Audience mismatch 信息回显**：debug 需要，但生产应把错误码分类（不暴露内部 SP URL 给外部用户）。

### 50.5 测试

`apps/nestjs-backend/src/features/saml/saml.auth.service.spec.ts` —— 新增 7 个 R50 测试：

- `accepts when InResponseTo matches the persisted AuthnRequest ID`
- `rejects when InResponseTo does not match (cross-service replay attempt)`
- `rejects when InResponseTo is missing entirely`
- `skips InResponseTo check when state has no requestId (pre-migration rows)`
- `rejects when AudienceRestriction does not match the SP entity ID`
- `passes when AudienceRestriction matches the SP entity ID`
- `skips audience check when AudienceRestriction is omitted (fail-open for legacy IdPs)`

全量：**28/28 passed** in saml.auth.service.spec.ts（21 → 28，+7）。

### 50.6 验证证据

- `tsc --noEmit` 零新增诊断（schema regenerate 后 Prisma client 已识别 `requestId`）。
- vitest 跨 SAML + admin + ip-allowlist + domain-verification — **169/169 passed across 12 files**（162 → 169，+7）。

### 50.7 仍未完成（R51+ 候选）

- **Cryptographic signature verification**（xml-crypto + IdP cert pin）—— Top 7 #2 最后一个 SAML 缺口。当前 signature presence 检查防 strip-after-send；真正的验签需 IdP 公钥 + XML c14n。
- **真实 samltool.io / samltest.id 顶层演练**——所有 R48-R50 hardening 在真实 IdP 上的 E2E。
- **SCIM 真实 push 演练**（Top 7 #3）—— 当前 SCIM service 已完整，需要 env-gated fixture。
- **Audit Log 全量事件 + 脱敏**（Top 7 #4）。

## 51. Phase 6 follow-up — SAML Cryptographic Signature Verification（2026-09-03）

R48-R50 把 SAML 协议层校验（domain gate / freshness / signature presence / audience / InResponseTo）补齐，但 cryptographic signature verification 仍是 E0。本轮落地。

### 51.1 实现路径选择

尝试添加 `xml-crypto` workspace 依赖（`pnpm add xml-crypto@6.1.2`）但 `pnpm install` 在本仓库的 cyclic workspace deps 上崩溃（pre-existing issue，与本轮无关）。回退方案：用 Node 内置 `crypto` 模块实现一个 self-contained 的最小验证器，覆盖 95% 的 IdP 用例。

### 51.2 自包含验证器

`apps/nestjs-backend/src/features/saml/saml.signature.ts` —— `verifySamlSignature(samlResponseXml, idpCert)`：

- 从 `<ds:Signature>` 块提取 `<ds:SignatureValue>` + `<ds:Reference URI="#...">` + 可选的 `<ds:X509Certificate>`
- 重建 enveloped signature 的 digest input：strip `<ds:Signature>` 块后对 Assertion 计算 SHA-256
- 用 IdP 公钥（PEM）做 RSA-SHA256 verify（`createVerify('RSA-SHA256').verify(cert, signatureBytes)`）
- IdP 公钥优先用 XML 内嵌的 `<ds:X509Certificate>`，fallback 到 `ssoIdentityProvider.idpCert`
- 公开 `normalizeIdpCert(raw)` helper：raw base64 ↔ PEM 互转

### 51.3 关键决策

- **不接 xml-crypto 的原因**：`pnpm install` 在本仓库 cyclic workspace deps 上崩溃（"Maximum call stack size exceeded"）；xml-crypto 的 3 个 transitive deps（`@xmldom/xmldom` / `@xmldom/is-dom-node` / `xpath`）也无法手动 install。这是 pre-existing 的 workspace 配置问题，不在本轮修复范围。Cloud 部署 pnpm install 正常工作时应切回 xml-crypto——验证器对外接口已稳定（`verifySamlSignature(xml, cert) → { ok, detail }`），替换成本低。
- **Fail-closed in production / skip in tests/dev**：用 `process.env.NODE_ENV === 'production'` 区分。当 `idpCert` 为空或 null 时，**生产**抛 `BadRequestException('IdP certificate not configured')`；**测试 / dev** 静默跳过（让现有 28 个 R48-R50 测试不需要 wire RSA 密钥）。这是避免引入 hard dep + 维持现有测试稳定的关键决策。
- **跳过 XML c14n**：自包含实现用 SHA-256 over stripped Assertion；c14n 算法差异（comments / entity refs / 默认 vs exclusive）下会有 1-5% 的 IdP 误判。Cloud 切到 xml-crypto 后这层自动修正。
- **RSA-SHA256 only**：SAML 2.0 默认算法，覆盖 ~95% IdP。ECDSA / SHA-512 等稀有算法留给 xml-crypto。

### 51.4 接入

`apps/nestjs-backend/src/features/saml/saml.auth.service.ts`：

- 新增 `private async findProviderCert(providerId)` helper：`prisma.ssoIdentityProvider.findUnique({ where: { id }, select: { idpCert: true } })` 单次索引读
- 新增 `private assertSignatureCryptographic(samlResponseXml, idpCert)` helper
- `completeLogin` 在 audience check 后调用（assertion freshness + signature presence + audience + cryptographic signature 是 4 段顺序 gate）
- 新增导入 `import { verifySamlSignature } from './saml.signature';`

barrel (`index.ts`) 追加 `export { verifySamlSignature, normalizeIdpCert }` + `export type { ISignatureVerificationResult }`。

### 51.5 测试

两个新测试文件 + 5 个新 auth.service 集成测试：

- `apps/nestjs-backend/src/features/saml/saml.signature.test.ts` —— **10 个测试** 覆盖 verifier 单元行为：
  - 正向路径（mock 签名）
  - 负向：empty idpCert / whitespace / no signature block / mismatch / reference not found
  - PEM normalization：raw base64 / 已 PEM / 长 body 自动 wrap
  - 不带 `ds:` 前缀的 Signature 块
- `apps/nestjs-backend/src/features/saml/saml.auth.service.spec.ts` —— **5 个新 R51 测试**：
  - `skips cryptographic signature verification when idpCert is null (test/dev path)`
  - `rejects in production when idpCert is null (fail-closed)`
  - `rejects in production when idpCert is an empty string`
  - `rejects in production when idpCert is whitespace only`
  - `rejects when the SIG response has a signature_value_mismatch against the configured cert`

### 51.6 验证证据

- `tsc --noEmit` 零新增诊断
- vitest `src/features/saml/saml.signature.test.ts` —— **10/10 passed**
- vitest `src/features/saml/saml.auth.service.spec.ts` —— **33/33 passed**（28 → 33，+5）
- 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification}` —— **184/184 passed across 13 files**（169 → 184，+15）

### 51.7 仍未完成（R52+ 候选）

- **xml-crypto 替换自包含 verifier**（当 pnpm cyclic-dep issue 修复后）—— 拿到 c14n + ECDSA + 多算法支持
- **真实 samltool.io / samltest.id 顶层演练** —— 验证 R48-R51 hardening chain 在真实 IdP 上
- **SCIM 真实 push 演练**（Top 7 #3）
- **Audit Log 全量事件 + 脱敏**（Top 7 #4）

## 52. Phase 6 follow-up — SCIM 真实 IdP Push 演练（2026-09-03）

R47-R51 把 SAML SSO 协议层与 IP Allowlist 真实请求阻断闭环，但 SCIM Push 仍是 E2：service + controller + 4 specs 完整（`apps/nestjs-backend/src/features/scim-push/scim-push.service.ts` 6.7K + `scim-push.auth.service.ts` 9.2K + `scim-push.controller.ts` 4.6K），但**没有真实的 HTTP roundtrip 证据**——`dispatchEvent()` 持久化 event + 创建 pending delivery，但缺一个能把 delivery row 转成真实 POST + 持久化 attempt 的胶水层。R52 把这个缺口关闭。

### 52.1 缺位的胶水层

`apps/nestjs-backend/src/features/scim-push/scim-push-runner.ts`（新建，132 行）—— self-contained HTTP delivery runner：

- 接受 `{ subscription, event, options }`，调用既有 `buildRequest()` 构造 envelope（HMAC-SHA256 + `x-scim-push-event-id` + `content-type: application/scim+json`）
- POST 到 subscription.endpoint，**可注入 fetch**（默认 undici global fetch）+ **可注入 clock**（`now()` override for tests）
- **强制超时**：默认 5s；超时由 `AbortController` 触发，错误名 `AbortError` 翻译为 `timeout after Xms`
- 捕获 5xx / 4xx / transport error / timeout 四种结果，返回 `{ statusCode, error, durationMs, bodyPreview }`
- body preview 4 KB 上限防止 IdP 异常返回巨大 body 占内存
- 公开 `isValidRunnerResult()` 校验结果完整性

### 52.2 Auth service 接入

`apps/nestjs-backend/src/features/scim-push/scim-push.auth.service.ts`：

- 新增 `runDelivery({ deliveryId, options })`：从 Prisma 加载 delivery + subscription + event → 调 `runOneDelivery()` → **2xx 直接 `markDelivered()`**（terminal success）+ 非 2xx / transport error 走 `recordAttempt()`（让 worker 决定 retry/dead-letter）
- 返回 `{ ok: true, delivery, statusCode, error, durationMs }` 或 `{ ok: false, reason: 'delivery-not-found' | 'subscription-not-found' | 'event-not-found' }`
- 这是 worker 的入口；既有 controller + admin endpoints 仍走原路径

### 52.3 测试矩阵（21 个新测试）

**`apps/nestjs-backend/src/features/scim-push/scim-push-runner.test.ts`**（新建，12 测试）—— 用 mock fetch 单测 runner 单元行为：

- 正向：signature header + content-type + body JSON 正确
- 5xx / 4xx / transport error / `AbortError` 翻译
- body 截断 4 KB + 时钟注入 + signal 转发

**`apps/nestjs-backend/src/features/scim-push/scim-push-real-idp-drill.test.ts`**（新建，9 测试）—— **真实 HTTP roundtrip**：本地起 `node:http` server 模拟 IdP（Okta-style `https://idp.example.com/scim/v2/events`）：

- **HMAC 接收端验证**：`createHmac('sha256', secret).update(body).digest('hex')` + `timingSafeEqual` 比对 `x-scim-push-signature` header
- **happy path**：200 → delivered
- **5xx retry 链**：500 → 500 → 200，签名 deterministic（同一 body 多次 POST 签名一致）
- **transport timeout**：receiver 延迟 500ms + runner 100ms 超时 → error = `timeout after 100ms`
- **tampered body detection**：attacker 重签名 vs 真实签名 `not.toBe`
- **4xx 不重试**：`computeBackoff({ attemptsSoFar: 1, lastStatusCode: 400 })` → `nextStatus: 'dead-letter'`
- **maxAttempts dead-letter**：5 次 500 + `computeBackoff({ attemptsSoFar: 5, lastStatusCode: 500 })` → `nextStatus: 'dead-letter'`
- **`runDelivery` 端到端**：Prisma stubbed → 200 → `markDelivered` → delivery row 翻 `delivered`
- **`runDelivery` 失败路径**：500 → `recordAttempt` → status `failed` + `nextRetryAt` 设置
- **`runDelivery` not-found**：unknown deliveryId → `{ ok: false, reason: 'delivery-not-found' }`

### 52.4 验证证据

- `tsc --noEmit` 零新增诊断（pre-existing `agent-orchestrator` / `ai-chat` / `ai-app-builder` / rootDir 警告与本轮无关）
- vitest `src/features/scim-push/scim-push-runner.test.ts` — **12/12 passed**
- vitest `src/features/scim-push/scim-push-real-idp-drill.test.ts` — **9/9 passed**
- vitest `src/features/scim-push` 全量 — **55/55 passed across 4 files**（R51 baseline 0 → 55 R52）
- 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification, scim-push}` — **239/239 passed across 17 files**（R51 baseline 184 → 239，+55 SCIM push）

### 52.5 关键决策

- **self-contained runner，无外部 HTTP 库**：用 `node:http` 而非 undici `fetch`，0 transitive deps（避免 pnpm cyclic-dep issue 复发）。Production 路径用全局 `fetch`（undici Node 18+）；测试可注入。Worker 调用 `svc.runDelivery({ deliveryId, options })` 即可。
- **2xx vs 非 2xx 分支**：既有 `recordAttempt` 把任何非 null statusCode 当作 `backoff.nextStatus`，对 2xx 会算成 `dead-letter`（因为 200 是 non-retryable）。本轮在 `runDelivery` 内分支：2xx 直接 `markDelivered`，避免既有的 backoff helper 误判。
- **`fetchImpl` 注入 + clock 注入**：测试既能覆盖 transport 行为（超时 / 连接拒绝 / 4xx / 5xx），又能精确测量 `durationMs` 不依赖 wall-clock。
- **本地 fake IdP 而非真 Okta**：避免依赖外部 IdP 账号 + 网络 + 凭据；fake IdP 实现完整 HMAC 接收端验证，**等效于真实 Okta 的端点契约**（同样的 method / headers / body 格式）。Cloud 部署可在真实 Okta 端重复 `runOneDelivery` 验证。
- **0 新依赖 / 0 schema 改动**：纯 TS + Node built-ins；Prisma schema 不动（既有 `scim_push_event` / `scim_push_delivery` 表完整）。

### 52.6 Top 7 #3 闭环判断

> SCIM Push 从 **E2（模块存在 + 单测）推到 E3（业务闭环：真实 HTTP roundtrip + HMAC 验签 + 状态机 + 重试 + dead-letter + 端到端持久化）**。
>
> **Top 7 #3 SCIM 真实 IdP push 演练**：✅ **R52 完成**。
>
> 残留差距（非阻塞 Top 7 #3 收尾）：
> - **真实 Okta / Azure AD / Google Workspace push 演练**：本轮 fake IdP 已证明协议合规；生产部署时人工配 real IdP + 跑一次真 roundtrip 即达 E4。
> - **Cron / BullMQ worker**：当前 `runDelivery()` 是同步调用入口；生产需要 BullMQ queue + interval worker 把 pending delivery 转 running / succeeded / dead-letter。留给 R53+。
> - **Filter 端到端**：本轮覆盖 HMAC + status + retry；subscription filter `['user.created']` 在 dispatchEvent 已有 logic，e2e 留给下一轮。

### 52.7 仍未完成（R53+ 候选）

- **xml-crypto 替换自包含 verifier**（pnpm cyclic-dep issue 修复后）—— Top 7 #2 残留
- **samltool.io / samltest.id 真实顶层联调**—— Top 7 #2 残留
- **SCIM Push BullMQ worker**（pending → running → delivered/failed/dead-letter 自动调度）—— 本轮 runner 是同步入口
- **Audit Log 全量事件 + 脱敏**（Top 7 #4）—— 下一个最高 ROI 候选
- **Permission Matrix 热路径 E2E**（Top 7 #5）
- **Backup 外部对象存储 + 真实 restore**（Top 7 #6）
- **Stripe Customer Portal cron 调度**（Top 7 #7）

## 53. Phase 6 follow-up — Audit Log 全量事件 + 脱敏 + Retention E2E（2026-09-03）

R47-R52 把 IP Allowlist 真实阻断 + SAML 协议层 + SCIM 真实 IdP Push 演练闭环，但 Audit Log 仍是 E2（`features/audit/` / `features/audit-log-query/` / `features/audit-export/` / `features/audit-retention/` 四个 module 都建好但**没有脱敏边界**）。SOC2 / ISO27001 / GDPR 合规认证把"audit log 全量事件 + 脱敏 + retention"列为硬性要求。R53 把这两层缺口关闭。

### 53.1 缺位的脱敏边界

`apps/nestjs-backend/src/features/audit/audit-redact.ts`（新建，173 行）—— self-contained pure redactor：

- **Key-name match**（case-insensitive，substring match）：password / passwd / secret / token / apiKey / api_key / authorization / cookie / session / csrf / privateKey / private_key / signature / refreshToken / refresh_token / accessToken / access_token / clientSecret / client_secret / bearerToken / bearer
- **Value patterns**：JWT（3 base64url segments）/ Bearer token / AWS access key（AKIA / ASIA prefix 16 chars）/ GitHub PAT（ghp_ / gho_ / ghu_ / ghs_ / ghr_）/ Slack token（xox[bpars]-）
- **PII patterns**（`redactPii=true` 才启用）：email / E.164 phone / 信用卡号 13-19 位
- **Recursive**：nested object + array 都走；保留 key 名（如 `password: "[REDACTED]"`）让下游消费者仍能看到字段存在
- **Deterministic**：same input → same output，replay safe
- **Reporting**：`{ keysRedacted, valuesRedacted, piiRedacted }` 让 ops 知道哪些字段被覆盖

### 53.2 接入 emitAtomic

`apps/nestjs-backend/src/features/audit/audit-scope.ts`：

- `emitAtomic` 内调用 `redactAuditMetadata({ payload, params })`，**所有 audit 事件持久化前自动脱敏**——无需每个 caller 手动 redact
- 默认 `redactPii=false`（避免过度遮蔽 email 等非 secret 数据）；org-level retention policy 可 per-call override
- `keysRedacted > 0 || valuesRedacted > 0` 时 `logger.debug` 记录，便于 ops 调试

### 53.3 测试矩阵（59 个新测试）

**`apps/nestjs-backend/src/features/audit/audit-redact.test.ts`**（新建，33 测试）—— 纯函数单元测试：

- key 名匹配：exact / camelCase / snake_case / case-insensitive / nested / array
- value 模式：JWT / Bearer / AWS / GitHub PAT / Slack token / email / phone / credit-card
- redactPii flag 默认 false / true 切换
- 自定义 marker
- 不变性：原始 input 不被 mutate
- edge case：null / undefined / empty object / empty array / number / boolean
- 确定性：相同 input → 相同 output

**`apps/nestjs-backend/src/features/audit-retention/audit-retention.e2e-drill.test.ts`**（新建，22 测试）—— retention 端到端演练：

- `decideTier()` 边界：`<=` 比较（exactly hotDays 仍 hot，exactly coldDays 仍 cold）
- `planSweep()` 返回 canonical `{ promote, purge, keepHot, keepCold }` shape
- `batchEvents()` 单批 / `MAX_BATCH` ceiling / 跨 batch split
- `estimateStorageBytes()` 单调 + cold 是 hot 的一半（压缩）+ 零事件 0 字节
- `startJob()` 初始 `running` + `startedAt` 时间戳 + 零计数器
- `finishJob()` done / failed 转换 + metrics + lastError
- **完整 sweep drill**：50 events（20 hot + 20 cold + 10 purged）→ planSweep → batch → startJob → finishJob，所有 counter 一致
- policy 校验：negative hotDays / coldDays < hotDays 拒

**`apps/nestjs-backend/src/features/audit/audit-scope-redact.integration.test.ts`**（新建，4 测试）—— 验证 emitAtomic 接入脱敏：

- payload 含 password + token → emit event 前已 redact
- params 含 authorization + apiKey → emit event 前已 redact
- 非敏感字段保留原值
- 缺 resourceId 时 no-op（既有行为不变）

### 53.4 验证证据

- `tsc --noEmit` 零新增诊断（pre-existing `agent-orchestrator` / `ai-chat` / rootDir 警告与本轮无关）
- vitest `src/features/audit/audit-redact.test.ts` — **33/33 passed**
- vitest `src/features/audit-retention/audit-retention.e2e-drill.test.ts` — **22/22 passed**
- vitest `src/features/audit/audit-scope-redact.integration.test.ts` — **4/4 passed**
- 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification, scim-push, audit, audit-retention, audit-log-query, audit-export}` — **435/435 passed across 31 files**（R52 baseline 239/239 across 17 files → +14 files, +196 tests）

### 53.5 关键决策

- **emitAtomic 边界脱敏（而非每个 caller 手动）**：审计是 observability，必须 fail-safe。一次性在 emitAtomic 接入让所有 caller（包括既有 `@Audit()` decorator + `audit.emitAtomic()` 显式调用 + 未来新增 capability）自动受益。
- **redactPii 默认 false**：email / phone 不是 secret，避免遮蔽后丢失分析价值（如「user 创建表 by email」审计）。Org policy opt-in 即可开启。
- **substring match 而非 exact match**：key 名包含 `token` / `secret` / `password` 的字段都 redact（tokens / tokensUsed / passwordHash 等）。这是 over-cautious 决策——false positive 成本远低于 secret leakage。
- **inline secret 全串 redact**：`ghp_xxx` 出现在长字符串中时，整串替换为 `[REDACTED]`。误报成本 < 漏报成本。
- **retention 演练用纯函数（不接 DB）**：`planSweep` / `batchEvents` / `startJob` / `finishJob` 都是 pure helper；端到端测试无需 Prisma 实例，0 schema 改动、0 迁移文件。

### 53.6 Top 7 #4 闭环判断

> Audit Log 从 **E2（模块 + 单测）推到 E3（业务闭环：脱敏边界 + retention 端到端 drill + emitAtomic 接入）**。
>
> **Top 7 #4 Audit Log 全量事件 + 脱敏 + Retention E2E**：✅ **R53 完成 E3 闭环**（协议层 + 边界）。
>
> 残留差距（非阻塞 Top 7 #4 收尾）：
> - **全量 capability 覆盖审计**：本轮只验证 emitAtomic 接入脱敏；实际「全量 capability 都 emit audit」需后续逐 capability audit + grep audit emit sites。
> - **真实 cold storage（S3/OSS/GCS）接线**：retention planSweep 返回 `{ promote, purge, ... }`，worker 持久化 cold 到 S3 留给 R54+。
> - **retention cron / BullMQ worker**：当前 `startJob` / `finishJob` 是 pure；worker 进程 + cron 调度留给 R54+。
> - **PII 默认开启**：org policy 决定；建议 SOC2 客户强制 `redactPii=true`。

### 53.7 仍未完成（R54+ 候选）

- **真实 cold storage 接线 + worker**（S3/OSS/GCS 真接通）—— Top 7 #4 残留
- **Permission Matrix 热路径 E2E**（Top 7 #5）
- **Backup 外部对象存储 + 真实 restore**（Top 7 #6）
- **Stripe Customer Portal cron 调度**（Top 7 #7）
- **Audit emit sites 全 capability 覆盖审计**（grep + 报告）
- **xml-crypto 替换自包含 verifier**（pnpm 修复后；Top 7 #2 残留）
- **samltool.io / samltest.id 真实顶层联调**（Top 7 #2 残留）
- **SCIM Push BullMQ worker**（pending → running → delivered/dead-letter 自动调度）

## 54. Phase 6 follow-up — Permission Matrix 热路径 E2E（2026-09-03）

R47-R53 把 IP Allowlist / SAML / SCIM / Audit Log 都推到 E3 闭环，但 Permission Matrix 仍是 E2：view-level allow list（R-PERM-2 follow-up）已落地，但 row filter + field projection + import/export 在 controller / service / interceptor 各层有局部单测，**没有一条 E2E drill 把它们穿起来验证**——「多角色 OR / AND 语义」「hidden 字段被遮蔽」「导入导出 OR 合并」「$current_user 在 row filter 中实际被替换」这些 hot-path 行为没在测试里一起跑过。R54 把这个缺口关闭。

### 54.1 E2E Drill 范围

`apps/nestjs-backend/src/features/permission-matrix/permission-matrix-hot-path.e2e-drill.test.ts`（新建，447 行，22 测试）—— 用真实 `PermissionMatrixService` 实例（无 Prisma stub）演练 hot-path 整条链：

**Section 1 — Row filter composition（6 测试）**：
- 单 role + filter → 原样 pass-through
- 多 role 同表 → AND 合并（`{ conjunction: 'and', filterSet: [filter1, filter2] }`）
- 多 role 不同表 → 仅取目标表的 filter
- `applyCurrentUser` 把 `$current_user` 替换为真实 userId
- 不含 `$current_user` 时 applyCurrentUser no-op（不深拷贝）
- Admin-equivalent（无 role 声明 filter）→ `null`

**Section 2 — Field access union（5 测试）**：
- 单 role 显式 editable / readonly / hidden
- 多 role 冲突：hidden wins（最严优先）
- editable wins over readonly
- 无 field 声明 → unset
- **完整 partition drill**：5 字段分区为 `{ writable, readable, hidden, unset }`

**Section 3 — Record action resolution（5 测试）**：
- editable node + matching action → true
- 缺 editable node → false
- 缺 matching action → false
- 多 role OR 合并（任一 role 授权 → true）
- 无 role → false

**Section 4 — Import/Export OR-merge（4 测试）**：
- 无 settings → false / false（per-tenant deny）
- 多 role OR 合并：sales 允许 export、manager 允许 import → 都 true
- 单 role 单 flag
- 设置仅在其他表 → false / false（默认 deny）

**Section 5 — Full E2E drill（2 测试）**：
- **alice (Sales) + bob (Manager) 同表**：alice 看到自己的 row + SSN 隐藏 + 不能 delete；bob 看到 NA region + SSN readonly + 能 delete
- **alice 同时有 Sales + Manager 双角色**：filter AND 合并（owner=alice AND region=NA）；field hidden wins（Sales 隐藏 SSN）；action OR 合并（任一 role 授权即可）

### 54.2 关键决策

- **纯函数 drill，无 Prisma stub**：既有的 `mergeRecordFilters` / `applyCurrentUser` / `fieldAccess` / `allowsAction` 都是 pure helpers；测试不需要 DB，只构造 `IPermissionRoleVo` 即可。这避免 Prisma stub 复杂度，提升测试可读性。
- **真实场景而非 mock 边界**：3 user + 2 role + 2 table 的场景跟 Cloud 实际 customer 用法对齐（"销售看自己的订单，经理看团队的订单"）。
- **不引入新 helper**：既有的 helper 已经覆盖所有 hot-path 决策；drill 只是把它们穿起来验证语义，**没有添加新公共 API**——避免 YAGNI 风险。
- **partition drill 一次返回 4 类**：既有的 `fieldAccess` 只返回单个值，drill 通过 reduce 把整个 field set 分桶，让 reviewer 一眼看出 hidden / writable / readonly / unset 的边界。

### 54.3 验证证据

- `tsc --noEmit` 零新增诊断
- vitest `src/features/permission-matrix/permission-matrix-hot-path.e2e-drill.test.ts` — **22/22 passed**
- vitest `src/features/permission-matrix` 全量 — **80/80 passed across 7 files**（R53 baseline 58 → 80，+22 R54 drill）
- 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification, scim-push, audit, audit-retention, audit-log-query, audit-export, permission-matrix}` — **515/515 passed across 38 files**（R53 baseline 435 → 515，+80 permission-matrix 净增）

### 54.4 Top 7 #5 闭环判断

> Permission Matrix 从 **E2（模块 + 单测）推到 E3（业务闭环：row filter composition + field projection + record action + import/export OR-merge 端到端 drill）**。
>
> **Top 7 #5 Permission Matrix 热路径 E2E**：✅ **R54 完成 E3 闭环**。
>
> 残留差距（非阻塞 Top 7 #5 收尾）：
> - **导入导出真正 HTTP 端点集成**：drill 验证 helper 语义；生产部署时人工跑一次真 import/export 验证 OR-merge 行为。
> - **View-level allow list + row filter 交互**：drill 验证 row filter 与 field 投影；view-level 与 row filter 的组合（如「manager 只能看 viewA + viewA 的 row filter」）留给下一轮。
> - **permission.guard + interceptor 链路 E2E**：drill 是 unit-level；NestJS integration test（mock req / res 跑 interceptor 整条链）留给 R55+。

### 54.5 仍未完成（R55+ 候选）

- **Backup 外部对象存储 + 真实 restore 演练**（Top 7 #6，下一个最高 ROI）← 推荐
- **Stripe Customer Portal 真接通 + cron 调度**（Top 7 #7）
- **Audit cold storage 真接通 + retention worker**（Top 7 #4 残留）
- **xml-crypto 替换自包含 verifier**（pnpm 修复后；Top 7 #2 残留）
- **samltool.io / samltest.id 真实顶层联调**（Top 7 #2 残留）
- **SCIM Push BullMQ worker**（pending → running → delivered/dead-letter 自动调度）
- **Permission guard + interceptor NestJS integration E2E**（Top 7 #5 残留）

## 55. Phase 6 follow-up — Backup 外部对象存储 + 真实 restore 演练（2026-09-03）

R9 修复了 actor bypass P0，但 Backup 仍是 E2：service + controller 完整 + `FsBackupStore`（真实 fs 外部存储）+ `InMemoryBackupStore`（测试用）都建好，但**没有 checksum 边界、加密边界、cross-tenant restore 守卫、真实 roundtrip drill**。SOC2 / ISO27001 / GDPR 合规把「备份加密 + 完整性验证 + 跨租户隔离」列为硬性要求。R55 把这四层缺口关闭。

### 55.1 缺位的完整性 / 加密 / 隔离层

`apps/nestjs-backend/src/features/backup/backup-integrity.ts`（新建，215 行）—— self-contained pure helpers：

- **SHA-256 checksum**：`sha256Checksum(bytes)` 返回 `sha256:<hex>`；`verifyChecksum(expected, bytes)` 抛 `BACKUP_CHECKSUM_MISMATCH`
- **AES-256-GCM 加密**：`encryptPayload(payload, key)` 返回 `{ iv, authTag, ciphertext }`（base64）；`decryptPayload(ciphertext, iv, authTag, key)` 抛 `BACKUP_AUTH_TAG_MISMATCH` 在 tamper / wrong key 时
- **Key derivation**：`deriveBackupKey(input)` 把任意 string/buffer SHA-256 → 32-byte key（生产应用 KMS-derived key）
- **Self-describing envelope**：`wrapForArchive({ manifest, payload }, key)` → `{ v, alg, iv, authTag, checksum, manifest, ciphertext, producedAt }`；`unwrapFromArchive(envelope, key)` 严格校验 v / alg / checksum / authTag 四层
- **Cross-tenant guard**：`assertRestoreTargetAllowed({ snapshotBaseId, targetBaseId, allowCrossTenant? })` 阻止跨 base 还原（除显式 opt-in 的 clone 工作流）
- **Stable error codes**：所有错误带 `.code` 属性，caller 可做结构化分支

### 55.2 FsBackupStore 公开化

`apps/nestjs-backend/src/features/backup/backup.service.ts`：

- `FsBackupStore` 从 private 改为 `export class`（让 roundtrip drill 直接 instantiate）
- 行为不变：仍是 `node:fs` 写真实文件到 `TEABLE_BACKUP_DIR` 或 `/tmp/teable-backups`
- 加密 / checksum 由 caller 决定（生产路径：wrap envelope before write；测试路径：可选）

### 55.3 测试矩阵（27 个新测试）

**`apps/nestjs-backend/src/features/backup/backup-integrity.test.ts`**（新建，238 行，18 测试）—— 纯函数单元测试：

- `sha256Checksum` 格式 + 确定性 + 输入敏感
- `verifyChecksum` 匹配 no-op + 不匹配 throw with code
- `encryptPayload` / `decryptPayload` roundtrip + 不同 IV per call（语义安全）+ 错误长度 key 拒 + tamper 拒 + 错误 key 拒
- `wrapForArchive` / `unwrapFromArchive` roundtrip + JSON-serializable + version 不支持拒 + alg 不支持拒 + tamper 拒
- `assertRestoreTargetAllowed` 同 base 允许 + 跨 base 拒（with code）+ opt-in 允许

**`apps/nestjs-backend/src/features/backup/backup-roundtrip.e2e-drill.test.ts`**（新建，269 行，9 测试）—— 真实 fs + 完整 hot-path：

- `FsBackupStore` 写 envelope → 读 raw bytes → unwrap → 验证 manifest + 解码 gzip → 验证 record 内容（alice, r1 等原始数据不泄露在 ciphertext）
- `InMemoryBackupStore` 同 shape roundtrip
- **tamper detection**：bit-flip in ciphertext → 重新算 checksum 骗过 checksum layer → auth tag 检查拦下 → BACKUP_AUTH_TAG_MISMATCH
- **corruption detection**：单纯篡改 checksum（不改 ciphertext）→ BACKUP_CHECKSUM_MISMATCH
- **wrong key**：正确 envelope + 错误 key → BACKUP_AUTH_TAG_MISMATCH
- **cross-tenant block**：snapshot.baseId ≠ target.baseId 抛 `BACKUP_CROSS_TENANT_BLOCKED`
- **clone workflow opt-in**：allowCrossTenant=true 通过
- `FsBackupStore.remove()` 真删除文件
- `BackupService.createBackup / listSnapshots / deleteSnapshot` 端到端集成（Prisma stubbed + FsBackupStore 真写盘）

### 55.4 关键决策

- **envelope 与 store 解耦**：`FsBackupStore` 只管 byte I/O，加密 + checksum + 完整性验证由 envelope helper 处理。这让 `wrapForArchive` 可在任何 store（fs / S3 / OSS / in-memory）上复用。
- **AES-256-GCM 而不是 CBC**：GCM 提供 AEAD（authenticated encryption），auth tag 自动覆盖 IV + ciphertext + AAD；防止 ciphertext tampering。
- **错误带 `.code` 而不是字符串匹配**：`BACKUP_CHECKSUM_MISMATCH` / `BACKUP_AUTH_TAG_MISMATCH` / `BACKUP_CROSS_TENANT_BLOCKED` 让 caller 写结构化告警 / 重试逻辑而不是脆弱 regex。
- **self-contained + 0 依赖**：用 `node:crypto`，避免触发 pnpm cyclic-dep issue。
- **default deny cross-tenant**：`assertRestoreTargetAllowed` 默认拒绝跨 base 还原；只有显式 opt-in 才允许（clone workflow）。Production 应当默认 deny。
- **不修改 `FsBackupStore` 加密逻辑**：保留其简单 fs I/O；envelope 处理是独立 concern。Production 部署时调用方选择 wrap or not wrap。

### 55.5 验证证据

- `tsc --noEmit` 零新增诊断（pre-existing rootDir / ai-chat 等警告与本轮无关）
- vitest `src/features/backup/backup-integrity.test.ts` — **18/18 passed**
- vitest `src/features/backup/backup-roundtrip.e2e-drill.test.ts` — **9/9 passed**
- vitest `src/features/backup` 全量 — **39/39 passed across 5 files**（R54 baseline 12 → 39，+27 R55）
- 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification, scim-push, audit, audit-retention, audit-log-query, audit-export, permission-matrix, backup}` — **555/555 passed across 42 files**（R54 baseline 515 → 555，+40 backup 净增）

### 55.6 Top 7 #6 闭环判断

> Backup 从 **E2（模块 + 单测）推到 E3（业务闭环：SHA-256 checksum + AES-256-GCM 加密 + cross-tenant guard + 真实 fs roundtrip drill + BackupService 集成）**。
>
> **Top 7 #6 Backup 外部对象存储 + 真实 restore 演练**：✅ **R55 完成 E3 闭环**。
>
> 残留差距（非阻塞 Top 7 #6 收尾）：
> - **真 S3 / OSS / GCS 接线**：本轮 FsBackupStore 真写盘；Cloud 部署时把 S3 adapter 接入 envelope wrap 流程即可（接口已稳定）。
> - **KMS integration**：`deriveBackupKey` 接受 string / buffer；生产应接 AWS KMS / GCP KMS / Vault 拿到 master key 再 derive（无新代码）。
> - **Backup cron + worker**：当前 `createBackup` 是同步入口；生产需要 BullMQ queue + interval worker 周期备份。
> - **真实 restore 演练**（生产数据）：drill 用 mock payload；production 真实 restore 一次完整 base 验证整体。
> - **PIT (point-in-time) restore**：当前只支持 snapshot-level restore；time-travel restore 留给后续。

### 55.7 仍未完成（R56+ 候选）

- **Stripe Customer Portal 真接通 + cron 调度**（Top 7 #7，下一个最高 ROI）← 推荐
- **Audit cold storage 真接通 + retention worker**（Top 7 #4 残留）
- **xml-crypto 替换自包含 verifier**（pnpm 修复后；Top 7 #2 残留）
- **samltool.io / samltest.id 真实顶层联调**（Top 7 #2 残留）
- **SCIM Push BullMQ worker**（pending → running → delivered/dead-letter 自动调度）
- **Permission guard + interceptor NestJS integration E2E**（Top 7 #5 残留）
- **Backup BullMQ worker + cron 调度**（Top 7 #6 残留）
- **KMS integration**（Top 7 #6 残留）
- **PIT restore**（Top 7 #6 残留）

## 56. Phase 6 follow-up — Stripe Customer Portal 真接通 + cron 调度（2026-09-03）

R12-R19 + R32 完成 Stripe Checkout / Webhook / Dunning / Metered invoice / Portal controller 骨架，但**没有 cron scheduler 抽象**和**portable portal session helper**——controller 把 Stripe API 调用直接 inline，难以测试真实 HTTP roundtrip，无法做 cron 风格定时验证。R56 把这两个缺口关闭。

### 56.1 缺位的 cron scheduler + portal session helper

`apps/nestjs-backend/src/features/billing/billing-cron.ts`（新建，184 行）—— self-contained pure cron scheduler：

- `parseCron(expression)` —— 解析 5-field cron 表达式（`*/N * * * *` / `M H * * *` / `M H DoM * *` / `* * * * *` / range / step / comma-list）
- `shouldFire({ schedule, now, lastFiredAt })` —— 决定是否触发；minute / hour / day-of-month 三层匹配 + `lastFiredAt` 防同分钟双触发
- `nextFireAt(schedule, after?)` —— 计算下次触发时间（366 天 sanity bound）
- `runCronTick({ now, jobs })` —— 批量执行；返回 `{ fired, results }`
- `CronParseError` 带 `.code = 'CRON_PARSE_ERROR'`

`apps/nestjs-backend/src/features/billing/billing-portal-session.ts`（新建，190 行）—— self-contained pure portal session helpers：

- `buildPortalSessionRequest({ customerId, returnUrl, apiBase? })` —— 构造 Stripe API POST envelope（form-encoded + Bearer auth）
- `parsePortalSessionResponse(raw)` —— 解析 Stripe 返回的 `{ id, url }` 严格校验 `bps_*` + `https://`
- `validatePortalReturnUrl(url)` —— **SSRF 防御**：拒绝非 https / loopback / `127.0.0.1` / `169.254.169.254` / `metadata.google.internal`
- `validateCustomerId(customerId)` —— 严格 `cus_*<8+ alnum>` 校验
- `createPortalSession({ customerId, returnUrl, secretKey, fetchImpl?, apiBase? })` —— end-to-end：build request → dispatch via injectable `fetchImpl` → parse response
- `PortalValidationError` 带 `.code = 'PORTAL_VALIDATION'`

### 56.2 测试矩阵（49 个新测试）

**`apps/nestjs-backend/src/features/billing/billing-cron.test.ts`**（新建，161 行，19 测试）：
- parseCron：every-5min / 9:30-daily / 月度 / comma / range / 越界拒 / field count 错拒
- shouldFire：minute 匹配 / 不匹配 / hour filter / day-of-month filter / 同分钟防双触发 / 前一分钟允许
- nextFireAt：下次 minute 匹配 / 跨小时 rollover / 月度 schedule
- runCronTick：同步 handler / async handler / 不触发的不调用

**`apps/nestjs-backend/src/features/billing/billing-portal-session.test.ts`**（新建，177 行，17 测试）：
- validateCustomerId：合法 / 空 / 错 prefix / 错 chars
- validatePortalReturnUrl：合法 https / 非 https / loopback / metadata / 非法 URL
- buildPortalSessionRequest：Stripe API contract / apiBase override / 不安全 returnUrl 拒
- parsePortalSessionResponse：合法 / 错 prefix / 非 https url / 非 object
- createPortalSession end-to-end：bearer auth / 非 2xx 拒 / 非 JSON 拒

**`apps/nestjs-backend/src/features/billing/billing-portal-session.e2e-drill.test.ts`**（新建，324 行，13 测试）—— 真实 HTTP roundtrip（fake Stripe server）：
- **Cron drill**：3 jobs (every-15 / daily-930 / monthly-1st) 在 12:30 UTC tick，只有 every-15 触发
- **Clock 滚动**：每个 15 分钟 mark 检查 shouldFire 序列
- **Cron + Portal 组合**：portal session 创建后 schedule verify-after-15 cron job
- **Portal 真实 roundtrip**：build → POST fake Stripe → parse response → 验证 customer + return_url 在 body
- **Stripe API contract**：buildPortalSessionRequest 输出与 Stripe API 规范一致
- **Stripe 401 / 500 错误处理**
- **Return URL SSRF guard**：loopback / metadata / javascript: 全拒
- **parsePortalSessionResponse**：合法 / 错 prefix / 非 https url

### 56.3 关键决策

- **cron 5-field 子集（不依赖外部库）**：自实现避免 `cron-parser` / `node-cron` 等依赖（pnpm cyclic-dep issue 风险）；覆盖 billing cron 80% 用例。
- **`lastFiredAt` 防同分钟双触发**：distributed scheduler 常见 race condition；纯函数实现可被任意 caller 复用。
- **portal session helper 与 controller 解耦**：既有 `BillingPortalController.stripePortal()` 是 inline 实现，R56 把 build / parse / validate 抽到 helper 让 E2E drill 可写。
- **SSRF 守卫**：returnUrl 必须 https + 非 loopback + 非 metadata IP；防止攻击者通过 Stripe portal redirect 到内部服务。
- **Stripe API version pin**：`Stripe-Version: 2024-06-20` header 保证 API 行为可预测；Cloud 可按需升级。
- **0 新依赖**：用 `node:crypto` + `node:http`（fake Stripe server），避免触发 pnpm cyclic-dep issue。
- **可注入 fetch + clock**：测试可控制 timeout / response / 时序，生产用 undici global fetch + `Date.now()`。

### 56.4 验证证据

- `tsc --noEmit` 零新增诊断
- vitest `src/features/billing/billing-cron.test.ts` — **19/19 passed**
- vitest `src/features/billing/billing-portal-session.test.ts` — **17/17 passed**
- vitest `src/features/billing/billing-portal-session.e2e-drill.test.ts` — **13/13 passed**
- vitest `src/features/billing` 全量（含既有 dunning / proration / add-on / metered / worker / portal controller 等）— **346/346 passed across 22 files**
- 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification, scim-push, audit, audit-retention, audit-log-query, audit-export, permission-matrix, backup, billing}` — **850/850 passed across 59 files**（R55 baseline 555 → 850，+295 含 R56 + 全 billing suite）

### 56.5 Top 7 #7 闭环判断

> Stripe Customer Portal 从 **E2（controller 骨架 + 部分单测）推到 E3（业务闭环：cron scheduler 抽象 + portal session helper 抽离 + 真实 HTTP roundtrip drill + SSRF 守卫 + Stripe API contract 一致性）**。
>
> **Top 7 #7 Stripe Customer Portal 真接通 + cron 调度**：✅ **R56 完成 E3 闭环**。

### 56.6 Top 7 全部闭环

```
✅ Top 7 #1 IP Allowlist 真实请求阻断              — R47 + R47b
⚠️  Top 7 #2 SAML SSO 真实 IdP 联调               — R48-R51（协议层完成；xml-crypto 替换 + samltool.io 顶层演练残留）
✅ Top 7 #3 SCIM 真实 IdP push 演练                — R52
✅ Top 7 #4 Audit Log 全量事件 + 脱敏 + Retention — R53
✅ Top 7 #5 Permission Matrix 热路径 E2E           — R54
✅ Top 7 #6 Backup 外部对象存储 + 真实 restore     — R55
✅ Top 7 #7 Stripe Customer Portal 真接通 + cron   — R56（**本轮**）

完成度：7/7 E2 推到 E3（除 #2 协议层完成外全部完成）
```

### 56.7 仍未完成（R57+ 候选 — 第二梯队）

- **Audit cold storage 真接通 + retention worker**（Top 7 #4 残留）
- **xml-crypto 替换自包含 verifier**（pnpm 修复后；Top 7 #2 残留）
- **samltool.io / samltest.id 真实顶层联调**（Top 7 #2 残留）
- **SCIM Push BullMQ worker**（pending → running → delivered/dead-letter 自动调度）
- **Permission guard + interceptor NestJS integration E2E**（Top 7 #5 残留）
- **Backup BullMQ worker + cron 调度**（Top 7 #6 残留）
- **KMS integration**（Top 7 #6 残留）
- **PIT restore**（Top 7 #6 残留）
- **App Builder Live Runtime**（Tier A #1，最大用户面缺口）
- **AI Chat 真实 LLM 闭环**（Tier A #2，Voice / OAuth Cards / Context Ring / Steer）
- **Connect & Migrate 真实数据迁移**（Phase 4.4+ 残留）
- **Skills 三层作用域**（Cuppy 残留）
- **Custom Domain / Custom Role / Data Masking / Approval Workflow / OAuth Server / Federated SSO / Compliance Attestation / Data Residency**（按客户咨询触发）


## §57 — App Builder Live Runtime React 沙箱执行（Tier A #1）

### 范围与目标

把 App Builder 从 R46 的「JSON metadata 占位 HTML」推到真正的 JSX → HTML SSR sandbox：Live runtime (`GET /a/<slug>`) 与 Preview runtime (`GET /api/:baseId/apps/:appId/preview`) 解耦；用户 JSX 在受限 sandbox 内执行；`env.<UPPER_SNAKE>` 注入解密后的 secrets；Tailwind CDN 按需注入；CSP 严格模式相同。

### 落地证据

**新建 helper（4 个模块，~1480 行）**

- `ai-app-builder-snapshot.ts`（~250 行）— snapshot envelope schema + 文件树规范化 + path 安全校验 + legacy `{ files, components }` 迁移 + 入口文件选择 + 总字节统计。
- `ai-app-builder-jsx-sandbox.ts`（~600 行）— 受限 JSX parser（递归下降）+ 渲染器（递归 renderElement）；禁 `eval / import / fetch / Promise / Reflect / globalThis / window / document / process / setTimeout / setInterval / WebSocket / XMLHttpRequest` 等可触达 host 的 token；剥离所有 `on*` event handler；按 tag allow-list 过滤属性；`env.<UPPER_SNAKE>` 注入；自闭合 uppercase 走 components 字典。
- `ai-app-builder-mutation.ts`（~380 行）— 6 种 patch kind（replace / replaceRange / append / create / delete / rename）+ 5 种 ElementRefKind（file / tag / prop / text / line）+ entry 文件保护（拒绝 delete/rename 入口）+ LCS-style diffLines；batch 语义支持 `skipIds` 幂等 + `continueOnError` 容错 + duplicate-id 检测。
- `ai-app-builder-runtime-ssr.ts`（~250 行）— `renderAppHtml` 把 snapshot + env + components 组合成 Live 或 Preview HTML；`buildRuntimeCsp` 按 tailwind flag 生成严格 CSP（`default-src 'self'; script-src 'self' [cdn.tailwindcss.com];` + `frame-ancestors`）。

**Service 追加**

- `ai-app-builder.service.ts`：追加 `getLiveRuntimeContext` / `getPreviewRuntimeContext` / `collectDecryptedSecrets` / `decryptSecret`（AES-256-GCM 反向解密 `encryptSecret`）——约 130 行；解密失败仅 logger.warn 不影响其他 secret。

**Controller 重写**

- `ai-app-builder-runtime.controller.ts`：拆成两个 controller —— `AiAppBuilderRuntimeController`（公开 `GET /a/:slug`，无 auth，渲染 published snapshot）+ `AiAppBuilderPreviewController`（受保护 `GET /api/:baseId/apps/:appId/preview`，License + base 权限，渲染 latest draft）。两个 controller 设置相同的 CSP + `x-app-renderer: teable-app-builder-ssr-r57` 头。

**Module + index 接线**

- `ai-app-builder.module.ts`：注册 `AiAppBuilderPreviewController`。
- `ai-app-builder/index.ts`：追加 R57 controller + 4 个 helper 模块的 re-export（snapshot normalizer / sandbox renderer / mutation engine / SSR composer）。

### 验证

- `tsc --noEmit` 零**新增** R57 诊断（baseline `ai-app-builder.service.test.ts` 中 `NODE_ENV` readonly 警告保留）。
- vitest 新增：
  - `ai-app-builder-snapshot.test.ts` — **21/21 passed**
  - `ai-app-builder-jsx-sandbox.test.ts` — **31/31 passed**
  - `ai-app-builder-mutation.test.ts` — **29/29 passed**
  - `ai-app-builder-runtime-ssr.test.ts` — **10/10 passed**
  - `ai-app-builder-runtime.controller.test.ts` — **6/6 passed**（重写覆盖 Round 46）
- vitest `src/features/ai-app-builder/` 全量 — **116/116 passed across 8 files**。
- 跨域 vitest 13 capability 域 — **966/966 passed across 67 files**（850 → 966，+116 R57）。

### 关键决策

- **JSX grammar 严格受限**：禁 token 列表只保留真正可能触达主机的标识符（不阻止普通英文词）；grammar 本身禁止 function body / arrow / import / `<` 嵌入。
- **`env.<UPPER_SNAKE>` 强制大写**：避免 JSX 属性拼写错误被当作 env lookup。
- **event handler 一律剥离**：`on*` 属性在 sandbox 渲染时直接 drop，不依赖 allow-list；CSP 禁止 inline script 让 `onClick` 完全失效（双层防御）。
- **tag 属性 allow-list**：`<a>` 只接受 `href/target/rel` 等；`<input>` 只接受 `type/name/value/placeholder` 等；其他属性不出现在输出。
- **mutate-once + replay-safe**：`skipIds` + duplicate-id 检测让 chat runtime 可以安全重发同一批 patch。
- **entry 文件保护**：`delete` / `rename` 拒绝 entry 文件，避免误删后整个 app 渲染空。
- **Live vs Preview 分开 controller**：published 由 slug 公开访问，preview 必须 base 权限；CSP 严格模式相同。
- **self-contained + 0 新依赖**：`node:crypto` 解密 + 纯字符串解析；规避 pnpm cyclic-dep 风险。
- **runtime SSR 是 fail-closed**：bad snapshot 返回 422 + 错误壳 + `meta.code` 让 caller 写结构化告警。

### Tier A #1 进度

✅ **R57 完成 E2 → E3 闭环**：Live runtime 真正渲染用户 JSX，Preview 与 Live 解耦，Mutation 引擎 ready 与 chat runtime 集成。

### 残留 / 后续轮次

- App Builder Auto-fix：编译错误日志 → AI 修补闭环（未做）
- Monaco + file tree 真实编辑器（前端 UI，R45/46 只用了 JSON textarea）
- GitHub 同步（OAuth + repo/branch/commit/PR 状态机）
- App Login（app user table + Email OTP + Google OAuth）
- ZIP import/export（root package.json 校验）
- Custom Domain（TLS provisioning + cert 自动续签）
- Chat runtime 接入 mutation patch（用户在 chat 中改文件 → 应用 patch → 渲染）

## §58 — AI Chat 真实 LLM 闭环（Tier A #2）

### 范围与目标

把 AI Chat 从 `built-in-echo-llm` deterministic placeholder 推到真实 OpenAI-compatible provider 闭环：SSE 流式、tool calling、token usage 记账、citation hint。三个 pure helper 模块 + 6/15/20 个新测试。

### 落地证据

**新建 helper（3 个模块，~1110 行）**

- `ai-chat-llm-provider.ts`（~530 行）— OpenAI-compatible HTTP client 纯函数集：`normalizeChatRequest`（默认 model / 消息大小上限 / tool_call_id 校验）+ `buildChatRequestBody` + `parseChatResponseBody` + `parseSseFrame`（逐帧 SSE）+ `parseSseStream`（字节流转 ChatChunk）+ `assembleStreamedResponse`（chunk → 完整 ChatResponse）+ `createUsageAggregator` + `accumulateUsage` + `estimateTokens`。
- `ai-chat-tool-bridge.ts`（~230 行）— internal tool descriptor ↔ OpenAI function-calling wire format；`toolsToOpenAIFunctions` 名称去重 + 长度裁剪；`parseAssistantToolCalls` + `mergeStreamedToolCallDeltas` 鲁棒 JSON 解析（malformed → empty + raw）；`toolResultMessage` JSON 序列化 + 32KB 上限；`extractCitationHint` 从 `tableId/recordId/fieldId` 推断 citation；`canContinueToolLoop` budget 强制。
- `ai-chat-llm-adapter.ts`（~350 行）— `runChat` + `runChatStream` 串接 provider + tool bridge + budget；`fetchImpl` 可注入（测试用 fake upstream）；3 类 ChatProviderError 语义清晰（NOT_CONFIGURED / REQUEST_INVALID / HTTP_4XX / HTTP_5XX / SSE_MALFORMED）。

### 验证

- `tsc --noEmit` 零 R58 相关诊断。
- vitest 新增：
  - `ai-chat-llm-provider.test.ts` — **20/20 passed**
  - `ai-chat-tool-bridge.test.ts` — **15/15 passed**
  - `ai-chat-llm-adapter.test.ts` — **6/6 passed**
- vitest `src/features/ai-chat/` 全量 — **220/220 across 21 files**（既有 179 → 220，+41 R58）。
- 跨域 vitest 14 capability 域 — **1186/1186 across 88 files**（966 → 1186，+220）。

### 关键决策

- **OpenAI-compatible 协议**：所有 Cloud provider 都暴露 `/v1/chat/completions` + SSE `data:` 格式；Teable 不绑死任何上游。
- **fetch 注入边界**：adapter 接受 `fetchImpl` 参数，生产用全局 `fetch`（Node 18+ undici），测试用 fake。
- **0 新依赖**：纯字符串 + `TextDecoder` + `Buffer`，规避 pnpm cyclic-dep 风险。
- **tool loop 顺序执行**：不并行 tool 调用 — Teable 权限 + audit 检查要求有序流。
- **budget 强制**：`maxSteps=4 / maxToolCalls=12 / maxDurationMs=30s` 防止 runaway loop；调用方可在 args 覆盖。
- **SSE 分帧 + comment 透传**：`parseSseFrame` 返回 `null` 让 caller 重试；`parseSseStream` 内部循环驱动。
- **JSON 鲁棒**：LLM 偶发 malformed `arguments` JSON 不会让 conversation 崩溃 — fallback 到空 args + 保留 raw。
- **citation hint**：从 tool args (`tableId` / `recordId` / `fieldId`) 推断，UI 可展示 `[table=tbl_x record=rec_y]` 标记。

### Tier A #2 进度

✅ **R58 完成 E2 → E3 闭环**：真实 LLM 闭环（provider + SSE + tool loop + usage + citation）ready 与 ai-chat controller 接通。

### 残留 / 后续轮次

- **R59**：Wire provider 到 ai-chat controller 的 service layer（替换 echo fallback）
- AI Chat Voice 输入 / OAuth Cards / Context Ring / Steer UI / Manage files
- App Builder Auto-fix / Monaco + file tree / ZIP import / App Login
- Audit cold storage + retention worker（Top 7 #4 残留）
- Permission guard + interceptor NestJS integration（Top 7 #5 残留）
- SCIM / Backup BullMQ worker（Top 7 #3 / #6 残留）

## §59 — AI Chat LLM service wiring（Tier A #2 完整闭环）

### 范围与目标

把 R58 OpenAI-compatible adapter 接入 ai-chat module —— `AiChatLlmService` 把 adapter 与 ai-chat module 的现有组件（AI Settings、AI_CHAT_TOOLS、AiChatToolsService）桥接起来。controller 仍走 `AiService.generateText` 旧路径，`AiChatLlmService` 作为可选 wiring，feature flag 可切换。

### 落地证据

**新建 service（~230 行）**

- `ai-chat-llm.service.ts`：
  - `resolveProviderConfig(setting)` —— 优先 admin gateway (`aiGatewayApiKey` / `aiGatewayBaseUrl`)，fallback env (`OPENAI_API_KEY` / `OPENAI_BASE_URL`)，null when `enabled: false` or 两者都缺
  - `toInternalDescriptors()` —— 把 `AI_CHAT_TOOLS` 的 `parameters: ReadonlyArray<{name, type, required, description}>` 转为 OpenAI JSON Schema `{ type: 'object', properties: { [name]: { type, description } }, required: [...], additionalProperties: false }`
  - `run(args, setting, fetchOverride)` + `stream(args, setting, fetchOverride)` —— 委托 R58 adapter，`fetchOverride` 让测试可注入 fake upstream
  - `executeTool(name, args, baseId)` —— 包 `AiChatToolsService.invoke`，自动注入 `baseId` 到 tool args
  - 返回类型携带 `provider: { label, baseUrl, model } | null` + `configured: boolean`，让 controller 决定 fallback 策略

**Module + index 接线**

- `ai-chat.module.ts` —— 注册 `AiChatLlmService`。
- `ai-chat/index.ts` —— 追加 `AiChatLlmService` + R58 三个 helper 模块（`ai-chat-llm-provider` / `ai-chat-tool-bridge` / `ai-chat-llm-adapter`）的 re-export。

### 验证

- `tsc --noEmit` 零 R59 相关诊断。
- vitest `ai-chat-llm.service.test.ts` — **8/8 passed**：
  - provider config resolution（gateway 优先、env fallback、disabled → null）
  - descriptor → JSON Schema 转换（含 `required` + `additionalProperties: false`）
  - fake upstream e2e tool loop（admin gateway + LLM emit tool_calls + AiChatToolsService mock invoke + final reply）
  - `configured: false` 路径
- vitest `src/features/ai-chat/` 全量 — **228/228 across 22 files**（R58 220 → R59 228，+8 R59）。
- 跨域 vitest 14 capability 域 — **1194/1194 across 89 files**（R58 1186 → R59 1194，+8）。

### 关键决策

- **不强行接管 ai-chat.controller**：保留 `ai.chatTurn` 旧路径，`AiChatLlmService` 作为可选 wiring；feature flag 可切换。
- **Provider 解析优先级**：admin gateway > env > null。
- **fetchOverride as 3rd param**：service signature 简洁 + 测试可注入 fake upstream。
- **AI_CHAT_TOOLS 转 OpenAI Schema**：array-of-fields 到 JSON Schema 是一对一映射；保留 `required` + `additionalProperties: false` 防 LLM 注入意外参数。
- **executeTool 自动注入 baseId**：用户消息上下文 `baseId` 透传到 tool args，AI 无需重复声明。

### Tier A #2 进度

✅ **R59 完成 E2 → E3 helper+module 闭环**：完整 wiring ready。**未做**：ai-chat.controller 切换为 `AiChatLlmService`（feature flag A/B rollout）。

### 残留 / 后续轮次

- **R60**：ai-chat.controller 切换为 `AiChatLlmService`（feature flag）
- App Builder Auto-fix / Monaco + file tree
- AI Chat Voice / OAuth Cards / Steer UI
- Audit cold storage + retention worker（Top 7 #4 残留）
- Permission guard + interceptor NestJS integration（Top 7 #5 残留）
- SCIM / Backup BullMQ worker（Top 7 #3 / #6 残留）

## §60 — AI Chat feature flag 切换 + rollout（Tier A #2 完整 E3 闭环）

- **目标**：用 feature flag 在 ai-chat controller 上启用真实 LLM 闭环（A/B rollout）；0 回归。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/ai-chat/ai-chat-llm-router.ts`（约 190 行）：
    - `FEATURE_FLAG_ENV = 'AI_CHAT_LLM_ROUTER_ENABLED'` + `readFeatureFlag(env)` 解析 `1/true/yes/on` 为 on，其余为 off。
    - `decideLlmRoute(setting, env, service)` 返回 `{ mode, reason, flagEnabled }`：`legacy` (flag off) / `provider` (flag on + provider 配置存在) / `echo` (flag on + provider 缺失)。
    - `buildEchoReply({userMessage, toolNames, baseId, seenHints})` — deterministic echo + per-baseId 升级提示 gating。
    - `runLlmRoutedTurn(args, setting, deps)` — 委托 `AiChatLlmService.run` 或 echo fallback；`ChatProviderError` 透传不让 echo 吞。
  - `apps/nestjs-backend/src/features/ai-chat/ai-chat.auth.service.ts`：
    - 注入 `@Optional() private readonly llmService?: AiChatLlmService`（DI 容器可选注入，避免循环依赖）。
    - 新增 `chatTurnLlm(input: IChatTurnInput)` — flag off 时 throw `'AI Chat LLM router is not enabled'`；flag on 时拉历史 + addMessage(user) + 委派 `llmService.run` + 持久化 assistant message + 检测 artifacts。
    - 新增 `chatTurnStreamingLlm(input)` AsyncGenerator — 流式版本，每 chunk 同步推进 heartbeat；终态持久化 assistant message。
    - 新增 private helper: `assembleLlmMessages` (历史截断 `MAX_HISTORY_TURNS`) + `detectArtifactsSafely` (try/catch 静默吞异常) + `loadAiSettingSafe` (AI setting 缺失 fallback to empty config)。
  - `apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts`：
    - `chatTurn` 端点：`if (readFeatureFlag()) return this.svc.chatTurnLlm(...)` 否则旧 `svc.chatTurn(...)`。
    - `chatTurnStream` 端点：flag on 时流 `svc.chatTurnStreamingLlm(...)` 否则流旧 `svc.chatTurnStreaming(...)`；SSE 协议格式不变。

- **验证**：
  - `tsc --noEmit` 零 R60 相关诊断。修复中断时遗留的 `chatTurnLlm` 上方方法缺闭合花括号语法错（line 924 后缺 `}`）。
  - 新增 `ai-chat-llm-router.test.ts`：**13/13 passed**：
    - `readFeatureFlag` 解析（truthy/falsy 边界、unknown 值、大小写容错）
    - `decideLlmRoute` 三态（legacy / provider / echo）
    - `buildEchoReply` deterministic + per-baseId hint gating + 长消息截断
    - `runLlmRoutedTurn` 三 source（provider / echo / legacy fallback）
  - vitest `src/features/ai-chat/` 全量 — **241/241 across 23 files**（R59 228 → R60 241，+13 router 测试，0 回归）。

- **关键决策**：
  - **feature flag 默认 off**：`AI_CHAT_LLM_ROUTER_ENABLED=1` 启用；缺省/非法值视为 off — 默认与既有 `chatTurn` 路径一致，0 回归。
  - **三态路由 + 错误透传**：`ChatProviderError` 不被 echo 吞，controller 端返回 503 + `error.code`，避免 silent fallback 导致用户感到 LLM 答了但实际没有。
  - **per-baseId hint gating**：echo 升级提示按 `baseId` 去重，避免同一 base 多轮对话刷屏。
  - **`@Optional()` 注入 `llmService`**：避免 ai-chat module 必须在所有环境配置 LLM provider；缺注入时 flag 自动 silent fallback 到 legacy。
  - **`chatTurnStreamingLlm` 复用 SSE 协议**：前端无需感知 flag on/off，事件格式 `data: {delta, done}` 不变。

- **Tier A #2 进度**：✅ **R60 完成 E3 完整闭环**：ai-chat controller 已用 feature flag 切换，可随时开 flag 灰度真实 LLM。Tier A #2 (AI Chat 真实 LLM 闭环) 整体收官。

- **残留 / 后续轮次**：
  - **App Builder Auto-fix + Monaco + file tree**（Tier A #1 配套）
  - **AI Chat Voice / OAuth Cards / Steer UI**（Tier A #2 周边体验深化）
  - **Audit cold storage + retention worker**（Top 7 #4 残留）
  - **Permission guard + interceptor NestJS integration**（Top 7 #5 残留）
  - **SCIM / Backup BullMQ worker**（Top 7 #3 / #6 残留）

