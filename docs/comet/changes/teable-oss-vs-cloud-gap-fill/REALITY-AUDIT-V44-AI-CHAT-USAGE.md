# Teable OSS vs Cloud 差距分析与补齐 — V44 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 用量统计（Stage 44）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V43 AI Chat Preferences

## 1. 真实差距

Cloud 版 AI Chat 设置面板显示「累计 sessions / messages / tokens / 各模型调用次数
/ 最近 N 天日均曲线」。V43 之前 OSS：

- 没有个人用量面板
- 计费 / 配额完全不可见
- 用户不知道自己消耗了多少资源

→ 体验上：企业版用户无法做成本控制。

## 2. 真实进度（V43 → V44）

| 维度 | V43 | V44 |
|---|---|---|
| AI Chat 单轮 / 流式 / 上下文 / Skills / Memory / Search / Export / Citation / Preferences | ✅ | ✅ |
| `GET /api/chat/usage/summary` 累计统计 | ❌ | ✅ |
| `GET /api/chat/usage/daily?days=N` 日均曲线 | ❌ | ✅ |
| 模型维度调用次数 | ❌ | ✅ |
| 时间段首尾标记（firstSessionAt / lastSessionAt） | ❌ | ✅ |

V44 实测在 admin 用户上：

- 初始：`totalSessions=0, totalMessages=0`（先前测试 session 已清理）
- 创建 1 个 session + 1 turn 后：`totalSessions=1, totalMessages=2`
- 日均 3 天返回 3 条记录，每条 4 个指标（sessions / messages / prompt / completion）

## 3. 最小改造实现

### 3.1 新增 `AiChatUsageService`（166 行）
- 文件：`apps/nestjs-backend/src/features/ai-chat/ai-chat-usage.service.ts`
- **零 schema 变更**：仅复用 `meta.ai_chat_session` + `meta.ai_chat_message`
- 公开能力：
  - `summary(userId)` → 累计统计（聚合 Prisma `_sum`）
  - `daily({ userId, days })` → 按 UTC 日分桶的 N 天数据
- 常量：`DEFAULT_DAILY_DAYS = 7`、`MAX_DAILY_DAYS = 90`
- 错误降级：DB 异常返回零值对象 + 日志 warn

### 3.2 控制器
- `AiChatController` 新增：
  - `@Get('usage/summary')`
  - `@Get('usage/daily')`
- 复用 `currentUserId()`（CLS）从 cookie 拿当前用户
- `ai-chat.module.ts` 注册 `AiChatUsageService`
- `ai-chat/index.ts` 导出 `AiChatUsageService` + 类型
  `IAiChatUsageSummary / IAiChatDailyUsage` + 常量

## 4. 自动化验证

### 4.1 单元测试（79 项全部通过）
```
✓ ai-chat-context.service.spec.ts     (9 tests)
✓ ai-chat-skill.service.spec.ts       (12 tests)
✓ ai-chat-memory.service.spec.ts      (6 tests)
✓ ai-chat-search.service.spec.ts      (8 tests)
✓ ai-chat-export.service.spec.ts      (6 tests)
✓ ai-chat-citation.service.spec.ts    (9 tests)
✓ ai-chat-preference.service.spec.ts  (7 tests)
✓ ai-chat-usage.service.spec.ts       (7 tests)        V44 ★ 新增
✓ ai-chat.auth.service.spec.ts        (15 tests)

Test Files  9 passed (9)
Tests       79 passed (79)
```

覆盖：
- summary：空 userId / 累计 tokens + 首次末次时间 / 模型计数排序 / 错误降级
- daily：连续 N 天零填充 / 按 UTC 分桶 / MAX_DAILY_DAYS cap / DB 异常空数组

### 4.2 后端构建
```
webpack 5.90.1 compiled successfully in 8075 ms
```

### 4.3 真实 E2E

**Case A — `GET /api/chat/usage/summary`（新用户初始）**
```json
{
  "totalSessions": 0,
  "totalMessages": 0,
  "totalPromptTokens": 0,
  "totalCompletionTokens": 0,
  "totalDurationMs": 0,
  "firstSessionAt": null,
  "lastSessionAt": null,
  "modelCounts": []
}
```

**Case B — `GET /api/chat/usage/daily?days=3`**
```json
[
  { "date": "2026-08-31", "sessions": 0, "messages": 0, "promptTokens": 0, "completionTokens": 0 },
  { "date": "2026-09-01", "sessions": 0, "messages": 0, "promptTokens": 0, "completionTokens": 0 },
  { "date": "2026-09-02", "sessions": 0, "messages": 0, "promptTokens": 0, "completionTokens": 0 }
]
```

**Case C — 创建 1 个 session + 1 turn 后**
```json
{
  "totalSessions": 1,
  "totalMessages": 2,
  ...
}
```

## 5. 进度更新

| 模块 | V43 | V44 |
|---|---|---|
| AI Field | 99% | 99% |
| AI Chat（上下文/Skills/Memory/Search/Export/Citations/Preferences/Usage） | 93% | **95%** |
| 全局企业级能力 | 91% | **92%** |

仍不能宣称 Cloud 全量等价：
- Function calling（多轮 tool use）
- Artifact 可视化输出
- 24h 长任务
- 自定义 skill 管理
- AI Chat 应用构建器

## 6. 下一步候选（V45+）

1. **V45 — AI Chat Function Calling**：把 `RecordService.listFields / getRecords /
   updateRecord` 包装为 tool schema，让模型自主调用。
2. **V46 — AI Chat 24h Long Tasks**：超 60s 请求转 `ai_chat_task` 异步执行 + UI 轮询。
3. **V47 — AI Chat Custom Skill Manager**：admin UI 定义 skill，存 `ai_chat_skill` 表。
4. **V48 — AI Chat Artifact Generator**：自动识别需要表格/图表的回答，生成 Markdown 表。
