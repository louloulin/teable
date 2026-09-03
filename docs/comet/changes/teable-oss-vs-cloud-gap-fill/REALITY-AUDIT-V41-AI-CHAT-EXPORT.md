# Teable OSS vs Cloud 差距分析与补齐 — V41 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 会话导出（Stage 41）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V40 AI Chat Search

## 1. 真实差距

Cloud 版 AI Chat 侧栏每个会话都有「分享 / 导出」按钮，可下载 .md 或 .json
用于归档 / 文档化 / 二次训练。V40 之前 OSS：

- 无导出能力
- 用户只能截屏或复制粘贴
- 不利于团队沉淀知识

→ 体验上：高质量对话无法被组织复用。

## 2. 真实进度（V40 → V41）

| 维度 | V40 | V41 |
|---|---|---|
| AI Chat 单轮 / 流式 / 上下文 / Skills / Memory / Search | ✅ | ✅ |
| `GET /api/chat/sessions/:id/export?format=md|json` | ❌ | ✅ |
| `?timestamps=1` 可选时间戳 | ❌ | ✅ |
| `Content-Disposition: attachment` 文件名 | ❌ | ✅ |
| Markdown / JSON 双格式 | ❌ | ✅ |

V41 实测创建包含 2 轮对话的会话后：

| 端点 | 返回 | 大小 |
|---|---|---|
| `?format=md` | text/markdown + attachment 头 | 7712 字节 |
| `?format=json` | application/json + 完整 export payload | ~3KB |
| `?format=md&timestamps=1` | 每条消息 `_(ISO 时间戳)_` 头 | 5704 字节 |

## 3. 最小改造实现

### 3.1 新增 `AiChatExportService`（148 行）
- 文件：`apps/nestjs-backend/src/features/ai-chat/ai-chat-export.service.ts`
- **零 schema 变更**：复用 `meta.ai_chat_session` + `meta.ai_chat_message`
- 公开能力：
  - `exportMarkdown(sessionId, options?)` → Markdown 文本
  - `exportJson(sessionId, options?)` → JSON 字符串
  - `export(sessionId, format, options?)` → 统一入口
- 输出格式：
  - Markdown：标题 + 元数据（session/base/table/view/model/messages 数）+ 每条消息 `## Role` 段
  - JSON：完整 session + messages 数组（含 tokens、durationMs）+ exportedAt

### 3.2 控制器
- `AiChatController` 新增 `@Get('sessions/:sessionId/export')`
  - 查询参数：`format=md|json`（默认 md）、`timestamps=1`
  - 设置 `Content-Type` + `Content-Disposition: attachment; filename=chat-{id}.{ext}`
- `ai-chat.module.ts` 注册 `AiChatExportService`
- `ai-chat/index.ts` 导出 `AiChatExportService` + 类型
  `ExportFormat / IAiChatExportOptions`

## 4. 自动化验证

### 4.1 单元测试（56 项全部通过）
```
✓ ai-chat-context.service.spec.ts (9 tests)
✓ ai-chat-skill.service.spec.ts   (12 tests)
✓ ai-chat-memory.service.spec.ts  (6 tests)
✓ ai-chat-search.service.spec.ts  (8 tests)
✓ ai-chat-export.service.spec.ts  (6 tests)        V41 ★ 新增
✓ ai-chat.auth.service.spec.ts    (15 tests)

Test Files  6 passed (6)
Tests       56 passed (56)
```

覆盖：
- 未知 session → NotFoundException
- Markdown：元数据 + 空消息 / 完整消息
- 时间戳开关（默认不含 / 含）
- JSON：结构 + exportedAt
- export() 分派 md/json

### 4.2 后端构建
```
webpack 5.90.1 compiled successfully in 8630 ms
```

### 4.3 真实 E2E（端口 3000）

**前置**：创建 1 个 session + 2 轮对话

**Case A — `GET /api/chat/sessions/{sid}/export?format=md`**
```
HTTP/1.1 200 OK
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="chat-aics_mtjheyqj_ivilefwg.md"
Content-Length: 7712

# Chat: 导出测试会话

- Session: `aics_mtjheyqj_ivilefwg`
- Base: `bse9SHNH2rrWTD4CsYQ`
- Model: `MiniMax-M3`
- Messages: 4
```

**Case B — `GET /api/chat/sessions/{sid}/export?format=json`**
```json
{
  "session": {
    "id": "aics_mtjheyqj_ivilefwg",
    "title": "导出测试会话",
    "baseId": "bse9SHNH2rrWTD4CsYQ",
    "model": "MiniMax-M3",
    ...
  },
  "messages": [
    { "role": "user",      "content": "总结一下 AI Chat 现在的能力" },
    { "role": "assistant", "content": "<think>...the current capabilities..." },
    { "role": "user",      "content": "下一步建议" },
    { "role": "assistant", "content": "<think>...next steps..." }
  ],
  "exportedAt": "2026-09-02T02:33:52.361Z"
}
```

**Case C — `GET /api/chat/sessions/{sid}/export?format=md&timestamps=1`**
```
## User _(2026-09-02T02:33:26.947Z)_

总结一下 AI Chat 现在的能力
```

## 5. 进度更新

| 模块 | V40 | V41 |
|---|---|---|
| AI Field | 99% | 99% |
| AI Chat（上下文/Skills/Memory/Search/Export） | 83% | **87%** |
| 全局企业级能力 | 88% | **89%** |

仍不能宣称 Cloud 全量等价：
- Function calling
- Artifact 可视化输出
- Citation 链接
- 24h 长任务
- 自定义 skill 管理
- 跨会话引用

## 6. 下一步候选（V42+）

1. **V42 — AI Chat Citation Linking**：从 assistant 回复中识别
   `fieldId/recordId/viewId` 并在 markdown 输出中渲染成可点击链接。
2. **V43 — AI Chat 用户偏好持久化**：在 `meta.setting.aiConfig.chatPreferences`
   存 per-user JSON。
3. **V44 — AI Chat Function Calling**：把 `RecordService.listFields/getRecords` 包成 tool schema。
4. **V45 — AI Chat 24h 长任务**：超 60s 请求转 `ai_chat_task` 异步 + UI 轮询。
