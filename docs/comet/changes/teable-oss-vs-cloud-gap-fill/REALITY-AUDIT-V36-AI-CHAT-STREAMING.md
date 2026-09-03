# Teable OSS vs Cloud V36 — AI Chat 流式响应（SSE）真实实现

**审计日期**：2026-09-02（Asia/Shanghai）  
**依据**：Cloud AI 对话（§ai/ai-chat）要求实时流式响应，用户能逐字看到 AI 输出。V35 报告把流式响应列为下一阶段，本轮以最小改造补齐。

## 本轮实现

| 能力 | 当前实现 |
|---|---|
| SSE 流式端点 | ✅ `POST /api/chat/sessions/:id/turn/stream` |
| 增量分块 | ✅ 每个 SSE `data:` 事件携带一个 `{delta, done:false}` chunk |
| 完成事件 | ✅ 最终 `done:true` 事件携带 userMessageId / assistantMessageId / token 计数 |
| 真实 LLM 流 | ✅ 复用 `AiService.generateTextStream`（底层 AI SDK `streamText`） |
| 消息持久化 | ✅ 流完成后统一持久化 user + assistant（与 V35 `chatTurn` 一致） |
| 自动标题 | ✅ 首条 user 消息的前 40 字自动作为 title |
| 错误处理 | ✅ 流过程中异常 → 终止事件携带 `error` 字段 |
| HTTP 头 | ✅ `Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive` |

## 代码位置

- `apps/nestjs-backend/src/features/ai-chat/ai-chat.auth.service.ts`：新增 `chatTurnStreaming` async generator。
- `apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts`：新增 `chatTurnStream` SSE 端点。
- `apps/nestjs-backend/src/features/ai-chat/ai-chat.auth.service.spec.ts`：新增流式单测。

## 自动化验证

### 单元测试

```text
ai-chat.auth.service.spec.ts  7 passed（新增流式 generator 验证 1 项）
```

### 构建与类型

```text
pnpm exec nest build
webpack 5.90.1 compiled successfully
```

### 真实端到端（MiniMax-M3，SSE）

```text
POST /api/auth/signin                       → 200
POST /api/chat/sessions                      → 201 aics_mtjeiva3_2oiqvnf4
POST /api/chat/sessions/:id/turn/stream       → 200 (text/event-stream)
  data: {"delta":"<think>The user wants","done":false}
  data: {"delta":" me","done":false}
  data: {"delta":" to reply","done":false}
  data: {"delta":" with one short sentence","done":false}
  ...
  data: {"delta":"How","done":false}
  data: {"delta":" can I help you","done":false}
  data: {"delta":"?","done":false}
  data: {"delta":"","done":true,"userMessageId":"...","assistantMessageId":"...",
         "assistantContent":"How can I help you?",
         "promptTokens":19,"completionTokens":46,"durationMs":2789}
GET  /api/chat/sessions/:id                  → 200
  session.title="Reply with one short sentence."（自动标题）
  messages[2] = [user, assistant]（流结束后持久化）
DELETE /api/chat/sessions/:id                → 200（清理）
```

## 真实进度判断

- AI Chat：由 V35 约 25% 提升到约 **40%**（已具备会话管理 + 对话历史 + 单轮调用 + 流式响应）。
- 全局企业级能力：约 **82%**（工程估计，非官方评分）。
- Cloud AI Chat 仍缺：Skills、Artifact、Memory、OAuth 集成、文件上传、24h 长任务、消息队列。

## 下一阶段

1. AI Chat 上下文注入（当前表/视图/选中行 → system prompt）。
2. 应用构建器（Cloud §ai/app-builder）真实实现。
3. 自定义 AI 模型（Cloud §ai/custom-ai-model）真实实现。
4. AI Chat 消息队列（用户可在 AI 仍在工作时继续发消息）。
