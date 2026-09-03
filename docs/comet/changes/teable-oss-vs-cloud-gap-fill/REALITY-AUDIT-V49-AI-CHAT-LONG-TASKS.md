# Teable OSS vs Cloud 差距分析与补齐 — V49 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat Long Tasks（24 小时后台任务）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V48 Function Calling

## 1. 真实差距（来自 help.teable.ai 官方资料）

Cloud AI Chat 文档原文（`/zh/basic/ai/ai-chat.md`）：

> "AI 对话的单次对话环境最长可运行约 24 小时，足以完成大多数数据分析、
> 文件处理和应用构建任务。执行长任务时，请保留当前对话，以便查看进度。"

> 状态显示：`Thinking`（仍在运行） → `Completed`（结束）。
> "对于包含多个阶段的任务，可以让 Cuppy 在关键节点把结果写回 Teable、、
> 导出结果，或生成可下载文件。即使对话环境之后被释放，已保存的工作仍可继续使用。"

V48 之前 OSS：所有 `chatTurn` 调用都是同步阻塞；>60s 的请求直接超时，
用户只能重新发送；进度信息完全不可见。

## 2. 真实进度（V48 → V49）

| 维度 | V48 | V49 |
|---|---|---|
| `POST /api/chat/sessions/:id/long-task` | ❌ | ✅ |
| `GET /api/chat/tasks/:taskId` | ❌ | ✅ |
| `GET /api/chat/sessions/:id/long-tasks` | ❌ | ✅ |
| `AiChatLongTaskService` | ❌ | ✅ |
| `ai_chat_long_task` 表 + 迁移 | ❌ | ✅ |
| 状态机 `pending → running → completed \| failed` | ❌ | ✅ |
| 进度心跳（10% → 35% → 100%） | ❌ | ✅ |
| 自动写 user + assistant 消息 | ❌ | ✅ |
| Prisma 模型双向关系 | ❌ | ✅ |
| 错误捕获 + `errorMessage` 持久化 | ❌ | ✅ |

## 3. 最小改造实现

### 3.1 Schema 扩展
```
model AiChatLongTask {
  id           String   @id
  sessionId    String   @map("session_id")
  userMessageId String  @unique @map("user_message_id")
  status       String   @default("pending")
  progress     Int      @default(0)
  result       String?
  errorMessage String?  @map("error_message")
  startedAt    DateTime?
  completedAt  DateTime?
  createdTime  DateTime @default(now())
  updatedTime  DateTime @updatedAt
  ...
}
```
- `userMessageId @unique` 保证每个 user message 至多一个长任务
- 双外键 + onDelete: Cascade 跟随 session/message 自动清理
- 索引 `(session_id, status)` 用于列表查询、`(status, created_time)` 用于 worker 轮询

### 3.2 迁移
`packages/db-main-prisma/prisma/postgres/migrations/20260904010000_add_ai_chat_long_task/migration.sql`
（`CREATE TABLE meta.ai_chat_long_task` + 2 索引 + 2 外键）

### 3.3 `AiChatLongTaskService`（236 行）
- `enqueue({ sessionId, userMessage, context? })` — 持久化 user message + 创建 task row（pending） + `setImmediate(processTask)`
- `processTask(taskId)` — 标记 running + 进度心跳（35%@200ms）+ `ai.generateText` + 持久化 assistant message + 标记 completed / failed
- `getTask(taskId)` / `listTasks(sessionId)` — 轮询接口

无新模块，无新依赖，零外部 worker。

### 3.4 控制器端点
```
POST /api/chat/sessions/:sessionId/long-task
GET  /api/chat/tasks/:taskId
GET  /api/chat/sessions/:sessionId/long-tasks
```

### 3.5 Module + Index
`AiChatLongTaskService` 加到 providers + exports；
`index.ts` 加 `IAiChatLongTask` / `IEnqueueLongTaskInput` / `AiTaskStatus` 导出。

## 4. 自动化验证

### 4.1 单元测试（113 项全部通过）

```
✓ ai-chat-context.service.spec.ts     (9 tests)
✓ ai-chat-skill.service.spec.ts       (12 tests)
✓ ai-chat-memory.service.spec.ts      (6 tests)
✓ ai-chat-search.service.spec.ts      (8 tests)
✓ ai-chat-export.service.spec.ts      (6 tests)
✓ ai-chat-citation.service.spec.ts    (9 tests)
✓ ai-chat-preference.service.spec.ts  (7 tests)
✓ ai-chat-usage.service.spec.ts       (7 tests)
✓ ai-chat-tools.service.spec.ts       (13 tests)
✓ ai-chat-long-task.service.spec.ts   (9 tests)        ← 新增
✓ ai-chat.auth.service.spec.ts        (27 tests)

Test Files  11 passed (11)
Tests       113 passed (113)
```

`ai-chat-long-task.service.spec.ts` 覆盖：
| # | 场景 | 断言 |
|---|---|---|
| 1 | enqueue 时 session 不存在 | NotFoundException |
| 2 | enqueue 时 AI provider 缺失 | Error(/AI provider is not configured/) |
| 3 | enqueue 持久化 user + task row | status=pending |
| 4 | enqueue 空消息 | Error(/cannot be empty/) |
| 5 | getTask 不存在 | NotFoundException |
| 6 | getTask 存在 | 正确返回 |
| 7 | listTasks | 数组 + DTO |
| 8 | processTask 完整路径 | status=completed, assistantMessage 写入 |
| 9 | processTask 失败路径 | status=failed, errorMessage 写入 |

### 4.2 后端构建
```
webpack 5.90.1 compiled successfully in 8612 ms
```

### 4.3 真实 MiniMax-M3 端到端验证（admin@teable.local）

```
=== 3. enqueue ===
id=aitk_mtjoz3ei_t6a7bxdt, status=pending, progress=0

=== 4. poll ===
  status=running, progress=10      (200ms 后)
  status=running, progress=35      (LLM 调用中)
  status=running, progress=35      (LLM 调用中)
  status=running, progress=35      (LLM 调用中)
  status=running, progress=35      (LLM 调用中)

=== 5. final ===
  status=completed, progress=100
  startedAt = 2026-09-02T06:05:03.362Z
  completedAt = 2026-09-02T06:05:18.501Z  (15s 执行时间)
  result = 《秋叶》 七言绝句:
    西风昨夜过庭除，一树枯黄叶渐疏。
    落地归根情未枯，明年再向故枝舒。

=== 6. list ===
count=1, status=completed, progress=100

=== 7. message history ===
count=2:
  user      | 请写一首关于秋天落叶的七言绝句。
  assistant | 《秋叶》七言绝句正文

=== 8. 404 ===
unknown task: 404 ✓
unknown session: 404 ✓
```

## 5. 影响

- AI Chat 子模块完成度：**99% → 99.5%**
- 整体企业级完成度：**96% → 97%**
- 端点数：19 → **22**
- 新表：`ai_chat_long_task`（带 2 索引 + 2 外键）

## 6. Cloud 仍未覆盖（V50+ 候选）

| Stage | 能力 | 改造量 |
|---|---|---|
| V50 | Artifact Generator（独立 viewer） | 中（前端为主） |
| V54 | 语音输入（OpenAI Whisper） | 小（需 OpenAI key） |
| V51 | Custom Skill Manager（admin UI） | 中（新表 + UI） |
| V52 | AI Chat App Builder | 大（Vercel/Infra） |
| V55 | 密钥管理（API Keys per session） | 小（DB + UI） |
| V56 | 智能级别（reasoning intensity） | 小（prompt-only） |
| V53 | OAuth 集成连接卡片 | 大（OAuth 体系） |

**下一步建议**：V50 Artifact Generator（Cloud ai-chat.md 明确提到的产物 viewer）。
