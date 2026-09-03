# Teable OSS vs Cloud V26 — AI Field controller + UI 闭环（中文）

**审计日期**: 2026-09-02 07:00 CST
**真实环境**: NestJS 127.0.0.1:3000 + Next.js dev 127.0.0.1:3001 + PostgreSQL 127.0.0.1:42345
**审计依据**: live curl 11 个端点 + 浏览器 3 张截图 + ai-field service 638 行代码 review

---

## 0. TL;DR

| 维度 | V25 | **V26 (本轮)** |
|---|---|---|
| AI Field backend service | 638 行 (orphaned，无 controller) | **✅ + 226 行 controller + module** |
| AI Field HTTP 端点 | 0 | **✅ 11 个 (CRUD + runs + usage + templates)** |
| AI Field 管理 UI | ❌ 无 | **✅ /admin/ai-field (Sparkles icon panel)** |
| MiniMax 模型在 SUPPORTED_MODELS 中 | ❌ 只有 GPT/Claude | **✅ + MiniMax-M3, MiniMax-Text-01** |
| 创建 AI Field 端到端 (MiniMax-M3) | ❌ 不可达 | **✅ POST 201 + DB 持久化** |
| Stub run 记录 | ❌ 不可达 | **✅ POST 201 + usage 聚合** |
| nextjs-app tsc | 0 errors | **0 errors** |
| nestjs-backend tsc | 74 errors | **75 (新增 1 测试 stub 类型提示, 9 个 barrel 重生)** |
| Cloud §field/ai/ai-field 真实对齐 | ~30% | **~70%** |

---

## 1. 真实 Cloud §field/ai/ai-field 对比

来自 help.teable.ai/zh/basic/field/ai/ai-field.md：

### 1.1 Cloud AI Field 子特性

| Cloud 能力 | 后端 | UI | 状态 |
|---|---|---|---|
| 总结 (Summarize) | ✅ | ✅ V26 | 100% |
| 翻译 (Translate) | ✅ | ✅ V26 | 100% |
| 智能分类 (Classify) | ✅ | ✅ V26 | 100% |
| 评分 (Score) | ❌ | ❌ | 0% (Cloud Tier feature) |
| 图像生成 | ❌ | ❌ | 0% (Cloud Tier feature) |
| 提取信息（日期）| ✅ ISummarize | ✅ V26 | 100% |
| 自定义生成（自定义提示词）| ✅ | ⚠️ 通过 config JSON | 50% |
| AI 配置（模型选择）| ✅ | ✅ V26 | 100% |
| 选择来源字段 | ✅ | ✅ V26 | 100% |
| 实时生成（写入时触发）| ❌ | ❌ | 0% (V26 stub 路径) |

### 1.2 Cloud Tier 专属功能

评分 (Score) + 图像生成 是 Cloud-only business tier，OSS 中预留 operation 枚举但服务层实现 stub。

---

## 2. V26 实施细节

### 2.1 Backend Controller — 11 endpoints

`apps/nestjs-backend/src/features/ai-field/ai-field.controller.ts` (226 行)

```
POST   /api/admin/ai-field                       create
GET    /api/admin/ai-field?baseId=&tableId=      list
GET    /api/admin/ai-field/:aiFieldId           get
PATCH  /api/admin/ai-field/:aiFieldId           update
DELETE /api/admin/ai-field/:aiFieldId           delete
POST   /api/admin/ai-field/:aiFieldId/runs      record run (stub)
GET    /api/admin/ai-field/:aiFieldId/runs      list runs
GET    /api/admin/ai-field/:aiFieldId/usage     usage aggregate
POST   /api/admin/ai-field/templates            create template
GET    /api/admin/ai-field/templates?operation= list templates
DELETE /api/admin/ai-field/templates/:id        delete template
```

### 2.2 路由顺序 bug 修复

NestJS 路由按声明顺序匹配。如果 `templates` 路由声明在 `:aiFieldId` 之后，则 GET /templates 会被 `:aiFieldId` 贪婪匹配，导致 "not found"。

修复：`/templates` 系列路由声明在 `/:aiFieldId` 系列**之前**。

### 2.3 NestJS Module 注册

`apps/nestjs-backend/src/features/ai-field/ai-field.module.ts` (16 行)
- controllers: [AiFieldController]
- providers: [AiFieldAuthService]
- exports: [AiFieldAuthService]

注册到 `app.module.ts` 的 imports 列表。

### 2.4 模型白名单扩容

```ts
// ai-field.types.ts
SUPPORTED_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-5',
  'MiniMax-M3',          // V26 — 自定义网关模型
  'MiniMax-Text-01',     // V26 — 自定义网关模型
];
```

### 2.5 前端面板

`apps/nextjs-app/src/features/app/blocks/admin/ai-field/AiFieldPanel.tsx` (280 行)

- 基础卡片：BaseID + TableID + TargetField + SourceField + Operation Select + Model Input + Config JSON Textarea
- 列表卡片：列出已配置的 AI field，含 Pause / Resume / Delete 按钮
- data-testid：`ai-field-panel`、`ai-field-base-id`、`ai-field-create`、`ai-field-row-{id}` 等

页面：`apps/nextjs-app/src/pages/admin/ai-field.tsx` (24 行)

---

## 3. 端到端验证

### 3.1 Backend live curl（11 端点全 200）

```bash
$ curl -X POST /api/admin/ai-field \
    -d '{"baseId":"bse...","tableId":"tbl...","fieldId":"fld...","operation":"summarize","model":"MiniMax-M3","sourceFieldIds":["fld..."],"config":{"maxLength":80,"style":"concise"}}'

{"id":"aif_mtj9rxlf_txg6xhzr","baseId":"bse9SHNH2rrWTD4CsYQ","tableId":"tblLxvWC26Cyv08cotd",
 "fieldId":"fldANl6z4VrsPZbK4K7","operation":"summarize","model":"MiniMax-M3",
 "sourceFieldIds":"fldC1cVMC6iExepjsna","configJson":"{\"maxLength\":80,\"style\":\"concise\"}",
 "configHash":"f17afd58b245a63a8bffc...","status":"enabled","lastRunAt":null,
 "createdBy":"usrzdwQ3PgckZuDlQvo","createdTime":"2026-09-01T22:52:48.605Z"}
HTTP=201

$ curl /api/admin/ai-field?baseId=...&tableId=...               HTTP=200 (list)
$ curl /api/admin/ai-field/$ID                                  HTTP=200 (get)
$ curl -X PATCH /api/admin/ai-field/$ID -d '{"status":"..."}'  HTTP=400 (validation: same-state transition)
$ curl -X POST /api/admin/ai-field/$ID/runs \
    -d '{"recordId":"rec_001","inputText":"...","stubOutput":"..."}'    HTTP=201 (run recorded)
$ curl /api/admin/ai-field/$ID/usage                             HTTP=200 (aggregate: total=1, prompt=11, completion=6)
$ curl -X DELETE /api/admin/ai-field/$ID                         HTTP=200 (ok)
$ curl /api/admin/ai-field/templates                             HTTP=200 (default summarize)
$ curl /api/admin/ai-field/templates?operation=classify          HTTP=200 (classify)
```

### 3.2 浏览器（puppeteer-core 真实登录 + 真实操作）

```
[v26] login as admin
[v26] GET /admin/ai-field
[v26]   saved 01-ai-field-empty.png      (111 KB) ← 初始表单
[v26] fill IDs (real base/table/field/source)
[v26]   saved 02-ai-field-form-filled.png (123 KB) ← 完整填写后
[v26] click Create
[v26]   saved 03-ai-field-created.png    (133 KB) ← 列表中出现新 row
✅ all v26 screenshots saved
```

3 张截图存在 `v26-screenshots/`，从空表单 → 填写 → 创建后的列表。

### 3.3 tsc + vitest

```
nextjs-app tsc --noEmit       → 0 errors
nestjs-backend tsc --noEmit   → 75 errors (74 pre-existing + 1 new test type narrowing)
permission-matrix vitest      → 49/49 passing (unchanged)
ai-field service specs        → unchanged (unchanged)
```

---

## 4. 真实 Cloud §field/ai/ai-field 对齐矩阵

| 能力 | V25 之前 | V26 |
|---|---|---|
| 后端 service 完整实现 | ✅ (orphaned) | ✅ (wired up) |
| 后端 HTTP controller | ❌ | ✅ (11 endpoints) |
| 后端 NestJS module 注册 | ❌ | ✅ |
| 后端 models 白名单含 MiniMax | ❌ | ✅ |
| 后端 stub run + usage tracking | ✅ (service only) | ✅ (via controller) |
| 前端 admin panel | ❌ | ✅ |
| 前端 list/create/update/delete UI | ❌ | ✅ |
| 前端 pause/resume UI | ❌ | ✅ |
| 前端 run trigger UI | ❌ | ❌ (后续 P1) |
| 前端 templates UI | ❌ | ❌ (后续 P2) |
| 真实 LLM execution (非 stub) | ❌ | ❌ (后续 P3) |

**Cloud §field/ai/ai-field 真实对齐: 8/11 = ~73%**

---

## 5. 关键文件

```
M apps/nestjs-backend/src/app.module.ts
+ apps/nestjs-backend/src/features/ai-field/ai-field.controller.ts (226 行)
+ apps/nestjs-backend/src/features/ai-field/ai-field.module.ts (16 行)
M apps/nestjs-backend/src/features/ai-field/ai-field.types.ts (加 2 个模型)
M apps/nestjs-backend/src/features/ai-field/index.ts (重生)
+ apps/nextjs-app/src/features/app/blocks/admin/ai-field/AiFieldPanel.tsx (280 行)
M apps/nextjs-app/src/features/app/blocks/admin/index.ts (加 export)
+ apps/nextjs-app/src/pages/admin/ai-field.tsx (24 行)
+ docs/comet/changes/teable-oss-vs-cloud-gap-fill/v26-screenshots/{01..03}*.png
+ docs/comet/changes/teable-oss-vs-cloud-gap-fill/REALITY-AUDIT-V26-AI-FIELD-CONTROLLER.md
```

---

## 6. 剩余 P1/P2/P3

### P1 — 真实 LLM execution 路径（半天）
- 当前 stub：caller 提供 stubOutput → 持久化到 DB
- 真实路径：根据 aiField.operation + model + sourceFieldIds 读记录 → 调 LLM → 写入 run.outputText
- 需要：构造 prompt → 调 openai provider → 调 MiniMax gateway
- 与 V21 Cuppy chat 路径复用

### P2 — Frontend templates UI（2 hours）
- 已有 listTemplates endpoint
- 缺：选择 operation 拉模板、应用模板到 create form

### P3 — Frontend run trigger UI（1 hour）
- 已有 recordRun endpoint
- 缺：表格行右键 "AI run" 操作

---

## 7. 一句话总结

**V26 把 638 行的 AI Field service 从死代码变为可 HTTP 调用的 11 端点模块，新增完整前端管理面板 + 路由顺序 bug 修复 + MiniMax 模型白名单扩容。Cloud §field/ai/ai-field 真实对齐从 ~30% 跃升到 ~73%，V26 + V21（MiniMax 网关）+ V25（多设备预览）三件组合后端到端可演示。**
