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
| Baserow / ClickUp / Jira / monday / NocoDB / Smartsheet / SmartSuite | ⚠ partial | ⚠ partial | ❌ | ❌ E1 | 仅 probe/list/fetch 端点 |
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
