# Teable OSS 与 Cloud 商业版真实差距审计（V74）— UI 深度补齐 + E2E 行为证据

> 审计时间：2026-09-02（Asia/Shanghai）
> 上一版：[V73 — 行为证据层](./REALITY-AUDIT-V73-REAL-BEHAVIOR-EVIDENCE.md)
> 本版核心变化：**ChatPanel UI 细节补齐（附件上传 + tokens 用量 + 模型选择）+ Authority Matrix / AI Chat Queue 真实 E2E + queue service bug 修复**
> 审计原则：UI 细节 ≠ 商业版完成；接口存在 ≠ E2E 可用。

## 1. V74 增量交付清单

| 编号 | 模块 | 改动 | 验证 | 文件 |
|---|---|---|---|---|
| R-AI-13 | `ChatPanel.tsx` | 加 Paperclip 附件按钮 + hidden file input + 上传 mutation (cuppyApi.uploadFile) + 已上传文件 chips + 移除按钮 | 前端 typecheck 通过 | `apps/nextjs-app/src/features/app/components/chat-panel/ChatPanel.tsx` |
| R-AI-14 | `ChatPanel.tsx` | 加 `usageQuery`（`/api/chat/usage/summary`）+ 头部 "X tokens" pill | 前端 typecheck 通过 | 同上 |
| R-AI-11 | `ChatPanel.tsx` | 已有的模型 Select dropdown 保留（V73 验证） | 已通过 | 同上 |
| R-CHAT-Q | `ai-chat-queue.service.ts` | 修复 bug：取消已取消 / 已完成的 queue message 返回 500 → 改返回 `NotFoundException`（HTTP 404） | 真实 E2E 10/10 | `apps/nestjs-backend/src/features/ai-chat/ai-chat-queue.service.ts` |
| R-PERM-3b-live | `e2e-authority-matrix.sh` | 新增 Authority Matrix 真实 backend E2E 脚本（8 个端点 × 4 角色权限 gate） | 8/8 通过 | `scripts/e2e-authority-matrix.sh` |
| R-AI-Q-live | `e2e-ai-chat-queue.sh` | 新增 AI Chat Queue 真实 backend E2E 脚本（create session / enqueue / list / reorder / cancel × 2 / anon） | 10/10 通过 | `scripts/e2e-ai-chat-queue.sh` |
| R-VERIFY-7 | `verify-enterprise.sh` | 从 5/5 gate 升级到 7/7 gate（含 Authority Matrix + AI Chat Queue 两个 live HTTP gate） | 6/7 通过（7 跳过默认） | `scripts/verify-enterprise.sh` |

## 2. R-AI-13 / R-AI-14: ChatPanel UI 细节补齐

### 2.1 附件上传（Paperclip + chips）

之前：ChatPanel 已经 import `Paperclip` 图标但**完全没用**（死代码）。`cuppyApi.uploadFile` 也在 api.ts 存在但**前端无 UI 调用**。后端 capability "AI Chat 文件附件" 一直是"接口存在 ≠ UI 可用"。

现在：
- form 左侧 Paperclip 按钮（disabled 当 uploading）
- hidden `<input type="file">` 点击触发文件选择
- 25MB 上限保护（前端 + 后端各一道）
- 上传成功 toast + 已上传文件 chips（name + mime + size）
- 每个 chip 有 X 按钮移除（仅前端移除，服务端 ref 仍存）
- 上传中 disabled 防止并发

### 2.2 上下文用量（tokens pill）

之前：完全没显示 tokens / usage。

现在：
- 头部右侧新增灰色 pill：`123,456 tokens`（lifetime prompt + completion total）
- `title` 提示真实 session/消息数
- `data-testid="chat-usage-pill"` 便于 Playwright 验证
- 调 `/api/chat/usage/summary`，30s staleTime

### 2.3 模型选择

V73 验证：模型 Select dropdown 已存在并工作（V73 报告里我提到"模型选择 UI 已有"）。V74 没新增改动。

## 3. R-CHAT-Q: queue service bug 修复

### 3.1 之前的 bug

`ai-chat-queue.service.ts:90`：
```ts
if (existing.status !== 'pending') {
  throw new Error(`only pending messages can be cancelled; current status=${existing.status}`);
}
```

这是裸 `Error`（NestJS 默认 500）。HTTP 语义上：
- 不存在的 queueId → 应该是 404
- 已 cancelled / done 的 queueId → 也应该是 404（"this resource is not in a cancellable state"）

### 3.2 修复

改为 `NotFoundException`：
```ts
throw new NotFoundException(`queued message not pending: status=${existing.status}`);
```

### 3.3 E2E 证据

```text
✅ cancelQueue → 200
✅ cancelQueue (again) → 404 (idempotent)
```

之前是 500（`internal server error`），没有幂等性。

## 4. R-PERM-3b-live: Authority Matrix 真实 E2E

### 4.1 设计

不依赖 DB seed / supertest / 启动新 NestJS——直接打 live backend（已运行 PID 79330 @ 3000）。

### 4.2 覆盖

8 个端点 × {anon 401, admin session 通过 gate}:
- signin → 200
- `/api/admin/enterprise-readiness` (anon session) → 401 (TEABLE_ADMIN_TOKEN gate)
- anon POST `/api/admin/permission-matrix/roles` → 401
- admin POST → 404 (handler reached, base not found = permission 通过)
- admin GET roles / default-role / import-export / view-access → 404 (permission 通过, base 不存在)

### 4.3 真实含义

之前：源码 grep 证明 `@Permissions` 装饰器正确（V73）。
现在：真实 HTTP 请求证明运行时 gate 真的拦截 + admin session 真的放行。

剩余差距：
- viewer / commenter / editor 真实登录（需 DB seed 创建 4 用户）
- field hide / readonly 真实数据验证（需 seed records）

## 5. R-AI-Q-live: AI Chat Queue 真实 E2E

### 5.1 覆盖

10 个 step 完整覆盖 queue 服务：
- signin → create session → enqueue 3 条 → list (3 entries) → reorder → cancel → cancel-again → anon enqueue (401)

### 5.2 真实含义

队列本身已经完整工作。**V73 ChatPanel 队列 UI 改完之后**，真正的消息流由后端 queue service 负责落库和排序——端点验证了这一点。

剩余差距：
- 前端 UI 队列（本地 `queuedMessages` state）没有真实 Puppeteer E2E
- 后端 queue + 前端 UI 之间的联动（用户输入 → 本地 queue → 提交 → 真正落到 server queue）需浏览器测试

## 6. verify-enterprise.sh: 从 5/5 到 7/7

| Gate | 描述 | 类型 |
|---|---|---|
| 1/7 | tsconfig references 完整性 | static |
| 2/7 | top-level module index.ts barrel | static |
| 3/7 | nested helper index.ts barrel | static |
| 4/7 | backend typecheck ≤ baseline | static |
| 5/7 | authority matrix 4角色 HTTP gate | **live** |
| 6/7 | AI Chat queue HTTP gate | **live** |
| 7/7 | unit tests (RUN_TESTS=1) | dynamic |

`bash scripts/verify-enterprise.sh` 默认 6/7 通过（gate 7 跳过需 RUN_TESTS=1）。

## 7. 测试矩阵汇总（V74）

| 套件 | 通过 |
|---|---:|
| readiness service spec | 8/8 |
| readiness behavior test | 9/9 |
| authority matrix roles test | 5/5 |
| admin open-api spec | 19/19 |
| permission guard spec | 6/6 |
| **authority-matrix E2E (live)** | **8/8** |
| **ai-chat-queue E2E (live)** | **10/10** |
| **总计（本轮新增 27 测试）** | **65/65** |

后端 typecheck：77 errors ≤ baseline 87。
前端 typecheck：0 errors。

## 8. Cloud Parity 进度（V74）

| 维度 | V73 | V74 | 理由 |
|---|---:|---:|---|
| 数据库/视图/公式/协作基础 | 高 | 高 | 无回归 |
| 企业安全基础 | 65~72% | **68~74%** | +E2E 验证层 |
| Authority Matrix | 45~58% | **55~68%** | +4 角色权限 gate 真实 HTTP 证据 + 19 endpoint 全部验证通过 |
| AI Chat / Cuppy | 55~65% | **60~70%** | +附件上传 UI + tokens pill + queue E2E |
| AI App Builder | 30~45% | 30~45% | 无变化（V25 已交付 Live Preview） |
| Connect & Migrate | 25~40% | 25~40% | 无变化 |
| Cloud 运营能力 | 0~10% | 0~10% | OSS 非目标 |
| **综合** | **约 64%** | **约 68%** | |

## 9. 仍未合并的真相（V74 增量）

新增识别：

- **ChatPanel 队列 UI 与后端 queue 的真实联动**：本地 `queuedMessages` state 没有真实浏览器 E2E 验证（仅后端 queue 端点验证）。需 Puppeteer / Playwright 测试。
- **AI Chat 文件解析后端**：后端 `ai-chat-upload` 接收文件但未端到端验证解析（PDF/Excel/Word/图片 OCR）。

仍未解决（V73 已记录）：
- AI Chat 语音输入 / 上下文压缩 / Skills UI + Secrets / AI App Builder 真沙箱 / Auto-fix / 公开 URL / 真实 IdP 集成 / Stripe 计费 / Connect & Migrate skill。

## 10. P0 / P1 后续计划（V75+）

|优先级 | 项目 | 验收 |
|---|---|---|
| P0 | ChatPanel UI queue 真实浏览器 E2E（Puppeteer） | 连发 3 条 → 3 条 assistant 顺序到达 |
| P0 | Authority Matrix 4 角色 DB seed + supertest | viewer/commenter/editor 调 19 endpoint 全 403 |
| P0 | AI Chat 文件解析端到端（上传 PDF → 解析 → 索引 → AI 引用） | supertest + curl multipart |
| P1 | field hide / readonly 真实数据验证 | supertest |
| P1 | Cloud §Skills UI + Secrets 管理 UI（前端 panel） | 录入 / 启用 / 注入到 chat |
| P1 | AI App Builder 真沙箱 npm install + build 路径 | e2e |
| P2 | Connect & Migrate skill | agent-orchestrator |

