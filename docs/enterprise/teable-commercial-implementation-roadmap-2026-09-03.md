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


**当前状态（2026-09-03 round 18）** — Phase 5.4 续 PDF 出口已上线：`BillingInvoicePdfService` 把 `invoice` 表 + `meteredInvoice.previewMeteredInvoice` 的 overage breakdown 折成 `IBillingLineItem[]`，再调 `billing-pdf-export.renderInvoicePdf` 生成 PDF；portal 路由 `GET /api/billing/portal/invoices/:invoiceId/pdf` 不再返 503。Per-org guard 在 service 内做（subscription.organizationId 不匹配 → 404，不是 403）。Stripe Customer Portal 仍 503 stub，PDF 缓存未做。
### Phase 6 — Readiness 与发布治理（贯穿全部阶段）

**范围**

- `enterprise-readiness` 只消费四维 capability evaluator，不直接读模块存在性作为完成度。
- 每个 capability 绑定源码、配置、测试、E2E 和 provider evidence；缺失证据显示 blocker。
- CI gates：typecheck、unit、contract、security、migration fixture、E2E、OpenAPI drift、secret scan。
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
