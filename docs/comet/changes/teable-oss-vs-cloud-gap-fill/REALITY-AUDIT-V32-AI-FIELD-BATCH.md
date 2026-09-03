# Teable OSS vs Cloud V32 — AI Field 批量生成（Fill empty / Entire column）真实实现

**审计日期**：2026-09-02（Asia/Shanghai）  
**依据**：官方文档 [AI Fields — 自动更新和批量生成](https://help.teable.ai/zh/basic/field/ai/ai-field) 明确列出 Cloud 能力：保存时可选「仅填充空单元格」「整列生成」「仅保存配置」；并支持任务状态、右键菜单重新生成。V31 报告把批量生成为下一阶段，本轮以最小改造补齐。

## 本轮实现

| 能力 | 当前实现 |
|---|---|
| `fill-empty` 模式 | ✅ 仅为目标字段为空的记录生成，不覆盖已有内容 |
| `entire-column` 模式 | ✅ 为当前视图/表内所有记录重新生成，覆盖已有内容 |
| 任务状态 | ✅ `ai_generation_task` 表：`waiting`/`processing`/`done`/`failed`/`cancelled` |
| 进度追踪 | ✅ `totalCount`/`completedCount`/`failedCount` 每 5 条更新 |
| 取消任务 | ✅ 取消标记 → 后台循环检测后优雅退出 |
| 任务列表 | ✅ `GET /api/admin/ai-field/:aiFieldId/batch/tasks` |
| 任务详情 | ✅ `GET /api/admin/ai-field/batch/tasks/:taskId` |
| 管理 API | ✅ `POST /api/admin/ai-field/:aiFieldId/batch` |
| 前端面板 | ✅ `AiFieldPanel` 每行加「Fill empty」「Column」按钮 + 任务列表卡片 |

## 代码位置

- `apps/nestjs-backend/src/features/ai-field/ai-field.types.ts`：批量类型（`BatchGenerationMode`、`IBatchGenerationInput`、`IAiGenerationTaskRow`）。
- `apps/nestjs-backend/src/features/ai-field/ai-field.auth.service.ts`：`startBatchGeneration` / `processBatchTask` / `cancelBatchTask` / `listBatchTasks` / `getBatchTask`。
- `apps/nestjs-backend/src/features/ai-field/ai-field.controller.ts`：4 个批量端点（路由顺序：静态 `/batch/tasks/:taskId` 在 `:aiFieldId` 之前）。
- `apps/nestjs-backend/src/features/ai-field/ai-field.module.ts`：导入 `RecordModule` 提供 `RecordService`。
- `apps/nestjs-backend/src/features/ai-field/index.ts`：导出批量类型。
- `apps/nextjs-app/src/features/app/blocks/admin/ai-field/AiFieldPanel.tsx`：批量按钮 + 任务列表（5 秒轮询）。

## 自动化验证

### 单元测试

```text
ai-field.service.spec.ts     39 passed
ai-field.auth.service.spec.ts 31 passed
合计：70 passed
```

### 构建与类型

```text
pnpm exec nest build
webpack 5.90.1 compiled successfully

nextjs-app tsc --noEmit
0 errors（含 AiFieldPanel）
```

### 真实端到端（MiniMax-M3，新表 BatchTest）

```text
POST /api/table (新表)              → 201 tblgPeMlIjANmV8Mgks
POST /api/admin/ai-field (summarize)→ 201 aif_mtjdk0fi_ej2m5uoi
POST /api/table/:id/record (×3)     → 201 (3 条记录)
POST /api/admin/ai-field/:id/batch (fill-empty) → 201 aigt_mtjdk9l3_s84mz9n1
GET  /api/admin/ai-field/batch/tasks/:id         → 200
  status=done totalCount=6 completedCount=3 failedCount=0
  (3 条空源记录跳过，3 条有源记录生成摘要)
  验证：记录 Summary 字段已写入真实 AI 摘要
POST /api/admin/ai-field/:id/batch (entire-column) → 201 aigt_mtjdlhn7_kqqv73cl
GET  /api/admin/ai-field/batch/tasks/:id          → 200
  status=done totalCount=6 completedCount=3 failedCount=0
  (覆盖已有摘要，重新生成)
GET  /api/admin/ai-field/:id/batch/tasks          → 200 (2 个任务)
DELETE /api/admin/ai-field/:id                    → 200 (清理)
DELETE /api/base/:baseId/table/:tableId           → 200 (清理)
```

## 真实进度判断

- AI Field 核心（文本 + 评分 + 图片 + 批量）：由 V31 约 97% 提升到约 **98%**。
- 全局企业级能力：约 **76%**（工程估计，非官方评分）。
- 仍不能宣称 Cloud 全量等价：自定义 prompt 完整 UI/HTTP 合同、多实例幂等的数据库唯一约束仍未完成。

## 下一阶段

1. 自定义 prompt 完整 UI/HTTP 合同（Cloud 支持自定义提示词引用同一行的字段）。
2. 多实例幂等的数据库唯一约束（防止并发重复启动相同任务）。
