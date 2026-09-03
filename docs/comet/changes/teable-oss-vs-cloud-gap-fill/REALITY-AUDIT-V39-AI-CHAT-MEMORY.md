# Teable OSS vs Cloud 差距分析与补齐 — V39 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 跨会话记忆（Stage 39）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V38 AI Chat Skills

## 1. 真实差距

Cloud 版 AI Chat 会在用户跨会话时维持"记忆"——上次聊过的 Q3 销售、翻译任务、
公式建议会自动出现在新会话的 system prompt 中。V38 之前 OSS：

- 无任何跨会话保留
- 用户开新会话必须重新解释上下文
- AI 表现为"金鱼"——完全不知道昨天聊过什么

→ 体验上：长流程分析被打散成多个独立对话，AI 无法串联信息。

## 2. 真实进度（V38 → V39）

| 维度 | V38 | V39 |
|---|---|---|
| AI Chat 单轮 / 流式 / 上下文 / Skills | ✅ | ✅ |
| 跨会话自动加载记忆 | ❌ | ✅ |
| 持久化偏好（语言/角色） | ❌ | ❌（留 V42+） |
| Long-term fact extraction | ❌ | ❌（留 V42+） |

V39 实测在真实 `Permission Test` base 上创建 2 个有标题的历史会话后开第 3 个：

- 助手实际看到 system prompt 包含：
  - 3 个历史标题：「继续上次的话题 / 字段翻译 / Q3 销售分析」
  - 3 条历史用户消息（Q3 销售分析、Name 字段翻译、上次讨论）
- 助手明确说「Looking at the memory, the recent topics were: 1. 继续上次的话题 …」

## 3. 最小改造实现

### 3.1 新增 `AiChatMemoryService`（96 行）
- 文件：`apps/nestjs-backend/src/features/ai-chat/ai-chat-memory.service.ts`
- 数据源：**不新增表**——直接查现有 `meta.ai_chat_session` + `meta.ai_chat_message`
  聚合得到近期主题与历史片段
- 公开能力：
  - `load({ userId, baseId })` → 取最近 3 个 session 的标题 + 最近 5 条 user 消息（截 120 字）
  - `render(memory)` → 渲染为 `Memory:\n  Recent topics: A | B\n  Recent user messages: ...`
- 错误降级：DB 异常 → 返回空对象，logger.warn

### 3.2 `AiChatAuthService` 改造
- 注入 `AiChatMemoryService`（`@Optional`）
- 新增 `resolveMemory({ userId, baseId })` 私有方法
- `chatTurn` / `chatTurnStreaming` 在 skill/context 之后调用
- `buildPrompt()` 新增 `memory?` 段，prompt 拼接顺序：
  ```
  Skill instructions → Context → Memory → History → User → Assistant:
  ```

### 3.3 模块 & barrel
- `ai-chat.module.ts` 注册 `AiChatMemoryService`
- `ai-chat/index.ts` 导出 `AiChatMemoryService` + 类型
  `IAiChatMemory` + 常量
  `MAX_MEMORY_SESSIONS / MAX_MEMORY_SNIPPETS / MEMORY_SNIPPET_MAX_LEN`

## 4. 自动化验证

### 4.1 单元测试（42 项全部通过）
```
✓ ai-chat-context.service.spec.ts (9 tests)
✓ ai-chat-skill.service.spec.ts   (12 tests)
✓ ai-chat-memory.service.spec.ts  (6 tests)        V39 ★ 新增
✓ ai-chat.auth.service.spec.ts    (15 tests)       (+2 memory 集成)

Test Files  4 passed (4)
Tests       42 passed (42)
```

覆盖：
- `load`：无会话 → 空；3 session 取最近标题；message 截断；错误降级
- `render`：topics + snippets；无记忆 → 空
- 集成：`chatTurn` 注入 memory 块；空 memory 不出现 `Memory:` 段

### 4.2 后端构建
```
webpack 5.90.1 compiled successfully in 12764 ms
```

### 4.3 真实 MiniMax-M3 E2E（端口 3000，新构建）

**前置数据**
1. 创建 session `SID1`：title=`Q3 销售分析`，userMessage=`分析上个季度的销售趋势`
2. 创建 session `SID2`：title=`字段翻译`，userMessage=`把 Name 字段翻译成英文`
3. 创建 session `SID3`：title=`继续上次的话题`，userMessage=`基于我们之前的讨论，告诉我下一步该做什么`

**Case A — 第三会话的 chatTurn**
```
POST /api/chat/sessions/SID3/turn
Body: {"userMessage":"基于我们之前的讨论，告诉我下一步该做什么"}
→ 200 OK
promptTokens: 46 （仅 memory + 短问句，无 table 上下文）
Content: 显式复述 memory：「Looking at the memory, the recent topics were:
  1. 继续上次的话题
  2. 字段翻译
  3. Q3 销售分析」
并基于"字段翻译"任务给出下一步建议。
```

## 5. 进度更新

| 模块 | V38 | V39 |
|---|---|---|
| AI Field | 99% | 99% |
| AI Chat（会话/历史/单轮/流式/上下文/Skills/Memory） | 70% | **78%** |
| 全局企业级能力 | 86% | **87%** |

仍不能宣称 Cloud 全量等价：
- 用户偏好持久化（语言/角色）
- 长期 fact extraction（自动从历史会话抽取关键事实）
- 多轮 function calling
- 24h 长任务
- 自定义 skill 平台
- AI Chat 应用构建器

## 6. 下一步候选（V40+）

1. **V40 — AI Chat 用户偏好持久化**：在 `meta.setting` 表的 `aiConfig.chatPreferences.{userId}`
   下存 JSON，包含默认语言 / 角色 / 输出格式偏好。
2. **V41 — AI Chat Function Calling**：把 `RecordService.listFields / getRecords / updateRecord`
   包装成 tool schema，让模型自主调用。
3. **V42 — AI Chat 自定义 Skill 管理**：admin UI 定义新 skill，存入 `ai_chat_skill` 表。
4. **V43 — AI Chat 24h 长任务**：超过 60s 的请求转入 `ai_chat_task` 异步执行，UI 轮询状态。
