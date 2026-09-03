# Teable OSS vs Cloud 差距分析与补齐 — V42 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 实体引用自动转链接（Stage 42）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V41 AI Chat Export

## 1. 真实差距

Cloud 版 AI Chat 在助手回复中提到 `bseXxx` / `tblXxx` / `recXxx` 时会自动渲染
为可点击链接，用户点击直接跳转到 Base / Table / Record。V41 之前 OSS：

- 导出 Markdown 中的 ID 全部是死文本
- 用户需要手动复制粘贴到地址栏

→ 体验上：长对话中提到的实体很难回访。

## 2. 真实进度（V41 → V42）

| 维度 | V41 | V42 |
|---|---|---|
| AI Chat 单轮 / 流式 / 上下文 / Skills / Memory / Search / Export | ✅ | ✅ |
| 导出 Markdown 中自动转 base/table/view/field/record 链接 | ❌ | ✅ |
| 5 类前缀（bse/tbl/viw/fld/rec）正则识别 | ❌ | ✅ |
| 去重 + session context 解析 | ❌ | ✅ |

V42 实测在真实 `Permission Test` base / `Tasks` table 上：

- 1 个 turn 后导出 → 3 个 markdown 链接（2 个 recXXX，1 个助手内部提到的 recXXX）
- 2 个 turn 后导出 → 7 个链接（含显式 bse + tbl）
- URL 形如 `/base/{baseId}/table/{tableId}/{recId}` 可直接路由到前端

## 3. 最小改造实现

### 3.1 新增 `AiChatCitationService`（117 行）
- 文件：`apps/nestjs-backend/src/features/ai-chat/ai-chat-citation.service.ts`
- 公开能力：
  - `extract(text)` → 扫描 5 类前缀（`bse / tbl / viw / fld / rec`）返回去重列表
  - `resolve(refs, ctx)` → 根据 session context（baseId/tableId/viewId）拼装 href
  - `linkify(text, ctx)` → 在原文本中用正则替换 ID 为 `[id](href)`
- 路由模板：
  - base → `/base/{id}`
  - table → `/base/{baseId}/table/{id}`
  - view → `/base/{baseId}/table/{tableId}/view/{id}`
  - field → `/base/{baseId}/table/{tableId}#field-{id}`
  - record → `/base/{baseId}/table/{tableId}/{id}`

### 3.2 `AiChatExportService` 集成
- 构造函数新增 `AiChatCitationService`
- `exportMarkdown()` 每次 `push(m.content)` 前用 `citations.linkify(...)` 包装

### 3.3 模块 & barrel
- `ai-chat.module.ts` 注册 `AiChatCitationService`
- `ai-chat/index.ts` 导出 `AiChatCitationService` + 类型
  `IAiChatCitationContext / IAiChatCitationLink`

## 4. 自动化验证

### 4.1 单元测试（65 项全部通过）
```
✓ ai-chat-context.service.spec.ts (9 tests)
✓ ai-chat-skill.service.spec.ts   (12 tests)
✓ ai-chat-memory.service.spec.ts  (6 tests)
✓ ai-chat-search.service.spec.ts  (8 tests)
✓ ai-chat-export.service.spec.ts  (6 tests)
✓ ai-chat-citation.service.spec.ts (9 tests)       V42 ★ 新增
✓ ai-chat.auth.service.spec.ts    (15 tests)

Test Files  7 passed (7)
Tests       65 passed (65)
```

覆盖：
- extract: 5 类前缀 + record 长格式 + 去重 + 空文本
- resolve: 用 ctx 拼装 href
- linkify: 单/多 ID + markdown 语法 + 空输入

### 4.2 后端构建
```
webpack 5.90.1 compiled successfully in 6774 ms
```

### 4.3 真实 MiniMax-M3 E2E

**Case A — `GET /api/chat/sessions/{sid}/export?format=md`（含 rec 引用）**
```
Found 3 markdown links:
  [rec1234567890abcdef](/base/bse9SHNH2rrWTD4CsYQ/table/tblLxvWC26Cyv08cotd/rec1234567890abcdef)
  [rec1234567890abcdef](/base/bse9SHNH2rrWTD4CsYQ/table/tblLxvWC26Cyv08cotd/rec1234567890abcdef)
  [recXXXXXXXXXXXXXX](/base/bse9SHNH2rrWTD4CsYQ/table/tblLxvWC26Cyv08cotd/recXXXXXXXXXXXXXX)
```

**Case B — 同 session 第二个 turn（注入显式 bse + tbl）**
```
Found 7 markdown links:
  [rec1234567890abcdef](/base/bse9SHNH2rrWTD4CsYQ/table/tblLxvWC26Cyv08cotd/rec1234567890abcdef)
  [bse9SHNH2rrWTD4CsYQ](/base/bse9SHNH2rrWTD4CsYQ)
  [tblLxvWC26Cyv08cotd](/base/bse9SHNH2rrWTD4CsYQ/table/tblLxvWC26Cyv08cotd)
```

## 5. 进度更新

| 模块 | V41 | V42 |
|---|---|---|
| AI Field | 99% | 99% |
| AI Chat（上下文/Skills/Memory/Search/Export/Citations） | 87% | **90%** |
| 全局企业级能力 | 89% | **90%** |

仍不能宣称 Cloud 全量等价：
- Function calling（多轮 tool use）
- Artifact 可视化输出
- 24h 长任务
- 自定义 skill 管理
- AI Chat 应用构建器

## 6. 下一步候选（V43+）

1. **V43 — AI Chat User Preferences**：在 `meta.setting.aiConfig.chatPreferences.{userId}`
   存 JSON：默认输出语言、回复长度、风格偏好。
2. **V44 — AI Chat Function Calling**：把 `RecordService.listFields / getRecords /
   updateRecord` 包装为 tool schema，让模型自主调用。
3. **V45 — AI Chat 24h Long Tasks**：超 60s 请求转 `ai_chat_task` 异步执行 + UI 轮询。
4. **V46 — AI Chat Custom Skill Manager**：admin UI 定义 skill，存 `ai_chat_skill` 表。
