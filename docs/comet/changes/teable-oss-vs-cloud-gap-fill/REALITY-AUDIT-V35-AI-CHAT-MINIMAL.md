# Teable OSS vs Cloud V35 — AI Chat（AI 对话）最小真实实现

**审计日期**：2026-09-02（Asia/Shanghai）  
**依据**：官方文档 [AI 对话](https://help.teable.ai/zh/basic/ai/ai-chat) 明确 Cloud §ai/ai-chat：自然语言与数据交互、会话管理、上下文感知、对话历史、模型选择。V34 报告把 AI 对话列为下一阶段。云端 AI 对话是大模块（含 Skills、Artifact、Memory、OAuth、文件上传、24h 长任务等），本轮以最小子集补齐：**会话管理 + 对话历史 + 单轮真实 LLM 调用**。

## 本轮实现

| 能力 | 当前实现 |
|---|---|
| 会话管理 | ✅ `POST/GET/DELETE /api/chat/sessions` + `GET /api/chat/sessions/:id` |
| 对话历史 | ✅ `ai_chat_session` + `ai_chat_message` 两张表（meta schema） |
| 单轮对话 | ✅ `POST /api/chat/sessions/:id/turn`：持久化 user + 调用 AI + 持久化 assistant |
| 真实 LLM 执行 | ✅ 复用 `AiService.generateText`（MiniMax-M3 验证通过） |
| 会话上下文 | ✅ 可选 `context` 字段（注入表格/视图信息） |
| 自动标题 | ✅ 首条 user 消息的前 40 字自动作为 title |
| 对话历史记忆 | ✅ 最近 20 轮作为 prompt 历史 |
| Token 计量 | ✅ `promptTokens`/`completionTokens`/`durationMs` 记录 |
| 删除级联 | ✅ 删除会话自动级联删除消息（FK ON DELETE CASCADE） |

## 代码位置

- `packages/db-main-prisma/prisma/postgres/schema.prisma`：`AiChatSession` / `AiChatMessage` Prisma 模型。
- 数据库表：`meta.ai_chat_session`、`meta.ai_chat_message`（已通过 SQL 创建并生成 Prisma client）。
- `apps/nestjs-backend/src/features/ai-chat/ai-chat.types.ts`：类型。
- `apps/nestjs-backend/src/features/ai-chat/ai-chat.helper.ts`：token 估算。
- `apps/nestjs-backend/src/features/ai-chat/ai-chat.auth.service.ts`：CRUD + chatTurn。
- `apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts`：7 个 HTTP 端点。
- `apps/nestjs-backend/src/features/ai-chat/ai-chat.module.ts`：NestJS 模块。
- `apps/nestjs-backend/src/features/ai-chat/index.ts`：barrel。
- `apps/nestjs-backend/src/app.module.ts`：注册 `AiChatModule`。

## 自动化验证

### 单元测试

```text
ai-chat.auth.service.spec.ts  6 passed（创建会话、列表、消息、删除、chatTurn 错误/成功）
```

### 构建与类型

```text
pnpm exec nest build
webpack 5.90.1 compiled successfully
```

### 真实端到端（MiniMax-M3）

```text
POST /api/auth/signin                       → 200
POST /api/chat/sessions                      → 201 aics_mtjef1aa_s3fo7l4q
  baseId=bse9SHNH2rrWTD4CsYQ, tableId=tblLxvWC26Cyv08cotd, model=MiniMax-M3
POST /api/chat/sessions/:id/turn (turn 1)    → 201
  userMessage="Say hello in 5 words or fewer"
  assistantContent="Hello, how are you."
  durationMs=4831
POST /api/chat/sessions/:id/turn (turn 2)    → 201
  userMessage="What did I ask you to say?"
  assistantContent="You asked me to say hello."（正确使用历史）
GET  /api/chat/sessions                      → 200 [1 session]
GET  /api/chat/sessions/:id                  → 200 {session, messages[2]}
  session.title="Say hello in 5 words or fewer"（自动标题）
DELETE /api/chat/sessions/:id                → 200（清理，级联删除消息）
```

## 真实进度判断

- AI Chat：由 0 提升到约 **25%**（Cloud AI Chat 含 Skills/Artifact/Memory/OAuth/文件上传/24h 长任务等大模块，本轮仅覆盖最小核心）。
- 全局企业级能力：约 **80%**（工程估计，非官方评分）。
- 已具备 Cloud AI Chat 的「会话管理 + 对话历史 + 单轮真实调用」骨架，后续可渐进添加流式响应、上下文感知、@ 引用、Artifact。

## 下一阶段

1. AI Chat 流式响应（Cloud §ai/ai-chat SSE/streaming）。
2. 应用构建器（Cloud §ai/app-builder）真实实现。
3. 自定义 AI 模型（Cloud §ai/custom-ai-model）真实实现。
4. AI Chat 上下文注入（当前表/视图/选中行）。
