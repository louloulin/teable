# Teable OSS vs Cloud 差距分析与补齐 — V47 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 编辑用户消息并重新生成（Stage 47）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V46 AI Chat Regenerate

## 1. 真实差距

Cloud 版 AI Chat 允许用户**点击任意一条自己发的消息**，进入内联编辑模式：
1. 把该条 user message 的 `content` 改写成新内容
2. 删除该条之后的所有消息（包括后续的 assistant、user、assistant …）
3. 用新的内容作为最新一条 user message，重新跑一次 LLM
4. 把新的 assistant 回复追加到尾部

V46 之前 OSS：
- `regenerateTurn()` 只针对**最新一条** user message 做重新生成
- 想改写中间某一轮的提问 → 只能新开一个 session
- 历史会变得断章，用户体验上"上下文已经变形"

→ 体验上：Cloud 端允许的"回头改问"在 OSS 上不可用。

## 2. 真实进度（V46 → V47）

| 维度 | V46 | V47 |
|---|---|---|
| Regenerate 最新一轮 | ✅ | ✅ |
| 改写历史某一轮 user message + 重新生成 | ❌ | ✅ |
| `POST /api/chat/sessions/:id/messages/:mid/resubmit` | ❌ | ✅ |
| 删除目标 user message 之后的所有消息 | ❌ | ✅ |
| 复用 context/skill/memory/preferences 重新拼 prompt | ❌ | ✅ |
| 保留原 user message 的 id、createdTime | ❌ | ✅ |

## 3. 最小改造实现

### 3.1 `AiChatAuthService.editAndResubmit(input)`
- 入参：`{ sessionId, userMessageId, newContent }`
- 校验：
  - session 存在 → 否则 `NotFoundException`
  - `newContent.trim()` 非空 → 否则 `Error('newContent cannot be empty')`
  - 截断到 8000 字符
  - `userMessage.role === 'user'` → 否则 `Error('only user messages can be edited')`
- 改写：`prisma.aiChatMessage.update({ where: { id: userMessageId }, data: { content: trimmed } })`
- 删除：`prisma.aiChatMessage.deleteMany({ sessionId, createdTime: { gt: userMessage.createdTime } })`
- 重新拼 prompt：复用 `resolveContextPrefix / resolveSkill / resolveMemory / resolvePreferences / buildPrompt`
- 调 `this.ai.generateText(baseId, { prompt, task: 'coding' as never })`
- 写入新的 assistant message（保留 user message 的 id 不变）

> 不动 schema，不动 module 装配，零迁移成本。

### 3.2 控制器端点
```
POST /api/chat/sessions/:sessionId/messages/:messageId/resubmit
Body: { "newContent": "..." }
→ { userMessageId, assistantMessageId, assistantContent, promptTokens, completionTokens, durationMs, skillName }
```

不需要 `index.ts` barrel 改动（service 已经导出过）。

## 4. 自动化验证

### 4.1 单元测试（91 项全部通过）

```
✓ ai-chat-context.service.spec.ts     (9 tests)
✓ ai-chat-skill.service.spec.ts       (12 tests)
✓ ai-chat-memory.service.spec.ts      (6 tests)
✓ ai-chat-search.service.spec.ts      (8 tests)
✓ ai-chat-export.service.spec.ts      (6 tests)
✓ ai-chat-citation.service.spec.ts    (9 tests)
✓ ai-chat-preference.service.spec.ts  (7 tests)
✓ ai-chat-usage.service.spec.ts       (7 tests)
✓ ai-chat.auth.service.spec.ts        (27 tests)        ← 24 + 3 新增

Test Files  9 passed (9)
Tests       91 passed (91)
```

新增 3 个用例覆盖：

| # | 场景 | 断言 |
|---|---|---|
| 1 | 正常路径：找到 user message、update 内容、删除后续、调 LLM、写新 assistant | `prisma.aiChatMessage.update` / `deleteMany` / `ai.generateText` 各被调用；返回值字段对齐 |
| 2 | user message 不存在 | `NotFoundException` |
| 3 | 目标 message role === 'assistant' | 抛 `Error(/only user messages can be edited/)`；**不会** 触发 LLM 调用、**不会** deleteMany |

### 4.2 后端构建

```
webpack 5.90.1 compiled successfully in 7601 ms
```

### 4.3 真实 MiniMax-M3 端到端验证（admin@teable.local）

1. 登录拿 cookie
2. `POST /api/chat/sessions` → session=`aics_mtjj0kn3_h0gwpra3`
3. turn 1: `请用一句话介绍 Tasks 表里现在有多少条记录。` → user + assistant 各 1 条
4. turn 2: `第一条的状态是什么？只回答状态名。` → 再添 2 条（**共 4 条**）
5. `GET /messages` 验证 count=4
6. `POST /sessions/:id/messages/:mid/resubmit` 把第 2 轮 user message 改成：
   `最后一条记录的标题是什么？只回答标题原文，不要解释。`
7. 端点返回新的 assistantMessageId、新 assistantContent、新 token 数
8. `GET /messages` 验证仍为 **count=4**，且第 3 条内容已经被改写为新 prompt
9. 新的 assistant message（基于新 prompt）成功生成

实测数据（节选）：
```
=== 6. RESUBMIT user message #2 ===
{
  "userMessageId": "aicm_mtjj0rap_fwkiyn08",          // id 不变
  "assistantMessageId": "aicm_mtjj0xiz_173ct6qn",     // 新 assistant
  "assistantContent": "<think>... 抱歉，我目前无法直接访问你的 Tasks 表 ...",
  "promptTokens": 643,
  "completionTokens": 120,
  "durationMs": 4541
}

=== 7. messages AFTER resubmit ===
count= 4
  aicm_mtjj0knt_... role=user  | 请用一句话介绍 Tasks 表里现在有多少条记录。
  aicm_mtjj0r86_... role=assi  | <think>The user is asking for a one-sentence ...
  aicm_mtjj0rap_... role=user  | 最后一条记录的标题是什么？只回答标题原文，不要解释。   ← 已编辑
  aicm_mtjj0xiz_... role=assi  | <think>The user is asking for the title of the last record...   ← 新回复
```

## 5. 不在 V47 范围 / 后续 Stage 候选

- **V48 Function Calling**：把 `RecordService.listFields/getRecords` 包装成 tool schema，让模型按需调用
- **V49 24h Long Tasks**：>60s 的请求转 `ai_chat_task` 异步表，前端轮询
- **V50 Artifact Generator**：Markdown 表格 / Mermaid 图自动产物
- **V51 Custom Skill Manager**：admin UI 自定义 skill
- **V52 AI Chat App Builder**：可视化 AI Chat 配置

每一项都需要新建表 / 新的端点 / 前端面板，**属于功能补齐而非微改造**，本轮不并入 V47。
