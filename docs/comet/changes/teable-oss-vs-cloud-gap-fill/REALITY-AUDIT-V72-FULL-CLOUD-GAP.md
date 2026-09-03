# Teable OSS 与 Cloud 商业版全量真实差距审计（V72）

> 审计时间：2026-09-02（Asia/Shanghai）  
> 审计对象：当前工作区 `/Users/louloulin/appx/teable`  及官方公开文档  
> 审计原则：**接口存在不等于商业行为完成；模块存在不等于端到端可用；单元测试通过不等于 Cloud parity。**

## 1. 结论先行

当前仓库不是“只有基础表格”的半成品，也不是“已等价 Cloud”的版本。真实状态是：

| 层级 | 当前判断 | 证据强度 | 说明 |
|---|---:|---|---|
| 数据库、表格、视图、公式、协作基础 | 高 | 高 | 代码规模和既有测试证明基础产品成熟。 |
| 企业安全基础（SSO、SAML、SCIM、TOTP、审计、备份、限流） | 中高 | 中 | 多数有后端模块和定向测试，但真实部署、真实身份源、灾备恢复证据不完整。 |
| Authority Matrix 业务语义 | 中 | 中低 | 角色、表、字段、记录过滤、视图、导入导出、应用/工作流接口存在；缺真实四角色登录 E2E 和组合矩阵证据。 |
| AI Chat / Cuppy | 中 | 中 | 后端能力明显增加，Cuppy 有工具和写入确认；Cloud 需要的文件解析、语音、OAuth、Skills UI、选区、上下文压缩、完整 Artifact/citation 尚未闭环。 |
| AI App Builder | 中低 | 中低 | CRUD、版本、回滚、Secrets、文件和基础预览存在；真正的沙箱生成、构建、部署、Auto-fix、公开 URL 和多设备预览没有被当前代码完整证明。 |
| Connect & Migrate Everything | 低到中 | 中低 | 多个源适配器和探测/读取端点存在，但 Cloud 是 AI Chat skill 驱动的迁移闭环，字段/关系/附件转换仍有明确 pending。 |
| Cloud 运营能力 | 低 | 高 | Billing、Stripe、发票、按席位计费、增购 credit、SLA、客服、公有云多区不是当前 OSS 的等价目标。 |

**综合工程进度建议采用 58%～66% 区间，而不是 85%～86%。**

这个区间是“对照官方可观察用户能力、按闭环完成度加权”的估计，不是官方评分。若只统计后端模块接线，会得到更高数字；若统计 Cloud 用户从 UI 完成任务的比例，会显著降低。当前最可信的单值是 **约 62%**。

## 2. 审计方法与官方基线

已核对的官方资料：

- `https://help.teable.ai/en/basic/ai/ai-chat.md`
- `https://help.teable.ai/en/basic/ai/custom-model.md`
- `https://help.teable.ai/en/basic/ai/app-builder.md`
- `https://help.teable.ai/en/basic/ai/connect-everything.md`
- `https://help.teable.ai/zh/basic/authority-matrix.md`
- `https://help.teable.ai/en/basic/space/space-permission.md`
- `https://help.teable.ai/en/basic/space/billing.md`
- `https://help.teable.ai/en/basic/admin-panel/overview.md`
- `https://help.teable.ai/en/deploy/architecture.md`

官方基线不是“有一个 HTTP endpoint”，而是完整用户闭环。例如官方 AI Chat 明确包含：当前表/视图上下文、选中行列单元格、PDF/Excel/Word/图片附件、`@` 节点、语音输入、模型和 Intelligence、Secrets、OAuth Integrations、Skills、上下文用量与压缩、文件管理、可编辑消息队列、分析/图表/报告以及创建或更新数据和节点。

## 3. 能力矩阵

状态定义：

- **已证实**：实现和针对关键行为的测试/运行证据同时存在。
- **部分可用**：核心路径存在，但 Cloud 还有明显用户能力或安全边界缺口。
- **仅有骨架**：有模块、表或 endpoint，但未证明真实下游行为。
- **缺失/Cloud 独占**：当前仓库没有等价实现，或官方明确是 Cloud 运营服务。

### 3.1 基础数据与协作

| 能力 | 当前代码事实 | 状态 | 主要差距 |
|---|---|---|---|
| 表、字段、记录、视图、公式、排序、过滤、聚合 | `packages/core`、`record`、`table`、`view` 等大量成熟模块 | 已证实 | 需要持续做版本兼容和全量回归，不是本轮主要差距。 |
| 实时协作、评论、历史、撤销/重做 | 对应模块和数据库模型存在 | 部分可用 | 商业版的通知、订阅、审计语义和跨实例恢复证据不完整。 |
| 附件对象存储 | `AttachmentsService`、S3/MinIO 路径和 Cuppy multipart 上传已接通 | 部分可用 | AI Chat 文件仍缺解析、索引、病毒扫描、内容权限、下载 token 细粒度审计。 |
| 导入/导出 | Airtable、Notion、Sheets 及多个导入模块存在 | 部分可用 | 迁移字段类型、关系、附件、错误恢复和 AI Chat skill 统一编排未证明。 |

### 3.2 Authority Matrix 与协作角色

官方权限矩阵要求：自定义角色/部门角色、多角色合并、表访问、指定视图、记录筛选、字段查看/更新/创建、导入导出、应用/工作流访问、文件夹隐藏，以及 Manager/权限矩阵管理员豁免规则。

| 项目 | 当前代码事实 | 状态 | 证据缺口 |
|---|---|---|---|
| 角色、成员、表/字段/记录/视图规则 | `permission-matrix.controller.ts/service.ts` 已有 CRUD 和规则接口 | 部分可用 | 主要是服务级测试，缺真实 Manager、Editor、Commenter、Viewer 登录 E2E。 |
| 字段 hidden / readonly | Permission 热路径和记录接口已有改造 | 部分可用 | 需真实 API 响应验证：hidden 字段为 null、readonly 写入 403、主字段约束。 |
| 记录过滤 | `record-filter` 规则存在 | 部分可用 | 需多角色合并、当前用户条件、分页/排序/聚合/AI 工具一致性 E2E。 |
| 视图权限 | `view-access` 相关服务和节点检查存在 | 部分可用 | 需证明未授权视图在树、API、`@` picker、AI context 和导出中都消失。 |
| 应用/工作流/文件夹 | `PermissionRoleNode.nodeType` 和 `app/workflow` 接口存在 | 仅有骨架到部分可用 | 需要真实 UI/API 组合场景；readiness 当前直接 `alwaysEnabled`，不能作为行为证据。 |
| 导入/导出权限 | controller/service 已有端点 | 部分可用 | 需要真实角色越权拒绝、导入/导出数据范围和附件范围验证。 |

**真实判断：Authority Matrix 后端接口约 60%～70%，商业用户可验证闭环约 40%～55%。** 当前不能称为“商业版权限矩阵已完整等价”。

### 3.3 AI Chat / Cuppy

当前后端证据：

- `/api/chat` 已有持久化 session/message、SSE、搜索、导出、偏好、usage、tools、long task、Artifact、queue、write plan 和节点引用。
- `/api/cuppy` 已有对话、SSE、模型、memory、Artifact、节点、附件、写入确认等接口。
- `AiChatNodeRef` 已加入 Prisma，并在普通对话、SSE、regenerate、edit/resubmit 前刷新权限。
- `ChatRuntime` 已在前端定义 Cuppy/AI Chat 的归一化边界。

关键代码证据：

- `/Users/louloulin/appx/teable/apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts`
- `/Users/louloulin/appx/teable/apps/nestjs-backend/src/features/ai-chat/ai-chat.auth.service.ts`
- `/Users/louloulin/appx/teable/apps/nestjs-backend/src/features/ai-chat/ai-chat-node-ref.service.ts`
- `/Users/louloulin/appx/teable/apps/nestjs-backend/src/features/agent-orchestrator/cuppy.controller.ts`
- `/Users/louloulin/appx/teable/apps/nextjs-app/src/features/app/components/chat-panel/ChatPanel.tsx`
- `/Users/louloulin/appx/teable/apps/nextjs-app/src/features/app/components/chat-panel/runtime.ts`

| Cloud AI Chat 能力 | 当前实现 | 状态 | 真实差距 |
|---|---|---|---|
| 基础文字对话/SSE/历史 | `/api/chat` 和 `/api/cuppy` 存在 | 部分可用 | 两套 runtime/存储仍未完全统一。 |
| 当前表/视图和过滤结果上下文 | `AiChatContextService` 可加载表/视图上下文 | 部分可用 | 当前筛选/排序结果、选择范围、选择快照没有证明完整注入。 |
| 选中行/列/单元格/区域 | Grid 有 selection cache 相关代码 | 仅有骨架 | ChatPanel/runtime 没有将 selection chips、快照和权限上下文完整传给 AI Chat。 |
| `@` 表/视图/App/Automation/Folder | 服务端资源归属、权限和持久化节点引用已实现 | 部分可用 | 没有官方级资源搜索、树选择、预览、选区引用和 citation 回链；Cuppy 旧节点仍是进程内 scratchpad。 |
| 文件上传 | Cuppy 真实 multipart 上传到附件存储 | 部分可用 | PDF、Excel、Word、图片解析/索引/预览/下载权限/病毒扫描/AI context 未闭环；持久化 AI Chat 尚未复用完整文件模型。 |
| 语音输入 | 未发现 ChatPanel 的麦克风/转写实现 | 缺失 | 官方明确有录音、完成/丢弃、转写到输入框。 |
| 模型选择 | Cuppy 有简单模型列表；AI Chat session 有 model 字段 | 部分可用 | ChatPanel 对持久化 AI Chat 未提供与 Cloud 等价的模型/Intelligence 菜单闭环。 |
| Intelligence | 后端 smart level 有实现 | 部分可用 | 前端输入控制和模型菜单未达到官方交互。 |
| Secrets | App Builder secrets 存在 | 部分可用 | 没有证明 AI Chat sandbox secrets 的独立、只写、环境变量注入和审计闭环。 |
| OAuth Integrations | Notion/Sheets 等导入有 OAuth | 部分可用 | AI Chat 对话中的 Connect/Skip 卡片和通用第三方 OAuth runtime 未实现。 |
| Skills | `/api/chat/skills`、skill service 存在 | 部分可用 | ChatPanel 没有官方 `+ → Skills` 导入/启用/Personal/Base/Space 范围 UI。 |
| Context usage/compact | history 有固定 take，memory 有服务 | 仅有骨架 | 没有 context token ring、token counts、可观察 compact 事件和 Cloud 级压缩策略。 |
| 文件管理 | Cuppy 有 list/add/remove；持久化 Chat 无对等完整文件管理 UI | 部分可用 | 缺预览、下载、目录、解析状态和附件消息绑定。 |
| 队列 | Prisma queue、取消、重排、后台 drain 已有 | 部分可用 | ChatPanel 发送时仍以 `isStreaming` 禁止提交，不是官方“继续发送并排队、编辑、Steer”体验。 |
| Artifact | AI Chat DB Artifact 和 Cuppy scratchpad Artifact 都存在 | 部分可用 | 统一消息事件、版本、图表/报告渲染、分享权限和 citation 仍未统一。 |
| 查询/图表/报告 | read-only tools、Artifact 检测存在 | 部分可用 | 查询意图仍是有限正则路由，不是完整 function calling/数据分析/图表生成闭环。 |
| 数据写入 | write plan + 二次确认 + 权限重校验 | 已证实的最小闭环 | 目前主要覆盖 record create/update；创建/更新表、字段、视图、App、Automation 的 Cloud 级计划和回滚未完整覆盖。 |

**AI Chat/Cuppy 真实判断：后端能力约 60%，可见 Cloud 用户体验约 35%～45%，统一产品闭环约 45%～55%。** “有对话框”不能称为 Cloud AI Chat parity。

### 3.4 Custom AI Model / MiniMax 等模型配置

| 能力 | 当前事实 | 状态 |
|---|---|---|
| Provider/模型 CRUD | `custom-ai-model.controller.ts` 有 providers、models CRUD | 部分可用 |
| 单模型测试/批量测试 | 有 `/models/:id/test` 和 `/models/batch-test` | 部分可用 |
| OpenAI/Anthropic/OpenAI-compatible | Provider 字段和 UI 存在 | 部分可用 |
| Vision/image generation 能力测试 | `imageGenerationModel` 字段存在，但完整真实能力探测和消费链路未证明 | 仅有骨架到部分可用 |
| 接入 AI Chat、AI Field、Automation、App Builder | 各模块有模型配置路径，但没有一份端到端矩阵证明每种 provider/model 被所有能力正确使用 | 部分可用 |
| 凭据安全 | 配置加密/只写语义在部分模块存在 | 部分可用 |

用户提供的 MiniMax key 不纳入审计输出；当前报告不读取、不回显、不验证该密钥。

### 3.5 AI App Builder 与 Sandbox

App Builder controller 有 app CRUD、deploy、rollback、versions、secrets、files；前端也有管理面板和基础预览。可是官方 App Builder 还要求 AI chat editing、第三方 OAuth、Skills、文件管理、Desktop/Tablet/Mobile 预览、元素选择、Monaco editor、ZIP download/import、公开发布、自定义域、登录、版本回滚和 Auto-fix。

| 能力 | 当前判断 |
|---|---|
| App 元数据、版本、Secrets、文件 API | 部分可用 |
| 真实生成代码、构建和部署到隔离运行时 | 未证实；controller 的 deploy 不能单独证明真实部署 |
| Sandbox | `SandboxAgentService` 能读取配置、查询/终止外部 `/v1/sandboxes`；未见本地创建/启动/会话桥接闭环，当前运行时未配置时明确返回 `runtime-not-configured` |
| Monaco、多设备、元素选择、ZIP | 部分 UI 或基础预览存在，不能据此证明完整 Cloud 体验 |
| Auto-fix | 未看到完整“编译错误→AI 修复→重新构建→验证”证据 |
| App 登录、自定义域、公开 URL | 有部分相关 API/模块，但未完成真实公开部署 E2E |

**真实判断：App Builder 约 35%～50%，Sandbox runtime 约 10%～25%。** 这是当前最大企业级差距之一。

**P0 安全发现：** `/Users/louloulin/appx/teable/apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder.controller.ts` 的 `currentUserId()` 在缺少 `user.id` 时回退到 `usr_admin`。这与 AI Chat controller 的显式 `401` 策略不一致；即使外层 guard 当前通常会拦截请求，也不应在业务 controller 内保留管理员身份回退。应改为统一抛出未认证错误，并补一条无 session/无 CLS user 的 HTTP 测试，证明请求不会进入 App Builder service。

### 3.6 Automation、Integrations、Migration

| 能力 | 当前事实 | 状态 |
|---|---|---|
| 记录/定时/Webhook 触发和动作 | automation 模块、catalog、canvas、listener 存在 | 部分可用到已证实 |
| AI action / script | `AutomationAiBuilderService` 和 `run_script` 路径存在 | 部分可用；脚本隔离、资源限额和生产安全需独立审计 |
| Feishu/Teams | Feishu 验签、去重、文字/图片/文件/富文本发送已有定向测试 | 部分可用；真实租户、全媒体类型和后台 UI 未证实 |
| Airtable/Notion/Sheets/多源导入 | 多个 source module 存在 | 部分可用 |
| Connect Everything AI skill | 官方是 AI Chat 中连接、授权、review、迁移表/字段/记录/关系/附件；当前主要是各源 API/导入器 | 未等价 |
| 通用 connector | REST/JSON/CSV 等 generic registry 存在 | 部分可用；不能替代官方全迁移语义 |

### 3.7 企业安全、管理、计费与运营

| 能力 | 当前判断 | Cloud 差距 |
|---|---|---|
| SSO/OIDC/SAML/SCIM/TOTP | 后端模块和测试存在 | 真实 IdP、用户生命周期、管理员 UI、失败恢复和多租户 E2E 不完整。 |
| 审计日志/导出/保留 | 后端模型、查询、导出、retention 存在 | 需确认所有 record/table/permission/AI/sandbox/admin 行为完整入审计。 |
| Admin Panel | 大量 API 和部分 UI 存在 | 官方列出的 Users、Spaces、Settings、AI Settings、Skills、Sandbox、Query Ops、Outbox、AI queue 等需逐页核对，不能只以 readiness endpoint 代替。 |
| Backup/Restore/DR | 模块和表存在 | 真实备份产物、恢复演练、跨区域 RPO/RTO 无证据。 |
| Data residency / customer KMS | 模块和接口存在 | 真实数据路由、加密密钥轮换、外部 KMS 失败行为无证据。 |
| Cloud Billing | OSS 有 billing controller/模型骨架 | 官方 billing 是 Cloud-only；Stripe checkout、按席位订阅、发票、credit add-on、续费/取消不应宣称 OSS 等价。 |
| Self-hosted license | License capability guard 和 plan 配额存在 | 这是自托管商业授权，不是 Cloud billing 的替代实现。 |
| SLA、客服、公有云多区、运营 | 不在仓库可替代范围 | Cloud 独占。 |

## 4. readiness 指标的真实性问题

`EnterpriseReadinessService` 的注释明确写着 capability 只要“runtime / DB state wired”就算 enabled，并且大量调用 `alwaysEnabled(...)`。例如：

- `billing_invoice`、`billing_credit`
- `db_connector`、`db_connector_sync`
- `data_db_connection`
- `approval_workflow`
- `dashboard`、`dr_canvas`
- `comment_subscription`
- `app_module_wire`

这些字段反映“模块/表/路由接线”，不是“商业用户可以完成完整任务”。因此：

1. `summary.enabled / total` 不能作为 Cloud parity 百分比。
2. `cloudGapCoverage` 把 `partial` 与 `implemented` 合并统计，容易高估完成度。
3. migration gap 中多项自身 notes 写明“field translation pending follow-up”，却仍标为 `implemented`；这属于接线完成，不是迁移完成。
4. `sandbox-agent` 运行时未配置时返回 `runtime-not-configured`，但 readiness 不能因此自动降低 App Builder/Sandbox 的行为分数。

建议把 readiness 改成三个互不混淆的指标：

```text
moduleWiring: 代码模块、DI、路由是否存在
behaviorVerified: 关键业务行为是否有 HTTP/E2E 证据
cloudParity: 是否覆盖官方用户可观察能力和限制
```

最终报告应分别输出 `wired / behaviorVerified / parity / blockedByExternalService`，而不是单个 `enabled`。

## 5. 真实进度计算建议

本次采用 100 个可观察能力单元进行保守估算：

| 能力域 | 权重 | 保守完成度 | 加权结果 |
|---|---:|---:|---:|
| 数据与协作基础 | 25 | 85% | 21.25 |
| Authority Matrix 与安全 | 20 | 55% | 11.00 |
| AI Chat/Cuppy | 20 | 45% | 9.00 |
| AI Model/BYOK | 8 | 60% | 4.80 |
| App Builder/Sandbox | 10 | 35% | 3.50 |
| Automation/Integration/Migration | 8 | 55% | 4.40 |
| Admin/SSO/SCIM/Audit/Backup | 6 | 65% | 3.90 |
| Cloud Billing/运营 | 3 | 0%（OSS 不可替代） | 0.00 |
| **合计** | **100** |  | **57.85%** |

如果把 Cloud 独占运营能力从分母剔除，OSS 可替代产品能力约为 **59%～66%**；因此对外应写 **约 62%**，并同时列出分项，而不能写 85% 以上的单值。

## 6. 当前最重要的缺口排序

### P0：必须先补的真实产品闭环

1. **统一 AI Chat/Cuppy 领域模型**：持久化 session、message、tool event、attachment、artifact、citation、node ref、selection ref 使用一个协议；Cuppy scratchpad 迁移到 DB-backed `ChatContext`。
2. **补 AI Chat 前端完整交互**：当前表/视图/选择范围 chip、资源搜索、预览、模型/Intelligence、文件解析状态、队列编辑/Steer、错误重试、上下文用量和语音输入。
3. **把附件变成 AI 可用内容**：解析 PDF/Excel/Word/图片，建立异步索引和权限校验，加入病毒扫描、下载 token 和审计。
4. **补真实 Authority Matrix E2E**：至少四个角色 × 表/视图/字段/记录/导入导出/App/Workflow × UI/API/AI 工具，验证撤权即时生效。
5. **补 AI 写入面**：除 record create/update 外，覆盖 table/field/view/app/automation 的计划、差异预览、确认、幂等、失败回滚和审计。

### P1：企业可用性

1. 真实接入至少一个 OIDC/SAML/SCIM 身份源和一个外部 OAuth 集成。
2. 将 Custom AI Model 真实接入 AI Chat、AI Field、Automation、App Builder，补 provider × capability 矩阵测试。
3. 完成 Sandbox create/start/stop/stream/cleanup、资源隔离、超时、日志和失败恢复。
4. 将迁移器从“探测/读取 endpoint”升级为可 review 的表/字段/关系/附件迁移事务。
5. 管理后台逐页核对官方清单，补 Skills、AI queue、Sandbox、Query Ops、License、Users/Spaces UI。

### P2：运营与长期治理

1. Backup restore 演练、RPO/RTO、跨区和数据驻留证据。
2. KMS 密钥轮换、租户隔离、DLP、合规导出和安全事件审计。
3. Cloud Billing、Stripe、发票、seat proration、credit add-on 仅在明确要做商业 SaaS 时单独立项；不要在 OSS readiness 中伪装完成。

## 7. `assistant-ui` 决策

当前代码没有安装或使用 `assistant-ui`。直接整体替换不是最佳第一步，因为缺口主要是 Teable 领域协议和权限，而不是消息气泡组件。建议顺序：

```text
Teable ChatContext / domain events
  → Cuppy + persistent AI Chat adapters
  → assistant-ui 的 thread/composer/tool/artifact UI
  → Teable 权限、写入确认、附件、citation 和审计插件
```

只有在上述领域事件稳定后，才评估引入 `assistant-ui`；引入它不能自动获得语音、文件解析、OAuth、权限矩阵或沙箱能力。

## 8. 审计证据与限制

已运行/确认：

- 官方文档抓取与逐项核对。
- 当前代码静态扫描、路由扫描、模块和测试文件盘点。
- 既有 `scripts/verify-enterprise.sh` 门禁此前通过，但它主要验证 root references、barrel、tsc baseline，不能证明 Cloud parity。
- 当前本地 `/api/auth/profile` 可返回 HTTP 200，前端根路径可返回 `307 → /space`；这只能证明服务存活。
- 当前 shell 未配置可用 `TEABLE_ADMIN_TOKEN`，因此未把 `/api/admin/enterprise-readiness` 的动态 JSON 当作本轮证据。

未宣称：

- 未宣称真实 Cloud Base 页面等于本地实现。
- 未宣称任何真实第三方租户、真实支付、真实 IdP、真实 Sandbox 已成功。
- 未读取、打印或验证用户提供的 MiniMax API key。
- 未把既有单元测试数量当作端到端商业版证明。
