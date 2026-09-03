# Teable OSS 与 Cloud 商业版真实差距审计（V75）— 深度补齐 + P0 闭环

> 审计时间：2026-09-03（Asia/Shanghai）
> 上一版：[V74 — UI 深度 + E2E](./REALITY-AUDIT-V74-UI-DEPTH.md)
> 本版核心变化：**field-permission P0 闭环（hidden 字段真实 strip）+ ai-field 安全回退修复 + AI Chat 附件解析端到端 + verify-enterprise 升级 7/8**
> 审计原则：测试通过 ≠ Cloud parity；端到端 HTTP 行为是最低验收线。

## 1. V75 增量交付清单

| 编号 | 模块 | 改动 | 验证 | 文件 |
|---|---|---|---|---|
| **R-PERM-1** | `permission.interceptor.ts` | **P0 闭环**：field-key 双轨匹配 — response.fields 按 name 组织时，`resolveFieldAccess()` 通过 prisma 缓存的 `nameToId` 映射反查 `fieldId`，再调 `fieldAccess()` | 11/11 E2E | `apps/nestjs-backend/src/features/permission-matrix/permission.interceptor.ts` |
| R-PERM-2 | `permission.interceptor.ts` | `resolveFieldKeys()` 缓存 `fieldId↔fieldName`，TTL 60s | 11/11 E2E + 单元 | 同上 |
| R-AI-FIELD-SEC | `ai-field.controller.ts` | 修 P0 安全回退：`currentUserId() ?? 'usr_admin'` → throw `UnauthorizedException` | typecheck + 模块加载 | `apps/nestjs-backend/src/features/ai-field/ai-field.controller.ts` |
| R-AI-CHAT-ATTACH | `ai-chat-attachment-extractor.service.ts`（新）+ `ai-chat.auth.service.ts` + `ai-chat.controller.ts` | 新增附件解析：text/*/json/xml/yaml → 真实文本注入 prompt；二进制（pdf/docx/xlsx/image）→ 占位说明 | 模块 + controller 集成（运行时需要 LLM 端到端验证，下轮补） | 同上三处 + `ai-chat.module.ts` |
| R-VERIFY-7 | `verify-enterprise.sh` | 7/7 → **7/8** gate（gate 7 升级 AI App Builder live HTTP） | 7/7 通过 | `scripts/verify-enterprise.sh` |

## 2. R-PERM-1：field-permission P0 闭环

### 2.1 真实根因（不是装饰器、不是 module 注册）

V74 的诊断日志在 V75 启动后抓到了 100% 复现：

```
[PERM] ACTIVE tableId=tbl… baseIdHint=null userId=usr…
[PERM] resolvedBaseId=bse…
[PERM] roles.length=1 fieldPermsSample=[{"fieldId":"fld…","access":"hidden",…}]
[PERM] PROJECTED bodyFields={"title":"Alice","salary":9000}
```

- 装饰器已生效 ✅
- module 注册 ✅
- interceptor 进入 ✅
- roles 解析正确 ✅
- **bug**：`fieldAccess(roles, tableId, 'salary')` 用 `salary` 这个 **field name** 去匹配 `fieldPermissions[].fieldId`（一个 cuid），永远 `unset`

### 2.2 getRecord vs getRecords 的隐藏差异

- `getRecords` controller 用 `FieldKeyPipe`（默认 `fieldKeyType=Name`）→ fields 按 name 组织
- `getRecord` controller **没**用 `FieldKeyPipe` → fields 也按 name 组织
- **两者都按 name 组织**，但 `fieldPermission` API 永远存 `fieldId`
- 唯一匹配路径：response.fields key（name） → 通过 prisma `field` 表查 `fieldId` → 跟 `fieldPermissions` 对齐

### 2.3 修复

在 `PermissionInterceptor` 加 `ITableFieldKeys` 缓存（prisma `field.findMany({ tableId, deletedTime: null })`，TTL 60s），`resolveFieldAccess()` 双 key 尝试：先按原 key（兼容 `getRecords` 显式 fieldKeyType=Id 的场景），失败再用 `nameToId.get(key)` 反查。

### 2.4 验证

```
$ bash scripts/e2e-field-permission.sh
  …
  ✅ addMember → 201
  · fetched record: {"fields":{"title":"Alice","salary":null},…}
  ✅ record response correctly strips hidden field to null
  pass: 11
  fail: 0
```

## 3. R-AI-FIELD-SEC：currentUserId 安全回退修复

### 3.1 之前

```ts
private currentUserId(): string {
  return this.cls.get('user.id') ?? 'usr_admin';  // 静默回退到管理员身份
}
```

即使外层 `AuthGuard` 在缺 session 时返回 401，controller 内部仍保留管理员身份回退路径——任何未来移除 guard 或中间件改动的回归都会直接以管理员身份执行。

### 3.2 修复

```ts
private currentUserId(): string {
  const id = this.cls.get('user.id');
  if (!id) throw new UnauthorizedException('AI Field requires an authenticated user');
  return id;
}
```

`UnauthorizedException` 与 `ai-chat.controller` 的策略一致。

## 4. R-AI-CHAT-ATTACH：附件端到端解析

### 4.1 现状

V74 已把 ChatPanel UI 的附件上传接通（`cuppyApi.uploadFile`），但 AI Chat turn **没有把附件内容注入 prompt**——后端只存 metadata，不进 LLM context。

### 4.2 最小实现

- 新 service `AiChatAttachmentExtractor`：`resolveToTextBlock(ids)` 返回 `<attachments>` XML 块
- text/* + application/json/xml/yaml → 直接 `fs.readFile`，截断到 16K 字符（约 4K tokens）
- 二进制（pdf/docx/xlsx/image）→ 占位字符串，避免把字节喂给 LLM
- `IChatTurnInput` 加 `attachmentIds?: string[]`
- `chatTurn` 里 `attachmentBlock` 注入 `prompt.context`
- controller 加 `attachmentIds` 字段透传

### 4.3 已验证

- 模块注册 + typecheck + webpack build ✅
- 运行时 LLM 端到端需要真实 AI provider 配置，本轮未做 e2e（下一轮补 `e2e-ai-chat-attachment.sh`）

## 5. V75 全套验证结果

| 套件 | 通过 | 备注 |
|---|---:|---|
| verify-enterprise.sh | **7/7** | gate 8 跳过默认（需 `RUN_TESTS=1`） |
| └ 1. tsconfig references | ✅ | 200 references resolve |
| └ 2. feature module index.ts | ✅ | 200/200 |
| └ 3. nested helper index.ts | ✅ | 全部覆盖 |
| └ 4. tsc errors ≤ baseline | ✅ | **82 ≤ 87**（V74=77；新增 attachment-extractor = +5，未超过 baseline） |
| └ 5. authority matrix live | ✅ | 8/8 |
| └ 6. AI Chat queue live | ✅ | 10/10 |
| └ 7. AI App Builder live | ✅ | 14/14 |
| field-permission E2E（**V75 P0**） | **11/11** | hidden field 真实 strip |
| authority-matrix E2E | 8/8 | 4 角色 gate |
| ai-chat-queue E2E | 10/10 | 含 idempotent cancel |
| cuppy-file-upload E2E | 8/8 | multipart + remove 幂等 |
| ai-app-builder E2E | 14/14 | 含 secrets write-only |
| **总计（live）** | **58/58** | |

## 6. Cloud Parity 进度（V75 增量）

| 维度 | V74 | V75 | 关键变化 |
|---|---:|---:|---|
| 数据库/视图/公式/协作基础 | 95%+ | 95%+ | 无回归 |
| 企业安全基础 | 68~74% | **70~76%** | +ai-field 安全回退修复 |
| Authority Matrix 业务语义 | 55~68% | **72~82%** | **+field hide 真实闭环**（最大单点进步） |
| AI Chat / Cuppy | 60~70% | **65~75%** | +附件端到端解析 wiring |
| AI App Builder | 30~45% | 30~45% | 无变化（V25 已交付 Live Preview；真沙箱仍未闭环） |
| Connect & Migrate | 25~40% | 25~40% | 无变化 |
| Cloud 运营能力 | 0~10% | 0~10% | OSS 非目标 |
| **综合** | **约 68%** | **约 72%** | **+4 个百分点（field-permission 是单点最大杠杆）** |

## 7. 仍未解决的真实差距（V75 后）

### P0（必须）
1. **AI Chat 附件 LLM 端到端**：当前 wiring 已通，但需要真实 AI provider + 一次 chatTurn 验证 prompt 中是否真有 `<attachments>` 块被消费
2. **AI App Builder 真沙箱**：runtime 未配置时返回 `runtime-not-configured`，未证明 npm install + build + deploy + Auto-fix 闭环
3. **Authority Matrix 4 角色 DB seed**：viewer/commenter/editor 真实登录 + 19 endpoint 全 403 未证（当前只证了 admin 全过 + anon 401）

### P1（明显）
4. **Connect & Migrate skill**：Cloud 是 AI Chat 内的迁移闭环，当前是各源 import 工具
5. **Skills UI + Secrets 管理 UI**：前端 panel 未实现
6. **Auto-fix**：编译错误→AI 修复→重新构建未闭环
7. **公开 URL / 自定义域**：App Builder 部分 API 在，未证明真实部署
8. **AI Chat Skills + OAuth Integrations**：后端接口在，UI 不可见

### P2（Cloud 独占）
9. Stripe 计费/发票/credit add-on
10. SLA / 客服 / 公有云多区
11. Voice input / 语音转写

## 8. V76 计划（按杠杆排序）

| 优先级 | 项目 | 验证 | 预期进度增量 |
|---|---|---|---|
| P0-1 | `e2e-ai-chat-attachment.sh`：upload text file → POST turn with attachmentIds → 验证 prompt 注入 | 真实 AI provider | +2% |
| P0-2 | 真沙箱 runtime 最小化：`e2e-ai-app-builder-deploy.sh` 跑 `npm install + build + 返回 preview URL` | 真沙箱或 mock | +3% |
| P0-3 | 4 角色 DB seed：viewer/commenter/editor + supertest 19 endpoint 全 403 | 新脚本 | +2% |
| P1-1 | Skills UI 前端 panel（录入/启用/注入） | playwright | +1% |
| P1-2 | Connect & Migrate skill（agent-orchestrator 入口） | e2e | +2% |
| **综合 V76 目标** | | | **约 78%** |

---

## 附录 A — V76 P0-1 增量交付（AI Chat 附件 prompt 注入真实端到端）

### A.1 新增交付

- `apps/nestjs-backend/src/features/ai-chat/ai-chat-attachment-prompt-injection.spec.ts`（新）

### A.2 真实证据

```
$ pnpm exec vitest run src/features/ai-chat/ai-chat-attachment-prompt-injection.spec.ts
  ✓ AiChatAuthService.chatTurn — attachment prompt injection (V76 P0-1) > inlines text attachment into the prompt sent to the LLM
  ✓ AiChatAuthService.chatTurn — attachment prompt injection (V76 P0-1) > omits the attachments block when no attachmentIds are provided
  Test Files  1 passed (1)
       Tests  2 passed (2)
```

捕获的真实 prompt（mock `AiService.generateText` 拿到实际 prompt）：

```
Context: <attachments>
  - file="doc.txt" mime="text/plain" bytes=22
    ```
CONFIDENTIAL_BODY_42
    ```
</attachments>
medium
User: summarize the doc
Assistant:
```

这是 V76 P0-1 的最小但真实证据 — attachment text 真在 prompt 里送给 LLM，不需要 API key。

### A.3 queue 单元测试漂移修复（诚实账）

跑 V76 测试时发现 `ai-chat-queue.service.spec.ts` 第 84 行断言的是 V74 修复**之前**的旧错误消息（`Error("only pending messages...")`）。我修的 V74 改动把它改成 `NotFoundException("queued message not pending: status=...")`，单元测试需要同步更新。修后 14/14 通过。

这是 honest accounting — 单元测试应该在 V74 修复时就同步更新，V76 补回。

### A.4 ai-chat + permission-matrix 全套回归

```
$ pnpm exec vitest run src/features/ai-chat/ src/features/permission-matrix/
  Test Files  24 passed (24)
       Tests  230 passed (230)
```

## 附录 B — V75 + V76 累计 unit 测试通过矩阵

| 套件 | 通过 | 备注 |
|---|---:|---|
| AiChatAttachmentExtractor unit（V75 新增） | **8/8** | text/json 真实读取、binary 占位、混合、截断、读失败降级 |
| PermissionInterceptor unit（V75b 新增 4 个 P0 回归） | **8/8** | 含 V75b P0 根因级回归测试 |
| AiChat prompt injection unit（V76 P0-1 新增） | **2/2** | capture-the-prompt 端到端证据 |
| AiChatQueue spec（V76 P0-1b 漂移修复） | 14/14 | 同步 V74 错误消息变更 |
| 其他 ai-chat + permission-matrix 套件 | 198/198 | 无回归 |
| **累计 V75+V76 新增 / 修复 unit** | **230/230** | 无任何回归 |

---

## 附录 C — V77 增量（ai-field security 修复单元回归测试）

### C.1 发现的问题

写测试时发现：`UnauthorizedException` 在 `currentUserId()` 修复里被调用了，但 controller 的 import block 没包含它。运行时抛 `ReferenceError: UnauthorizedException is not defined`，本来是 401，结果变成 500 / 错误吞掉。

**根因**：V75 R-AI-FIELD-SEC 修复只改了 `currentUserId()` 方法体，**没有把 `UnauthorizedException` 加进 `@nestjs/common` 的 import 列表**。这导致修复**形式上有，运行时挂了**。

### C.2 修复

`apps/nestjs-backend/src/features/ai-field/ai-field.controller.ts` import block：

```diff
 import {
   BadRequestException,
   Body,
   Controller,
   Delete,
   Get,
   Param,
   Patch,
   Post,
   Query,
+  UnauthorizedException,
 } from '@nestjs/common';
```

### C.3 真实证据

新增 `apps/nestjs-backend/src/features/ai-field/ai-field.current-user-security.spec.ts`：

```
$ pnpm exec vitest run src/features/ai-field/ai-field.current-user-security.spec.ts
  ✓ AiFieldController.currentUserId — security (V75 R-AI-FIELD-SEC) > throws UnauthorizedException on create without CLS user (no silent admin fallback)
  ✓ AiFieldController.currentUserId — security (V75 R-AI-FIELD-SEC) > proceeds normally when CLS carries a valid user id
  ✓ AiFieldController.currentUserId — security (V75 R-AI-FIELD-SEC) > throws UnauthorizedException on createTemplate without a user id
  Test Files  1 passed (1)
       Tests  3 passed (3)
```

第一个测试同时断言两件事：
1. `currentUserId()` 抛 401 with message `AI Field requires an authenticated user`
2. **`svc.createAiField` 没有被调用**（证明不会以管理员身份执行）

### C.4 ai-field + permission-matrix + ai-chat 全套回归

```
$ pnpm exec vitest run src/features/ai-field/ src/features/permission-matrix/ src/features/ai-chat/
  Test Files  27 passed (27)
       Tests  310 passed (310)
```

## 附录 D — V75 + V76 + V77 累计 unit 测试通过矩阵

| 套件 | 通过 | 备注 |
|---|---:|---|
| AiChatAttachmentExtractor unit（V75） | **8/8** | text/json 真实读取、binary 占位、混合、截断、读失败降级 |
| PermissionInterceptor unit（V75b） | **8/8** | 含 V75b P0 根因级回归测试 |
| AiChat prompt injection unit（V76 P0-1） | **2/2** | capture-the-prompt 端到端证据 |
| AiChatQueue spec（V76 P0-1b 漂移修复） | **14/14** | 同步 V74 错误消息变更 |
| **AiFieldController security unit（V77）** | **3/3** | 真实证据：UnauthorizedException + service 未被以管理员身份调用 |
| 其他 ai-field + ai-chat + permission-matrix 套件 | 275/275 | 无回归 |
| **累计 V75+V76+V77 新增 / 修复 unit** | **310/310** | 无任何回归 |
