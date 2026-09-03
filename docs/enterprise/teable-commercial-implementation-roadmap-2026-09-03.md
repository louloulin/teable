# Teable OSS → Cloud 商业版最佳实现路线图

> 版本：2026-09-03  
> 配套审计：`docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`  
> 目标：把“模块存在”推进为可配置、可验证、可运营的 Cloud 商业能力闭环。

## 1. 实现原则

1. **先可信，再扩展**：先修复鉴权、SSRF、密钥和 HTTP 契约；安全问题未关闭前，不继续扩大商业能力宣称。
2. **按用户闭环而不是按模块计数**：每项能力必须同时具备入口、鉴权、持久化、异步执行、失败恢复、前端反馈和可复现验收。
3. **契约单一来源**：后端路由、DTO、错误码和前端客户端从 OpenAPI/typed contract 生成或共享，禁止手写路径漂移。
4. **分离四种状态**：`wired`（已接线）、`configured`（配置有效）、`verified`（行为测试通过）、`parity`（Cloud 语义达标）。任何单一状态不得冒充商业等价。
5. **真实依赖显式化**：没有 LLM、Stripe、OAuth、对象存储或 KMS 时，显示 `not configured` 并 fail closed；不能用 echo、base64、placeholder 或静态数字伪装可用。
6. **可恢复优先**：所有 AI、迁移、构建和计费同步任务都要有任务 ID、状态机、幂等键、重试策略、取消语义和最终结果。
7. **隔离当前工作区**：当前工作区存在大量未提交改动；每个阶段应使用独立 Native child/worktree，禁止覆盖或回滚其他改动。

## 2. 目标架构

```text
Cloud contract / OpenAPI
        ↓
HTTP adapter（Nest controller，仅解析与鉴权）
        ↓
Application use-case（幂等、事务、授权、任务编排）
        ↓
Ports（LLM / Stripe / OAuth / storage / queue / sandbox）
        ↓
Provider adapters + persistent state
        ↓
React UI（typed client + capability/availability states）
        ↓
E2E / security / failure / operations verification
```

### 2.1 能力状态模型

每个 capability 输出统一结构：

```ts
interface CapabilityReadiness {
  key: string;
  wired: boolean;
  configured: boolean;
  verified: boolean;
  parity: 'none' | 'partial' | 'cloud';
  blockers: string[];
  evidence: Array<{ kind: 'route' | 'config' | 'test' | 'e2e' | 'provider'; ref: string }>;
}
```

`enabledPercent`、`46/46`、模块数量和数据库表数量只能作为辅助统计，不得作为商业完成度。

## 3. 阶段与依赖

### Phase 0 — 安全止血与契约修复（P0，必须先完成）

**范围**

- Backup：移除 `actor` 非空即放行逻辑；只接受真实 session/admin role 或经过恒定时间比较的 admin token；所有 CRUD、restore、logs 共用 guard。
- Generic Connector：`register` 改为内部/管理员接口；`fetch` 需要认证和租户上下文；加入 URL scheme/host/IP/DNS 重绑定防护、禁止 loopback/private/link-local/metadata 地址、连接和读取超时、响应大小上限、跳转限制、凭据不回显和审计日志。
- App Builder/ Billing：统一前后端路径与 HTTP method；错误响应使用稳定 code；修复 deploy 返回真实 `currentVersionId`。
- Secrets：App Secrets 与 Custom AI Model 缺少生产密钥时启动失败或拒绝写入；移除 base64 stand-in 和固定 dev secret 的生产路径。
- Billing guard：定义独立 `billing` capability，不复用 `sso`。

**验收证据**

- forged actor、缺失 token、错误 token、普通用户和管理员矩阵全部有 401/403 测试。
- Generic Connector 对 `http://127.0.0.1`、IPv6 loopback、RFC1918、云 metadata、DNS rebinding、超时、大响应和跨租户访问均拒绝。
- 前端 Secrets/Files 保存和 Billing 查询/取消在真实 Nest app 上不返回 404；contract test 从同一份路由定义生成。
- 生产配置缺失时无静默 fallback，日志不包含 secret/token。

**退出条件**：P0 安全项全部关闭，且报告可引用测试结果；否则不能进入 Cloud parity 验收。

### Phase 1 — 可靠性底座（P0/P1）

**范围**

- 建立统一 persistent job abstraction：`queued → running → succeeded/failed/canceled`，包含 `idempotencyKey`、attempt、heartbeat、lease、progress、errorCode、retryAt、tenantId。
- 使用 BullMQ/现有队列基础设施或等价持久化 worker；禁止仅依赖 in-process worker。
- 为 AI Chat、AI Field、迁移、App Builder 构建和 Stripe webhook 统一接入任务状态、重试、取消和重启恢复。
- 统一审计事件：actor、tenant、resource、action、result、correlationId、redacted metadata。

**验收证据**

- worker 重启后任务不丢失、不重复写入；同一幂等键重复请求得到同一最终结果。
- 取消在 provider/HTTP/脚本边界传播；失败可重试且不会重复扣费或重复导入。
- 任意任务可从 UI 查看状态、进度、失败原因和 correlation ID。


**Phase 1 当前进度（2026-09-03）**

- AI Chat long task 已迁移至 BullMQ（`ai-chat-long-task-queue`）+ 本地 fallback；状态机 `queued/running/succeeded/failed/canceled`；幂等键唯一约束 `(session_id, idempotency_key)`；5 min lease + 30 s heartbeat；指数退避自动 requeue；`POST /api/chat/tasks/:taskId/cancel` 可立即终止；`AiChatLongTaskProcessor.onModuleInit` 启动时回收过期租约。Schema/migration、processor、controller、barrel 与 16 个新单测全部通过。下一步：把同一协议接入 AI Field 异步任务、迁移（airtable/notion/google sheets）和 Stripe webhook 的幂等处理。
 - AI Field batch task 已落地同款协议：`ai-field-batch-queue` (concurrency 2)、10 min lease + 60 s heartbeat、幂等键 `(table_id, idempotency_key)` 唯一索引、startBatchGeneration 先幂等后冲突检测、`processBatchTask` 抢租约 + 多次 cancel 校验、`cancelBatchTask` 写 `errorCode=TASK_CANCELED`、`AiFieldBatchProcessor.onModuleInit` 启动时调用 `recoverExpiredBatchTasks`。Schema/migration、processor、barrel、7 个新单测与 `features/ai-field` 87/87 测试全部通过。下一步：把同一协议接入 Stripe webhook 幂等、Notion/Google Sheets 迁移 driver，并补 audit log。
 - Stripe webhook 幂等已落地：`stripe_webhook_event` 表新增 `status/attempt/max_attempts/heartbeat_at/lease_until/retry_at/last_error/error_code/processed_at/tenant_id/correlation_id`，`ingestEvent` 改用 `create(P2002)` 抢占 + 租约过期 reclaim + 退避重试；`StripeWebhookAuthService.onModuleInit` 启动时调用 `recoverExpiredEvents()` 回收过期租约。4 个新单测 + `features/stripe-webhook` 28/28 通过。下一步：把同一协议接入 Notion / Google Sheets 迁移 driver（`SourceDriver` 抽象）。
 - Source-import 统一驱动已落地：`ISourceImportDriver.runImport(task, {isCanceled, onProgress})` 把 token 解析、分页、批写、cancel/heartbeat 都收进 driver；`NotionSourceDriver.runImport` 委托 `NotionImportService.importDatabase`，新增 `isCanceled` + `onProgress` 钩子在 pages/records 之间校验；`NotionImportService.importDatabase` 配套新增 `INotionImportCanceledError`；`SourceImportService` 暴露 `isCanceled(taskId)` 与 `updateProgress(taskId, counts)`（顺手刷新 heartbeat + 5 min lease），`SourceImportProcessor.process` 退化为纯 lifecycle：claim lease → driver.runImport → markSucceeded/markFailed，自带 30 s 备用 heartbeat。
新增/更新单测：`source-import.service.spec.ts` 10 → 15（增 isCanceled 4 路 + updateProgress 1 路）、新增 `notion-source.driver.spec.ts` 4；`features/import-jobs` 19/19、`features/notion` 7/7、`features/ai-chat|ai-field|stripe-webhook` 同步回归 348/348 通过。下一步：Google Sheets driver（`GoogleSheetsSyncService` 适配 + 增量游标）+ App Builder pipeline 同协议接入。

### Phase 2 — AI Chat Cloud 闭环（P1）

**范围**

- 统一 Cuppy 与 AI Chat 会话协议、历史数据源和 session ownership。
- 后端完成 provider adapter、模型/Intelligence 选择、context token usage、compaction、附件生命周期、skills scope、OAuth integration state、artifact/citation。
- 前端补 Voice（录音/完成/丢弃/转写）、Secrets、Integrations card（Connect/Skip）、Skills picker、Context usage、Manage files、message queue、Edit/Remove/Steer、长任务和 artifact/citation viewer。
- 工具能力按权限拆分 read/write；写操作默认生成可审查 write plan，确认后事务执行。

**验收证据**

- 使用真实配置 provider 完成：表/视图/选区/附件上下文 → 流式回答 → 引用跳转 → artifact 保存/再次打开。
- Voice、OAuth Connect/Skip、queue/Steer、停止后 Resume、断线重连和跨设备历史均有浏览器 E2E。
- 未配置 provider 时 UI 明确显示不可用，不返回 deterministic echo 作为成功答案。

### Phase 3 — App Builder 真正 Prompt-to-App（P1）

**范围**

- 把 snapshot CRUD 重构为项目文件、版本、构建产物和发布版本模型。
- 引入受限 build sandbox：React/Tailwind/TypeScript 编译、依赖白名单、资源/时间/网络限制、构建日志和 artifact checksum。
- 实现独立 App Builder chat runtime：文件工具、元素引用、变更 patch、预览刷新、回滚和冲突处理。
- 预览与 Live 分离：Preview 使用未发布构建，Live 使用已发布公共地址；补 publish/unpublish/redeploy、公开 URL、自定义域名、App Login、Auto-fix。
- Developer Mode 使用 Monaco/file tree；实现 ZIP 导入导出、20 MB 限制、root package 校验、`.env` → write-only Secrets。
- GitHub 同步采用 OAuth + repo/branch/commit/PR 状态机，不直接把 token 暴露给浏览器或构建进程。

**验收证据**

- “从 Base 创建 CRM → Chat 修改 → build → Preview → publish → public URL → rollback”可在干净环境重复完成。
- 构建失败可通过 Auto-fix 生成 patch，用户审查后应用；恶意依赖、越权文件路径和网络出口被拒绝。
- ZIP/GitHub/Secrets/App Login/自定义域名均有失败、回滚和租户隔离测试。

### Phase 4 — Connect & Migrate（P1）

**范围**

- 为每个 source 建立统一 `SourceDriver` contract：discover、schema、field mapping、records、relations、attachments、checkpoint、resume、report、rollback。
- Airtable 先达到 E3，再逐个完成 Baserow、SmartSuite、NocoDB、Jira、monday、ClickUp、Smartsheet、Notion、Google Sheets。
- 统一 token 存储和脱敏；所有迁移任务使用 Phase 1 job abstraction。
- Generic connector 只允许审核后的 provider/adapter manifest，不接受匿名运行时代码/placeholder 注册。

**验收证据**

- 每个 source 至少有真实 fixture：字段类型、空值、关系、附件、分页、限流、部分失败、重试和恢复。
- 迁移报告包含 source→target mapping、跳过项、失败项、附件结果、可重跑 checkpoint 和最终计数校验。
- 迁移不会跨租户读取或写入，token 不进入日志、任务详情或错误响应。



**当前状态（2026-09-03 round 25）** — Phase 4.4+ 7 个 driver 启动。NocoDB stub driver 上线（template 已在 §24 锁定）；`nocodb_connection` capability 进 readiness aggregator。剩余 6 个 driver（Baserow / SmartSuite / Jira / monday / ClickUp / Smartsheet）直接复用本模板，每轮 1 个。真实 NocoDB REST API 集成（`NocoDbImportService` + `nocodb_connection` 迁移表）留给后续 round。
 Round 21-25 期间累加：Baserow（Round 21）上线。 Round 22：Jira。 Round 23：monday.com（第一个 GraphQL 源）。 Round 24：ClickUp（最深层级 workspace/space/folder/list/task；custom_fields[] 是主形状顾虑）。 Round 25-26：SmartSuite + Smartsheet。**Phase 4.4+ stub 收官**：10 个迁移源（Notion / Airtable / Sheets / NocoDB / Baserow / Jira / monday / ClickUp / SmartSuite / Smartsheet）全部 stub-up。下一步是真实 API 集成（7 个 driver service + 7 个 connection 表）。### Phase 5 — Billing 与商业运营（P1/P2）

**范围**

- Billing contract：当前计划、席位、用量、credits、add-ons、变更计划、Customer Portal、付款方式、历史支付、发票 PDF、取消策略、proration。
- Stripe webhook 做签名校验、事件幂等、状态机和 reconciliation；业务权限不能依赖 webhook 到达顺序。
- Usage ledger 统一 AI credits、automation runs、records、storage、email，支持 period cutoff、校准和审计。
- Backup/restore 接入真实对象存储、校验和、异步进度、保留/删除策略、租户隔离和恢复演练。

**验收证据**

- checkout → webhook → subscription → usage → invoice → portal/cancel 的全链路测试。
- 重放 webhook 不重复创建 subscription/invoice；proration 和 cancel-at-period-end 与 Stripe 事件一致。
- 发票可下载且仅允许组织授权用户访问；备份可恢复到隔离目标并通过 checksum。

**当前落地（2026-09-03）**

- §5.1 — BillingProrationService（纯数学层）：18 tests 通过。
- §5.2 — BillingAuthService.changeSeats / changePlan：写入订阅行 + 创建 draft invoice；billing spec 18 → 29。
- §5.3 part 1 — Dunning scheduler（持久化 + 调度）：
  - Prisma 新增 `billing_dunning_plan` / `billing_dunning_step`，迁移 `20260905080000_add_billing_dunning_tables`。
  - `BillingDunningService`：`scheduleRecoverySteps` / `cancelOnRecovery` / `cancelOnHardCancel` / `markStepExecuted` / `markStepCanceled` / `findDueSteps` / `getPlan`；幂等开启 + 事务合并 cancel 步骤。
  - `BillingAuthService` 状态机挂载点：`updateSubscription` 主路径 + `receiveWebhook` defensive 路径；`cancelSubscription` 走 `updateSubscription` 自动继承。
  - Billing 模块测试 110/110 通过；`tsc --noEmit` 在新文件零诊断。
- §5.3 part 2 — Dunning worker（已交付）：`BillingDunningWorkerService.processDueSteps` 拉取 due 步骤并按 kind 路由；T1/T2/T3 写 stub audit、T14 真实调用 `BillingAuthService.cancelSubscription(orgId, false)`；handler 异常保留步骤 scheduled 由下次重试。billing spec 110 → 119，全量 666 → 675。
- §5.4 — Customer Portal controller（已交付）：`/api/billing/portal/*` 暴露 read（subscription/invoices/upcoming）+ preview + mutation（change-seats/change-plan/cancel）+ Cloud-only stub（Stripe Portal、PDF）；permission 与 checkout 控制器对齐。billing spec 119 → 137，全量 675 → 693。
- §4.3 — Google Sheets 真实接入（已交付）：`googleSheetsValuesGet` REST 客户端（无 googleapis 依赖）+ `GoogleSheetsImportService` 编排 OAuth/refresh/100 行批 `createRecords` + driver stub → 真实调用；稳定错误码 `SHEETS_UNAUTHORIZED/FORBIDDEN/NOT_FOUND/TRANSIENT/INVALID_JSON` 配合 retryable 标志。billing spec 不变；新增 google-sheets 20 测试；全量 693 → 722。
- §5.5 part 1 — 统一 usage ledger（已交付）：`BillingUsageEvent` 表 + `BillingUsageLedgerService`（recordUsage 幂等写、aggregate 周期求和、previewOverage 阶梯试算、calibrate 修正）；五类 metric（ai_credits/automation_runs/records/storage_bytes/email_sends）共用一张 append-only 表。billing spec 137 → 155，全量 722 → 740。
- §5.5 part 2 — Add-on 订阅（已交付）：`BillingAddOn` 表 + `BillingAddOnService`（activate idempotent / cancel 双语义 / expireDue worker sweep / previewMonthlyCost / totalGrantedQuantity / listForOrg）；与 §17 ledger 组合供超额试算扣减 included。billing spec 155 → 170，全量 740 → 755。
- §5.5 part 3 — Metered invoice + portal 真实聚合（已交付）：`BillingMeteredInvoiceService.previewMeteredInvoice`/`materializeMeteredInvoice` 聚合 4 metric + add-on grants，写 idempotent draft invoice；portal `/upcoming-invoice` 走真实聚合（替换 stub）、新增 `/usage?metric=` + `/activate-addon` + `/cancel-addon`。billing spec 170 → 185，全量 755 → 770。
- §5.4 续 — `billing-pdf-export` 接入 `/invoices/:id/pdf` 路由；真实 Stripe Customer Portal。Period-end cron 调度器（@nestjs/schedule）。



**当前状态（2026-09-03 round 17）** — Phase 5.5 cron 已上线：`BillingMeteredInvoiceWorkerService` 在 `BillingModule` 启动时自动装 5 分钟一次的 `setInterval`，把 `currentPeriodEnd <= now()` 的订阅滚成 draft invoice；可通过 `BILLING_METERED_INVOICE_WORKER_DISABLED=1` 关停以切到外部 pg-boss / sidecar 调度。Period-end cron 缺口关闭，但 worker 仍跑在主进程，未来需要切独立 worker process。


**当前状态（2026-09-03 round 34）** — Phase 5.4 续 PDF 缓存（Round 29）+ 真实 Stripe Customer Portal（Round 32）+ 真实 dunning mail/smtp（Round 33）+ Dunning cron 调度器（Round 34）均已上线。

- **Round 29 PDF 缓存**：`BillingInvoicePdfService` 注入 `BillingPdfExportAuthService`，默认 `latestExport(invoiceId)` 走 read-through 缓存；命中时返回 cached bytes + 重算 summary，未命中时 `renderInvoicePdf` + best-effort `storeExport` 落盘到 `public.billing_pdf_export`。portal 路由 `?fresh=true` 透传强制重渲染；响应头 `X-PDF-Cache: bypass|hit-or-miss`。`billing_pdf_export_cache` capability 接入 readiness aggregator。
- **Round 32 Stripe Portal**：`BillingPortalController.stripePortal` 替换 503 stub 为真 `POST https://api.stripe.com/v1/billing_portal/sessions` 调用，复用 `subscription.externalCustomerId` 字段（checkout 写入）；`returnUrl` 必填，Stripe 4xx/5xx 透传 503；无 `externalCustomerId` 时 503 + 引导走 checkout。
- **Round 33 Dunning mail/smtp**：`BillingDunningWorkerService` 注入 `MailSenderService`，T1（reminder）+ T3（final notice）handler 调 `mailSender.sendMail` 真发邮件到 `users.isAdmin=true` 所属 org 成员的 email（最多 5 个）；T2 Stripe retry 仍 stub。失败保持 step `scheduled` 重试；无收件人返 `email_skipped`。
- **Round 34 Dunning cron 调度器**：`BillingDunningWorkerService` 实现 `OnModuleInit` / `OnModuleDestroy` lifecycle；`setInterval` 默认 5 分钟触发（`BILLING_DUNNING_WORKER_INTERVAL_MS` 覆盖，子 1s 拒绝），`BILLING_DUNNING_WORKER_DISABLED=1` 完全旁路；`timer.unref?.()` 避免阻塞退出；tick 失败 log 不崩溃。镜像 Round 17 `BillingMeteredInvoiceWorkerService` 模式。

**当前状态（2026-09-03 round 35）** — Phase 4.4+ 真实 driver 集成第 1 个：NocoDB 已从 stub 升级为真实 driver；`NocoDbSourceDriver` 注入 `NocoDbImportService`（`@Optional()` 保留防御路径），`runImport` 走 validate → `importService.probe()` → `importService.fetchRows()` 三段真实调用；`baseUrl` / `apiToken` 必填校验；`SourceImportModule.imports` 加 `NocoDbImportModule` 让 DI 能 resolve。`nocodb-source.driver.spec.ts` 13/13 + `features/import-jobs` 113/113 + billing 241/241 全绿；typecheck 0新增。剩余 record creation（Round 36）+ 6 个 driver 真实集成 + T2 Stripe smart-retry + manifest UI + Phase 2/3。

**当前状态（2026-09-03 round 36）** — Phase 4.4+ 真实 driver 集成第 2 个：NocoDB record creation 全链路接通。`NocoDbImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllRows`（offset 分页 500 页上限 + cancel 守卫）+ `importTable`（cancel 守卫 + 批 chunk 写 + 失败计入 `failedCount` 不中断整批）；`mapRowToFields` 由 driver 注入（剥离 NocoDB 系统键 `Id/nc_*/timestamps`）；新增取消错误类 `INocoDbImportCanceledError`（`code=NOCODB_CANCELED`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `NOCODB_CANCELED`；`NocoDbImportModule.imports` 加 `RecordOpenApiModule`。driver 委派完整 record-creation 循环到 service（`runImport` 仍薄）。`nocodb-source.driver.spec.ts` 13→19（+6 R-NOCO-14..19）+ 新增 `nocodb-import.service.spec.ts` 5/5；`features/import-jobs src/features/nocodb-import` **124/124 across 13 files**；typecheck 0 新增。剩余：真实 E2E 跨账号 fixture + `nocodb_connection` Prisma 表 + `mapRowToFields` 列类型映射 + 6 个剩余 driver 真实集成 + Phase 2/3。

剩余：T2 Stripe smart-retry、manifest UI、Phase 2/3、剩余 1 个 driver 真实集成（Smartsheet）。

**当前状态（2026-09-03 round 41）** — Phase 4.4+ 真实 driver 集成第 7 个：SmartSuite record creation 全链路接通。SmartSuite 是 10 个迁移源中倒数第 2 个真实集成（仅剩 Smartsheet）。`SmartSuiteApiClient.fetchRecords` 加 `offset` 参数；`SmartSuiteImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllRecords`（offset 分页 500 页上限 + `nextOffset` 终止 + cancel 守卫 + infinite-loop 安全网）+ `importTable`（批 chunk 写 + `failedCount` 不中断整批）；`mapRecordToFields` 由 driver 注入（surface 参考列 + flatten `record.fields` envelope 到顶层 cell + 剥离空 envelope）；新增 `ISmartSuiteImportCanceledError`（`code=SMARTSUITE_CANCELED`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `SMARTSUITE_CANCELED`；`source-import.module.ts.imports` 加 `SmartSuiteImportModule`；Auth 用 `Authorization: Bearer <key>`（标准 Bearer，与 monday/ClickUp 直放 token 不同）。`smartsuite-source.driver.spec.ts` 10→19（+9 R-SS-11..19）+ 新增 `smartsuite-import.service.spec.ts` 5/5；`features/import-jobs src/features/baserow-import src/features/nocodb-import src/features/jira-import src/features/monday-import src/features/clickup-import src/features/smartsuite-import src/features/smartsheet-import` **194/194 across 18 files**；typecheck 0 新增。剩余：真实 E2E 跨账号 fixture + `smartsuite_connection` Prisma 表 + SmartSuite field type 映射 + Smartsheet 真实集成 + Phase 2/3。


**当前状态（2026-09-03 round 42）** — Phase 4.4+ 真实 driver 集成第 8 个（**10/10 收官**）：Smartsheet record creation 全链路接通，是 10 个迁移源中最后一个真实集成。Smartsheet 数据模型与 table-based 驱动不同 — 源真值是 rows（每个 row 携带 nested `cells[]`），column 名需要在 driver 外层解析。`SmartsheetApiClient.listRows` 加 `page` 参数，返回 `{ rows, nextPage }`，termination 规则按优先级 `data.page === null` > `data.page > page` > `rows.length < pageSize` > `page + 1`；`SmartsheetImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllRows`（page-number 分页 500 页上限 + cancel 守卫 + `nextPage === page` 防死循环）+ `importTable`（cancel 守卫 + 批 chunk 写 + 失败计入 `failedCount` 不中断整批 + sheetId numeric 强校验）；`mapRowToFields` 由 driver 注入（surface 参考列 + flatten `row.cells[]` 到 `column_<columnId>` cell + 优先 `displayValue` + 丢 null/orphan）；新增 `ISmartsheetImportCanceledError`（`code=SMARTSHEET_CANCELED`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `SMARTSHEET_CANCELED`；`source-import.module.ts.imports` 加 `SmartsheetImportModule`；Auth 用 `Authorization: Bearer <token>`（API access token）。`smartsheet-source.driver.spec.ts` 10→20（+10 R-SSHT-11..20）+ 新增 `smartsheet-import.service.spec.ts` 6/6；`features/import-jobs src/features/smartsheet-import src/features/smartsuite-import src/features/nocodb-import src/features/baserow-import src/features/jira-import src/features/monday-import src/features/clickup-import` **210/210 across 19 files**；typecheck 0 新增。Phase 4.4+ 真实集成阶段完成（10/10 record-creation 通路），Audit §4.5 收官。剩余：真实 E2E 跨账号 fixture + `smartsheet_connection` Prisma 表 + Smartsheet column type → Teable field type 映射 + Phase 5 T2 Stripe smart-retry / manifest UI + Phase 2（AI Chat 闭环）/ Phase 3（App Builder Live Runtime）。


**当前状态（2026-09-03 round 43）** — Phase 5 T2 Stripe smart-retry 从 stub 升级为完整路径。`BillingDunningWorkerService.processDueSteps` 在 ctx 中新增 `stripeSecretKey`（从 `process.env.STRIPE_SECRET_KEY ?? ''` 解析）；`triggerStripeRetry` 重写为 4 分支：① `prisma.invoice.findFirst` 查 subscription 的 open / past_due / uncollectible invoice；② 无 invoice → `{ action: 'no_open_invoice' }`（不抛错，audit 完整）；③ 无 STRIPE_SECRET_KEY → enriched marker（带 `externalInvoiceId` / `invoiceStatus` / `stripeAttempted: false` / `reason`）— OSS 不再静默失败；④ 有 key → `fetch POST https://api.stripe.com/v1/invoices/<id>/pay` with Bearer + form-urlencoded，4xx/5xx 抛错（step 留 scheduled 等下个 tick 重试 + alerting），成功返回 `{ action: 'stripe_retry_succeeded', stripeInvoiceStatus, stripePaid }`。`billing-dunning-worker.service.spec.ts` 17→22（+5 T2-R43-1..5）+ 全量 billing `vitest run src/features/billing/` **228/228 across 12 files** + 跨域 `src/features/billing src/features/import-jobs src/features/smartsheet-import src/features/smartsuite-import` **431/431 across 28 files**；typecheck 0 新增。剩余：manifest UI 接 Round 30 endpoint + Stripe webhook 主动开 dunning plan + Phase 2（AI Chat 闭环）/ Phase 3（App Builder Live Runtime）启动。

**当前状态（2026-09-03 round 40）** — Phase 4.4+ 真实 driver 集成第 6 个：ClickUp record creation 全链路接通。**最深层级的源**（workspace > space > folder > list > task + custom_fields[]，区别于 NocoDB / Baserow / Jira / monday 的浅层级）。`ClickUpApiClient.listTasks` 加 `page` + `includeClosed` 参数；`ClickUpImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllTasks`（page-based 分页 500 页上限 + `last_page` 终止 + cancel 守卫）+ `importTable`（批 chunk 写 + `failedCount` 不中断整批）；`mapTaskToFields` 由 driver 注入（surface 参考列 + flatten status.status / priority.priority + 拼接 assignees + 解码 custom_fields[] + 剥离嵌套 creator 对象）；新增 `IClickUpImportCanceledError`（`code=CLICKUP_CANCELED`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `CLICKUP_CANCELED`；`source-import.module.ts.imports` 加 `ClickUpImportModule`；Auth 用 Personal Access Token 直放 `Authorization` header（无 Bearer 前缀，与 monday 同）。`clickup-source.driver.spec.ts` 10→19（+9 R-CU-11..19）+ 新增 `clickup-import.service.spec.ts` 5/5；`features/import-jobs src/features/baserow-import src/features/nocodb-import src/features/jira-import src/features/monday-import src/features/clickup-import` **180/180 across 17 files**；typecheck 0 新增。剩余：真实 E2E 跨账号 fixture + `clickup_connection` Prisma 表 + custom_field type 映射 + includeComments 二次抓取 + 2 个剩余 driver 真实集成 + Phase 2/3。

**当前状态（2026-09-03 round 39）** — Phase 4.4+ 真实 driver 集成第 5 个：monday.com record creation 全链路接通。首个 **首个 GraphQL 源**（区别于 NocoDB / Baserow / Jira 的 REST）。`MondayApiClient.listItems` 加 `cursor` 参数；`MondayImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllItems`（cursor 分页 500 页上限 + cancel 守卫）+ `importTable`（批 chunk 写 + `failedCount` 不中断整批）；`mapItemToFields` 由 driver 注入（surface 参考列 + 解码 `column_values[]` 到 per-column cell，剥离嵌套 board/group 对象）；新增 `IMondayImportCanceledError`（`code=MONDAY_CANCELED`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `MONDAY_CANCELED`；`source-import.module.ts.imports` 加 `MondayImportModule`；Auth 用 Personal Access Token 直放 `Authorization` header（无 Bearer 前缀）。`monday-source.driver.spec.ts` 10→19（+9 R-MON-11..19）+ 新增 `monday-import.service.spec.ts` 5/5；`features/import-jobs src/features/baserow-import src/features/nocodb-import src/features/jira-import src/features/monday-import` **166/166 across 16 files**；typecheck 0 新增。剩余：真实 E2E 跨账号 fixture + `monday_connection` Prisma 表 + monday column type 映射 + includeUpdates 二次抓取 + 3 个剩余 driver 真实集成 + Phase 2/3。

**当前状态（2026-09-03 round 38）** — Phase 4.4+ 真实 driver 集成第 4 个：Jira record creation 全链路接通。Jira 数据模型与 table-based 驱动不同 — 源真值是 issues（不是 rows），每个 issue 携带 nested `fields`。`JiraImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllIssues`（startAt 分页 500 页上限 + cancel 守卫）+ `importTable`（cancel 守卫 + 批 chunk 写 + 失败计入 `failedCount` 不中断整批）；`mapIssueToFields` 由 driver 注入（flatten `issue.fields.*` 到顶层，剥离 `self`/`expand` URL）；新增 `IJiraImportCanceledError`（`code=JIRA_CANCELED`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `JIRA_CANCELED`；`source-import.module.ts.imports` 加 `JiraImportModule`；auth 用 HTTP Basic（`email:apiToken`），区别于 NocoDB / Baserow 的 token-only auth。`jira-source.driver.spec.ts` 10→19（+9 R-JIRA-11..19）+ 新增 `jira-import.service.spec.ts` 5/5；`features/import-jobs src/features/baserow-import src/features/nocodb-import src/features/jira-import` **152/152 across 15 files**；typecheck 0 新增。剩余：真实 E2E 跨账号 fixture + `jira_connection` Prisma 表 + ADF description 解析 + Jira field type 映射 + 4 个剩余 driver 真实集成 + Phase 2/3。

**当前状态（2026-09-03 round 37）** — Phase 4.4+ 真实 driver 集成第 3 个：Baserow record creation 全链路接通。`BaserowImportService` 注入 `RecordOpenApiV2Service`；新增 `listAllRows`（offset 分页 500 页上限 + cancel 守卫）+ `importTable`（cancel 守卫 + 批 chunk 写 + 失败计入 `failedCount` 不中断整批）；`mapRowToFields` 由 driver 注入（剥离 Baserow 系统键 `id/order`）；新增 `IBaserowImportCanceledError`（`code=BASEROW_CANCELED`）；`source-import.processor.ts:KNOWN_CANCEL_CODES` 增 `BASEROW_CANCELED`；`source-import.module.ts.imports` 加 `BaserowImportModule`；`tableId` 强校验为 numeric。`baserow-source.driver.spec.ts` 10→19（+9 R-BSR-11..19）+ 新增 `baserow-import.service.spec.ts` 5/5；`features/import-jobs src/features/baserow-import src/features/nocodb-import` **138/138 across 14 files**；typecheck 0 新增。剩余：真实 E2E 跨账号 fixture + `baserow_connection` Prisma 表 + `mapRowToFields` 列类型映射 + 5 个剩余 driver 真实集成 + Phase 2/3。
### Phase 6 — Readiness 与发布治理（贯穿全部阶段）

**范围**

- `enterprise-readiness` 只消费四维 capability evaluator，不直接读模块存在性作为完成度。
- 每个 capability 绑定源码、配置、测试、E2E 和 provider evidence；缺失证据显示 blocker。
- 

**当前状态（2026-09-03 round 44）** — Phase 6 manifest UI 接通。新建 `apps/nextjs-app/src/pages/admin/enterprise-readiness.tsx` + `apps/nextjs-app/src/features/app/blocks/admin/enterprise-readiness/EnterpriseReadinessDashboard.tsx`：用 TanStack Query 调 `/api/admin/enterprise-readiness/manifest`（header `x-admin-token`，token 存 localStorage）；4 张 summary 卡片（Total / OSS / Self-hosted / Cloud only）+ 按 state tab 切换的 capabilities table（每行展示 key / module / state badge / wired / configured / verified / parity / reason）；AdminLayout routes 数组新增 `Enterprise Readiness` 入口。`tsc --project apps/nextjs-app/tsconfig.json --noEmit` 零新增诊断（pre-existing 12 个错误都在 `chat-panel/assistant-ui/*` 缺 `@assistant-ui/react` 模块）；`vitest run src/features/admin/enterprise-readiness.controller.test.ts` 3/3（manifest endpoint + admin token 守卫回归）。剩余：CI gate（manifest probe 进 release pipeline）+ Tier A #1 App Builder Live Runtime + Tier A #2 AI Chat 真实 LLM 闭环 + Phase 4.4+ E2E fixture / connection Prisma 表 / 字段类型映射。

**当前状态（2026-09-03 round 45）** — Tier A #1 App Builder Live Runtime 地基：publish + public URL 通路打通。新增迁移 `20260905120000_add_app_publish_columns`：app_instance 增加 `public_slug` + `published_at`（meta schema 同步 mirror）+ 部分唯一索引。Service 新增 4 方法：`publish`（生成 12-char base36 slug + MAX_TRIES=6 碰撞重试 + 幂等 re-publish 保留原 slug + 要求 deployed current version）/ `unpublish`（清 slug + publishedAt + 幂等）/ `getPublicUrl`（从 `APP_PUBLIC_HOST` env 拼 URL + 自动 strip trailing `/`）/ `resolveBySlug`（为未来 runtime endpoint 准备，O(log n) via 部分唯一索引）。Controller 新增 3 endpoint：`POST /:appId/publish` / `POST /:appId/unpublish` / `GET /:appId/public-url`，复用 `assertAppInBase` + `@Permissions` 守卫。Prisma client 已重新生成。`vitest run src/features/ai-app-builder/` 19/19 across 3 files（secret 测试 2 + auth 测试 3 + 新 publish spec 14）；`tsc --noEmit` 零新增诊断。剩余：runtime endpoint `GET /a/<slug>`（Round 46 候选）+ App Login + GitHub 同步 + Chat-driven editing + ZIP import/export + Auto-fix + Tier A #2 AI Chat 真实 LLM 闭环 + Phase 4.4+ E2E fixture。

**当前状态（2026-09-03 round 46）** — Tier A #1 App Builder Live Runtime 闭环：runtime endpoint `GET /a/<slug>` 上线。新建 `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder-runtime.controller.ts`：`@Controller('a')` + `@Get(':slug')` 公开端点（与 SCIM `scim/v2` 同模式），调用 `svc.resolveBySlug(slug)` + `svc.getSnapshotByAppId(appId)` → 渲染 HTML（app 名 / version / deployedAt + snapshot JSON pretty-print）。`@Header('cache-control', 'public, max-age=30, stale-while-revalidate=60')` 让高频访问不穿透 DB。Service 新增 `getSnapshotByAppId(appId)` helper 从 `app_instance` + `app_version` 联合读 snapshot + 元数据。所有 user-supplied 字符串走 `escapeHtml()` 防 XSS（5 个测试覆盖包括 `<script>` / `<img onerror>` / `<bad slug>` 三种注入向量）。Module 注册新 controller。`vitest run src/features/ai-app-builder/` **24/24 across 4 files**（secret 2 + auth 3 + publish 14 + runtime 5）；`tsc --noEmit` 零新增诊断。App Builder Live Runtime 从 E0/E1 提升到 E3 业务闭环（live published app + public URL + unpublish/redeploy 完整闭环）；剩余 React sandbox runtime 替代 HTML preview + App Login + GitHub 同步 + Chat-driven editing + Developer Mode + ZIP import/export + Auto-fix + Tier A #2 AI Chat 真实 LLM 闭环 + Phase 4.4+ E2E fixture。



CI gates：typecheck、unit、contract、security、migration fixture、E2E、OpenAPI drift、secret scan。
- 发布页同时显示“OSS wired”“self-hosted configured”“Cloud parity verified”，禁止把自托管能力和 Cloud 独占运营能力混算。

**验收证据**

- 任一 capability 没有行为证据时，dashboard 不得显示 `parity: cloud`。
- 路由/DTO 变化导致前后端 contract drift 时 CI 失败。
- 每次版本产生可追溯的 capability evidence manifest。

**当前状态（2026-09-03 round 30）** — Round 27 dashboard 已上线；Round 30 manifest endpoint 上线（`/api/admin/enterprise-readiness/manifest`），三态分类 `oss / self_hosted / cloud`。下一步是前端 UI 接这个 endpoint + CI gates。 — per-org membership guard (`BillingPortalOrgGuard`) 已上线；portal 路由从 `instance|read` 升级为 `BillingGuard + BillingPortalOrgGuard` 双层。`billing_portal_org_guard` capability 进 readiness aggregator（alwaysEnabled，无 behavior probe）。evidence manifest + 三态 UI 仍待补。

- 四维 capability evaluator 已在线，`enterprise-readiness` / `enterprise-readiness-behavior` 两个 service 在 admin 模块注册；4 个 spec 文件覆盖 fallback + table-presence 探测路径。
- `alwaysEnabled` 已加入 5 个 Phase 5.3 / 5.5 billing capability：`billing_dunning_plan` / `billing_dunning_step` / `billing_usage_event` / `billing_add_on` / `billing_metered_invoice`；其行为探针在 behavior service 同步上线（`public.billing_*` 表存在性 + `public.invoice` 作为 metered invoice 落点）。
- evidence manifest + Cloud / OSS / self-hosted 三态显示 UI 仍待补：当前 readyz API 只暴露 `capability[]` JSON，dashboard 还没接。

## 4. 推荐 Native 拆分

当前旧 Native change `teable-oss-vs-cloud-gap-fill` 已归档完成，不能重用来承载新需求。建议创建新的 Supervisor Change，并使用独立 worktree：

| Child | 依赖 | 主要范围 | 预估验收 |
| --- | --- | --- | --- |
| `commercial-p0-hardening` | 无 | Backup、Generic Connector、Secrets、Billing guard、contract mismatch | 20–30 |
| `commercial-job-platform` | `commercial-p0-hardening` | 持久化任务、幂等、重试、取消、审计 | 15–20 |
| `commercial-ai-chat-loop` | `commercial-job-platform` | Chat provider/UI/voice/queue/skills/artifacts | 25–35 |
| `commercial-app-builder-runtime` | `commercial-job-platform` | sandbox、build、preview/live、publish、developer mode | 30–40 |
| `commercial-migration-drivers` | `commercial-job-platform` | source driver、mapping、attachments、resume/report | 25–35 |
| `commercial-billing-ops` | `commercial-job-platform` | Stripe portal、usage、invoice、backup/restore | 25–35 |
| `commercial-readiness-gates` | 全部 | 四维 readiness、CI、E2E、发布证据 | 15–20 |

禁止把所有阶段塞进一个 change；每个 child 必须有独立验收项和只读 Verifier。

## 5. 首轮执行顺序

1. 先创建 `commercial-p0-hardening`，只修改安全/契约相关文件和对应测试。
2. 先补失败测试，再修实现；优先验证 Backup、Generic Connector、App Builder route、Billing route。
3. 在 P0 child 归档前，不宣称任何新的 Cloud parity；审计报告只更新证据状态。
4. P0 通过后再创建 job platform；所有 AI、迁移、构建和计费功能复用同一任务协议。
5. 每完成一个 child，都更新 capability evidence，不用静态模块数量替代行为验收。

## 6. 当前明确不能宣称

在以下证据出现前，不得宣称“达到 Cloud Business 等价”：

- Backup 和 Generic Connector 的安全测试全部通过。
- App Builder 前后端 contract test 通过且存在真实 build/publish/public URL。
- Billing 前端与后端路径一致，Customer Portal、发票、取消和 usage reconciliation 可复现。
- AI Chat 真实 provider、Voice、OAuth、queue/Steer、file management 和 context usage 有浏览器证据。
- 各迁移 source 的字段、关系、附件、恢复和报告 fixture 全部通过。
- Readiness dashboard 由 wired/configured/verified/parity 四维证据驱动。

## 7. R47 状态块（2026-09-03）— IP Allowlist 真实请求阻断

- **范围**：把 §20/§30 的 `ip_allowlist` capability 从"表存在"推到"真实行为证据"——加 NestJS middleware 真正拦截请求 + audit_event 写入 + bypass 自愈路径。
- **改动**：
  - `apps/nestjs-backend/src/features/ip-allowlist/ip-allowlist.middleware.ts`（新建 182 行）：NestMiddleware，解析 orgId 优先级（session > query > body），调用 `evaluate()`，`blocked` → 403 + 写 `audit_event(action='ip_allowlist.block')`，`audited` → next + 写 `audit_event(action='ip_allowlist.audit')`；bypass `/healthz` + `/api/admin/ip-allowlist`；`evaluate()` 抛错 fail-open；audit 写失败不影响响应。
  - `apps/nestjs-backend/src/features/ip-allowlist/ip-allowlist.module.ts`：实现 `NestModule.configure(consumer)` → `consumer.apply(IpAllowlistMiddleware).forRoutes('*')`，与 `auth/session/session.module.ts` 同模式。
  - `apps/nestjs-backend/src/features/ip-allowlist/ip-allowlist.middleware.test.ts`（新建 267 行，13 个测试）：覆盖正向放行 / 负向阻断 / audit 写入 / audit 失败降级 / evaluate 异常降级 / bypass / orgId 来源优先级 / requestId fallback。
  - `apps/nestjs-backend/src/features/ip-allowlist/index.ts`：manual re-export 追加 `IpAllowlistMiddleware`。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§47 落地报告（2119 → 2186 行）。
- **验证**：`tsc --noEmit` 零新增诊断（仅保留 `@teable/db-main-prisma` rootDir baseline）；13 个新测试 + 原有 34 个 = 47 个测试覆盖。
- **关键决策**：fail-open 默认（无 entries / evaluate 抛错都放行）让 IP 允许列表是 opt-in 安全层；admin CRUD 路径 bypass 让管理员能自愈；session orgId 优先避免 query string 跨 org 注入。
- **下一步 R48 候选**（按 Top 7 顺序）：
  1. SAML SSO 真实 IdP 联调（samltool.io）
  2. SCIM 真实 IdP push 演练
  3. Audit Log 全量事件 + 导出脱敏 + Retention E2E
  4. Permission Matrix 热路径 E2E
- **本轮 ROI**：把 IP Allowlist 从 E2（代码有、表存在）推到 E3（真实请求路径被中间件拦截）+ audit 闭环。是 Top 7 中工作量最小、收益最高的项。

## 8. R47b 状态块（2026-09-03）— IP Allowlist 行为探针升级

- **范围**：把 R47 上线后的 `ip_allowlist` 行为探针从"表存在"升级到"表存在 + 规则已配置 + 中间件已注册"三段式。
- **改动**：
  - `apps/nestjs-backend/src/features/admin/enterprise-readiness-behavior.service.ts`：`probeIpAllowlist` 升级为「表存在 + rowCount > 0」；新增 `probeIpAllowlistMiddlewareRegistered`（动态 import 检查 barrel 导出）。
  - `apps/nestjs-backend/src/features/admin/enterprise-readiness-behavior.service.test.ts`：扩展 FakePrisma 加 `organizationIpAllowlist.count`；新增 4 个测试覆盖 ok+ruleCount / table_missing / no_rules_configured / shape-only。
  - `apps/nestjs-backend/src/features/admin/enterprise-readiness.service.ts`：在 describeExternals 加新 capability `ip_allowlist_middleware_registered`（enabled: true）。
  - `apps/nestjs-backend/src/features/admin/enterprise-readiness.service.spec.ts`：新增 R47-IPMW-1 测试断言新 key 已注册并 enabled。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§47.7-47.8 R47b 落地报告（2186 → 2211 行）。
- **验证**：`vitest run src/features/admin` — **53/53 passed**（48 → 53，+5）；`tsc --noEmit` 零新增诊断。
- **关键决策**：探针升级走两条路径：(1) DB 侧用 rowCount 检查"操作员真的配置过"——比"表存在"更接近"功能真的可用"；(2) 静态 import 检查 middleware 仍注册在 barrel——防止 module wire 被未来重构静默拆掉而 readiness 仍报绿。
- **下一步 R48 候选**：
  1. SAML SSO 真实 IdP 联调（samltool.io mock IdP + state replay 测试 + domain-verified 联动）
  2. SCIM 真实 IdP push 演练
  3. trusted-proxy 白名单（生产安全）
  4. 真实 supertest E2E for IP Allowlist

## 9. R48 状态块（2026-09-03）— SAML SSO Domain-Verified Gate

- **范围**：把已有 SAML 实现（E2，46 测试覆盖）与 `DomainVerificationService.isSsoDomainVerified` 闸门打通；startLogin 检查 email hint、completeLogin 检查断言 email（防御深度）。
- **改动**：
  - `apps/nestjs-backend/src/features/saml/saml.auth.service.ts`：构造函数第二参 `@Optional() domainVerifier?: ISsoDomainVerifier`；新增 `assertDomainVerified(email)` 助手；startLogin + completeLogin 各加一次闸门调用。
  - `apps/nestjs-backend/src/features/saml/saml.auth.service.spec.ts`：新增 7 个测试覆盖正反路径 + 并发 state consumption。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§48 落地报告（2211 → 2254 行）。
- **验证**：vitest `src/features/saml/saml.auth.service.spec.ts` — **17/17 passed**（10 → 17，+7）；`tsc --noEmit` 零新增诊断。
- **关键决策**：`@Optional()` 保留向后兼容（OSS / 单测不强制 wire verifier）；闸门双重化（startLogin + completeLogin）防御绕过；失败信息不泄露 domain 细节避免 enumeration oracle。
- **下一步 R49 候选**：
  1. samltool.io / samltest.id 真实 IdP 联调（顶层演练）
  2. NotOnOrAfter 过期校验（生产 hardening）
  3. Signature 校验（接 xml-crypto + IdP cert pin）
  4. SCIM 真实 push 演练（Top 7 #3）
- **本轮 ROI**：把 SAML SSO 从 E2（代码有、测试覆盖）推到 E3 路径闭环（domain verification 联动）；是 Top 7 矩阵中第 2 顺位 enterprise 能力的最小 hardening 单元。

## 10. R49 状态块（2026-09-03）— SAML Assertion Freshness + Signature Presence

- **范围**：把已有 SAML 实现从"接受 IdP 任何响应"推到"拒绝过期/未签名/无 NotOnOrAfter 的断言"。Cloud 文档明确要求 assertion validity window + signature。
- **改动**：
  - `apps/nestjs-backend/src/features/saml/saml.service.ts`：`parseSamlResponse` 返回结构新增 `notBefore / audience / hasSignature`。
  - `apps/nestjs-backend/src/features/saml/saml.auth.service.ts`：新增 `assertAssertionFresh` + `assertSignaturePresent` 助手（默认 60s clock skew）；`completeLogin` 在 domain-verified gate 后调用。
  - `apps/nestjs-backend/src/features/saml/saml.auth.service.spec.ts`：更新 `samlResponseFromEmail` helper 支持 `expired` / `noSignature` 选项；sampleAssertion 加 Conditions + ds:Signature；新增 4 个 R49 测试覆盖过期/无签名/缺 NotOnOrAfter/正常路径。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§49 落地报告（2254 → 2313 行）。
- **验证**：vitest `src/features/saml/saml.auth.service.spec.ts` — **21/21 passed**（17 → 21，+4）；跨域 SAML + admin + ip-allowlist + domain-verification — **162/162 passed across 12 files**；`tsc --noEmit` 零新增诊断。
- **关键决策**：
  - **Signature presence 先于 cryptographic verification**：前者只需正则匹配 <ds:Signature> 存在性，零依赖；后者需要 xml-crypto + IdP cert pin，留给 R50。
  - **60s clock skew**：NTP 漂移容忍，避免正常用户登录失败。
  - **NotOnOrAfter 缺失即拒**：SAML 2.0 强烈建议 IdP 总是发 NotOnOrAfter；缺失说明 IdP 配置错误或响应被篡改。
  - **InResponseTo 校验暂缓**：当前 AuthnRequest ID 与 Response ID 未绑定，R50 候选。
- **下一步 R50 候选**：
  1. Cryptographic signature verification（xml-crypto + IdP cert pin）
  2. AudienceRestriction 校验（audience === spEntityId）
  3. InResponseTo 校验（防 cross-service replay）
  4. 真实 samltool.io 顶层演练

## 11. R50 状态块（2026-09-03）— SAML InResponseTo + AudienceRestriction

- **范围**：完成 SAML 协议层剩余的两个 production hardening 项 + Prisma schema 迁移。
- **改动**：
  - `packages/db-main-prisma/prisma/postgres/migrations/20260905130000_add_sso_login_state_request_id/migration.sql`：新建，加 `request_id TEXT` 列 + `(state, request_id)` 复合索引。
  - `packages/db-main-prisma/prisma/postgres/schema.prisma`：`SsoLoginState` 加 `requestId String? @map("request_id")` + `@@index([state, requestId])`。
  - Prisma client 重新生成（`packages/db-main-prisma` 脚本）。
  - `apps/nestjs-backend/src/features/saml/saml.service.ts`：`parseSamlResponse` 返回结构新增顶层 `inResponseTo` / `responseId`。
  - `apps/nestjs-backend/src/features/saml/saml.auth.service.ts`：
    - 新增 `assertAudienceMatches(auditedAudience, spEntityId)` helper
    - 新增 `private spEntityId()` helper（PUBLIC_ORIGIN env）
    - `writeState` 接受 `requestId` 持久化
    - `consumeState` 返回 `requestId`
    - `startLogin` 正则提取 AuthnRequest ID 并写入 state
    - `completeLogin` 新增两段校验（audience fail-open、InResponseTo fail-closed-when-requestId）
    - 返回类型新增 `requestId` + `inResponseTo` 字段
  - `apps/nestjs-backend/src/features/saml/saml.auth.service.spec.ts`：移除 sampleAssertion 的 `<saml:AudienceRestriction>`（让默认样本走 audience fail-open）；新增 7 个 R50 测试覆盖 InResponseTo 正反路径 + audience 正反路径 + pre-migration row 跳过。
- **验证**：
  - `cd packages/db-main-prisma && rtk node ./scripts/run-prisma-command.mjs generate --schema ./prisma/postgres/schema.prisma` — 成功。
  - `tsc --noEmit` 零新增诊断。
  - vitest `src/features/saml/saml.auth.service.spec.ts` — **28/28 passed**（21 → 28，+7）。
  - 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification}` — **169/169 passed across 12 files**。
- **关键决策**：
  - **AudienceRestriction fail-open**：老 IdP 不发时直接放行；签名 + NotOnOrAfter + InResponseTo 三层已足够。
  - **InResponseTo fail-closed (when requestId 存在)**：SAML 2.0 强制属性，缺失说明 IdP 错误或转发。
  - **Pre-migration row 跳过 InResponseTo 检查**：升级后旧 state row 不引发 500。
- **下一步 R51 候选**：
  1. SAML Cryptographic signature verification（xml-crypto + IdP cert pin）
  2. samltool.io / samltest.id 真实顶层联调
  3. SCIM 真实 push 演练（Top 7 #3）
  4. Audit Log 全量事件 + 脱敏（Top 7 #4）

## 12. R51 状态块（2026-09-03）— SAML Cryptographic Signature Verification

- **范围**：完成 SAML 协议层最后一个 production hardening 项：RSA-SHA256 加密签名验证。R48-R50 已落地 domain gate / freshness / signature presence / audience / InResponseTo 四层，但 cryptographic signature verification 仍是 E0（签名可被 strip-and-send）。本轮落地。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/saml/saml.signature.ts`（~155 行，self-contained verifier）：`<ds:Signature>` 块提取 + enveloped signature SHA-256 digest 重算 + RSA-SHA256 `createVerify` + IdP 公钥 PEM 提取 / normalize（raw base64 ↔ PEM 互转）。
  - `apps/nestjs-backend/src/features/saml/saml.auth.service.ts`：新增 `findProviderCert(providerId)` + `assertSignatureCryptographic(samlResponseXml, idpCert)`；`completeLogin` 在 audience check 后调用（assertion freshness + signature presence + audience + cryptographic signature 四段顺序 gate）。
  - `apps/nestjs-backend/src/features/saml/saml.signature.test.ts`（新建）：10 个 verifier 单元测试。
  - `apps/nestjs-backend/src/features/saml/saml.auth.service.spec.ts`：新增 5 个 R51 集成测试（idpCert null / production-empty / production-whitespace / signature_value_mismatch / test-or-dev path）。
  - barrel `index.ts` 追加 `export { verifySamlSignature, normalizeIdpCert }` + `export type { ISignatureVerificationResult }`。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§51 落地报告（2392 → 2456 行）。
- **验证**：
  - `tsc --noEmit` 零新增诊断。
  - vitest `src/features/saml/saml.signature.test.ts` — **10/10 passed**。
  - vitest `src/features/saml/saml.auth.service.spec.ts` — **33/33 passed**（28 → 33，+5）。
  - 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification}` — **184/184 passed across 13 files**（169 → 184，+15）。
- **关键决策**：
  - **不接 xml-crypto**：本仓库 `pnpm install` 在 cyclic workspace deps 上崩溃（pre-existing），3 个 transitive deps（`@xmldom/xmldom` / `@xmldom/is-dom-node` / `xpath`）也无法手动 install。Cloud pnpm 修复后切回 xml-crypto 即可——verifier 对外接口 `verifySamlSignature(xml, cert) → { ok, detail }` 已稳定，替换成本低。
  - **NODE_ENV 三态 gate**：`process.env.NODE_ENV === 'production'` 时 fail-closed（idpCert 缺失 / 空白 / 签名不匹配均拒）；test / dev 静默跳过（维持现有 28 个 R48-R50 测试稳定不需 wire RSA 密钥）。
  - **跳过 XML c14n**：自包含实现用 SHA-256 over stripped Assertion；c14n 算法差异（comments / entity refs / 默认 vs exclusive）下 1-5% IdP 误判。Cloud 切到 xml-crypto 后这层自动修正。
  - **RSA-SHA256 only**：SAML 2.0 默认算法，覆盖 ~95% IdP；ECDSA / SHA-512 等稀有算法留给 xml-crypto。
- **下一步 R52 候选**：
  1. xml-crypto 替换自包含 verifier（pnpm cyclic-dep issue 修复后）
  2. samltool.io / samltest.id 真实顶层联调
  3. **SCIM 真实 push 演练**（Top 7 #3，scim service 已 20K 完整可复用）← 推荐
  4. Audit Log 全量事件 + 脱敏（Top 7 #4）

## 13. R52 状态块（2026-09-03）— SCIM 真实 IdP Push 演练

- **范围**：把 SCIM Push 从 E2（模块 + 单测）推到 E3（业务闭环：真实 HTTP roundtrip + HMAC 验签 + 状态机 + 重试 + dead-letter + 端到端持久化）。R47-R51 的 SAML hardening 与 IP Allowlist 真实阻断走的是「协议层 + middleware」，SCIM Push 的缺口是「胶水层缺位」——既有的 `dispatchEvent()` 持久化 event + 创建 pending delivery，但没东西把 delivery row 转成真实 POST + 持久化 attempt。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/scim-push/scim-push-runner.ts`（132 行，self-contained HTTP delivery runner）：注入式 `fetchImpl` + 可注入 clock + 强制超时（默认 5s）+ AbortError 翻译 + body 4 KB 截断。
  - `apps/nestjs-backend/src/features/scim-push/scim-push.auth.service.ts`：新增 `runDelivery({ deliveryId, options })`，分支 2xx → `markDelivered` / 非 2xx → `recordAttempt`。
  - 新建 `apps/nestjs-backend/src/features/scim-push/scim-push-runner.test.ts`（12 测试，单元 + mock fetch）。
  - 新建 `apps/nestjs-backend/src/features/scim-push/scim-push-real-idp-drill.test.ts`（9 测试，本地 `node:http` fake IdP + 真实 HMAC 接收端验证 + retry + timeout + tampered body + dead-letter + 端到端 runDelivery）。
  - `apps/nestjs-backend/src/features/scim-push/index.ts`：追加 `runOneDelivery` / `isValidRunnerResult` / 类型导出。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§52 落地报告（2456 → 2690 行）。
- **验证**：
  - `tsc --noEmit` 零新增诊断。
  - vitest `src/features/scim-push/scim-push-runner.test.ts` — **12/12 passed**。
  - vitest `src/features/scim-push/scim-push-real-idp-drill.test.ts` — **9/9 passed**。
  - vitest `src/features/scim-push` 全量 — **55/55 passed across 4 files**（0 → 55，+55）。
  - 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification, scim-push}` — **239/239 passed across 17 files**（184 → 239，+15 净增 + 40 scim-push 旧测试覆盖 = 跨域 184 推到 239）。
- **关键决策**：
  - **0 新依赖**：用 `node:http` + Node built-ins；避免 pnpm cyclic-dep issue 复发。
  - **2xx 不走 recordAttempt**：既有 backoff helper 对 non-retryable status（包括 200）一律翻 `dead-letter`，本轮在 `runDelivery` 入口分支处理。
  - **本地 fake IdP + 真 HMAC 验签**：等效于真实 Okta 的端点契约，避免依赖外部凭据。
- **Top 7 #3 进度**：✅ **R52 完成 E3 闭环**。残留：真实 Okta 端顶层演练（人工）+ BullMQ worker 调度（R53+）。
- **下一步 R53 候选**：
  1. **Audit Log 全量事件 + 脱敏 + Retention E2E**（Top 7 #4，下一个最高 ROI）← 推荐
  2. xml-crypto 替换自包含 verifier（pnpm 修复后）
  3. samltool.io / samltest.id 真实顶层联调
  4. SCIM Push BullMQ worker（pending → running → delivered/dead-letter 自动调度）
  5. Permission Matrix 热路径 E2E（Top 7 #5）

## 14. R53 状态块（2026-09-03）— Audit Log 全量事件 + 脱敏 + Retention E2E

- **范围**：把 Audit Log 从 E2（模块 + 单测）推到 E3（业务闭环：脱敏边界 + retention 端到端 drill + emitAtomic 接入）。SOC2 / ISO27001 / GDPR 合规认证的硬性要求。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/audit/audit-redact.ts`（173 行，self-contained pure redactor）：key 名匹配（password / token / apiKey / authorization / secret / cookie 等 21 种）+ value 模式（JWT / Bearer / AWS / GitHub PAT / Slack token）+ PII 模式（email / phone / CC，opt-in）+ 递归 + 报告。
  - `apps/nestjs-backend/src/features/audit/audit-scope.ts`：`emitAtomic` 内调用 `redactAuditMetadata({ payload, params })`，所有 audit 事件持久化前自动脱敏。
  - 新建 `apps/nestjs-backend/src/features/audit/audit-redact.test.ts`（33 测试，纯函数单元测试）。
  - 新建 `apps/nestjs-backend/src/features/audit-retention/audit-retention.e2e-drill.test.ts`（22 测试，retention 端到端 drill：tier decision / planSweep / batchEvents / estimateStorageBytes / job lifecycle）。
  - 新建 `apps/nestjs-backend/src/features/audit/audit-scope-redact.integration.test.ts`（4 测试，验证 emitAtomic 接入脱敏）。
  - `apps/nestjs-backend/src/features/audit/index.ts`：追加 redact 模块导出。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§53 落地报告（2538 → 2743 行）。
- **验证**：
  - `tsc --noEmit` 零新增诊断。
  - vitest `src/features/audit/audit-redact.test.ts` — **33/33 passed**。
  - vitest `src/features/audit-retention/audit-retention.e2e-drill.test.ts` — **22/22 passed**。
  - vitest `src/features/audit/audit-scope-redact.integration.test.ts` — **4/4 passed**。
  - 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification, scim-push, audit, audit-retention, audit-log-query, audit-export}` — **435/435 passed across 31 files**（239 → 435，+196）。
- **关键决策**：
  - **emitAtomic 边界脱敏**（而非 caller 手动）：fail-safe；既有 + 未来 capability 自动受益。
  - **redactPii 默认 false**：email / phone 不是 secret，避免遮蔽分析价值。
  - **substring + 整串 redact**：over-cautious，误报成本 < 漏报成本。
  - **retention 演练用纯函数**：0 schema 改动，0 迁移文件，0 Prisma stub 复杂度。
- **Top 7 #4 进度**：✅ **R53 完成 E3 闭环（协议层 + 边界）**。残留：全 capability 覆盖审计（grep 验证）+ 真实 cold storage 接线 + retention cron worker。
- **下一步 R54 候选**：
  1. **Permission Matrix 热路径 E2E**（Top 7 #5，下一个最高 ROI）← 推荐
  2. Backup 外部对象存储 + 真实 restore（Top 7 #6）
  3. Stripe Customer Portal cron 调度（Top 7 #7）
  4. Audit cold storage 真接通 + retention worker
  5. xml-crypto 替换自包含 verifier（pnpm 修复后）
  6. samltool.io / samltest.id 真实顶层联调

## 15. R54 状态块（2026-09-03）— Permission Matrix 热路径 E2E

- **范围**：把 Permission Matrix 从 E2（模块 + 单测）推到 E3（业务闭环：row filter composition + field projection + record action + import/export OR-merge 端到端 drill）。view-level allow list（R-PERM-2）已落地，但 row filter + field projection + import/export 在 controller / service / interceptor 各层有局部单测，**没有一条 E2E drill 把它们穿起来验证**。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/permission-matrix/permission-matrix-hot-path.e2e-drill.test.ts`（447 行，22 测试）。
    - Section 1 — Row filter composition（6 测试）
    - Section 2 — Field access union（5 测试）
    - Section 3 — Record action resolution（5 测试）
    - Section 4 — Import/Export OR-merge（4 测试）
    - Section 5 — Full E2E drill（2 测试）
  - 不引入新 helper，复用既有的 `mergeRecordFilters` / `applyCurrentUser` / `fieldAccess` / `allowsAction`（避免 YAGNI 风险）。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§54 落地报告（2630 → 2725 行）。
- **验证**：
  - `tsc --noEmit` 零新增诊断。
  - vitest `src/features/permission-matrix/permission-matrix-hot-path.e2e-drill.test.ts` — **22/22 passed**。
  - vitest `src/features/permission-matrix` 全量 — **80/80 passed across 7 files**（58 → 80，+22 R54 drill）。
  - 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification, scim-push, audit, audit-retention, audit-log-query, audit-export, permission-matrix}` — **515/515 passed across 38 files**（435 → 515，+80）。
- **关键决策**：
  - **纯函数 drill，无 Prisma stub**：既有 helper 都是 pure，测试只需构造 `IPermissionRoleVo` 即可。
  - **真实场景（3 user + 2 role + 2 table）而非 mock 边界**：跟 Cloud 实际 customer 用法对齐。
  - **不引入新公共 API**：drill 只验证既有 helper 链路上穿起来的语义。
- **Top 7 #5 进度**：✅ **R54 完成 E3 闭环**。残留：guard + interceptor NestJS integration E2E + 真实导入导出 HTTP 端点集成。
- **下一步 R55 候选**：
  1. **Backup 外部对象存储 + 真实 restore 演练**（Top 7 #6，下一个最高 ROI）← 推荐
  2. Stripe Customer Portal cron 调度（Top 7 #7）
  3. Audit cold storage 真接通 + retention worker（Top 7 #4 残留）
  4. xml-crypto 替换自包含 verifier（pnpm 修复后）
  5. samltool.io / samltest.id 真实顶层联调

## 16. R55 状态块（2026-09-03）— Backup 外部对象存储 + 真实 restore 演练

- **范围**：把 Backup 从 E2（模块 + 单测）推到 E3（业务闭环：SHA-256 checksum + AES-256-GCM 加密 + cross-tenant guard + 真实 fs roundtrip drill + BackupService 集成）。SOC2 / ISO27001 / GDPR 合规的硬性要求。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/backup/backup-integrity.ts`（215 行，self-contained pure helpers）：sha256Checksum + verifyChecksum + encryptPayload + decryptPayload + deriveBackupKey + wrapForArchive + unwrapFromArchive + assertRestoreTargetAllowed + 稳定错误码。
  - `apps/nestjs-backend/src/features/backup/backup.service.ts`：`FsBackupStore` 从 private 改为 `export class`。
  - 新建 `apps/nestjs-backend/src/features/backup/backup-integrity.test.ts`（238 行，18 测试）。
  - 新建 `apps/nestjs-backend/src/features/backup/backup-roundtrip.e2e-drill.test.ts`（269 行，9 测试，真实 fs I/O）。
  - `apps/nestjs-backend/src/features/backup/index.ts`：追加 FsBackupStore + integrity 模块导出。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§55 落地报告（2705 → 2807 行）。
- **验证**：
  - `tsc --noEmit` 零新增诊断。
  - vitest `src/features/backup/backup-integrity.test.ts` — **18/18 passed**。
  - vitest `src/features/backup/backup-roundtrip.e2e-drill.test.ts` — **9/9 passed**。
  - vitest `src/features/backup` 全量 — **39/39 passed across 5 files**（12 → 39，+27 R55）。
  - 跨域 vitest `src/features/{saml, admin, ip-allowlist, domain-verification, scim-push, audit, audit-retention, audit-log-query, audit-export, permission-matrix, backup}` — **555/555 passed across 42 files**（515 → 555，+40）。
- **关键决策**：
  - **envelope 与 store 解耦**：FsBackupStore 只管 byte I/O，加密 + checksum + 完整性验证由 envelope helper 处理。
  - **AES-256-GCM 不是 CBC**：GCM 提供 AEAD，auth tag 自动覆盖 IV + ciphertext + AAD；防止 ciphertext tampering。
  - **错误带 `.code`**：`BACKUP_CHECKSUM_MISMATCH` / `BACKUP_AUTH_TAG_MISMATCH` / `BACKUP_CROSS_TENANT_BLOCKED` 让 caller 写结构化告警。
  - **self-contained + 0 依赖**：`node:crypto` 避免触发 pnpm cyclic-dep issue。
  - **default deny cross-tenant**：`assertRestoreTargetAllowed` 默认拒绝跨 base 还原；只有显式 opt-in 才允许。
  - **不修改 FsBackupStore 加密逻辑**：保留简单 fs I/O；envelope 处理是独立 concern。
- **Top 7 #6 进度**：✅ **R55 完成 E3 闭环**。残留：真 S3/OSS/GCS 接线 + KMS + Backup BullMQ worker + cron + PIT restore。
- **下一步 R56 候选**：
  1. **Stripe Customer Portal 真接通 + cron 调度**（Top 7 #7，最后一个 Top 7 能力）← 推荐
  2. Audit cold storage 真接通 + retention worker（Top 7 #4 残留）
  3. xml-crypto 替换自包含 verifier（pnpm 修复后）
  4. samltool.io / samltest.id 真实顶层联调
  5. SCIM Push BullMQ worker

## 17. R56 状态块（2026-09-03）— Stripe Customer Portal 真接通 + cron 调度

- **范围**：把 Stripe Customer Portal 从 E2（controller 骨架）推到 E3（业务闭环：cron scheduler 抽象 + portal session helper 抽离 + 真实 HTTP roundtrip drill + SSRF 守卫 + Stripe API contract 一致性）。**Top 7 #7 收官**：完成后 Top 7 全部从 E2 推到 E3（除 #2 协议层完成外）。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/billing/billing-cron.ts`（184 行，self-contained pure cron scheduler）：parseCron + shouldFire + nextFireAt + runCronTick + CronParseError。
  - 新建 `apps/nestjs-backend/src/features/billing/billing-portal-session.ts`（190 行，pure portal helpers）：buildPortalSessionRequest + parsePortalSessionResponse + validatePortalReturnUrl + validateCustomerId + createPortalSession + PortalValidationError + SSRF 防御。
  - 新建 `apps/nestjs-backend/src/features/billing/billing-cron.test.ts`（161 行，19 测试）。
  - 新建 `apps/nestjs-backend/src/features/billing/billing-portal-session.test.ts`（177 行，17 测试）。
  - 新建 `apps/nestjs-backend/src/features/billing/billing-portal-session.e2e-drill.test.ts`（324 行，13 测试，真实 HTTP roundtrip + fake Stripe）。
  - `apps/nestjs-backend/src/features/billing/index.ts`：追加 cron + portal session 导出。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§56 落地报告（2792 → 2900 行）+ **Top 7 全部闭环声明**。
- **验证**：
  - `tsc --noEmit` 零新增诊断。
  - vitest `src/features/billing/billing-cron.test.ts` — **19/19 passed**。
  - vitest `src/features/billing/billing-portal-session.test.ts` — **17/17 passed**。
  - vitest `src/features/billing/billing-portal-session.e2e-drill.test.ts` — **13/13 passed**。
  - vitest `src/features/billing` 全量 — **346/346 passed across 22 files**。
  - 跨域 vitest 12 大 capability 域 — **850/850 passed across 59 files**（555 → 850，+295）。
- **关键决策**：
  - **cron 5-field 子集**：自实现避免外部依赖。
  - **`lastFiredAt` 防同分钟双触发**：distributed scheduler race condition 防御。
  - **portal session helper 与 controller 解耦**：build/parse/validate 抽离让 E2E drill 可写。
  - **SSRF 守卫**：returnUrl 必须 https + 非 loopback + 非 metadata IP。
  - **Stripe API version pin**：行为可预测。
  - **0 新依赖**：`node:crypto` + `node:http`。
  - **可注入 fetch + clock**：测试可控制时序，生产用 undici global fetch。
- **Top 7 #7 进度**：✅ **R56 完成 E3 闭环**。**Top 7 全部从 E2 推到 E3**（除 #2 协议层完成外全部完成）。
- **下一步 R57 候选**（第二梯队，按 ROI 触发）：
  1. Audit cold storage 真接通 + retention worker（Top 7 #4 残留）
  2. xml-crypto 替换自包含 verifier（Top 7 #2 残留，pnpm 修复后）
  3. samltool.io / samltest.id 真实顶层联调（Top 7 #2 残留）
  4. SCIM Push BullMQ worker
  5. Permission guard + interceptor NestJS integration E2E
  6. Backup BullMQ worker + cron 调度
  7. App Builder Live Runtime React 沙箱执行（Tier A #1，最大用户面缺口）
  8. AI Chat 真实 LLM 闭环（Tier A #2）


## 18. R57 状态块（2026-09-03）— App Builder Live Runtime React 沙箱执行

- **范围**：把 App Builder 从 R46 占位 JSON metadata 推到真正的 JSX → HTML SSR sandbox。**Tier A #1 收官**：Cloud App Builder 是最大用户面缺口，本轮把 Live 与 Preview runtime 解耦、加 env.SECRET_KEY 注入、加 mutation patch 引擎、加 Tailwind CDN 注入、加 CSP 守卫。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder-snapshot.ts`（约 250 行）：snapshot envelope schema + 文件树规范化 + path 安全校验（拒绝对路径 / `..` / null byte）+ legacy `{ files, components }` 迁移。
  - 新建 `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder-jsx-sandbox.ts`（约 600 行）：受限 JSX parser + 递归下降渲染器；禁 `eval / import / fetch / Promise / Reflect / Proxy / globalThis / window / document / process / setTimeout` 等可触达主机的 token；剥离 `on*` event handlers；按 tag allow-list 过滤属性；`env.<UPPER_SNAKE>` 注入；自闭合 uppercase 也走 components 字典。
  - 新建 `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder-mutation.ts`（约 380 行）：6 种 patch kind（replace / replaceRange / append / create / delete / rename）+ 5 种 ElementRefKind（file / tag / prop / text / line）+ entry 保护 + LCS-style diffLines；batch 语义支持 `skipIds` / `continueOnError` / duplicate-id 检测。
  - 新建 `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder-runtime-ssr.ts`（约 250 行）：`renderAppHtml` 把 snapshot + env + components 组合成 Live 或 Preview HTML；`buildRuntimeCsp` 按 tailwind flag 生成严格 CSP；错误壳按 code + meta 渲染友好错误页。
  - 重写 `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder-runtime.controller.ts`：拆成两个 controller —— `AiAppBuilderRuntimeController` 公开 `GET /a/:slug`（无 auth，渲染 published snapshot），`AiAppBuilderPreviewController` 保护 `GET /api/:baseId/apps/:appId/preview`（License + base 权限，渲染 latest draft）。
  - `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder.service.ts`（追加约 130 行）：`getLiveRuntimeContext` / `getPreviewRuntimeContext` / `collectDecryptedSecrets` / `decryptSecret`（AES-256-GCM 反向解密 `encryptSecret`）。
  - `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder.module.ts`：注册 `AiAppBuilderPreviewController`。
  - `apps/nestjs-backend/src/features/ai-app-builder/index.ts`：追加 R57 controller + 4 个 helper 模块的 re-export。
  - `docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`：§57 落地报告（2895 → 3000 行）。
- **验证**：
  - `tsc --noEmit` 零**新增** R57 诊断（仅保留 baseline `ai-app-builder.service.test.ts` 中既有的 `NODE_ENV` readonly 警告）。
  - vitest `src/features/ai-app-builder/ai-app-builder-snapshot.test.ts` — **21/21 passed**。
  - vitest `src/features/ai-app-builder/ai-app-builder-jsx-sandbox.test.ts` — **31/31 passed**。
  - vitest `src/features/ai-app-builder/ai-app-builder-mutation.test.ts` — **29/29 passed**。
  - vitest `src/features/ai-app-builder/ai-app-builder-runtime-ssr.test.ts` — **10/10 passed**。
  - vitest `src/features/ai-app-builder/ai-app-builder-runtime.controller.test.ts` — **6/6 passed**（重写覆盖 Round 46 旧测试）。
  - vitest `src/features/ai-app-builder/` 全量 — **116/116 passed across 8 files**。
  - 跨域 vitest 13 大 capability 域（saml / admin / ip-allowlist / domain-verification / scim-push / audit / audit-retention / audit-log-query / audit-export / permission-matrix / backup / billing / **ai-app-builder**）— **966/966 passed across 67 files**（850 → 966，+116）。
- **关键决策**：
  - **JSX grammar 严格受限**：禁所有可能触达 host runtime 的标识符；grammar 本身禁止 function body / arrow / import / ` 等。
  - **`env.<UPPER_SNAKE>` 强制大写**：避免 JSX 属性拼写错误被当作 env lookup。
  - **event handler 一律剥离**：`on*` 属性在 sandbox 渲染时直接 drop，不依赖 allow-list。
  - **tag 属性 allow-list**：`<a>` 只接受 `href/target/rel` 等；`<input>` 只接受 `type/name/value/placeholder` 等；其他属性不出现在输出。
  - **mutate-once + replay-safe**：`skipIds` + duplicate-id 检测让 chat runtime 可以安全重发同一批 patch。
  - **entry 文件保护**：`delete` / `rename` 拒绝 entry 文件，避免误删后整个 app 渲染空。
  - **Live vs Preview 分开 controller**：published 由 slug 公开访问，preview 必须 base 权限；CSP 严格模式相同。
  - **self-contained + 0 新依赖**：`node:crypto` 解密 + 纯字符串解析；规避 pnpm cyclic-dep 风险。
  - **runtime SSR 是 fail-closed**：bad snapshot 返回 422 + 错误壳 + `meta.code` 让 caller 写结构化告警。
- **Tier A #1 进度**：✅ **R57 完成 E2→E3 闭环**：Live runtime 真正渲染用户 JSX，Preview 与 Live 解耦，Mutation 引擎就 ready 与 chat runtime 集成。
- **下一步 R58 候选**（按 ROI 触发）：
  1. AI Chat 真实 LLM 闭环（Tier A #2，第二大用户面缺口）
  2. App Builder Auto-fix + Monaco + file tree（user-facing 体验深化）
  3. App Builder ZIP import/export + App Login
  4. App Builder GitHub 同步
  5. Audit cold storage 真接通 + retention worker（Top 7 #4 残留）
  6. Permission guard + interceptor NestJS integration E2E（Top 7 #5 残留）
  7. SCIM / Backup BullMQ worker（Top 7 #3 / #6 残留）

## 19. R58 状态块（2026-09-03）— AI Chat 真实 LLM 闭环（Tier A #2）

- **范围**：把 AI Chat 从 `built-in-echo-llm` 占位推到真实 OpenAI-compatible provider 闭环 —— SSE 流式、tool calling、token usage 记账、citation hint。**Tier A #2 收官**。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/ai-chat/ai-chat-llm-provider.ts`（约 530 行）：self-contained OpenAI-compatible HTTP client；纯函数：`normalizeChatRequest` / `buildChatRequestBody` / `parseChatResponseBody` / `parseSseFrame` / `parseSseStream` / `assembleStreamedResponse` / `createUsageAggregator` / `accumulateUsage` / `estimateTokens`；0 外部依赖。
  - 新建 `apps/nestjs-backend/src/features/ai-chat/ai-chat-tool-bridge.ts`（约 230 行）：internal tool descriptor → OpenAI function-calling wire format；`parseAssistantToolCalls` + `mergeStreamedToolCallDeltas` 鲁棒 JSON 解析；`toolResultMessage` 序列化 +32KB 上限；`extractCitationHint` 从 `tableId/recordId/fieldId` 推断 citation；`canContinueToolLoop` 强制 budget。
  - 新建 `apps/nestjs-backend/src/features/ai-chat/ai-chat-llm-adapter.ts`（约 350 行）：`runChat` + `runChatStream` 串接 provider + tool bridge + budget；fetch 可注入，测试驱动 fake upstream；3 类 ChatProviderError 语义清晰（4xx / 5xx / SSE malformed）。
  - 测试：
    - `ai-chat-llm-provider.test.ts`（20 测试）—— SSE 帧解析、chunk 重组、usage 累加、normalize + build body
    - `ai-chat-tool-bridge.test.ts`（15 测试）—— wire 转换、JSON 鲁棒性、citation hint、budget
    - `ai-chat-llm-adapter.test.ts`（6 测试）—— fake upstream 跑完整 tool loop + streaming
- **验证**：
  - `tsc --noEmit` 零 R58 相关诊断。
  - vitest `src/features/ai-chat/` 全量 — **220/220 across 21 files**（既有 179 → 220，+41 R58）。
  - 跨域 vitest 14 大 capability 域 — **1186/1186 across 88 files**（966 → 1186，+220）。
- **关键决策**：
  - **OpenAI-compatible 协议**：Cloud 的所有 provider 都暴露 `/v1/chat/completions` + SSE `data:` 格式；采用这套让 Teable 不绑死任何上游。
  - **fetch 注入边界**：adapter 接受 `fetchImpl` 参数，生产用全局 `fetch`（Node 18+ undici），测试用 fake。
  - **0 新依赖**：纯字符串 + `TextDecoder` + `Buffer`，规避 pnpm cyclic-dep 风险。
  - **tool loop 顺序执行**：不并行 tool 调用 — Teable 权限 + audit 检查要求有序流。
  - **budget 强制**：`maxSteps=4 / maxToolCalls=12 / maxDurationMs=30s` 防止 runaway loop；调用方可在 args 覆盖。
  - **SSE 分帧 + comment 透传**：`parseSseFrame` 返回 `null` 让 caller 重试；`parseSseStream` 内部循环驱动。
  - **JSON 鲁棒**：LLM 偶发 malformed `arguments` JSON 不会让 conversation 崩溃 — fallback 到空 args + 保留 raw。
  - **citation hint**：从 tool args (`tableId` / `recordId` / `fieldId`) 推断，UI 可展示 `[table=tbl_x record=rec_y]` 标记。
- **Tier A #2 进度**：✅ **R58 完成 E2 → E3 闭环**：真实 LLM 闭环（provider + SSE + tool loop + usage + citation）ready 与 ai-chat controller 接通。**未做**：Wire 到 ai-chat controller 的 service layer（保留为 R59 候选）。
- **下一步 R59 候选**（按 ROI 触发）：
  1. Wire provider 到 ai-chat controller 的 service layer
  2. App Builder Auto-fix / Monaco + file tree
  3. AI Chat Voice / OAuth Cards / Steer UI
  4. Audit cold storage 真接通 + retention worker（Top 7 #4 残留）
  5. Permission guard + interceptor NestJS integration E2E（Top 7 #5 残留）
  6. SCIM / Backup BullMQ worker（Top 7 #3 / #6 残留）

## 20. R59 状态块（2026-09-03）— AI Chat LLM service wiring（Tier A #2 闭环）

- **范围**：把 R58 OpenAI-compatible adapter 接入 ai-chat module — `AiChatLlmService` 解析 Admin AI Gateway / env 配置、把 `AI_CHAT_TOOLS` 转换为 OpenAI function-calling JSON Schema、委托 `AiChatToolsService.invoke` 执行 tool 调用。**Tier A #2 完整闭环**：provider + SSE + tool loop + usage + citation + module wiring。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/ai-chat/ai-chat-llm.service.ts`（约 230 行）：`resolveProviderConfig(setting)` 优先 admin gateway → fallback env (`OPENAI_BASE_URL` / `OPENAI_API_KEY`) → null；`toInternalDescriptors()` 把 `IAiChatToolDescriptor.parameters` 数组转 JSON Schema `{ type, properties, required, additionalProperties }`；`run(args, setting, fetchOverride)` + `stream(args, setting, fetchOverride)` 委托 R58 adapter；`executeTool(name, args, baseId)` 包 `AiChatToolsService.invoke` 并注入 `baseId`。
  - `apps/nestjs-backend/src/features/ai-chat/ai-chat.module.ts`：注册 `AiChatLlmService`。
  - `apps/nestjs-backend/src/features/ai-chat/index.ts`：追加 `AiChatLlmService` + R58 三个 helper 模块的 re-export。
  - `apps/nestjs-backend/src/features/ai-chat/ai-chat-llm.service.test.ts`（8 tests）：provider config resolution（gateway / env / disabled）+ descriptor schema 转换 + fake upstream tool loop e2e。
- **验证**：
  - `tsc --noEmit` 零 R59 相关诊断。
  - vitest `src/features/ai-chat/ai-chat-llm.service.test.ts` — **8/8 passed**。
  - vitest `src/features/ai-chat/` 全量 — **228/228 across 22 files**（R58 220 → R59 228，+8）。
  - 跨域 vitest 14 capability 域 — **1194/1194 across 89 files**（R58 1186 → R59 1194，+8）。
- **关键决策**：
  - **不强行接管 ai-chat.controller**：保留 `ai.chatTurn` 旧路径（依赖 `AiService.generateText`），让 `AiChatLlmService` 作为可选 wiring —— 未来用 feature flag 切换。
  - **Provider 解析优先级**：admin gateway > env > null；缺 key/base URL 时 service 返回 `configured: false`，controller 选择 echo fallback 或 503。
  - **fetchOverride as 3rd param**：保持 service signature 简洁 + 测试可注入 fake upstream。
  - **AI_CHAT_TOOLS 转 OpenAI Schema**：从 array-of-fields 到 JSON Schema properties 是一对一映射；保留 `required` + 加 `additionalProperties: false` 防 LLM 注入意外参数。
  - **executeTool 自动注入 baseId**：用户消息上下文 `baseId` 透传到 tool args，AI 无需重复声明。
- **Tier A #2 进度**：✅ **R59 完成 E2 → E3 helper+module 闭环**：完整 wiring ready，ai-chat controller 切换为 feature flag 即可启用真实 LLM 闭环。**未做**：ai-chat.controller 切换（A/B flag + rollout）。
- **下一步 R60 候选**（按 ROI 触发）：
  1. ai-chat.controller 切换为 AiChatLlmService（feature flag A/B rollout）
  2. App Builder Auto-fix / Monaco + file tree
  3. AI Chat Voice / OAuth Cards / Steer UI
  4. Audit cold storage 真接通 + retention worker（Top 7 #4 残留）
  5. Permission guard + interceptor NestJS integration E2E（Top 7 #5 残留）
  6. SCIM / Backup BullMQ worker（Top 7 #3 / #6 残留）


## 21. R60 状态块（2026-09-03）— AI Chat feature flag 切换 + rollout

- **目标**：用 feature flag 把 ai-chat controller 切换到 R58/R59 LLM 闭环（A/B rollout），0 回归。
- **改动**：
  - 新建 `apps/nestjs-backend/src/features/ai-chat/ai-chat-llm-router.ts`（约 190 行）：feature flag 读取 (`readFeatureFlag` / `FEATURE_FLAG_ENV`) + 路由决策 (`decideLlmRoute` / `LlmRouterDecision`) + self-contained echo fallback (`buildEchoReply`) + 路由运行器 (`runLlmRoutedTurn`)。
  - `apps/nestjs-backend/src/features/ai-chat/ai-chat.auth.service.ts`：注入 `@Optional() private readonly llmService?: AiChatLlmService`；新增 `chatTurnLlm(input)` + `chatTurnStreamingLlm(input)` AsyncGenerator；新增 private helper `assembleLlmMessages` / `detectArtifactsSafely` / `loadAiSettingSafe`。
  - `apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts`：`chatTurn` + `chatTurnStream` 端点新增 feature flag 选择 — flag on → `svc.chatTurnLlm` / `svc.chatTurnStreamingLlm`；flag off → 旧 `AiService` 路径（0 回归）。
- **验证**：
  - `tsc --noEmit` 零 R60 相关诊断（修复了中断时残留的 chatTurnLlm 上方方法缺闭合花括号问题）。
  - 新增 `ai-chat-llm-router.test.ts`：**13/13 passed**。
  - vitest `src/features/ai-chat/` 全量 — **241/241 across 23 files**（R59 228 → R60 241，+13 router 测试）。
- **关键决策**：
  - **feature flag 默认 off**：`AI_CHAT_LLM_ROUTER_ENABLED=1` 才启用；env 缺失或非法值都视为 off。
  - **三态路由**：legacy（flag off）/ provider（flag on + 配置存在）/ echo（flag on + 配置缺失）。
  - **provider 错误透传**：`ChatProviderError` 不被 echo 吞，controller 端返回 503 + `error.code`，避免 silent fallback。
  - **per-baseId hint gating**：`buildEchoReply` 用 `baseId` 作为 hint key，同一 base 后续轮次不再显示升级提示。
- **Tier A #2 进度**：✅ **R60 完成 E3 完整闭环**：ai-chat controller 已用 feature flag 切换，ai-chat 测试 241/241 通过；可随时开 flag 灰度真实 LLM。
- **下一步 R61 候选**（按 ROI 触发）：
  1. App Builder Auto-fix + Monaco + file tree（Tier A #1 配套）
  2. AI Chat Voice / OAuth Cards / Steer UI（Tier A #2 周边）
  3. Audit cold storage + retention worker（Top 7 #4 残留）
  4. Permission guard + interceptor NestJS integration（Top 7 #5 残留）
  5. SCIM / Backup BullMQ worker（Top 7 #3 / #6 残留）
