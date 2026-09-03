# Teable OSS vs Cloud 差距分析与补齐 — V38 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 内置 Skills（Stage 38）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V37 AI Chat Context Injection

## 1. 真实差距

Cloud 版 AI Chat 在输入框旁有"@"快捷唤起面板（[app.teable.ai](https://app.teable.ai)
的 `/assistant` 视图），常用指令如 `@base` / `@table` / `@record` /
`@formula` / `@automation` 一键注入预设 prompt。V37 之前 OSS：

- 无 `@<skill>` 前缀识别
- 所有 system prompt 只能由前端粘贴
- 用户每次都得把 schema / 字段类型复制进 chat

→ 体验上：高频指令需要重复输入，模型也不知该按什么格式回答。

## 2. 真实进度（V37 → V38）

| 维度 | V37 | V38 |
|---|---|---|
| AI Chat 单轮 | ✅ | ✅ |
| AI Chat 流式（SSE） | ✅ | ✅ |
| AI Chat 自动上下文注入 | ✅ | ✅ |
| AI Chat 内置 Skills | ❌ | ✅ |
| `GET /api/chat/skills` 元数据 | ❌ | ✅ |
| `chatTurn` 返回 `skillName` 字段 | ❌ | ✅ |

V38 实测在真实 `Permission Test` base / `Tasks` table 上：

- `@table` 触发：列出 5 字段 + 语义说明（promptTokens=224）
- `@base` 触发：列出 base 内 2 张表 + 业务概述（promptTokens=558）
- `@record` 占位（待 recordId 输入）
- 无 `@` 前缀：skillName=null，普通回复（promptTokens≈14）

## 3. 最小改造实现

### 3.1 新增 `AiChatSkillService`（179 行）
- 文件：`apps/nestjs-backend/src/features/ai-chat/ai-chat-skill.service.ts`
- 公开能力：
  - `listSkills()` → 返回 3 个内置 skill 元数据（name / title / description / tags）
  - `match(userMessage)` → 正则 `/^@([a-zA-Z][a-zA-Z0-9_-]*)\b/` 匹配前缀
  - `buildPrompt({ skill, remainder, session })` → 渲染 system prompt
- 三个 Skill：
  - `@base`：列出 base 中所有表（`prisma.tableMeta.findMany`）+ 字段数
  - `@table`：复用 `AiChatContextService`（V37），附加摘要指令
  - `@record`：从 remainder 中提取 `recId`（`/\brec[A-Za-z0-9_-]{14,}\b/`）

### 3.2 `AiChatAuthService` 改造
- 注入 `AiChatSkillService`（`@Optional`）
- 新增 `resolveSkill({ userMessage, session })`：
  - 调 `skillService.match()` 识别前缀
  - 调 `skillService.buildPrompt()` 渲染 system prompt
- `chatTurn` / `chatTurnStreaming` 在 `resolveContextPrefix` 之后调用
- `buildPrompt()` 签名扩展接收 `skillSystem?`，按顺序拼接：
  `Skill instructions: … → Context: … → 历史 → User: …`
- 返回结果与流式终事件新增 `skillName?: string`

### 3.3 控制器 + 模块
- `AiChatController` 新增 `@Get('skills')` → `skills.listSkills()`
- `AiChatModule` 注册 `AiChatSkillService` 到 providers + exports
- barrel `ai-chat/index.ts` 导出 `AiChatSkillService` 与类型
  `IAiChatSkill / IAiChatSkillMatch`

### 3.4 类型扩展
- `IChatTurnResult` 新增 `skillName?: string`
- 流式 generator 终事件类型同步扩展

## 4. 自动化验证

### 4.1 单元测试（34 项全部通过）
```
✓ ai-chat-context.service.spec.ts (9 tests)        V37
✓ ai-chat-skill.service.spec.ts   (12 tests)        V38 ★ 新增
✓ ai-chat.auth.service.spec.ts    (13 tests)        V35-V38 (含 2 新增 skill 用例)

Test Files  3 passed (3)
Tests       34 passed (34)
```

覆盖：
- `listSkills()`：返回 3 个内置
- `match()`：前缀匹配、case-insensitive、unknown 返回 null、非开头不匹配
- `buildPrompt()`：@table 用 context 服务；@base 用 prisma 列表；@record 提取 recId
- 边界：无 baseId / 无 tableId / 无 recId / unknown skill 全部降级到空字符串
- 集成：`chatTurn` 检测 `@table` → skillName=table；无 `@` 时 skillName=undefined

### 4.2 后端构建
```
webpack 5.90.1 compiled successfully in 6884 ms
```

### 4.3 真实 MiniMax-M3 E2E（端口 3000，新构建）

**Case A — `GET /api/chat/skills`**
```
→ 200 OK
[
  { name: "base",    title: "@base — 总结当前 Base",    description: "…", tags: [summary, overview] },
  { name: "table",   title: "@table — 描述当前表",     description: "…", tags: [schema, fields] },
  { name: "record",  title: "@record — 解释单条记录",  description: "…", tags: [record, detail] }
]
```

**Case B — `@table` 触发**
```
POST /api/chat/sessions/{sid}/turn
Body: {"userMessage":"@table  describe this table"}
→ 200 OK
skillName: "table"
promptTokens: 224
Content: 1段概要 + 5个字段（Name/Count/Status/AI Auto Target/Batch Test）的语义角色说明
```

**Case C — `@base` 触发**
```
Body: {"userMessage":"@base  give me an overview"}
→ 200 OK
skillName: "base"
promptTokens: 558
Content: base 业务定位概述 + 2 张表（Tasks / CustomPromptTest）的描述
```

**Case D — 普通消息（无 `@`）**
```
Body: {"userMessage":"What is 3+5?"}
→ 200 OK
skillName: undefined （即 null）
Content: "3 + 5 = 8"
```

## 5. 进度更新

| 模块 | V37 | V38 |
|---|---|---|
| AI Field（文本/评分/图片/批量/自定义 prompt/幂等） | 99% | 99% |
| AI Chat（会话/历史/单轮/流式/上下文/Skills） | 60% | **70%** |
| 全局企业级能力 | 84% | **86%** |

仍不能宣称 Cloud 全量等价：Memory / 多轮 function calling /
24h 长任务 / 应用构建器 / 自定义 AI 模型仍未涉及。

## 6. 下一步候选（V39+）

1. **V39 — AI Chat Memory**：会话间持久化用户偏好与最近主题，下次自动加载。
2. **V40 — AI Chat Multi-turn Tool Use**：把 `RecordService` 包装成工具，模型可自主
   调用 `list_fields` / `get_records` / `update_record`。
3. **V41 — AI Chat 24h 长任务**：超 60s 请求转入 `ai_chat_task` 表异步执行，UI 轮询。
4. **V42 — AI Chat 自定义 Skills**：允许管理员在 admin 后台定义新 skill，
   存入 `ai_chat_skill` 表。
