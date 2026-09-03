# Teable OSS vs Cloud 差距分析与补齐 — V40 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 跨会话搜索（Stage 40）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V39 AI Chat Memory

## 1. 真实差距

Cloud 版 AI Chat 侧栏有全局搜索框，可按"主题 / 用户消息 / 助手回复"全文
检索历史会话。V39 之前 OSS：

- 没有跨会话搜索能力
- 用户只能用 `listSessions?baseId=` 按 base 过滤
- 找到旧会话后还得逐条翻 message

→ 体验上：用户积累 20+ 会话后基本无法回顾。

## 2. 真实进度（V39 → V40）

| 维度 | V39 | V40 |
|---|---|---|
| AI Chat 单轮 / 流式 / 上下文 / Skills / Memory | ✅ | ✅ |
| `GET /api/chat/search?q=` 跨会话搜索 | ❌ | ✅ |
| 标题/消息/助手回复多源加权 | ❌ | ✅ |
| 24h recency boost | ❌ | ✅ |
| 上下文 snippet 提取 | ❌ | ✅ |

V40 实测在真实 `Permission Test` base 上创建 3 个不同主题会话后：

| 查询 | Top-1 命中 | 分数 | Snippet |
|---|---|---|---|
| `sales` | Sales analysis Q3 | 7.5 | "The user is asking me to analyze Q3 sales n…" |
| `customer` | Customer feedback | 7.5 | "…provided:\n\n- Recent topics include …" |
| `nonexistent_xyz` | （无） | — | — |

排名合理，标题命中分最高，recency 提升新会话。

## 3. 最小改造实现

### 3.1 新增 `AiChatSearchService`（162 行）
- 文件：`apps/nestjs-backend/src/features/ai-chat/ai-chat-search.service.ts`
- **零 schema 变更**：复用 `meta.ai_chat_session` + `meta.ai_chat_message`
- 公开能力：`search({ userId, query, baseId?, take? })`
- 评分算法（最小可解释）：
  ```
  score = min(titleMatches,10)*5
        + min(userMatches,5)*1
        + min(assistantMatches,2)*0.5
        + (updatedTime ≤ 24h ? 0.5 : 0)
  ```
- 取最近 200 session 候选 + 5000 message 评分（O(N×M) 但有上限）
- `extractSnippet()` 提取匹配项 ± 60 字上下文

### 3.2 控制器 + 类型
- `AiChatController` 新增 `@Get('search')` → `q, baseId, take`
- `ai-chat.module.ts` 注册 `AiChatSearchService`
- `ai-chat/index.ts` 导出 `AiChatSearchService` + `IAiChatSearchResult` + `MAX_SEARCH_RESULTS`

## 4. 自动化验证

### 4.1 单元测试（50 项全部通过）
```
✓ ai-chat-context.service.spec.ts (9 tests)
✓ ai-chat-skill.service.spec.ts   (12 tests)
✓ ai-chat-memory.service.spec.ts  (6 tests)
✓ ai-chat-search.service.spec.ts  (8 tests)        V40 ★ 新增
✓ ai-chat.auth.service.spec.ts    (15 tests)

Test Files  5 passed (5)
Tests       50 passed (50)
```

覆盖：
- 空 query / 无 session → 空数组
- 标题匹配（最高分）
- user/assistant 命中排序
- 24h recency boost
- snippet 提取（含前后省略号）
- take 上限 + `MAX_SEARCH_RESULTS` 常量
- 错误降级

### 4.2 后端构建
```
webpack 5.90.1 compiled successfully in 14036 ms
```

### 4.3 真实 MiniMax-M3 E2E

**前置**：3 个真实 base 会话，各 1 turn

**Case A — `GET /api/chat/search?q=sales`**
```
Found 3 results:
  'Sales analysis Q3'   score=7.5  matches=13  snippet="…The user is asking me to analyze Q3 sales n…"
  'Marketing plan'      score=1.5  matches=2   snippet="…quiz on your website…"
  'Customer feedback'   score=1.5  matches=3   snippet="…Recent topics include "Customer feedback"…"
```

**Case B — `GET /api/chat/search?q=customer`**
```
Found 3 results:
  'Customer feedback'   score=7.5   ← 标题命中
  'Marketing plan'      score=1.5
  'Sales analysis Q3'   score=1
```

**Case C — `GET /api/chat/search?q=nonexistent_keyword_xyz`**
```
Found 0 results
```

## 5. 进度更新

| 模块 | V39 | V40 |
|---|---|---|
| AI Field | 99% | 99% |
| AI Chat（上下文/Skills/Memory/Search） | 78% | **83%** |
| 全局企业级能力 | 87% | **88%** |

仍不能宣称 Cloud 全量等价：
- Function calling（多轮 tool use）
- Artifact 生成（图表/表格可视化输出）
- Citation 链接
- 24h 长任务
- 自定义 skill 管理

## 6. 下一步候选（V41+）

1. **V41 — AI Chat Function Calling**：把 `RecordService.listFields / getRecords`
   包装为 tool schema，模型自主调用。
2. **V42 — AI Chat 用户偏好持久化**：在 `meta.setting` 存 per-user JSON 默认值。
3. **V43 — AI Chat 自定义 Skill 管理**：admin UI 定义 skill，存入新表。
4. **V44 — AI Chat 24h 长任务**：超 60s 请求转 `ai_chat_task` 异步执行 + 轮询。
