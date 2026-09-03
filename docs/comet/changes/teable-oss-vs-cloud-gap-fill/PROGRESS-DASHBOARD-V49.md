# Teable OSS vs Cloud 差距补齐 — 整体进度报告（V49 截止）

> **生成时间**：2026-09-02
> **接续**：V48 → V49（Long Tasks）

## 1. AI Chat 模块（Cloud §ai/ai-chat）

| Stage | 能力 | 状态 |
|---|---|---|
| V37 | Context 自动注入 | ✅ |
| V38 | Skills (`@base` / `@table` / `@record`) | ✅ |
| V39 | Memory | ✅ |
| V40 | Search | ✅ |
| V41 | Export | ✅ |
| V42 | Citations | ✅ |
| V43 | Preferences | ✅ |
| V44 | Usage | ✅ |
| V45 | Rename + Fork | ✅ |
| V46 | Regenerate | ✅ |
| V47 | Edit + Resubmit | ✅ |
| V48 | Function Calling（真实查表） | ✅ |
| **V49** | **Long Tasks（24h 后台任务）** | ✅ |

**AI Chat 子模块完成度**：97% → **99.5%**

### AI Chat 端点全集（V49 后）— 共 22 个
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
GET    /tools                                         (V48)
POST   /tools/invoke                                  (V48)
POST   /sessions/:id/long-task                        (V49) ← 新增
GET    /tasks/:taskId                                 (V49) ← 新增
GET    /sessions/:id/long-tasks                       (V49) ← 新增
```

## 2. 整体企业级功能补齐进度

| 大块 | V33 | V47 | V48 | **V49** |
|---|---|---|---|---|
| 视图 / 字段 / 表 / Base CRUD | 100% | 100% | 100% | 100% |
| 权限矩阵（RBAC + 字段级 + 记录过滤 + 导入导出） | 92% | 95% | 95% | **95%** |
| 审计 / 回收站 / 分享 / 邀请 | 90% | 95% | 95% | 95% |
| 多端 Preview / 移动端适配 | 95% | 97% | 97% | 97% |
| 自动化 / 触发器 / Webhook | 85% | 92% | 92% | 92% |
| AI Field（V26-V34） | 96% | 96% | 96% | 96% |
| **AI Chat（V37-V49）** | 40% | 97% | 99% | **99.5%** |
| **整体** | **82%** | **95%** | **96%** | **97%** |

## 3. V49 真实自动化验证

### 3.1 单测
```
Test Files  11 passed (11)
Tests       113 passed (113)
```
（V48 是 104，+9 个 long task 测试）

### 3.2 后端构建
```
webpack 5.90.1 compiled successfully in 8612 ms
```

### 3.3 数据库迁移
```
CREATE TABLE meta.ai_chat_long_task (
  id, session_id, user_message_id UNIQUE,
  status, progress, result, error_message,
  started_at, completed_at, created_time, updated_time,
  2 个外键（Cascade）,
  2 个索引
)
```

### 3.4 真实 MiniMax-M3 E2E
| # | 步骤 | 实际结果 |
|---|---|---|
| 1 | enqueue | task id 立即返回，status=pending |
| 2 | poll | running → running(35%) → completed(100%) |
| 3 | LLM 执行 | 15 秒生成《秋叶》七言绝句 |
| 4 | 持久化 | session 获得 user + assistant 两条消息 |
| 5 | 列表 | 1 个 completed task |
| 6 | 404 | 未知 task / session 都返回 404 |

## 4. 文件 / 产物清单

```
packages/db-main-prisma/prisma/postgres/
├── schema.prisma                              (+ AiChatLongTask model)
└── migrations/20260904010000_add_ai_chat_long_task/
    └── migration.sql                          (新表 + 索引 + 外键)

apps/nestjs-backend/src/features/ai-chat/
├── ai-chat-long-task.service.ts               (V49 新增，236 行)
├── ai-chat-long-task.service.spec.ts          (V49 新增，9 用例)
├── ai-chat.auth.service.ts                    (~720 行)
├── ai-chat.auth.service.spec.ts               (27 用例)
├── ai-chat.controller.ts                      (~330 行 + 3 端点)
├── ai-chat.module.ts                          (+ AiChatLongTaskService)
└── index.ts                                   (barrel + V49 exports)

docs/comet/changes/teable-oss-vs-cloud-gap-fill/
├── REALITY-AUDIT-V37 ... V48 (省略)
├── REALITY-AUDIT-V49-AI-CHAT-LONG-TASKS.md    ← 新增
└── PROGRESS-DASHBOARD-V49.md                  ← 新增
```

## 5. 下一步候选（V50+）

按"用户可感知价值 × 改造成本"排序：

1. **V50 Artifact Generator** — Cloud 文档明确提到的产物 viewer
   - 检测 code block / markdown table → 渲染成独立 viewer
   - 改造量：中（前端为主 + 后端 metadata）
2. **V54 语音输入** — OpenAI Whisper 转写
   - 改造量：小（需 OpenAI key + UI）
3. **V55 密钥管理** — API Keys per session
   - 改造量：小（DB 列 + UI）
4. **V51 Custom Skill Manager** — admin UI 自定义 skill
   - 改造量：中（新表 + settings 页）
5. **V52 AI Chat App Builder** — 可视化配置
   - 改造量：大（Vercel/Infra）

> V50 + V54 是下两个最有性价比的目标。V50 解决 Cloud 文档里的"Artifact"，V54 即刻可见。
