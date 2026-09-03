# Teable OSS vs Cloud 差距分析与补齐 — V37 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 自动表/视图上下文注入（Stage 37）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V36 AI Chat Streaming

## 1. 真实差距

Cloud 版 AI Chat（[app.teable.ai](https://app.teable.ai)）在用户打开 AI 面板时，
会感知当前所在的 Base / Table / View / 选中行，并把这些上下文作为
system prompt 自动注入，**无需用户复制粘贴**。
V36 之前 OSS 仅支持：

- `POST /api/chat/sessions/:id/turn` 接收一个可选 `context` 字段
- 完全靠前端手工塞 schema / 行数据

→ 体验上：AI 不"看见"用户当前页面，所有上下文都得手动粘贴。

## 2. 真实进度（V36 → V37）

| 维度 | V36 | V37 |
|---|---|---|
| AI Chat 单轮 | ✅ | ✅ |
| AI Chat 流式（SSE） | ✅ | ✅ |
| AI Chat 自动上下文注入 | ❌ | ✅ |
| AI Chat 错误降级（context 缺失） | ❌ | ✅ |
| 会话无 baseId 时的实例级配置回退 | ❌（抛 500） | ✅ |

V37 实测在真实 `Permission Test` base / `Tasks` table / `Grid view` 上，
`MiniMax-M3` 正确返回了 5 个字段（Name / Count / Status / AI Auto Target / Batch Test）
及其类型，并基于真实样本行总结出"AI 自动化工作流测试表"的语义。

## 3. 最小改造实现

### 3.1 新增 `AiChatContextService`（185 行）
- 文件：`apps/nestjs-backend/src/features/ai-chat/ai-chat-context.service.ts`
- 公开能力：
  - `resolve({ tableId, viewId })` → 查 `prisma.tableMeta` + 关联字段，按 `order` 排序，
    过滤 `deletedTime`，返回 `{ tableName, fields[], rows[], rowCount }`
  - 若提供 `viewId` 且 `RecordService` 可用，调用 `getRecordsFields(tableId, { viewId, projection, take: 20 })`
    拉前 20 行；每个单元格 `truncateValue()` 截到 200 字符，避免 prompt 膨胀
  - `render(ctx)` 输出结构化文本（`Table: … Fields: … Sample rows: …`）
- 错误降级：表不存在 / view 行查询失败 → `logger.warn` + 返回 `null`，
  Chat 仍然正常回复（无上下文）

### 3.2 `AiChatAuthService` 改造（最小改动）
- 新增 `resolveContextPrefix(session, explicitContext)` 私有方法
  - 优先级：调用方 `context` > 自动上下文 > 空
- `chatTurn()` 与 `chatTurnStreaming()` 都调用该方法
- `session.baseId ?? 'global'` → `session.baseId ?? ''`，避免非真实 baseId 触发
  `AiService.getAIConfig()` 里的 `findUniqueOrThrow` 500

### 3.3 `AiService.getAIConfig(baseId)` 改造（兼容无 baseId 路径）
- 把 `findUniqueOrThrow` 替换为 `findUnique` + `??null`
- 当 `baseId` 为空时跳过空间级 `integration` 查询，只用实例级 AI 配置

### 3.4 模块 & barrel
- `ai-chat.module.ts` 加 `RecordModule` import + `AiChatContextService` provider/export
- `ai-chat/index.ts` 导出 `AiChatContextService` 与常量
  `MAX_CONTEXT_ROWS / MAX_CONTEXT_FIELD_VALUE_LENGTH`

## 4. 自动化验证

### 4.1 单元测试（20 项全部通过）
```
✓ src/features/ai-chat/ai-chat-context.service.spec.ts (9 tests)
✓ src/features/ai-chat/ai-chat.auth.service.spec.ts (11 tests)
Test Files  2 passed (2)
Tests       20 passed (20)
```

覆盖：
- 上下文解析：无 tableId → null；表不存在 → null；无 viewId → 无 rows
- 上下文注入：`chatTurn` 自动注入；显式 context 优先；无 tableId 不调用 resolve
- 流式：SSE 端点内部也注入上下文
- 错误降级：`recordService` 抛错 → rows 为空但 ctx 非空
- 截断：长字符串截到 200 + ellipsis

### 4.2 全模块回归（133 项全部通过）
```
✓ ai-gateway-models.service.spec.ts (4)
✓ ai.service.spec.ts (13)
✓ ai-chat-context.service.spec.ts (9)
✓ ai-chat.auth.service.spec.ts (11)
✓ ai-field.auth.service.spec.ts (35)
+ 其它 ai / ai-field spec
Test Files  8 passed (8)
Tests       133 passed (133)
```

### 4.3 后端构建
```
webpack 5.90.1 compiled successfully in 6629 ms
```

### 4.4 真实 MiniMax-M3 E2E（端口 3000，新构建）

**基础数据**
- Base: `bse9SHNH2rrWTD4CsYQ`（Permission Test）
- Table: `tblLxvWC26Cyv08cotd`（Tasks）
- View: `viwyZ4THdDNXpxOZiAb`（Grid view）
- Fields: `Name / Count / Status / AI Auto Target / Batch Test`

**Case A — 自动上下文（chatTurn）**
```
POST /api/chat/sessions/{sid}/turn
Body: {"userMessage":"List the field names of the current table."}
→ 200 OK
promptTokens:    277    （注入上下文后）
completionTokens: 119
Content: 列出全部 5 个字段（Name / Count / Status / AI Auto Target / Batch Test）
```

**Case B — 自动上下文（SSE 流式）**
```
POST /api/chat/sessions/{sid}/turn/stream
Body: {"userMessage":"Summarize in one sentence what kind of records we have."}
→ 40 个 SSE data: 事件 + done:true
promptTokens:    415
completionTokens: 140
Content: "The table contains records of various AI-related tasks and prompts,
         including automatic trigger tests, batch testing, and content generation
         requests on diverse topics such as programming, machine learning, and
         creative writing."
```

**Case C — 无 baseId 不注入（降级）**
```
POST /api/chat/sessions  body={"model":"MiniMax-M3"}
POST /api/chat/sessions/{sid}/turn  body={"userMessage":"What is 2+2?"}
→ 201 OK
promptTokens:    14     （无上下文）
Content: "2 + 2 equals 4."
```

## 5. 进度更新

| 模块 | V36 | V37 |
|---|---|---|
| AI Field（文本/评分/图片/批量/自定义 prompt/幂等） | 99% | 99% |
| AI Chat（会话/历史/单轮/流式/上下文） | 40% | **60%** |
| 全局企业级能力 | 82% | **84%** |

仍不能宣称 Cloud 全量等价：Skills / Artifact / Memory / 多轮 function calling /
24h 长任务 / 应用构建器 / 自定义 AI 模型仍未涉及。

## 6. 下一步候选（V38+）

1. **V38 — AI Chat Skills**：`GET /api/chat/skills` 列出可用 Skills（`@base` / `@field`
   / `@table` / `@record`），自动注入 session 首条 system prompt。
2. **V39 — AI Chat Multi-turn Tool Use**：把 `RecordService` 包装成工具，模型可自主
   调用 `list_fields` / `get_records` 等 API。
3. **V40 — AI Chat Memory**：会话间持久化用户偏好与最近主题，下次打开自动加载。
4. **V41 — AI Chat 24h 长任务**：超过 60s 的请求转入 `ai_chat_task` 表，后台异步执行。
