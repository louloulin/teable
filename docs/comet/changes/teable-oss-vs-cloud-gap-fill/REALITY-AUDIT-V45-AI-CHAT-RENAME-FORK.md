# Teable OSS vs Cloud 差距分析与补齐 — V45 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 会话重命名 / Fork（Stage 45）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V44 AI Chat Usage

## 1. 真实差距

Cloud 版 AI Chat 侧栏每个会话可「重命名」或「从某条消息 Fork」出独立分支，
便于探索不同答案而不污染原对话。V44 之前 OSS：

- 会话一旦创建无法改名
- 无法 fork，分支回答只能新开 session 然后人工复制粘贴

→ 体验上：用户试错成本高，怕搞坏原对话就少做实验。

## 2. 真实进度（V44 → V45）

| 维度 | V44 | V45 |
|---|---|---|
| AI Chat 单轮 / 流式 / 上下文 / Skills / Memory / Search / Export / Citation / Preferences / Usage | ✅ | ✅ |
| `PATCH /api/chat/sessions/:id` 重命名 | ❌ | ✅ |
| `POST /api/chat/sessions/:id/fork` 分支 | ❌ | ✅ |
| Title trim + 120 字截断 | ❌ | ✅ |
| Fork `[Fork] original` 前缀 + metadata 继承 | ❌ | ✅ |

V45 实测在 admin 用户上创建 1 个 session + 3 轮对话：

- PATCH `{"title":"renamed via PATCH"}` → session.title 更新成功
- POST `/fork {"upToMessageIndex":3}` → 新 session id + copiedMessages=4（含 user/assistant 各 2 条）

## 3. 最小改造实现

### 3.1 `AiChatAuthService` 扩展
- `renameSession({ sessionId, title })`：
  - 校验 session 存在
  - `title.trim().slice(0, 120)` 后更新
- `forkSession({ sourceSessionId, upToMessageIndex?, createdBy })`：
  - 复制 session 元数据（baseId/tableId/viewId/model）
  - 复制 messages[0..upToMessageIndex]（含）
  - 新 session title = `[Fork] {original}`
  - 抛 `NotFoundException` 当源 session 缺失

### 3.2 控制器
- `AiChatController` 新增：
  - `@Patch('sessions/:sessionId')` 接收 `{ title }`
  - `@Post('sessions/:sessionId/fork')` 接收 `{ upToMessageIndex? }`
- 无模块/index.ts 改动（service 直接加方法）

## 4. 自动化验证

### 4.1 单元测试（85 项全部通过）
```
✓ ai-chat-context.service.spec.ts     (9 tests)
✓ ai-chat-skill.service.spec.ts       (12 tests)
✓ ai-chat-memory.service.spec.ts      (6 tests)
✓ ai-chat-search.service.spec.ts      (8 tests)
✓ ai-chat-export.service.spec.ts      (6 tests)
✓ ai-chat-citation.service.spec.ts    (9 tests)
✓ ai-chat-preference.service.spec.ts  (7 tests)
✓ ai-chat-usage.service.spec.ts       (7 tests)
✓ ai-chat.auth.service.spec.ts        (21 tests)       + 6 新增

Test Files  9 passed (9)
Tests       85 passed (85)
```

覆盖：
- rename：成功更新 / 源缺失返回 null / 长 title 截断到 120 字
- fork：指定 index 复制 N+1 条 / 默认复制全部 / 源缺失抛 NotFoundException
- metadata 继承：baseId/tableId/viewId 透传

### 4.2 后端构建
```
webpack 5.90.1 compiled successfully in 7333 ms
```

### 4.3 真实 E2E

**Case A — `PATCH /api/chat/sessions/{id}`**
```
Request:  {"title":"renamed via PATCH"}
Response: { … title: "renamed via PATCH", updatedTime: "..." }
```

**Case B — `POST /api/chat/sessions/{id}/fork`**
```
Request:  {"upToMessageIndex": 3}
Response: { newSessionId: "aics_mtjhysyk_...", copiedMessages: 4 }
```
（index=3 inclusive 复制 4 条消息）

## 5. 进度更新

| 模块 | V44 | V45 |
|---|---|---|
| AI Field | 99% | 99% |
| AI Chat（上下文/Skills/Memory/Search/Export/Citations/Preferences/Usage/Rename/Fork） | 95% | **96%** |
| 全局企业级能力 | 92% | **93%** |

仍不能宣称 Cloud 全量等价：
- Function calling（多轮 tool use）
- Artifact 可视化输出
- 24h 长任务
- 自定义 skill 管理
- AI Chat 应用构建器

## 6. 下一步候选（V46+）

1. **V46 — AI Chat Function Calling**：把 `RecordService.listFields / getRecords /
   updateRecord` 包装为 tool schema，让模型自主调用。
2. **V47 — AI Chat 24h Long Tasks**：超 60s 请求转 `ai_chat_task` 异步执行 + UI 轮询。
3. **V48 — AI Chat Custom Skill Manager**：admin UI 定义 skill，存 `ai_chat_skill` 表。
4. **V49 — AI Chat Artifact Generator**：自动识别需要表格/图表的回答，生成 Markdown 表。
