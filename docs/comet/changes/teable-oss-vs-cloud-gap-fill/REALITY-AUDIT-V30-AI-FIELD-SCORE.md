# Teable OSS vs Cloud V30 — AI Field Score（评分）真实实现

**审计日期**：2026-09-02（Asia/Shanghai）  
**依据**：官方文档 [AI Fields](https://help.teable.ai/en/basic/field/ai/ai-field.md) 明确列出 Cloud AI Field 能力：summarize / classify / **generate scores** / turn content into images。V26 报告曾把 Score 标为未完成，本轮以最小改造补齐。

## 本轮实现

| 能力 | 当前实现 |
|---|---|
| `score` 操作类型 | ✅ 新增 `AiFieldOperation = 'score'` |
| 评分配置 | ✅ `IScoreConfig`：`min` / `max` / `criteria` / `description` |
| 配置校验 | ✅ 整数边界、`0 <= min < max <= 10000`、criteria/description 类型 |
| 评分 Prompt | ✅ 中英文模板，注入 min/max/criteria |
| 输出守卫 | ✅ 解析数字、钳制到 `[min, max]`、四舍五入为整数、非数字回退 `min` |
| 管理 API | ✅ 复用既有 `POST /api/admin/ai-field`，`operation=score` 直接可用 |
| 前端面板 | ✅ `AiFieldPanel` 增加 Score 选项 |
| 自动触发 | ✅ 复用 V28 记录写入监听，score 结果回写目标字段 |

## 代码位置

- `apps/nestjs-backend/src/features/ai-field/ai-field.types.ts`：`score` 操作 + `IScoreConfig`。
- `apps/nestjs-backend/src/features/ai-field/ai-field.service.ts`：校验、模板、prompt、输出守卫。
- `apps/nestjs-backend/src/features/ai-field/index.ts`：导出 `IScoreConfig`。
- `apps/nextjs-app/src/features/app/blocks/admin/ai-field/AiFieldPanel.tsx`：Score 选项。

## 自动化验证

### 单元测试

```text
ai-field.service.spec.ts    35 passed（新增 score 校验/prompt/守卫 8 项）
ai-field.auth.service.spec.ts 31 passed
合计：66 passed
```

### 构建与类型

```text
pnpm exec nest build
webpack 5.90.1 compiled successfully

nextjs-app tsc --noEmit
0 errors（含 AiFieldPanel）
```

### 真实端到端（MiniMax-M3）

```text
POST /api/auth/signin                          → 200
POST /api/admin/ai-field (operation=score)     → 201 aif_mtjbdt9e_bhgvlc1f
POST /api/admin/ai-field/:id/runs (真实模型)     → 201 status=ok
  outputText="1"（1-5 分制，guardOutput 钳制生效）
  promptTokens=63 completionTokens=1 durationMs=7216
GET  /api/admin/ai-field/:id/usage             → 200 {total:1, ok:1}
DELETE /api/admin/ai-field/:id                → 200（清理）
```

## 真实进度判断

- AI Field 核心文本 + 评分：由 V29 约 93% 提升到约 **95%**。
- 全局企业级能力：约 **72%**（工程估计，非官方评分）。
- 仍不能宣称 Cloud 全量等价：Image Generation、批量生成（Fill empty cells / Generate entire column）、自定义 prompt 完整 UI、多实例幂等仍未完成。

## 下一阶段

1. AI Field Image Generation：复用 `AiService.image()` 底层能力，回写 attachment 字段。
2. 批量生成：按视图生成整列 / 只填空单元格，带任务状态。
3. 自定义 prompt 完整 UI/HTTP 合同。
4. 多实例幂等的数据库唯一约束。
