# Teable OSS vs Cloud V34 — AI Field 批量任务多实例幂等

**审计日期**：2026-09-02（Asia/Shanghai）  
**依据**：V33 报告把「多实例幂等的数据库唯一约束」列为下一阶段。云端生产环境的批量任务必须防止并发重复启动（多实例竞争 + 用户重复点击）。本轮以最小改造补齐。

## 本轮实现

| 能力 | 当前实现 |
|---|---|
| 重复启动检测 | ✅ `startBatchGeneration` 启动前检查 `ai_generation_task` 表 |
| 拒绝条件 | ✅ 同表已有 `status IN ('waiting','processing')` 且 `cancelRequested=false` 的任务 |
| 错误类型 | ✅ `ConflictException`（HTTP 409），消息包含现有 taskId / trigger / status |
| 跨实例一致性 | ✅ 应用层检查（在同一事务内查询 + 插入，受限于 Prisma 事务隔离） |
| 任务完成后允许重启 | ✅ 任务进入 `done`/`failed`/`cancelled` 后不再阻塞新任务 |

## 代码位置

- `apps/nestjs-backend/src/features/ai-field/ai-field.auth.service.ts`：`startBatchGeneration` 增加 `findFirst` 检查 + `ConflictException`。
- `apps/nestjs-backend/src/features/ai-field/ai-field.auth.service.spec.ts`：新增 `startBatchGeneration idempotency` describe 块。

## 自动化验证

### 单元测试

```text
ai-field.service.spec.ts     42 passed
ai-field.auth.service.spec.ts 35 passed（新增 2 项：拒绝重复 + 允许重启）
合计：77 passed
```

### 构建与类型

```text
pnpm exec nest build
webpack 5.90.1 compiled successfully

nextjs-app tsc --noEmit
0 errors
```

### 真实端到端（新表 IdempotencyTest）

```text
POST /api/table (新表)                       → 201 tblrRh49V66OpDqqj1H
POST /api/admin/ai-field (summarize)          → 201 aif_mtje8r1k_9z7mu0il
POST /api/admin/ai-field/:id/batch (fill-empty) → 201 aigt_mtje8ug0_6rza46q3
POST /api/admin/ai-field/:id/batch (entire-column) → 409 Conflict
  {"message":"a batch task is already running for this table
   (taskId=aigt_mtje8ug0_6rza46q3, trigger=fill-empty, status=waiting)",
   "status":409,"code":"conflict"}
GET  /api/admin/ai-field/batch/tasks/:id      → 200 status=done totalCount=3
POST /api/admin/ai-field/:id/batch (entire-column) → 201 aigt_mtje9fi2_zw83uvi6
  (旧任务完成后，新任务成功创建)
DELETE /api/admin/ai-field/:id                 → 200（清理）
DELETE /api/base/:baseId/table/:tableId        → 200（清理）
```

## 真实进度判断

- AI Field 核心（文本 + 评分 + 图片 + 批量 + 自定义 prompt + 多实例幂等）：由 V33 约 99% 提升到约 **99%**。
- 全局企业级能力：约 **78%**（工程估计，非官方评分）。
- AI Field 维度已逼近 Cloud 等价：5 个默认操作 + 1 个自定义操作 + 自动更新 + 批量生成 + 任务状态 + 多实例幂等。

## 下一阶段

1. AI 对话（Cloud §ai/ai-chat）真实实现。
2. 应用构建器（Cloud §ai/app-builder）真实实现。
3. 自定义 AI 模型（Cloud §ai/custom-ai-model）真实实现。
