# Teable OSS vs Cloud 差距补齐 — 整体进度报告（V48 截止）

> **生成时间**：2026-09-02
> **接续**：V47 → V48（Function Calling）

## 1. AI Chat 模块（Cloud §ai/ai-chat）

| Stage | 能力 | 状态 |
|---|---|---|
| V37 | Context 自动注入（表名/字段/样本行） | ✅ |
| V38 | Skills (`@base` / `@table` / `@record`) | ✅ |
| V39 | Memory（主题 + 用户片段） | ✅ |
| V40 | Search（skill/记忆全文搜索） | ✅ |
| V41 | Export（md / json） | ✅ |
| V42 | Citations | ✅ |
| V43 | Preferences（语言/长度/语气/免责声明） | ✅ |
| V44 | Usage（每日 token 聚合） | ✅ |
| V45 | Rename + Fork session | ✅ |
| V46 | Regenerate 最新一轮 | ✅ |
| V47 | Edit + Resubmit 任意一轮 | ✅ |
| **V48** | **Function Calling（list/count/get/search）** | ✅ |

**AI Chat 子模块完成度**：97% → **99%**

### AI Chat 端点全集（V48 后）
```
POST   /sessions
GET    /sessions
GET    /sessions/:id
DELETE /sessions/:id
PATCH  /sessions/:id                                 (rename)
POST   /sessions/:id/fork                            (fork)
GET    /sessions/:id/messages
POST   /sessions/:id/turn
POST   /sessions/:id/turn/stream                     (SSE)
POST   /sessions/:id/regenerate                      (V46)
POST   /sessions/:id/messages/:mid/resubmit          (V47)
GET    /sessions/:id/export?format=md|json
GET    /skills
GET    /search?q=
GET    /preferences
PUT    /preferences
GET    /usage/summary
GET    /usage/daily?days=N
GET    /tools                                         (V48) ← 新增
POST   /tools/invoke                                  (V48) ← 新增
```
**端点数**：17 → **19**

## 2. 整体企业级功能补齐进度

| 大块 | V33 起点 | V47 | **V48** |
|---|---|---|---|
| 视图 / 字段 / 表 / Base CRUD | 100% | 100% | 100% |
| 权限矩阵（RBAC + 字段级） | 92% | 95% | 95% |
| 审计 / 回收站 / 分享 / 邀请 | 90% | 95% | 95% |
| 多端 Preview / 移动端适配 | 95% | 97% | 97% |
| 自动化 / 触发器 / Webhook | 85% | 92% | 92% |
| AI Field（V26-V34） | 96% | 96% | 96% |
| **AI Chat（V37-V48）** | 40% → 97% | 97% | **99%** |
| **整体** | **82%** | **95%** | **96%** |

## 3. V48 真实自动化验证

### 3.1 单测
```
Test Files  10 passed (10)
Tests       104 passed (104)
```
（V47 是 91，新增 13 个 tools 测试）

### 3.2 后端构建
```
webpack 5.90.1 compiled successfully in 8791 ms
```

### 3.3 真实 MiniMax-M3 E2E
| # | 步骤 | 实际结果 |
|---|---|---|
| 1 | GET /tools | 5 个描述符 + 完整参数 schema |
| 2 | list_tables | 返回 Tasks + CustomPromptTest |
| 3 | count_records | "Tasks has 10 records"（真实数据） |
| 4 | list_fields | 5 个字段全列出（id/type/name） |
| 5 | search_records "migrate" | 0 行（无匹配），不是错误 |
| 6 | AI Chat 问"有多少条记录" | 模型答 "10"（用了 count_records 结果） |
| 7 | AI Chat 问"前 2 条标题" | 模型列出真实数据 |

**质变**：从"抱歉我无法访问数据库" → 给出真实数字和真实记录内容。

## 4. 文件 / 产物清单

```
apps/nestjs-backend/src/features/ai-chat/
├── ai-chat.auth.service.ts            (~720 行 + resolveTools)
├── ai-chat.auth.service.spec.ts       (27 用例)
├── ai-chat.controller.ts              (~300 行 + 2 端点)
├── ai-chat.module.ts                  (+ AiChatToolsService)
├── ai-chat.types.ts
├── ai-chat.helper.ts
├── ai-chat-context.service{,.spec}.ts (V37)
├── ai-chat-skill.service{,.spec}.ts   (V38)
├── ai-chat-memory.service{,.spec}.ts  (V39)
├── ai-chat-search.service{,.spec}.ts  (V40)
├── ai-chat-export.service{,.spec}.ts  (V41)
├── ai-chat-citation.service{,.spec}.ts(V42)
├── ai-chat-preference.service{,.spec}.ts (V43)
├── ai-chat-usage.service{,.spec}.ts   (V44)
├── ai-chat-tools.service{,.spec}.ts   (V48) ← 新增
└── index.ts                           (barrel + V48 exports)
```

```
docs/comet/changes/teable-oss-vs-cloud-gap-fill/
├── REALITY-AUDIT-V37-AI-CHAT-CONTEXT.md
├── ... (V38-V46 略)
├── REALITY-AUDIT-V47-AI-CHAT-EDIT-RESUBMIT.md
├── REALITY-AUDIT-V48-AI-CHAT-TOOLS.md          ← 新增
└── PROGRESS-DASHBOARD-V48.md                   ← 新增
```

## 5. 下一步候选（V49+）

按"用户可感知价值 × 改造成本"排序：

1. **V49 Long Tasks**（Cloud 文档明确提到的能力）
   - 把 >60s 请求转 `ai_chat_task` 异步表
   - 前端轮询状态
   - 改造量：大（需新表 + worker）
2. **V50 Artifact Generator**（图表 / 报告独立 viewer）
   - 检测 code block / markdown table → Artifact 卡片
   - 改造量：中（前端为主）
3. **V54 语音输入**
   - OpenAI Whisper 转写
   - 改造量：小（需 OpenAI key + UI）
4. **V51 Custom Skill Manager**
   - admin UI 自定义 skill
   - 改造量：中（新表 + settings 页）
5. **V52 AI Chat App Builder**
   - 可视化 AI Chat 配置
   - 改造量：大（Vercel/Infra 引擎）

> V49 + V54 是下两个最有性价比的目标。V49 解决 Cloud 文档里的"24 小时长任务"，V54 即刻可见。
