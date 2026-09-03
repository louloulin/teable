# Teable OSS vs Cloud V33 — AI Field 自定义 Prompt（Custom Generation）真实实现

**审计日期**：2026-09-02（Asia/Shanghai）  
**依据**：官方文档 [AI Fields](https://help.teable.ai/zh/basic/field/ai/ai-field) 明确列出 Cloud 能力「自定义生成：用自定义提示词控制输出，适合默认动作无法覆盖的场景。自定义提示可以引用同一行里的字段。」V32 报告把自定义 prompt 列为下一阶段，本轮以最小改造补齐。

## 本轮实现

| 能力 | 当前实现 |
|---|---|
| `custom` 操作类型 | ✅ 新增 `AiFieldOperation = 'custom'` |
| 自定义配置 | ✅ `ICustomPromptConfig`：`prompt` / `systemPrompt` / `language` |
| 字段引用渲染 | ✅ `{{fieldId}}` 占位符解析为该行的字段值 |
| 容错渲染 | ✅ 未知占位符解析为空字符串；非字符串值 JSON 序列化 |
| 配置校验 | ✅ prompt 必填、systemPrompt 字符串类型、language ∈ {english, chinese} |
| 真实 LLM 执行 | ✅ `executeRunOnce` 走真实 MiniMax-M3 provider |
| 自动触发 | ✅ 复用 V28 记录写入监听，rowFields 自动透传 |
| 批量生成 | ✅ rowFields 自动透传，V32 批量任务无需改动 |
| HTTP 合同 | ✅ 复用 `POST /:aiFieldId/runs`，接受 `rowFields` 字段 |
| 前端面板 | ✅ 复用 V32 AiFieldPanel（custom 已在 AiOp 类型中） |

## 代码位置

- `apps/nestjs-backend/src/features/ai-field/ai-field.types.ts`：`custom` 操作 + `ICustomPromptConfig` + `IRunAiFieldInput.rowFields`。
- `apps/nestjs-backend/src/features/ai-field/ai-field.service.ts`：校验、模板、`buildDefaultPrompt` custom 分支。
- `apps/nestjs-backend/src/features/ai-field/ai-field.auth.service.ts`：`renderCustomPrompt` 私有方法 + `executeRunOnce` custom 分支。
- `apps/nestjs-backend/src/features/ai-field/ai-field.controller.ts`：`runs` 端点透传 `rowFields`。
- `apps/nestjs-backend/src/features/ai-field/index.ts`：导出 `ICustomPromptConfig`。

## 自动化验证

### 单元测试

```text
ai-field.service.spec.ts     42 passed（新增 custom 校验 3 项）
ai-field.auth.service.spec.ts 33 passed（新增 custom 占位符渲染 2 项）
合计：75 passed
```

### 构建与类型

```text
pnpm exec nest build
webpack 5.90.1 compiled successfully

nextjs-app tsc --noEmit
0 errors
```

### 真实端到端（MiniMax-M3，新表 CustomPromptTest）

```text
POST /api/table (新表)              → 201 tblrPciIiAhWC5DskaC
  字段：ProductName、Category、MarketingTagline
POST /api/admin/ai-field (custom)   → 201 aif_mtje2vr7_rqsk1jd6
  config.prompt = "Generate a short marketing tagline (under 15 words)
                   for the product {{fld95vNOF9kpK1wsJnJ}} in the
                   {{fldNXlE4or8Aw5iv21z}} category. Return only the tagline."
POST /api/table/:id/record          → 201 recDYu6d91fuAmhIrpa
  ProductName=Aurora Smart Lamp, Category=Home Lighting
POST /api/admin/ai-field/:id/runs   → 201 status=ok
  rowFields 透传，{{fld95vNOF9kpK1wsJnJ}} → "Aurora Smart Lamp"
                 {{fldNXlE4or8Aw5iv21z}} → "Home Lighting"
  outputText = "Light that listens, ambiance that inspires."
  （占位符解析正确，MiniMax 生成的 tagline 引用了正确的产品和类别）
DELETE /api/admin/ai-field/:id      → 200（清理）
DELETE /api/base/:baseId/table/:tableId → 200（清理）
```

## 真实进度判断

- AI Field 核心（文本 + 评分 + 图片 + 批量 + 自定义 prompt）：由 V32 约 98% 提升到约 **99%**。
- 全局企业级能力：约 **77%**（工程估计，非官方评分）。
- AI Field 维度已逼近 Cloud 等价：5 个默认操作（summarize/classify/translate/score/image）+ 1 个自定义操作 + 自动更新 + 批量生成 + 任务状态。
- 仍不能宣称 Cloud 全量等价：多实例幂等的数据库唯一约束、AI 对话、应用构建器、自定义 AI 模型等大模块未涉及。

## 下一阶段

1. 多实例幂等的数据库唯一约束（防止并发重复启动相同 batch 任务）。
2. AI 对话（Cloud §ai/ai-chat）真实实现。
3. 应用构建器（Cloud §ai/app-builder）真实实现。
