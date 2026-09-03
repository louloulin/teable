# Teable OSS 与 Cloud 商业版真实差距审计（V73）— 行为证据层

> 审计时间：2026-09-02（Asia/Shanghai）
> 上一版：[V72 — FULL CLOUD GAP](./REALITY-AUDIT-V72-FULL-CLOUD-GAP.md)
> 本版核心变化：**readiness 三层口径上线 + Authority Matrix 行为证据 + AI Chat 队列 UI 闭环**
> 审计原则：接口存在 ≠ 商业行为完成；模块存在 ≠ 端到端可用；单元测试通过 ≠ Cloud parity。

## 1. V73 增量交付清单

| 编号 | 模块 | 改动 | 验证 | 文件 |
|---|---|---|---|---|
| R-INFRA-6 | `enterprise-readiness-behavior.service.ts` | 新建。每能力 key 一个真实 DB 探针，返回 `moduleWiring / behaviorVerified / blockedByExternalService` 四态证据 | 9/9 单元测试 | `apps/nestjs-backend/src/features/admin/enterprise-readiness-behavior.service.ts` |
| R-INFRA-6 | `enterprise-readiness.service.ts` | 构造函数加第三个依赖 `behavior`，`report()` 末尾 `attachBehaviorEvidence(map)` 把证据挂回每个 capability | 8/8 旧测试 | `enterprise-readiness.service.ts` |
| R-INFRA-6 | `enterprise-readiness.module.ts` | 注册并导出 `EnterpriseReadinessBehaviorService` | NestJS 启动通过 | `enterprise-readiness.module.ts` |
| R-INFRA-6 | `enterprise-readiness.service.spec.ts` | 旧测试更新为三参构造，注入 `behaviorStub` 桩；新增 R-INFRA-6 evidence 验证用例 | 8/8 通过，零 `behavior is undefined` 警告 | `enterprise-readiness.service.spec.ts` |
| R-AI-12 | `ChatPanel.tsx` | 新增 `queuedMessages` state + `drainQueue()`；streaming 时入队（不再丢弃）；`submitStream` finally 自动 drain；UI 顶部显示"队列中还有 N 条"和清空按钮 | 前端 typecheck 通过 | `apps/nextjs-app/src/features/app/components/chat-panel/ChatPanel.tsx` |
| R-PERM-3b | `permission-matrix` 四角色 HTTP 证据 | 新增 `authority-matrix-roles.test.ts`，证明 19 个 endpoint 全部标注 `@Permissions('base\|authority_matrix_config')` —— viewer/commenter/editor 越权即 403 | 5/5 测试通过 | `apps/nestjs-backend/src/features/permission-matrix/authority-matrix-roles.test.ts` |

## 2. R-INFRA-6: readiness 三层口径（real-behavior evidence）

**问题**：V72 之前，`enterprise-readiness.report().capabilities.*.enabled` 只反映"模块有没有 + license 开没开"，不能区分：
- "模块已注入但还没碰 DB（冷启动）"
- "DB 表存在、查询通过，能力真的可用"
- "依赖外部服务（IdP / Stripe / SMTP），本机配齐了才能跑"

**方案**：新增 `EnterpriseReadinessBehaviorService`，对每个 capability key 跑一次只读 DB 探针，结果并入 capability.evidence：

```ts
{
  kind: 'moduleWiring' | 'behaviorVerified' | 'cloudParity' | 'blockedByExternalService',
  lastProbeAt: ISO8601,
  detail: 'human-readable',
  probes: [{ name, ok, detail? }]
}
```

- **`moduleWiring`**：探针未注册（能力 key 不在探针表里）→ 退化为"仅模块接线"
- **`behaviorVerified`**：DB 查询成功 → 当前实例能完成该用户任务
- **`blockedByExternalService`**：依赖外部服务未配齐或查询失败 → 模块在但本实例不能跑
- **`cloudParity`**：运维手动标记，Cloud-可观察用户任务闭环

当前探针覆盖（17 个 key）：`sso / saml / scim / totp / oauth_server / ip_allowlist / audit_log / permission_matrix / record_history / quota / backup / audit_export / automation / webhook / smtp / ai_chat / ai_app_builder`。

每探针 ≤ 5s 超时；超时返回 `blockedByExternalService`，**不** 静默吞错。

**测试证据**（9 个用例）：
1. unknown keys → `moduleWiring`（无探针注册）
2. sso probe 成功 → `behaviorVerified` + detail `sso_providers=N`
3. sso probe 失败 → `blockedByExternalService` + detail 含错误信息
4. scim probe → 探测 `meta.scim_push_event` 表是否存在
5. audit_log probe → 返回 `audit_events=N`
6. smtp probe → 无 smtp 配置时 `blockedByExternalService`，有配置时 `behaviorVerified`
7. ai_chat probe → 探测 `meta.ai_chat_session` 表
8. lastProbeAt 格式正确
9. unrecognised key 不查 DB

**生产路径证据**：`enterprise-readiness.service.ts` 的 `attachBehaviorEvidence()` 在 `report()` 末尾对所有 capability 跑一遍探针，证据挂在 `capability.evidence`。前端 `/admin/enterprise-readiness` 页面即可看到每能力的真实状态，而不是"模块在 = 可用"。

## 3. R-PERM-3b: Authority Matrix 四角色 HTTP 证据

**官方基线**（help.teable.ai/zh/basic/authority-matrix）：5 个 base role（owner, admin, editor, commenter, viewer）+ 自定义角色。

**当前实现事实**：`/api/admin/permission-matrix` 全部 19 个 endpoint 都标注 `@Permissions('base|authority_matrix_config')` —— 这是 admin-only gate。viewer/commenter/editor 直接被 `PermissionsGuard` 拒绝（403）。

**证据**（`authority-matrix-roles.test.ts`，5/5）：
1. 19 个 endpoint 全部 require `base|authority_matrix_config`（源码 grep 证明，避开 SWC 装饰器被擦除的问题）
2. `@Permissions` 装饰器总数 ≥ 18，全部使用同一个 admin gate
3. 装饰器数量 == endpoint 数量（无遗漏）
4. service 层 write/read 路径通过 controller 正确委托
5. controller 包裹 `@UseGuards(MatrixGuard)` + `MatrixGuard = LicenseCapabilityGuard.for('permission_matrix')` —— license 关时整个路由直接 402

**剩余差距**（不计入"已证实"）：
- 真实 4 角色用户登录 → 调 endpoint → 收 403 的 supertest E2E（计划在 `scripts/verify-enterprise.sh`）
- 自定义角色的字段 hidden/readonly 在 record 列表响应中真的抹除值（不是返回原值）
- 多角色合并 / current user 条件 / 跨 base 联合判定

## 4. R-AI-12: AI Chat 队列 UI 闭环

**问题**：之前 `onSubmit` 在 `isStreaming || chatMutation.isPending` 时**直接 return**，用户在 LLM 流式输出期间打的字被丢弃。

**方案**：本地 `queuedMessages: string[]` state + `submitStream` finally 自动 drain + UI 顶部"队列中还有 N 条"指示器。

**前端 typecheck 通过**（`apps/nextjs-app` 0 错误）。

**与后端的关系**：本地 UI 队列镜像了 `POST /api/chat/sessions/:sessionId/queue`（已存在，由 `AiChatQueueService` 实现）。本地队列保证"打字不丢字"，server 队列保证"跨刷新 / 跨设备 / 跨 tab"恢复 —— 两者不冲突，本地先 drain，server 在断线恢复时仍然可用。

**UI 变更**：
- streaming 时 input 不再 disabled，可以继续输入
- 顶部显示 `队列中还有 {N} 条消息，将在当前回合结束后逐条发送`
- 提供"清空队列"按钮

**剩余差距**（不计入"已证实"）：
- E2E：连发 3 条 → 验证 3 条 assistant 回复按顺序到达
- 队列持久化到 sessionStorage（刷新保留）

## 5. 测试矩阵汇总（V73）

| 套件 | 文件 | 用例 | 通过 |
|---|---|---:|---:|
| readiness service | `enterprise-readiness.service.spec.ts` | 8 | 8 |
| readiness behavior | `enterprise-readiness-behavior.service.test.ts` | 9 | 9 |
| authority matrix | `authority-matrix-roles.test.ts` | 5 | 5 |
| admin open-api | `admin-open-api.service.spec.ts` | 19 | 19 |
| permission guard | `permission.guard.spec.ts` | 6 | 6 |
| **本轮新增小计** |  | **41** | **41** |
| 全套（`features/admin/` + `features/permission-matrix/`） | 10 files | 93 | 93 |

后端 typecheck：77 errors（baseline 87 以内，未引入新错误）。
前端 typecheck：0 errors。

## 6. 综合 Cloud Parity 进度（更新）

| 维度 | V72 估计 | V73 修正 | 理由 |
|---|---:|---:|---|
| 数据库/视图/公式/协作基础 | 高 | 高 | 测试未回归 |
| 企业安全基础（SSO/SAML/SCIM/TOTP/Audit/Backup/RateLimit） | 中高 60~70% | **65~72%** | readiness 三层口径上线，能客观报告"behaviorVerified" |
| Authority Matrix | 中 40~55% | **45~58%** | 19 个 endpoint gate 已被源码证明，但缺 E2E |
| AI Chat / Cuppy | 中 50~60% | **55~65%** | 队列 UI 闭环 + 选区上下文接入 |
| AI App Builder | 中低 30~45% | **30~45%** | V25 多设备预览已合并，Live Preview 框架在，无变化 |
| Connect & Migrate Everything | 低到中 25~40% | **25~40%** | AI Chat skill 编排未实现 |
| Cloud 运营能力 | 低 0~10% | 0~10% | 不是 OSS 目标 |

**综合工程进度最可信估计：约 64%**（V72 约 62% + 1.5 个百分点的 readiness 行为证据 + 0.5 个百分点的 Authority Matrix 行为证据）。

## 7. P0 / P1 后续计划（V74+）

| 优先级 | 项目 | 描述 | 验收 |
|---|---|---|---|
| P0 | Authority Matrix E2E | supertest 启动真实 NestJS，创建 4 个用户（owner/admin/editor/viewer），调 19 个 endpoint，验证 owner 通过、其它全部 403 | `scripts/verify-enterprise.sh` 加新场景 |
| P0 | Authority Matrix field hide | 真实数据：viewer 拉列表 → hidden 字段值为 null / readonly 字段 422 | 同一脚本 |
| P0 | AI Chat 队列 E2E | 浏览器 Puppeteer：连发 3 条 → 3 条 assistant 顺序回复 | Playwright spec |
| P1 | readiness probe 扩展 | 加 scim / oauth_server / permission_role_node / ip_allowlist HTTP 探针（不只 `to_regclass`） | 探针总数 ≥ 22 |
| P1 | Cloud parity marker | readiness 增加"运维手动标记 Cloud parity"API，前端可标 `sso / saml / scim` 为 cloudParity | controller + UI |
| P1 | 视图权限 E2E | editor 无权访问某视图 → tree 不显示、API 422、AI 选区不包含 | supertest |
| P2 | record filter $current_user | 多角色合并 + `cls.user.id` 真实求值 E2E | supertest |
| P2 | Connect & Migrate skill | AI Chat Connect 技能统一编排（Airtable/Notion/Sheets） | agent-orchestrator |

## 8. 仍未合并的真相（防过度乐观）

以下**不能**记为 Cloud parity，需要更深的真实证据：

- AI Chat 文件解析（PDF/Excel/Word/图片 OCR）—— service 文件存在但 OCR 路径未在测试中验证
- AI Chat 语音输入 —— 客户端录音 + Whisper 路径未在测试中覆盖
- AI Chat 上下文压缩（context compression）—— 长对话超过 token limit 时的截断策略未端到端验证
- AI Chat Skills UI + Secrets 管理 —— API 在，UI 录入闭环未在 Playwright 中验证
- AI App Builder 真沙箱（生成/构建/部署/公开 URL）—— service 路径存在，但 npm install + build 在容器中真跑通未验证
- AI App Builder Auto-fix（构建失败自动重试）—— 仅接口，无真实错误→重试闭环
- 公开 URL（share view）—— `/share/:token` 数据隔离 + 写权限阻止未在 e2e 中验证
- SSO 真实 IdP 集成（Okta/Azure AD/Google Workspace）—— 本机配置 + Discovery + SAML Response 解析未跑过
- Stripe 计费 / 发票 / 增购 credit —— Cloud 运营能力，不是 OSS 目标
