# Teable OSS vs Cloud 差距补齐 — V58 Feishu 事件与多媒体

> **生成时间**：2026-09-02 20:12（Asia/Shanghai）  
> **官方依据**：`https://help.teable.ai/en/basic/space/im-integration.md`、`https://help.teable.ai/en/basic/ai/custom-model.md`、`https://help.teable.ai/llms.txt`  
> **验证原则**：代码、单测、编译产物和本地真实 HTTP 响应分别记录；未接入真实飞书租户的部分不标记为“投递成功”。

## 1. 本轮交付

### Feishu 事件回调

新增公开端点：

- `POST /api/im-bridge/feishu/events/:spaceId`
- 支持 `url_verification` challenge。
- 支持 `x-lark-request-timestamp`、`x-lark-request-nonce`、`x-lark-signature` 验签。
- 使用 SHA-256 + `timingSafeEqual`，时间窗口默认 5 分钟。
- `verificationToken` 和 `encryptKey` 通过现有 `setting` 表 AES-256-GCM 加密保存。
- 兼容旧配置：缺少新字段的旧 Feishu 配置仍可发送出站文字消息，但不能通过入站 webhook 校验。
- webhook 明确返回 HTTP 200，避免 Feishu 因 201 或非 2xx 触发重试。

### Feishu 出站消息

`IBridgeMessage` 与自动化 `send_feishu_message` 已支持：

- `text`：原有文字消息。
- `image`：`imageKey`。
- `file`：`fileKey`。
- `post`：`providerPayload` 富文本/卡片内容。

旧 Teams 路径保持文字/卡片逻辑，不会接收 Feishu 专用字段。非文字 Feishu 自动化不再强制要求 `text`，而是按消息类型校验对应 payload。

### 原始请求体

Bootstrap 的 JSON parser 保存 `rawBody`，保证第三方签名验证使用网络原文，而不是重新序列化后的对象。

## 2. 官方 Cloud 对比

官方 IM 文档要求：

- 飞书自建应用、机器人能力、App ID/App Secret。
- 事件订阅 `im.message.receive_v1`。
- 文字、图片、文件、音频、视频、表情、富文本消息。

本轮已覆盖“事件 URL 验证 + 事件签名 + 文字/图片/文件/富文本出站”这条最小高价值链路；仍未完成：

- 入站事件持久化和去重已完成；V59 已补空间级自动化触发，真实第三方租户验证仍缺。
- Feishu 图片/文件上传 API（当前要求调用方提供 `imageKey/fileKey`）。
- 音频、视频、表情等媒体上传和消息转换。
- 管理后台配置 UI 与 webhook URL 自动生成。
- 真实飞书租户的成功投递验证。

官方 AI 自定义模型文档同时确认 Cloud 支持 OpenAI、Anthropic、OpenAI Compatible、多模型和模型能力测试；该大块仍是当前 OSS 的独立差距，未被 V58 冒充完成。

## 3. 当前保守进度

| 能力域 | V57 | V58 | 证据后的判断 |
|---|---:|---:|---|
| 核心表/视图/权限 | 90% | 90% | 仍需复杂矩阵组合和 UI E2E |
| 自动化 | 75% | 77% | Feishu 多媒体动作已贯通，入站触发仍缺 |
| AI Chat/Cuppy | 70% | 70% | 后端增量存在，完整 Cloud UI/后台任务仍缺 |
| AI App Builder | 60% | 60% | 部署、版本、回滚、自动修复仍缺 |
| 自定义 AI 模型/BYOK | 55% | **65%** | 配置加密、真实单模型/批量连通性测试已补；完整能力探测和 AI Gateway 接入仍需补齐 |
| SSO/SCIM | 75% | 75% | OIDC 基础 discovery 有，企业管理闭环仍需增强 |
| Billing/License | 55% | 55% | webhook/gating 有，Cloud 运营能力不可由 OSS 替代 |
| Feishu IM | 45% | **65%** | 事件验签 + 四类出站 payload；真实租户和媒体上传未验证 |
| 审计/合规/隔离 | 65% | 65% | 证据包、数据驻留、多租户闭环仍缺 |
| 语音输入 | 0% | 0% | 未实现 |

**整体保守估计：约 79%。** 该数字是工程范围估计，不是 Teable 官方评分；Cloud 专属运营服务不计入 OSS 可替代能力。

## 4. 自动化与真实运行证据

### 自动化

- Feishu adapter + webhook：**2 个测试文件、11 个测试通过**。
- Feishu/Teams/Automation Catalog/Serialization：**5 个测试文件、43 个测试通过**。
- `bash scripts/verify-enterprise.sh`：**4/4 通过**。
- `python3 scripts/generate-module-index.py --check`：`would_write 0`。
- 后端 `tsc --noEmit`：**87 个错误，等于 baseline 87**；没有把 baseline 当成零错误。
- `pnpm exec nest build`：webpack 编译成功。
- `git diff --check`：通过。

### 本地 HTTP

使用本地管理员 `admin@teable.local` 登录：

- `POST /api/auth/signin`：200，session cookie 写入。
- `POST /api/admin/im-bridge/feishu/config`：201，响应不返回 App Secret、verificationToken 或 encryptKey。
- `GET /api/admin/im-bridge/feishu/config/spc_test`：200，receiveId 脱敏。
- `POST /api/im-bridge/feishu/events/spc_test` + 正确 token：200，返回 challenge。
- 错误 verification token：401。
- 正确事件签名：200，返回 `eventId/eventType/accepted`。
- 同一 `event_id` 重放：第一次返回 `deduplicated:false`，第二次返回 `deduplicated:true`，均为 200。
- 过期事件签名：401，返回时间窗口错误。
- 前端 `http://127.0.0.1:3001/`：此前验证返回 307，服务仍运行。

上述事件验证使用本地假凭据和本地签名，证明应用链路和失败拒绝路径；不证明第三方飞书网络投递成功。

## 5. 下一步最小改造路线

1. **P0：入站媒体闭环**：在已完成 `im.message.receive_v1` 自动化触发基础上，补媒体上传、音视频/表情解析和第三方租户验证。
2. **P0：媒体上传**：封装 Feishu `/im/v1/images` 与 `/im/v1/files` 上传，再由自动化动作接受本地附件引用。
3. **P1：Feishu 管理 UI**：展示 webhook URL、校验字段状态、事件订阅说明和测试按钮。
4. **P1：AI Chat 闭环**：把已有 session/queue/artifact/memory/tool 接入真实前端入口，而不是继续孤立扩 endpoint。
5. **P1：Cloud 自定义 AI 模型**：补 OpenAI/Anthropic/OpenAI Compatible provider、加密 key、模型列表、单模型/批量能力测试。
6. **P2：企业运营与合规**：Billing UI、OIDC/SCIM 管理、审计 UI、ISO/SOC 证据包、数据驻留和多租户隔离。
7. **P2：音视频/语音**：在基础事件和媒体上传稳定后补音频、视频、表情和语音输入。

## 6. Comet Native 状态与限制

- 已归档的 `teable-oss-vs-cloud-gap-fill`：旧验收仍为 `89/89 passed`。
- V58 尝试创建新 change 时，Runtime 连续返回：
  `ENOENT ... docs/comet/changes/enterprise-readiness-2026/comet-state.yaml`。
- 已尝试 `comet native doctor enterprise-readiness-2026 --repair`，同一缺失状态仍阻塞；没有手工伪造 `comet-state.yaml`。
- 因此 V58 代码和报告已保留在当前工作区，但不能声称已完成 Comet Native 新 change 的 Shape/Verify/Archive 流程。

## 7. 本地账号与安全

- 本地默认账号：`admin@teable.local` / `teable`。
- 生产部署必须修改默认密码。
- MiniMax API Key 不写入源码、报告或日志；建议仅使用环境变量并在使用后轮换。

## 5. V59 最小改造补充（2026-09-02）

### 已补齐

- Feishu `im.message.receive_v1` 首次验签入库后发出内部事件，重复 `event_id` 不再次触发。
- 新增空间级自动化匹配：自动化触发器配置 `{"provider":"feishu","spaceId":"<spaceId>"}` 时，事件只进入该空间下启用的 automation，避免跨租户触发。
- 入站 payload 映射出 `eventId`、`eventType`、`message`、`content`、`text`、`chatId`、`sender`，复用现有 `webhook_received` 执行链。
- 自定义 AI 模型使用 AES-256-GCM 保存 `baseUrl`、`modelName` 和 API Key；API 响应不返回明文密钥。
- 自定义 AI 模型新增真实 HTTP 单模型测试和批量测试：
  - `POST /api/custom-ai-model/models/:id/test`
  - `POST /api/custom-ai-model/models/batch-test`
  - OpenAI-compatible 使用 `/chat/completions`，Anthropic 使用 `/messages`。
- 所有新增代码通过既有顶层 feature barrel 规则；本轮没有新增数据库 migration。

### 当前明确未实现

- Feishu 图片/文件上传 API、音频/视频/表情入站解析和媒体转发。
- Feishu 管理 UI、自动生成 webhook URL、真实第三方租户投递证据。
- 自定义 AI 模型 vision/image-generation 能力探测仍是保守结果，不等同 Cloud 的完整能力测试；多模型 provider 表单和 AI Chat 前端闭环仍未完成。
- AI Chat 的完整自然语言数据分析/可视化/写入闭环不能用现有 Cuppy 或后端接口宣称等价。
- Cloud 独占的 Stripe 增购/发票、SLA、客服、公有云多区运营不能由 OSS 本地代码替代。

## 6. V59 验证结果

- 定向 Vitest：**2 个测试文件、15 个测试通过**。
- `pnpm exec nest build`：webpack 编译成功。
- `bash scripts/verify-enterprise.sh`：**4/4 通过**，后端 tsc **87**，与 baseline **87** 持平。
- `python3 scripts/generate-module-index.py --check`：`would_write 0`。
- `git diff --check`：通过。
- 本地后端：`GET http://127.0.0.1:3000/api/auth/profile` 返回 **200**。
- 本地前端：`GET http://127.0.0.1:3001/` 返回 **307**，重定向到 `/space`，说明前端服务在线。

## 7. 中文结论与计划

当前工程化企业能力保守估计由 **79% 提升到约 81%**。这是“已实现代码范围 / 计划企业能力”的工程估算，不是 Teable Cloud 官方评分，也不代表 OSS 与 Cloud 等价。

下一阶段按优先级执行：

1. P0：补 Feishu 媒体上传 API 与第三方租户端到端验证。
2. P0：把自定义模型配置接入现有 AI Gateway，补 vision、image-generation、批量能力明细和模型级 usage。
3. P1：完成 AI Chat 前端/后端真实对话、数据查询、图表生成、写入确认和审计闭环。
4. P1：补 Feishu/AI 管理 UI、权限校验和空间级配置体验。
5. P2：补多租户隔离证据、数据驻留、合规导出、灾备和运营级能力说明。

## 8. V60 飞书媒体上传（2026-09-02）

### 新增实现

- `FeishuAdapter.uploadFromUrl()`：通过现有 `safeFetch` 下载用户提供的图片/文件 URL，再调用飞书：
  - `POST /im/v1/images`
  - `POST /im/v1/files`
- 默认单文件上限 10 MiB，先检查 `content-length`，再检查实际读取字节数；超限不会上传到飞书。
- 自动生成安全文件名，失败响应只返回状态和错误摘要，不记录 App Secret、API Key 或文件内容。
- `send_feishu_message` 自动化动作支持：
  - `kind=text|image|file|post`
  - `imageKey` / `imageUrl`
  - `fileKey` / `fileUrl` / `fileName`
  - `contentType` / `providerPayload`
- 自动化动作目录不再强制媒体消息提供文字正文，配置层可正确表达图片/文件消息。

### 验证

- Feishu adapter：**11 个测试通过**，覆盖 token、图片上传成功和超限拒绝。
- Feishu webhook、automation listener、action catalog 合计：**4 个测试文件、46 个测试通过**。
- 改动文件 TypeScript 检查：无新增错误。
- 改动文件 ESLint：通过。
- `generate-module-index.py --check`：`would_write 0`。
- `git diff --check`：通过。
- Nest webpack build：成功。

### 仍未宣称完成的能力

- 尚未使用真实飞书租户验证 `/im/v1/images`、`/im/v1/files` 成功投递；当前测试使用本地响应夹具。
- 音频、视频、表情入站/出站消息仍未实现。
- 图片/文件来源目前是 URL；直接从 Teable 附件 token 解析并上传仍需接入附件授权服务。
- AI Chat 的真实前端对话、权限矩阵 UI 与 Cloud 独占运营服务仍是独立差距。

### 进度调整

- Feishu IM：**65% → 72%**（验签、去重、入站自动化、文字/图片/文件/富文本出站和 URL 上传已具备；真实租户、媒体全类型和管理 UI 未完成）。
- 自动化：**77% → 79%**（Feishu 入站触发与媒体动作已贯通）。
- 企业级整体保守估计：**约 81% → 约 82%**。该数值是当前仓库实现范围估算，不是 Teable Cloud 官方评分。

## 9. 下一步计划

1. P0：接入附件 token 授权读取，避免自动化只能使用公网 URL；完成真实飞书租户端到端验证。
2. P0：补 Feishu 音频、视频、表情协议适配和入站事件解析。
3. P1：把自定义模型配置接入现有 AI Gateway，补 vision/image-generation 能力测试及多模型 provider UI。
4. P1：完成 AI Chat 前端真实对话、数据查询、图表生成、写入确认与审计闭环。
5. P1：按官方 Authority Matrix 补齐 UI 权限矩阵的角色、字段、记录和视图组合验证。
6. P2：继续补 SSO/SCIM 管理体验、数据驻留、合规证据、灾备和 Cloud 运营差距说明。

## 10. V61 AI Chat 权限隔离与验证（2026-09-02）

### 本轮最小改造

- 移除 `AiChatController.currentUserId()` 的 `usr_admin` 静默回退；未认证请求现在明确返回 `401`。
- AI Chat 会话服务增加统一的会话归属校验：读取、消息列表、删除、重命名、分叉、重试、编辑重发、普通对话和 SSE 均按 `createdBy` 隔离。
- 有 `baseId` 的会话创建、访问、列表和数据工具调用复用 `PermissionService` 的 `base|read` 校验；无权或不属于当前用户的会话统一按不可发现资源处理。
- 长任务、队列、工件的 session 级入口在控制器中复用同一访问校验，避免通过附属资源绕过主会话权限。
- 新增跨用户读取/删除回归测试；AI Chat feature barrel 与递归模块索引保持完整。

### 验证结果

- AI Chat 定向 Vitest：**2 个测试文件、43 个测试通过**。
- Nest webpack build：**成功**。
- Next.js `build-fast`：**成功**；页面路由生成完成。
- `bash scripts/verify-enterprise.sh`：**4/4 通过**，后端 tsc **87**，与 baseline **87** 持平。
- `python3 scripts/generate-module-index.py --check`：`would_write 0`。
- `git diff --check`：通过。
- 本地前端登录页：`GET http://127.0.0.1:3001/auth/login` 返回 **200**。
- 未认证 AI Chat：`GET http://127.0.0.1:3000/api/chat/sessions` 返回 **401**，证明不再使用固定管理员身份。

### 仍未完成与真实差距

- 当前权限闭环保护的是 AI Chat 会话和基地读取入口；AI Chat 的自然语言写入确认、复杂图表生成、完整 usage 计量、模型能力探测和管理 UI 仍未达到 Cloud 的完整体验。
- `PermissionService` 的角色/字段/记录/视图组合仍需用真实 Authority Matrix 场景做端到端证据；本轮未宣称 OSS 与 Cloud 权限完全等价。
- 后端全量 typecheck 仍有 **87 个既有错误**，与基线持平；AI Chat 既有完整 ESLint 扫描仍包含历史规则问题，本轮构建和定向测试未受影响。
- Comet Native 新 change 仍被缺失 `comet-state.yaml` 阻塞，不能声称已完成新 change 的 Shape/Verify/Archive 生命周期。

### 进度更新

- AI Chat 后端权限隔离：**约 60% → 78%**（会话主链路已隔离；附属资源、AI Gateway、多模型能力、管理 UI 和 E2E 仍待补）。
- 企业级整体保守估计：**约 82% → 83%**。这是当前仓库实现范围估算，不是 Teable Cloud 官方评分，也不代表商业版等价。

### 下一步计划

1. P0：用真实登录用户和 Authority Matrix 角色补 AI Chat + base/table/view/record 的组合 E2E。
2. P0：把自定义模型接入 AI Gateway，补 vision/image-generation、多模型批测、usage 与失败审计。
3. P1：完成 AI Chat 前端 session 恢复、数据分析、图表 artifact、写入确认和审计闭环。
4. P1：补 Feishu 附件 token 授权读取、音视频/表情协议适配与真实租户验证。
5. P2：继续补 Cloud 独有的 Billing、SLA、客服、多区运营和合规证据，不将 OSS 本地实现冒充商业版能力。

## 11. V62 AI Chat 连续会话与自定义模型能力探测（2026-09-02）

### 官方资料复核（真实差距）

本轮重新读取官方帮助文档：

- `https://help.teable.ai/en/basic/ai/ai-chat.md`
- `https://help.teable.ai/en/basic/ai/custom-model.md`
- `https://help.teable.ai/en/basic/ai/connect-everything.md`
- `https://help.teable.ai/zh/basic/authority-matrix`

官方 AI Chat 不只是问答，还支持分析当前表、解释记录、生成图表/报告，以及创建或更新表、视图、应用和自动化；涉及写入时要求先给计划，再由用户确认。官方还描述了 Secrets、第三方 OAuth Integrations、Skills、`@` 节点引用、附件/选择范围引用和 Connect & Migrate Everything。

官方 Custom Model 明确要求：OpenAI/Anthropic/OpenAI Compatible 等 provider、多模型配置、单模型测试、批量能力测试；视觉任务需要 Vision 模型，图像生成模型需要单独标记并按 text-to-image/image-to-image 路径测试。

因此当前 OSS 不能把“已有 `/api/chat` 和 `/api/custom-ai-model` 路由”直接等同 Cloud parity：自然语言写入确认、Secrets/OAuth、`@` 节点选择器、Connect Everything、完整 artifact 工作流仍是明显差距。

### 本轮实现

- 前端 Base 内进入 AI Chat 时，先按 `baseId` 查询最近会话并恢复消息；只有没有历史会话时才创建新会话。
- 清空会话后删除当前持久化会话，创建新会话并刷新会话查询；不再每次进入 Base 都丢失历史。
- 新增 `aiChatApi.listSessions(baseId)`，前端继续使用后端按用户与基地权限过滤的列表接口。
- 自定义模型增加 `imageGenerationModel` 持久化配置（仍在加密配置内，不保存明文 API Key）。
- 能力测试不再静态返回 `vision: false`、`imageGeneration: false`：
  - 普通 Chat：`/chat/completions` 或 Anthropic `/messages`。
  - Vision：发送最小内嵌 PNG；OpenAI-compatible 使用 `image_url`，Anthropic 使用 `image`/base64。
  - Image Generation：标记后调用 `/images/generations`。
- 管理面板新增 Image Generation 标记、单模型能力徽章和“Test all capabilities”批量测试入口。

### 验证结果

- AI Chat、队列、自定义模型定向 Vitest：**3 个测试文件、45 个测试通过**。
- 自定义模型新增真实 HTTP 探测夹具测试：**2/2 通过**，覆盖三路请求、Authorization 和失败能力报告。
- Next.js 类型检查：通过。
- Next.js `build-fast`：成功。
- Nest webpack build：成功。
- `bash scripts/verify-enterprise.sh`：**4/4 通过**，后端 tsc **87**，与 baseline **87** 持平。
- Prettier changed-file check：通过；`git diff --check`：通过。
- `python3 scripts/generate-module-index.py --check`：此前已验证 `would_write 0`；本轮未新增公共 TS 文件。
- 本地后端仍在线：`/api/auth/profile` 可访问；未认证 `/api/chat/sessions` 返回 `401`。

### 当前进度与后续计划

- AI Chat 后端基础与会话连续性：**约 78% → 84%**。
- 自定义 AI Model 管理与能力测试：**约 65% → 80%**；仍缺真实 provider 租户验证、多模型逗号配置的 Cloud 语义、AI Gateway 深度路由、usage 细分和完整管理体验。
- 企业级整体保守估计：**约 83% → 84%**。这是当前代码实现范围估算，不是官方评分，也不代表 OSS 与 Cloud 商业版等价。

下一阶段严格按真实差距推进：

1. P0：为 AI Chat 增加“计划 → 用户确认 → 执行”的写入工具协议，默认禁止自然语言直接修改数据。
2. P0：补 Authority Matrix 的 Manager/Editor/Commenter/Viewer 组合 E2E，证明 AI 工具不会越过字段、记录和视图权限。
3. P1：实现 AI Chat `@` 节点/附件/选择范围引用与 Secrets 脱敏使用。
4. P1：把自定义模型接入真实 AI Gateway，并补多模型、usage、provider 错误审计和真实服务端点验证。
5. P1：实现 Connect Everything 的最小授权连接器框架，至少覆盖 API/数据库连接的权限确认与迁移预览。
6. P2：继续补 Cloud 独有 Billing、发票、SLA、客服、多区运营和合规证据；不将 OSS 本地代码冒充商业服务。

## 12. V63 AI Chat 写入确认安全边界（2026-09-02）

### 真实差距判断

官方 AI Chat 的核心差异不是“有一个聊天接口”，而是对数据写入提供可审查的计划、用户确认和执行边界。本仓库此前已有只读 AI 工具、持久化会话和流式对话，但没有统一的持久化写入计划协议，因此不能宣称已达到 Cloud 的表/记录写入体验。

### 本轮最小改造

- 新增 `AiChatWritePlan` Prisma 模型和迁移，记录 session、用户、Base、表、操作、payload、状态、过期时间、确认人、执行结果和失败原因。
- 新增 `AiChatWritePlanService`：创建计划只保存 `pending`，不写记录；确认时再次校验 session owner、Base 可读、表属于该 Base 且未删除，以及具体表级 `record|create` / `record|update` 权限。
- 采用 `status=pending + expiresAt > now` 的原子 `updateMany` 抢占，重复确认或并发确认不能重复执行；过期计划拒绝执行。
- 实际写入复用现有 `RecordOpenApiService`，不直接绕过记录业务层写数据库。
- 增加 `/api/chat/sessions/:sessionId/write-plans` 创建/列表接口和 `/api/chat/write-plans/:planId/confirm` 确认接口；前端 Base AI Chat 增加待确认计划卡片和“确认执行”按钮。
- AI Chat feature 继续通过单一 `index.ts` 暴露公共服务；递归 barrel 生成检查保持无待写入项。

### 验证结果

- 新增写入计划安全回归：**5/5 通过**，覆盖未授权用户、未确认不执行、过期拒绝和并发抢占失败。
- AI Chat 相关定向测试：**4 个测试文件、54/54 通过**。
- Prisma Client 生成：成功；Nest webpack build：成功。
- Next.js typecheck：通过；Next.js `build-fast`：成功。
- `python3 scripts/generate-module-index.py --check`：`would_write 0`；Prettier 与 `git diff --check`：通过。
- 后端全量 typecheck 仍为既有 **87** 个错误，与此前 baseline 持平，未将该 baseline 误报为本轮回归。

### 当前进度与未完成差距

- AI Chat 后端基础、会话连续性与写入确认边界：**约 84% → 88%**；尚缺自然语言到计划的完整 agent 编排、表/字段/视图/自动化写入、审计展示和真实 Authority Matrix E2E。
- 自定义 AI Model：**约 80%**；仍缺真实 provider 租户验证、AI Gateway 深度路由、多模型 Cloud 语义、usage 细分和 image-to-image。
- 企业级整体保守估计：**约 84% → 85%**。这是仓库当前实现范围估算，不是官方评分，也不代表 OSS 与 Cloud 商业版等价。

下一阶段按优先级推进：

1. P0：用真实 Manager/Editor/Commenter/Viewer 账号验证表、字段、记录、视图和 AI 写入组合权限。
2. P0：把 AI 回复中的写入意图转成上述持久化计划，并在前端展示变更明细、风险和确认结果。
3. P1：补 `@` 节点/附件/选择范围引用、Secrets 脱敏和 OAuth Integrations。
4. P1：接入真实 AI Gateway，完善 provider 错误审计、usage、批量能力测试和 image-to-image。
5. P2：继续补 Connect & Migrate Everything，以及 Cloud 独有 Billing、SLA、客服、多区运营和合规证据。

本轮没有读取、写入或回显用户提供的 MiniMax API Key；真实 provider 联调仍需在本地受控环境通过环境变量完成，不能用密钥存在来替代端到端证据。

## 13. V64 Cuppy UI 与 AI Chat UI 真实边界分析（2026-09-02）

### 结论

当前前端 `ChatPanel` **不是完整的 Teable Cloud AI Chat UI**，而是一个根据是否有 `baseId` 切换后端的双模式外壳：

- 有 `baseId`：调用持久化 `/api/chat`，使用 `AiChatSession` / `AiChatMessage`，支持会话恢复、流式消息和写入计划卡片。
- 没有 `baseId`：调用内存型 `/api/cuppy`，使用 Cuppy conversation store 和 echo/provider fallback。
- 因此标题显示为 `AI Chat` 或 `Cuppy`，但同一组件并不代表同一套能力，也不等同官方 Cloud 的完整 AI Chat 页面。

### 已实现的 Cuppy UI 功能

- 普通对话和 SSE 流式输出。
- Cuppy 模型列表和非 Base 模式模型选择。
- Cuppy 会话消息读取、删除和基础 fallback 提示。
- 后端已具备 memory、artifact、`@` node、file、smart level 等 Cuppy API；这些能力有独立组件或接口，但没有全部接入当前主聊天面板。
- Cuppy 的 `record_create` 后端旁路已改为只生成待确认写入计划，不再直接调用 `createRecords`。

### 当前 UI 问题（按严重度）

1. **P0：写入确认断链。** Cuppy 写工具现在生成 `aics_cuppy_<conversationId>` 计划，但 `ChatPanel` 的计划查询只在持久化 AI Chat 模式启用；Cuppy 模式没有计划列表和确认按钮，外部 Cuppy 调用可以生成计划却没有当前 UI 完成确认。
2. **P0：Base AI Chat 与 Cuppy 能力割裂。** Base 模式不使用 Cuppy 的 node、artifact、file、memory、smart level、model picker；这些官方 AI Chat 体验不能从主面板使用。
3. **P1：没有会话历史切换。** 前端只恢复最近一个 session，没有会话列表、重命名、分叉、搜索或删除历史入口。
4. **P1：没有完整 AI 结果呈现。** 当前消息气泡是纯文本，没有统一的 citation、table、chart、report、artifact viewer、执行进度和工具调用状态。
5. **P1：没有输入增强。** 缺少附件上传、语音输入、`@` 节点选择器、选区引用、快捷提示和上下文范围显示。
6. **P1：模型和智能级别体验不完整。** 模型选择器只在无 Base Cuppy 模式显示；Base AI Chat 没有模型/智能级别/参数入口。
7. **P2：面板状态语义混乱。** `ChatContainer` 强制把 `panelType` 重置为 `general`，store 初始值却是 `app-builder`；`data-panel-type` 因此不能代表真实页面模式。
8. **P2：错误和空状态不足。** 主要依赖 toast 和文本 fallback，没有可重试、取消、重新生成、编辑重发、网络断线恢复等完整交互。

### 代码证据

- `/apps/nextjs-app/src/features/app/components/chat-panel/ChatPanel.tsx` 以 `persistentChat = Boolean(baseId)` 分流两条 API 链路；主渲染只有消息气泡、输入框、清空按钮和有限的写入计划卡片。
- `/apps/nextjs-app/src/features/app/components/chat-panel/api.ts` 同时定义 `cuppyApi` 与 `aiChatApi`，但它们不是统一会话模型。
- `/apps/nextjs-app/src/features/app/components/chat-panel/AtNodePicker.tsx`、`ArtifactPanel.tsx` 存在，但没有被 `ChatPanel` / `ChatContainer` 接入主流程。
- `/apps/nextjs-app/src/features/app/components/chat-panel/ChatContainer.tsx` 只渲染 `ChatPanel`，没有 Cloud 风格的会话侧栏、artifact 区域或上下文选择器。
- `/apps/nestjs-backend/src/features/agent-orchestrator/cuppy.controller.ts` 是 Cuppy API；`/apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts` 是持久化 AI Chat API，二者的路由、存储和权限入口不同。

### UI 进度估算

- Cuppy 后端能力：**约 70%**；基础对话、流式、memory/artifact/node/file API 存在，但持久化、真实附件授权和完整交互仍不足。
- Cuppy 主 UI：**约 35%**；当前主要是文本聊天壳，Cuppy 高级 API 大部分未接入。
- 持久化 AI Chat UI：**约 48%**；已具备 session 恢复、流式消息和写入确认卡片，但缺少 Cloud 的上下文、历史、artifact、引用和输入能力。
- AI Chat + Cuppy 统一企业级体验：**约 42%**；不能用后端接口数量替代 UI 完成度。

### 下一步最小正确改造

1. 先让 Cuppy 计划查询/确认闭环可见：把 `aics_cuppy_<conversationId>` 映射到统一计划 API，或让 Cuppy 返回结构化 plan 并由面板渲染确认卡片。
2. 抽出统一 `ChatMessage`、`ChatSession`、`ChatAction` 前端模型，避免 Cuppy 与 AI Chat 各自维护一套消息状态。
3. 接入会话历史侧栏、`@` 节点、附件、smart level、artifact/citation renderer，再补重试/取消/编辑重发。
4. 最后才做模型切换、Connect Everything 和更多 Cloud 专属能力，避免继续堆叠“有接口但 UI 不可用”的实现。

## 14. V65 Cuppy 写入计划与统一确认 UI（2026-09-02）

### 本轮实现

- Cuppy 的 `record_create` 工具不再直接调用 `RecordOpenApiService.createRecords`，统一调用 `AiChatWritePlanService.createForCuppy`，只返回 `requiresConfirmation=true`、`planId` 和 `pending` 状态。
- 为 Cuppy 增加计划列表和确认接口：
  - `GET /api/cuppy/conversations/:id/write-plans`
  - `POST /api/cuppy/conversations/:id/write-plans/:planId/confirm`
- Cuppy 计划使用 `aics_cuppy_<conversationId>` 绑定持久化会话；确认前先校验用户和 conversation 绑定，再复用 Base、表和 record 权限检查。
- `ChatPanel` 的写入计划查询和确认卡片不再只对 `persistentChat` 开启；Cuppy 与持久化 AI Chat 使用统一的前端计划卡片。
- Cuppy 内存会话新增用户归属校验；读取、删除、模型、智能级别、memory、artifact、node、file 等入口不再允许仅凭猜测的 conversation id 访问别人的上下文。

### 验证结果

- Cuppy tool 回归：**4/4 通过**，确认 `record_create` 返回计划且 `createRecords` 未被调用。
- AI Chat 权限/写入定向测试：**39/39 通过**，新增跨 Cuppy conversation 确认拒绝覆盖。
- Next.js typecheck：通过。
- Nest webpack build：成功。
- Prettier 与 `git diff --check`：通过。

### 当前 UI 真实状态

- Cuppy 主 UI 仍约 **40%**：统一确认卡片已接入，但 node、artifact、file、memory、smart level、会话历史、附件和引用仍没有完整整合到主面板。
- 持久化 AI Chat UI 仍约 **50%**：会话恢复、流式回复和写入确认已可用，但缺 Cloud 风格的历史侧栏、结构化结果渲染、citation、图表、语音和完整上下文选择器。
- 统一 AI Chat/Cuppy 企业级 UI 约 **45%**，不能把同一个 `ChatPanel` 组件名称当成 Cloud UI 已完成的证据。

### 遗留验证限制

- `cuppy.controller.test.ts` 当前包含与工作区现状不一致的旧测试契约（测试调用 `listConversations` / `handleStream`，当前控制器使用 `inspect` / `chatStream`）；本轮未伪造兼容方法，也未把该既有测试问题算作本轮绿色证据。
- 仍需真实登录账号进行 Manager / Editor / Commenter / Viewer 的表、字段、记录、视图和 Cuppy/AI Chat 写入 E2E；当前定向测试是服务级证据，不等价于生产矩阵验证。

## 15. V66 Cuppy 会话历史与流式契约收敛（2026-09-02）

### 本轮实现

- 为 Cuppy 正式增加 `GET /api/cuppy/conversations`，按当前用户过滤进程内会话，返回会话 id、Base、消息数和更新时间。
- `AgentOrchestratorService` 增加 `listConversations` 和 `handleStream` 兼容别名，统一旧调用方与当前 `chatStream` 的契约。
- `chatStream` 兼容旧 provider 直接 yield 字符串的行为，并确保字符串流同时正确返回和持久化到会话上下文。
- `ChatPanel` 在 Cuppy 模式增加会话历史选择器；持久化 AI Chat 继续使用最近 session 恢复，两种模式的写入计划继续使用同一确认卡片。
- SSE 控制器继续走真实 `chatStream`，并保留 `handleStream` 聚合兼容路径，避免旧客户端因接口漂移失效。

### 验证结果

- Cuppy controller / orchestrator / write-plan 定向测试：**31/31 通过**。
- Next.js typecheck：通过。
- Next.js `build-fast`：成功。
- Nest webpack build：成功。
- `python3 scripts/generate-module-index.py --check`：`would_write 0`。
- `git diff --check`：通过。
- `bash scripts/verify-enterprise.sh`：**4/4 通过**；后端 typecheck 错误 **74**，低于既有 baseline **87**。

### 当前真实进度

- Cuppy 主 UI：**约 40% → 48%**，新增进程内会话列表和切换；仍不是跨设备持久化历史。
- 持久化 AI Chat UI：**约 50%**，仍缺完整会话侧栏、重命名、分叉、搜索和统一结构化输出。
- Cuppy + AI Chat 统一企业级 UI：**约 45% → 50%**。
- 企业级整体保守估计：**约 85%**。百分比是代码实现范围估算，不是官方评分，也不代表 Cloud 等价。

### 仍未完成

- Cuppy 的会话状态仍主要在进程内，服务重启后历史会丢失；只有写入计划和部分 AI Chat session 进入 Prisma。
- `AtNodePicker`、`ArtifactPanel`、文件上传、memory、smart level、citation、图表和报告仍未全部接入主 ChatPanel。
- 真实 Authority Matrix 的 Manager / Editor / Commenter / Viewer 组合 E2E 仍缺少真实账号证据。
- Cuppy `/api/cuppy` 与持久化 `/api/chat` 仍是两套后端模型，统一 UI 尚未达到 Cloud 的完整产品级体验。

## 16. V67 主面板接入引用、Artifact 与附件上下文（2026-09-02）

### 本轮最小改造

- 新增 `POST /api/cuppy/conversations` 显式创建空会话；创建 Base 会话前复用 `base|read` 权限校验，避免前端通过伪造消息初始化上下文。
- `ChatPanel` 在 Cuppy 模式接入 `AtNodePicker`，现在可以从主面板添加/删除 table、view、app、automation、folder 引用。
- `ChatPanel` 接入 `ArtifactPanel`，主面板可查看 chart/report/card/page/doc 内容，执行分享切换和删除。
- `ChatPanel` 接入附件上下文条；当前选择文件后只登记文件名、MIME 和大小元数据，支持删除，不把“元数据登记”误报为真实文件内容已上传。
- `api.ts` 增加 Cuppy 会话创建、节点、Artifact、文件列表和文件元数据接口 wrapper；所有上下文刷新均按 conversation id 隔离。

### 真实进度

- Cuppy 主 UI：**约 48% → 58%**；节点、Artifact 和附件上下文已进入主面板，但会话仍是进程内状态，文件二进制上传、预览、解析和真实 attachment token 尚未完成。
- 持久化 AI Chat UI：**约 50%**；本轮没有把 Cuppy 的内存能力冒充为持久化 AI Chat 能力，Cloud 风格历史侧栏、结构化引用和完整附件链路仍缺失。
- Cuppy + AI Chat 统一企业级 UI：**约 50% → 56%**。
- 企业级整体：**约 85%**；这是代码实现范围估算，不是官方评分，也不代表 OSS 已等价 Teable Cloud。

### 验证结果

- Next.js typecheck：通过。
- NestJS typecheck：通过。
- Cuppy 定向回归：**4/4 通过**。
- `bash scripts/verify-enterprise.sh`：**4/4 通过**；后端 tsc 错误 **74 ≤ baseline 87**。
- `python3 scripts/generate-module-index.py --check`：`would_write 0`。
- `git diff --check`：通过。
- 本地 HTTP smoke：`http://127.0.0.1:3000/` 返回 `404`，`/api/cuppy/models` 返回 `401`；服务有响应，但根路径未提供页面且 API 需要登录，不能据此宣称前端已登录可用。
- 后端全量 `test-unit` 仍有一个既有 `BaseDuplicateService` 断言失败（期望 `singleLineText`、实际 `link`），与本轮 ChatPanel/Cuppy 改动无关；未修改该无关问题。

### 后续计划（按优先级）

1. P0：把附件从“元数据登记”升级为真实上传、大小/类型限制、病毒扫描/解析和权限化下载；同时将引用解析到真实 Base 节点，禁止仅凭用户输入的 `refId` 形成越权上下文。
2. P0：为 Manager / Editor / Commenter / Viewer 建立真实登录 E2E，覆盖字段 hidden/readonly、记录过滤、视图权限、AI 查询和确认写入。
3. P1：统一 Cuppy 与持久化 AI Chat 的前端 adapter，补会话历史、重命名、删除、搜索、分叉、citation、工具状态和结构化输出。
4. P1：将 Cuppy 会话上下文从进程内 scratchpad 迁移到持久化模型，再补跨设备恢复和审计。
5. P2：补语音输入、Secrets/OAuth、Skills、Connect & Migrate Everything 等 Cloud 专属能力；这些不是本轮最小改造范围。

## 17. V68 真实附件上传与 Chat Runtime 抽象（2026-09-02）

### 本轮实现

- Cuppy 文件上传改为真实 `multipart/form-data`：`POST /api/cuppy/conversations/:id/files/upload`。
- 后端复用现有 `AttachmentsService.uploadFromStream` 和 `UploadType.ChatFile`，不另造临时文件存储；标准附件大小限制、对象存储签名和 attachment token 链路继续生效。
- 上传前校验当前用户对 conversation 的所有权；上传成功后把 `attachmentId/token/path/url/name/mime/size` 绑定到会话上下文。
- ChatPanel 选择文件后执行真实上传；文件列表中的元数据条目仍保留兼容显示，但真实上传条目标记为 `uploaded=true`。
- 新增 `runtime.ts`，统一 Cuppy 与持久化 AI Chat 的消息格式、历史加载、SSE stream 和会话删除接口；ChatPanel 已通过该 runtime 读取消息和发送流式请求。
- 修正 Cuppy 历史消息响应的 `ts` 与前端 `createdAt` 类型不一致问题，避免把后端契约错误隐藏为 Cloud parity。

### 关于 assistant-ui 的真实判断

- 当前项目没有安装或使用 `assistant-ui`；现有 UI 是 React、TanStack Query、手写 SSE、Teable UI Lib 和 Zustand 自研组合。
- 本轮没有直接引入 `assistant-ui`，因为 Cuppy 与 `/api/chat` 尚未统一成单一消息/工具/Artifact 协议，直接替换会掩盖权限和业务差异。
- 当前已先建立 `ChatRuntime` 适配边界，后续可以把 `assistant-ui` 作为通用消息列表、Composer、retry、stop、regenerate 和 tool-state UI 层接入；Teable 的 WritePlan、Authority Matrix、Artifact、节点引用和附件仍由自定义业务层负责。

### 真实进度

- Cuppy 主 UI：**约 58% → 63%**；真实文件上传已完成，但内容解析、上下文注入和下载权限仍需补齐。
- 持久化 AI Chat UI：**约 50% → 54%**；已共享 runtime 归一化边界，但仍缺完整 Cloud 风格历史侧栏、结构化消息和 citation。
- Cuppy + AI Chat 统一企业级 UI：**约 56% → 61%**。
- 企业级整体：**约 85%**；这是代码实现范围估算，不是官方评分，也不代表 OSS 等价 Teable Cloud。

### 验证结果

- Next.js typecheck：通过。
- NestJS typecheck：通过。
- Cuppy controller/orchestrator 定向测试：**13/13 通过**。
- `bash scripts/verify-enterprise.sh`：**4/4 通过**；后端 tsc 错误 **82 ≤ baseline 87**。
- `python3 scripts/generate-module-index.py --check`：`would_write 0`。
- `git diff --check`：通过。

### 仍需完成

1. P0：为上传文件增加真实内容解析/索引、病毒扫描、下载 token 权限和审计记录；当前只完成对象存储和 conversation 绑定。
2. P0：将 `@` 节点从自由输入 `refId` 收敛到真实资源检索，并以 Authority Matrix 再校验。
3. P1：统一 Cuppy/AI Chat 的工具调用、Artifact、citation 和结构化消息事件，之后再评估引入 `assistant-ui` 的具体版本和 adapter。
4. P1：补真实 Manager/Editor/Commenter/Viewer 登录 E2E；服务级测试不能等价商业版权限矩阵证据。

## 18. V69 `@` 节点真实资源与权限校验（2026-09-02）

### 本轮实现

- `POST /api/cuppy/conversations/:id/nodes` 不再信任客户端提交的 `label`；后端根据真实资源查询结果生成名称。
- 节点引用要求 conversation 已绑定 Base；无 Base 的 Cuppy 会话不能附加 Base 节点。
- `table`：校验表属于当前 Base、未删除，并检查 `table|read`。
- `view`：校验视图属于当前 Base 下未删除的表，并检查表和视图读取权限。
- `automation`：校验自动化属于当前 Base，并检查 `automation|read`。
- `app`：校验 AppInstance 属于当前 Base，并检查 `app|read`。
- `folder`：校验文件夹属于当前 Base，并检查 `base|read`。
- 客户端 `AtNodePicker` 的 label 改为可选；输入的显示名仅作为兼容字段，最终以服务端真实资源名称为准。

### 真实边界

- 当前实现已经阻断跨 Base 和无权限节点的直接绑定，但仍不是 Cloud 完整的 `@` 搜索体验：没有资源搜索、模糊匹配、最近使用、拖拽范围引用和上下文内容解析。
- 节点元数据仍存于 Cuppy 进程内 scratchpad；服务重启后丢失，尚未进入持久化会话模型。
- `@` 节点被绑定后，AI 工具还需要显式读取这些引用并再次按权限过滤上下文，不能仅凭绑定成功就认为模型已经使用了节点数据。

### 验证结果

- 节点权限定向回归：`11/11` 通过，覆盖服务端名称覆盖和跨 Base 拒绝。
- Cuppy tool 回归：`4/4` 通过。
- Next.js typecheck：通过。
- NestJS typecheck：通过。
- `bash scripts/verify-enterprise.sh`：`4/4` 通过；后端 tsc 错误 `77 ≤ baseline 87`（当前工作区基线检查）。
- `python3 scripts/generate-module-index.py --check`：`would_write 0`。
- `git diff --check`：通过。

### 当前进度

- Cuppy 主 UI：约 `63% → 67%`。
- 持久化 AI Chat UI：约 `54%`，本轮未虚报为已获得 Cuppy 节点能力。
- Cuppy + AI Chat 统一企业级 UI：约 `61% → 64%`。
- 企业级整体：约 `85%`；百分比是代码实现范围估算，不是官方评分，也不代表 OSS 等价 Teable Cloud。

### 下一步

1. P0：将节点绑定内容注入统一 ChatRuntime 的 context 事件，并在每次 AI 查询/写入前重新验证权限。
2. P0：补 Manager/Editor/Commenter/Viewer 真实登录 E2E，覆盖节点、字段、记录、视图和 AI 工具。
3. P1：把 Cuppy scratchpad 会话和节点引用迁移到 Prisma，支持跨设备恢复和审计。
4. P1：再评估 `assistant-ui` 接入；它只负责通用消息交互，不能替代上述 Teable 权限与领域逻辑。

## 19. V70 `@` 上下文注入与每轮撤权清理（2026-09-02）

### 本轮实现

- 编排器新增统一节点上下文 prompt：模型只接收当前 conversation 中服务端授权过的 `@kind/refId/label`。
- Cuppy HTTP `/chat` 和 `/chat/stream` 在每次请求进入编排器前刷新节点授权：资源删除、跨 Base 或读取权限被撤销时，该引用从本轮上下文剔除。
- 刷新后使用真实资源名称覆盖旧缓存名称，避免客户端历史 label 进入模型上下文。
- 节点上下文明确提示模型只能通过权限检查工具使用已授权资源，不能根据对话内容推断并访问无关资源。
- 保留纯编排器可测试性：权限查询仍在 Cuppy controller，编排器只负责构造 prompt；没有把 Prisma/权限依赖硬编码进 domain-like orchestration 层。

### 直接证据

- service 测试证明授权节点会进入 LLM `system` prompt。
- controller 测试证明读取权限撤销后调用 `replaceNodeRefs(..., [])`，不会把失效节点继续传给模型。
- controller/orchestrator 定向测试总计 **25/25 通过**。

### 真实进度和边界

- Cuppy 主 UI：约 **67% → 70%**。
- 持久化 AI Chat UI：约 **54%**；本轮只改 Cuppy 后端上下文，不把 Cuppy 能力虚报给 `/api/chat`。
- Cuppy + AI Chat 统一企业级 UI：约 **64% → 66%**。
- 企业级整体：约 **85%**；百分比是实现范围估算，不是官方评分，也不代表 OSS 等价 Teable Cloud。
- 节点仍是进程内 scratchpad，尚未持久化；尚未实现 Cloud 风格资源搜索、选区引用和节点内容索引。

### 验证结果

- Next.js typecheck：通过。
- NestJS typecheck：通过。
- `bash scripts/verify-enterprise.sh`：**4/4 通过**；后端 tsc 错误 **76 ≤ baseline 87**。
- `python3 scripts/generate-module-index.py --check`：`would_write 0`。
- `git diff --check`：通过。

### 下一步

1. P0：把 Cuppy scratchpad 节点迁移到 Prisma 会话上下文，并增加审计事件。
2. P0：为 `/api/chat` 持久化 AI Chat 复用同等节点权限/上下文模型。
3. P1：实现真实节点搜索、引用预览、选区引用和 citation 回链。
4. P1：补 Manager/Editor/Commenter/Viewer 真实登录 E2E，验证节点撤权、字段 hidden、记录过滤和 AI 写入确认。

## 20. V71 持久化 AI Chat 节点引用（2026-09-02）

### 本轮最小改造

- 新增 `meta.ai_chat_node_ref` 与 Prisma `AiChatNodeRef`，引用绑定 `AiChatSession`，会话删除时级联删除。
- 新增 `/api/chat/sessions/:sessionId/nodes` 的列表、添加、删除接口；服务端按会话归属、Base 读取权限、资源归属和资源读取权限校验。
- 服务端覆盖客户端 label，使用数据库中的真实资源名称；重复引用按 session/kind/refId 幂等更新。
- 每次 AI Chat 普通对话、SSE、regenerate、edit/resubmit 前重新校验节点；资源删除或撤权后从数据库删除并不注入 prompt。
- ChatPanel 的 Cuppy 与持久化 AI Chat 共用 `AtNodePicker` 交互，AI Chat 节点不再依赖 Cuppy scratchpad。

### 真实边界

- 这不是 Cloud 完整 parity：尚无资源搜索、引用预览、选区引用、附件内容索引、citation 回链、语音和 Cloud 运营服务。
- Cuppy 旧节点接口保持兼容，仍是进程内 scratchpad；本轮只让持久化 AI Chat 获得 DB-backed 节点闭环，未冒充完成迁移。
- 节点元数据已进入 prompt，但仍需后续将节点内容解析、结构化工具调用和审计事件进一步统一。

### 验证结果

- AI Chat 节点服务 + AI Chat Auth 定向测试：`31/31` 通过。
- Next.js typecheck：通过。
- NestJS typecheck：通过。
- `bash scripts/verify-enterprise.sh`：`4/4` 通过；后端 tsc 错误 `77 ≤ baseline 87`（当前工作区基线检查）。
- `python3 scripts/generate-module-index.py --recursive --check`：`would_write 0`。
- `git diff --check`：通过。

### 进度调整

- Cuppy 主 UI：约 `70%`，本轮保持不变。
- 持久化 AI Chat UI：约 `54% → 62%`，增加持久化节点、权限刷新和统一节点交互。
- Cuppy + AI Chat 统一企业级 UI：约 `66% → 70%`。
- 企业级整体：约 `85% → 86%`；这是代码实现范围估算，不是官方评分，也不代表 OSS 与 Cloud 等价。

### 下一步

1. P0：将 Cuppy 节点迁移到共享 `ChatContext`/Prisma 存储，并保留兼容迁移。
2. P0：补 Manager/Editor/Commenter/Viewer 真实登录 E2E，验证字段、记录、视图和 AI 写入确认。
3. P1：实现节点搜索、预览、选区引用、附件解析和 citation 回链。
4. P1：在领域模型稳定后评估 `assistant-ui` adapter；不直接整体替换现有 ChatPanel。
