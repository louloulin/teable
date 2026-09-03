# Teable OSS vs Cloud 差距分析与补齐 — V46 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 重新生成回答（Stage 46）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V45 AI Chat Rename+Fork

## 1. 真实差距

Cloud 版 AI Chat 每条助手消息旁都有「↻ 重新生成」按钮，点了之后：
1. 删除当前助手消息
2. 用相同的 user message 重新调一次 LLM
3. 写入新的助手回复

V45 之前 OSS：

- 用户对回答不满意只能整轮重发
- 用户消息和原助手消息都进 DB，污染历史

→ 体验上：每次刷新回答都丢失原内容。

## 2. 真实进度（V45 → V46）

| 维度 | V45 | V46 |
|---|---|---|
| AI Chat 单轮 / 流式 / 上下文 / Skills / Memory / Search / Export / Citation / Preferences / Usage / Rename / Fork | ✅ | ✅ |
| `POST /api/chat/sessions/:id/regenerate` | ❌ | ✅ |
| 删除原 assistant + 重新调 LLM | ❌ | ✅ |
| 不重复写 user message | ❌ | ✅ |

V46 实测在 admin 用户上：

- 1 个 turn 后：2 条消息（user + assistant）
- POST `/regenerate` 后：仍 2 条消息，但 assistantMessageId 变化
- 新回复独立生成（不同 promptTokens）

## 3. 最小改造实现

### 3.1 `AiChatAuthService.regenerateTurn({ sessionId })`
- 取最近 1 条 user message
- `prisma.aiChatMessage.deleteMany({ sessionId, role: 'assistant', createdTime: { gte: lastUser.createdTime } })`
- 复用 context/skill/memory/preferences 解析
- 复用 `buildPrompt()` 重新拼装
- 调 `this.ai.generateText(baseId, ...)`
- 写入新 assistant message

不重新写 user message（保留原始时间戳）。

### 3.2 控制器
- `AiChatController` 新增 `@Post('sessions/:sessionId/regenerate')`
- 无 module / index.ts 改动

## 4. 自动化验证

### 4.1 单元测试（88 项全部通过）
```
✓ ai-chat-context.service.spec.ts     (9 tests)
✓ ai-chat-skill.service.spec.ts       (12 tests)
✓ ai-chat-memory.service.spec.ts      (6 tests)
✓ ai-chat-search.service.spec.ts      (8 tests)
✓ ai-chat-export.service.spec.ts      (6 tests)
✓ ai-chat-citation.service.spec.ts    (9 tests)
✓ ai-chat-preference.service.spec.ts  (7 tests)
✓ ai-chat-usage.service.spec.ts       (7 tests)
✓ ai-chat.auth.service.spec.ts        (24 tests)        + 3 新增

Test Files  9 passed (9)
Tests       88 passed (88)
```

覆盖：
- 正常路径：deleteMany + ai.generateText + addMessage
- 无 user message → NotFoundException
- 无 session → NotFoundException

### 4.2 后端构建
```
webpack 5.90.1 compiled successfully in 8027 ms
```

### 4.3 真实 E2E

**Case A — 首次 turn**
```
POST /api/chat/sessions/{sid}/turn
Body: {"userMessage":"write a haiku about clouds"}
→ assistantMessageId: aicm_mtji9j7x_ht0jk34m
Content: 云随风飘荡… （中文俳句）
```

**Case B — 重新生成**
```
POST /api/chat/sessions/{sid}/regenerate
→ new assistantMessageId: aicm_mtji9nwm_851cmsu7
Content: 不同的中文俳句（含 disclaimer，符合 V43 preferences）
```

**Case C — DB 状态校验**
```
GET /api/chat/sessions/{sid}/messages
→ Messages count: 2
  user       (id=aicm_mtji9d69_pdlcnkh2)  ← 原始 user 保留
  assistant  (id=aicm_mtji9nwm_851cmsu7)  ← 新回复
原 assistant (aicm_mtji9j7x_ht0jk34m) 已被 deleteMany 删除
```

## 5. 进度更新

| 模块 | V45 | V46 |
|---|---|---|
| AI Field | 99% | 99% |
| AI Chat（10 项 Stage + 重新生成）| 96% | **97%** |
| 全局企业级能力 | 93% | **94%** |

仍不能宣称 Cloud 全量等价：
- Function Calling（多轮 tool use）
- 24h Long Tasks
- Artifact Generator（Markdown 表 / Mermaid 图）
- Custom Skill Manager（admin UI）

## 6. 下一步候选（V47+）

1. **V47 — AI Chat Edit-Then-Resubmit**：允许用户编辑已发 user message 后重发，连带删除后续 assistant 回复。
2. **V48 — AI Chat Stop Generation**：流式 turn 期间按 `AbortController` 立即停止。
3. **V49 — AI Chat Function Calling**：把 `RecordService.listFields / getRecords` 包装为 tool schema。
4. **V50 — AI Chat Artifact Generator**：识别需要表格/图表的回答，输出 Markdown 表 / Mermaid 图。
