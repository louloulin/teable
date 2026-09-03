# Teable OSS vs Cloud V31 — AI Field Image Generation（图片生成）真实实现

**审计日期**：2026-09-02（Asia/Shanghai）  
**依据**：官方文档 [AI Fields](https://help.teable.ai/en/basic/field/ai/ai-field.md) 明确列出 Cloud AI Field 能力：summarize / classify / generate scores / **turn content into images**。V30 报告把 Image Generation 列为未完成，本轮以最小改造补齐。

## 本轮实现

| 能力 | 当前实现 |
|---|---|
| `image` 操作类型 | ✅ 新增 `AiFieldOperation = 'image'` |
| 图片配置 | ✅ `IImageConfig`：`prompt` / `size` / `count` / `aspectRatio` / `quality` |
| 配置校验 | ✅ prompt 必填、count ∈ [1,4]、quality ∈ {standard, hd} |
| 图片 Prompt | ✅ 中英文模板，注入 prompt + 源文本上下文 |
| MiniMax 原生图片 API | ✅ `POST {baseUrl}/image_generation`（model=image-01），下载图片 URL |
| 通用图片模型 | ✅ 非 MiniMax 走 AI SDK `generateImage`（DALL-E / flux 等） |
| 附件上传回写 | ✅ `AttachmentsService.uploadFromStream` 上传，回写 attachment 字段 |
| 自动触发 | ✅ 目标字段类型限定 `attachment`，记录更新自动生成图片 |
| 前端面板 | ✅ `AiFieldPanel` 增加 Image 选项 |

## 代码位置

- `apps/nestjs-backend/src/features/ai-field/ai-field.types.ts`：`image` 操作 + `IImageConfig`。
- `apps/nestjs-backend/src/features/ai-field/ai-field.service.ts`：校验、模板、prompt。
- `apps/nestjs-backend/src/features/ai/ai.service.ts`：`generateImage()` + MiniMax 原生 `/image_generation` 分支。
- `apps/nestjs-backend/src/features/ai-field/ai-field.auth.service.ts`：`executeImageRun` + 附件回写解析。
- `apps/nestjs-backend/src/features/ai-field/ai-field.module.ts`：导入 `AttachmentsModule`。
- `apps/nextjs-app/src/features/app/blocks/admin/ai-field/AiFieldPanel.tsx`：Image 选项。

## 自动化验证

### 单元测试

```text
ai-field.service.spec.ts     39 passed（新增 image 校验/prompt 5 项）
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

### 真实端到端（MiniMax image-01）

```text
POST /api/auth/signin                          → 200
POST /api/table/:id/field (attachment)          → 201 fldrM9th8fSuNyFbYHp
POST /api/admin/ai-field (operation=image)     → 201 aif_mtjbub2t_0o3ek1qk
POST /api/admin/ai-field/:id/runs (真实模型)     → 201 status=ok
  outputText=[{token, size:94481, mimetype:image/jpeg, width:1024, height:1024}]
  durationMs=41218（MiniMax 图片生成耗时）
GET  /api/attachments/read/private/...         → 200 JPEG 1024x1024（可下载）
PATCH /api/table/:id/record（触发自动生成）       → 200
GET  /api/table/:id/record/:id                 → 200 attachment 字段已回写
  [{id:actcpmLM2Npye6eE89f, size:558233, width:1024, height:1024, mimetype:image/jpeg}]
DELETE /api/admin/ai-field/:id                 → 200（清理）
DELETE /api/table/:id/field/:id                → 200（清理）
```

## 真实进度判断

- AI Field 核心文本 + 评分 + 图片生成：由 V30 约 95% 提升到约 **97%**。
- 全局企业级能力：约 **74%**（工程估计，非官方评分）。
- 仍不能宣称 Cloud 全量等价：批量生成（Fill empty cells / Generate entire column）、自定义 prompt 完整 UI、多实例幂等仍未完成。

## 下一阶段

1. 批量生成：按视图生成整列 / 只填空单元格，带任务状态。
2. 自定义 prompt 完整 UI/HTTP 合同。
3. 多实例幂等的数据库唯一约束。
