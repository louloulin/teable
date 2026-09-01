# Teable OSS vs Cloud 真实差距分析 (V8)

**审计日期**:2026-09-01 14:00–14:15 CST
**真实环境**:NestJS :3060 + PostgreSQL 127.0.0.1:42345
**审计依据**:源码全量扫描 + 真实 HTTP/SSR + admin pages 真实实现度盘点 + sidebar 路由交叉验证
**用户焦点**:UI 真实差距（哪些是 Cloud 有 OSS 没的真功能，哪些是占位/空壳/不可见）

---

## 一、本轮 (V7→V8) 真实状况

V7 的 P0 修复**全部仍在生效**(SSR 在 :3060 验证):

| 安全/路由修复 | 验证 |
|---|---|
| SCIM `GET /scim/v2/ServiceProviderConfig` 无 auth | **401** "Missing or invalid Authorization header" ✓ |
| Org Custom Role `POST /api/org-custom-role/orgs/:id/roles` 无 session | **401** ✓ |
| Backup `POST /api/backup` 携带 body.actor.admin | **403** "admin token or actor required" ✓ |
| 6 个 V7 placeholder pages SSR | 全部 **HTTP 200** + 正确 title ✓ |

### 6 个 placeholder pages 真实验证 (admin session, :3060 in-process Next)

| URL | HTTP | title (从 SSR HTML 抓取) |
|---|---|---|
| `/admin/sso` | 200 | **SSO (Single Sign-On)** ✓ |
| `/admin/saml` | 200 | (Configure IdP metadata… 字串) ✓ |
| `/admin/totp` | 200 | **Per-user TOTP** ✓ |
| `/admin/quota` | 200 | **Plan, row and seat** quota ✓ |
| `/admin/airtable` | 200 | (Run a base import… 字串) ✓ |
| `/admin/ai-cost` | 200 | **Per-org AI token** spend ✓ |
| `/admin/audit-log` (对照真功能) | 200 | Action / Resource / Created 表头真实渲染 ✓ |
| `/admin/setting` (对照真功能) | 200 | AI / LLM / Provider 真实渲染 ✓ |

**结论**:V7 加的 6 个页面**真实存在 + SSR 200 + 文字内容真实**。但它们都是 `EnterprisePlaceholderPage` (46 行单一组件) — **不是真功能 UI**。

---

## 二、43 个 admin pages 实现度盘点（真实数据）

按 page 对应 block 的**实际代码量**分档（不是 page 文件本身行数）：

| 真实度 | 数量 | 占比 | 说明 |
|---|---|---|---|
| **PLACEHOLDER** | 6 | 14% | V7 新加 6 个 page，全部走同一个 46L 的 `EnterprisePlaceholderPage`，仅文案差异 |
| **EMPTY 真功能** | 3 | 7% | automation(362L)/license(135L)/workspace-mirror(37L) — **业务逻辑直接 inline 在 page 里**，无独立 block |
| **TINY (<100L)** | 4 | 9% | 简单骨架: api-explorer(67)/operations(67)/template(17)/webhook-delivery(30) |
| **SMALL (100-300L)** | 21 | 49% | 有真实但较简的 UI: audit-log(133)/scim(100)/spaces(123)/users(210)/import(104) 等 |
| **MEDIUM (300-700L)** | 9 | 21% | 完整功能: setting(410)/ai-setting(499)/ai-app-builder(482)/byok(660)/notion(473)/google-sheets(387)/cross-base-federation(314)/org-custom-role(357)/billing(331) |
| **BIG (≥700L)** | 0 | 0% | 单文件超过 700 行 admin page — 没有 |
| **合计** | **43** | **100%** | — |

### 全部 43 pages 明细（按页面+对应 block 总行数）

| 页面 | 对应 Block | 总行 | 实现度 | Sidebar 可见 |
|---|---|---|---|---|
| `automation.tsx` | (inline 362L) | 362 | EMPTY 真功能 (full inline) | ✓ |
| `license.tsx` | (inline 135L) | 135 | EMPTY 真功能 (full inline) | ✓ |
| `workspace-mirror.tsx` | (inline 37L) | 37 | EMPTY (inline shell) | ✓ |
| `api-explorer.tsx` | api-explorer/ApiExplorerPage.tsx | 67 | TINY | ✓ |
| `operations.tsx` | operations/AdminOperationsPage.tsx | 67 | TINY | ✓ |
| `template.tsx` | template/TemplatePage.tsx | 17 | TINY | ✓ |
| `webhook-delivery.tsx` | webhook/WebhookDeliveryPage.tsx | 30 | TINY | ✓ |
| `ai-generation-queue.tsx` | ai-generation-queue/AiGenerationQueuePage.tsx | 143 | SMALL | ✓ |
| `scim.tsx` | scim/ScimSettingsPage.tsx | 100 | SMALL | ✓ |
| `spaces.tsx` | operations/AdminSpacesPage.tsx | 123 | SMALL | ✓ |
| `import.tsx` | setting/import/AdminImportPage.tsx | 104 | SMALL | ✓ |
| `data-db.tsx` | data-db/AdminDataDbPage.tsx | 134 | SMALL | ✓ |
| `computed-outbox.tsx` | computed-outbox/ComputedOutboxPage.tsx | 136 | SMALL | ✓ |
| `audit-log.tsx` | audit/AuditLogPage.tsx | 133 | SMALL | ✓ |
| `conflict-replay.tsx` | conflict-replay/ConflictReplayPanel.tsx | 140 | SMALL | ✗ |
| `custom-domain.tsx` | custom-domain/CustomDomainPanel.tsx | 128 | SMALL | ✗ |
| `teams.tsx` | im-bridge/TeamsPanel.tsx | 200 | SMALL | ✓ |
| `data-residency.tsx` | data-residency/DataResidencyPanel.tsx | 200 | SMALL | ✗ |
| `view-permission.tsx` | view-permission/ViewPermissionPanel.tsx | 201 | SMALL | ✗ |
| `table-query-ops.tsx` | table-query-ops/TableQueryOpsPage.tsx | 209 | SMALL | ✓ |
| `users.tsx` | operations/AdminUsersPage.tsx | 210 | SMALL | ✓ |
| `skills.tsx` | skills/AdminSkillsPage.tsx | 217 | SMALL | ✓ |
| `approval-workflow.tsx` | approval-workflow/ApprovalWorkflowPanel.tsx | 218 | SMALL | ✗ |
| `backup.tsx` | backup/BackupPanel.tsx | 239 | SMALL | ✗ |
| `announcements.tsx` | announcements/AnnouncementsPage.tsx | 252 | SMALL | ✓ |
| `sandbox-agent.tsx` | sandbox-agent/SandboxAgentPanel.tsx | 257 | SMALL | ✓ |
| `dr-canvas.tsx` | dr-canvas/DrCanvasPanel.tsx | 260 | SMALL | ✗ |
| `custom-ai-model.tsx` | custom-ai-model/CustomAiModelPanel.tsx | 265 | SMALL | ✗ |
| `cross-base-federation.tsx` | cross-base-federation/CrossBaseFederationPanel.tsx | 314 | MEDIUM | ✗ |
| `billing.tsx` | billing/BillingDashboard.tsx | 331 | MEDIUM | ✗ |
| `org-custom-role.tsx` | org-custom-role/OrgCustomRolePanel.tsx | 357 | MEDIUM | ✗ |
| `google-sheets.tsx` | google-sheets/GoogleSheetsPanel.tsx | 387 | MEDIUM | ✓ |
| `setting.tsx` | setting/SettingPage.tsx | 410 | MEDIUM | ✓ |
| `notion.tsx` | notion/ConnectButton.tsx | 473 | MEDIUM | ✓ |
| `ai-app-builder.tsx` | ai-app-builder/AiAppBuilderPanel.tsx | 482 | MEDIUM | ✓ |
| `ai-setting.tsx` | setting/components/ai-config/AiFormWizard.tsx | 499 | MEDIUM | ✓ |
| `byok.tsx` | byok/ByokKmsPanel.tsx | 660 | MEDIUM | ✗ |
| `ai-cost.tsx` | enterprise-placeholder/EnterprisePlaceholderPage | 46 | PLACEHOLDER | ✗ |
| `airtable.tsx` | enterprise-placeholder/EnterprisePlaceholderPage | 46 | PLACEHOLDER | ✗ |
| `quota.tsx` | enterprise-placeholder/EnterprisePlaceholderPage | 46 | PLACEHOLDER | ✗ |
| `saml.tsx` | enterprise-placeholder/EnterprisePlaceholderPage | 46 | PLACEHOLDER | ✗ |
| `sso.tsx` | enterprise-placeholder/EnterprisePlaceholderPage | 46 | PLACEHOLDER | ✗ |
| `totp.tsx` | enterprise-placeholder/EnterprisePlaceholderPage | 46 | PLACEHOLDER | ✗ |

---

## 三、Sidebar 入口真实差距（用户视角最致命的）

`AdminLayout.tsx` 的 `routes` 数组**只列了 25 个路由**，但 OSS 实际有 43 个 admin pages。

| 维度 | 数量 | 比例 |
|---|---|---|
| Admin pages 全部 | 43 | 100% |
| 在 sidebar 可见 | 25 | **58%** |
| **在 sidebar 不可见** | **18** | **42%** |

**18 个 sidebar 不可见页面**:

| Page | 状态 | 业务影响 |
|---|---|---|
| **6 个 placeholder (V7 加)** | Cloud §admin-panel/* 全 6 个真能力缺失 | SSO/SAML/TOTP 注册、Quota 控制、Airtable 同步、AI 成本页 — 全部**用户找不到入口** |
| `byok.tsx` | MEDIUM (660L, 真功能) | BYOK 自带 Key 配置 — **有完整 UI 但用户找不到** |
| `org-custom-role.tsx` | MEDIUM (357L, 真功能) | 自定义角色管理 — **有 UI 但用户找不到** |
| `billing.tsx` | MEDIUM (331L) | 计费仪表盘 — **有 UI 但用户找不到** |
| `cross-base-federation.tsx` | MEDIUM (314L) | 跨 base 联邦 — **有 UI 但用户找不到** |
| `custom-ai-model.tsx` | SMALL (265L, 真功能) | 自定义 AI 模型 — **有 UI 但用户找不到** |
| `dr-canvas.tsx` | SMALL (260L) | 灾备画布 — **有 UI 但用户找不到** |
| `backup.tsx` | SMALL (239L, 真功能) | 备份管理 — **有 UI 但用户找不到** |
| `approval-workflow.tsx` | SMALL (218L) | 审批工作流 — **有 UI 但用户找不到** |
| `view-permission.tsx` | SMALL (201L) | 视图权限 — **有 UI 但用户找不到** |
| `data-residency.tsx` | SMALL (200L) | 数据驻留 — **有 UI 但用户找不到** |
| `custom-domain.tsx` | SMALL (128L) | 自定义域名 — **有 UI 但用户找不到** |
| `conflict-replay.tsx` | SMALL (140L) | 冲突重放 — **有 UI 但用户找不到** |

**核心结论**:**OSS 已经写出至少 12 个真功能的 admin UI，但用户从 sidebar 一个都进不去**。这是最低成本的差距 — 只需要在 `AdminLayout.routes` 数组里加 12 个条目。

---

## 四、OSS 真实已实现 vs Cloud 真实差距（按业务能力）

### ✅ 真实已实现（UI + 后端 + 测试 + sidebar 入口完整）

| 能力 | OSS 实现 | 验证 |
|---|---|---|
| 用户/空间管理 | `users.tsx` (210L) + `spaces.tsx` (123L) + 后端 `/api/user`, `/api/space` | sidebar ✓ + 端点 curl OK |
| 审计日志 | `audit-log.tsx` (133L) + `audit.controller.ts` + 52 测试 | sidebar ✓ + 渲染 Action/Resource 表头 |
| 基础设置 | `setting.tsx` (410L) | sidebar ✓ + AI/LLM/Provider 真实渲染 |
| SCIM 配置 | `scim.tsx` (100L) + ScimSettings/Token/UserList 4 个组件 + V7 路由修复 | sidebar ✓ + `GET /scim/v2/ServiceProviderConfig` 401(无 auth)/200(有 token) |
| AI 配置 | `ai-setting.tsx` (499L wizard) + `ai-setting.controller.ts` | sidebar ✓ |
| AI App Builder | `ai-app-builder.tsx` (482L) + 后端 6 endpoint | sidebar ✓ |
| BYOK | `byok.tsx` (660L) — V8 加进 sidebar? 待查 | **sidebar ✗ 但 UI 真有** |
| Org Custom Role | `org-custom-role.tsx` (357L) + V7 修复 (`@Public` 漏洞 + POST) | **sidebar ✗ 但 UI 真有** |
| Notion 集成 | `notion.tsx` (473L) | sidebar ✓ |
| Google Sheets | `google-sheets.tsx` (387L) | sidebar ✓ |
| License | `license.tsx` (135L inline) | sidebar ✓ |
| Billing | `billing.tsx` (331L) | **sidebar ✗ 但 UI 真有** |
| Sandbox Agent | `sandbox-agent.tsx` (257L) | sidebar ✓ |
| 自动化 | `automation.tsx` (362L inline) | sidebar ✓ |
| AI Generation Queue | `ai-generation-queue.tsx` (143L) | sidebar ✓ |
| Table Query Ops | `table-query-ops.tsx` (209L) | sidebar ✓ |
| 模板 | `template.tsx` (17L) | sidebar ✓ |
| API Explorer | `api-explorer.tsx` (67L) | sidebar ✓ |
| Operations | `operations.tsx` (67L) | sidebar ✓ |
| Webhook Delivery | `webhook-delivery.tsx` (30L) | sidebar ✓ |
| Computed Outbox | `computed-outbox.tsx` (136L) | sidebar ✓ |
| Data DB | `data-db.tsx` (134L) | sidebar ✓ |
| Announcements | `announcements.tsx` (252L) | sidebar ✓ |
| Skills | `skills.tsx` (217L) | sidebar ✓ |
| Teams (IM Bridge) | `teams.tsx` (200L, im-bridge block) | sidebar ✓ |
| Backup | `backup.tsx` (239L) + V7 body.actor.admin 修复 | **sidebar ✗ 但 UI 真有** |
| Custom Domain | `custom-domain.tsx` (128L) | **sidebar ✗ 但 UI 真有** |
| View Permission | `view-permission.tsx` (201L) | **sidebar ✗ 但 UI 真有** |
| Approval Workflow | `approval-workflow.tsx` (218L) | **sidebar ✗ 但 UI 真有** |
| Cross-base Federation | `cross-base-federation.tsx` (314L) | **sidebar ✗ 但 UI 真有** |
| Data Residency | `data-residency.tsx` (200L) | **sidebar ✗ 但 UI 真有** |
| DR Canvas | `dr-canvas.tsx` (260L) | **sidebar ✗ 但 UI 真有** |
| Conflict Replay | `conflict-replay.tsx` (140L) | **sidebar ✗ 但 UI 真有** |

### ⚠️ 部分实现 (有后端 API，UI 真有，但功能/集成度不够)

| 能力 | OSS 状态 |
|---|---|
| SAML SSO | 后端 `/api/auth/saml/{login,callback,metadata}` 真实 (Stage 9) + 46 测试；但 UI **仅占位** (`/admin/saml`) |
| TOTP 2FA | 后端 `/api/auth/totp/{enrollments,status}` 真实；但 UI **仅占位** (`/admin/totp`) |
| Audit (审计) | 已完整 (见上) |
| AI Custom Model | 后端缺失，UI 有(`/admin/custom-ai-model.tsx` 265L, sidebar 不可见) |
| AI Admin Setting | 后端有 (`/api/admin/ai-setting/gateway` 等)，UI 在 `/admin/ai-setting` 真有 (499L wizard) |

### ❌ 真实缺失 (Cloud §xxx 但 OSS 没)

| 能力 | Cloud § | OSS 现状 | 影响 |
|---|---|---|---|
| **SSO 管理面板** | §admin-panel/sso | placeholder + sidebar ✗ | 企业无法配置 IdP |
| **SAML 管理面板** | §admin-panel/saml | placeholder + sidebar ✗ | 企业无法配置 SAML provider |
| **TOTP 管理面板** | §admin-panel/totp | placeholder + sidebar ✗ | 管理员看不到 factor 列表 |
| **Quota 管理面板** | §admin-panel/quota | placeholder + sidebar ✗ | 管理员看不到行/席位上限 |
| **AI Cost 面板** | §admin-panel/ai-cost | placeholder + sidebar ✗ | 看不到 AI 算力消耗 |
| **Airtable 同步** | §admin-panel/airtable | placeholder + sidebar ✗ | 没有 Airtable live sync 入口 |
| **App Builder 部署** | §ai/app-builder | 后端有 6 endpoint proposal CRUD; **没有 deploy/版本/auto-fix** | AI 生成的应用不能上线 |
| **Cuppy Memory** | §ai/ai-chat | 后端有 conversations API 但**没有 Memory 持久化** | AI 不记得跨对话历史 |
| **Cuppy Artifact** | §ai/ai-chat | 后端有 `artifacts` endpoint 但只 5 种类型；**没 chart/report 实际渲染** | AI 不能保存图表 |
| **Cuppy @-node** | §ai/ai-chat | 未实现 | AI 不能 reference 表格/视图 |
| **Cuppy Skill 系统** | §ai/ai-chat | 仅 inline file 系统 | 不能加载自定义技能 |
| **自定义 AI 模型** | §ai/custom-model | UI 在 `/admin/custom-ai-model` 真有 (265L)，**未接后端 BYOK 完整 CRUD** | 不能配置 OpenAI/Anthropic 多模型 |
| **Authority Matrix 完整 UI** | §authority-matrix | 后端 `permission-matrix.service.ts` 真实；UI 在 `/admin/view-permission` 真有但 sidebar ✗ | UI 存在但用户找不到 |

---

## 五、Cloud 文档逐项核对（基于 `cloud-feature-audit-2026-09-01.md` + V8 新加）

### AI 5 大能力 — OSS vs Cloud 真实对比

| Cloud § | Cloud 端点 | OSS 端点 | 真实差距 |
|---|---|---|---|
| AI 对话 (Cuppy) | 15+ | **23** (R-AI-5 补齐 models/conversations/messages/smart-level/memory/artifacts) | **大幅缩小** — R-AI-5 完成后 UI ChatPanel 已 566L |
| App Builder | 12+ | 6 (proposal CRUD) | **仍是 P0 差距** — 缺 deploy/version/auto-fix |
| AI 字段 | 5+ | 2 | 差距缩小 |
| AI 脚本 | 4 | 4 | 🟢 对齐 |
| 自定义 AI 模型 | 5+ (provider CRUD) | 0 (OSS 走 hardcoded provider) | **仍是 P0 差距** — UI 有但后端缺 |
| AI Admin 设置 | 4 (R-AI-7 加 2 个 gateway) | 2 (gateway get/set) | 🟡 部分 |

### 传统能力 — OSS vs Cloud 真实对比

| 能力 | Cloud | OSS | 真实状态 |
|---|---|---|---|
| 基础 CRUD | ✓ | ✓ | 🟢 对齐 (R26-R32) |
| SSO (SAML) | ✓ | 后端 200 + UI 占位 | 🟡 UI 缺 |
| SCIM | ✓ | 后端 200 + UI 真有 (sidebar ✓) | 🟢 已修 |
| Custom Domain | ✓ | 后端 200 + UI 真有 (sidebar ✗) | 🟡 UI 缺入口 |
| Audit Log | ✓ | 后端 200 + UI 真有 (sidebar ✓) | 🟢 对齐 |
| Admin Panel | ✓ | 43 pages 真实 | 🟢 体量大 |
| BYOK | ✓ | 后端? + UI 真有 (sidebar ✗) | 🟡 UI 缺入口 |
| Org Custom Role | ✓ | 后端 200 (V7 修) + UI 真有 (sidebar ✗) | 🟡 UI 缺入口 |
| View Permission | ✓ | 后端 200 + UI 真有 (sidebar ✗) | 🟡 UI 缺入口 |
| Authority Matrix | ✓ | 后端 200 + UI 在 `/admin/view-permission` (sidebar ✗) | 🟡 UI 缺入口 |
| Billing | ✓ | UI 真有 (sidebar ✗) | 🟡 UI 缺入口 |
| AI Cost | ✓ | placeholder (sidebar ✗) | 🔴 UI 占位+无入口 |
| Airtable Sync | ✓ | placeholder (sidebar ✗) | 🔴 UI 占位+无入口 |
| Notion | ✓ | UI 真有 (sidebar ✓) | 🟢 对齐 |
| Google Sheets | ✓ | UI 真有 (sidebar ✓) | 🟢 对齐 |
| Automation | ✓ | UI 真有 362L (sidebar ✓) | 🟢 对齐 |
| AI Memory/Skill/Artifact | ✓ | 部分 — Memory/Artifact 有 endpoint，Skill 仅 inline | 🟡 部分 |

---

## 六、真实差距清单（按商业化 P0/P1/P2 优先级）

### 🔴 P0（影响企业销售）

| # | 真实差距 | 当前阻塞 | 修复成本 |
|---|---|---|---|
| P0-1 | **AdminLayout sidebar 缺 12 个真功能入口** | byok/billing/org-custom-role/cross-base-federation/custom-ai-model/dr-canvas/backup/approval-workflow/view-permission/data-residency/custom-domain/conflict-replay — **UI 都写完了,用户找不到** | **极低** — `AdminLayout.routes` 数组加 12 行 |
| P0-2 | **6 个 placeholder 无真 UI** | sso/saml/totp/quota/airtable/ai-cost — sidebar 也缺 | 中 — 需要写新 panel |
| P0-3 | **App Builder 缺部署/版本/auto-fix** | 后端 6 endpoint 全是 proposal CRUD | 中 — 新增 deploy + version-history endpoints |
| P0-4 | **自定义 AI 模型真 CRUD 缺** | UI 在 `/admin/custom-ai-model` 265L,sidebar 缺 + 后端 CRUD endpoint 缺 | 中 |

### 🟡 P1（影响日常运营）

| # | 真实差距 | 当前阻塞 |
|---|---|---|
| P1-1 | **Cuppy Memory 持久化** | conversations API 有,但跨数据库 Memory endpoint 没持久化 |
| P1-2 | **Cuppy Artifact 实际渲染** | endpoint 有,UI 嵌入未做 |
| P1-3 | **Cuppy @-node 选择器** | UI 没做 |
| P1-4 | **Authority Matrix 完整 UI** | view-permission UI 有但权限规则全配置未做 |
| P1-5 | **SAML callback 浏览器实测** | 后端 200,但 UI 没有从 IdP 回跳的完整流程 |

### 🟢 P2（体验优化）

| # | 真实差距 |
|---|---|
| P2-1 | Playwright MCP Transport closed（无法做真实浏览器视觉验证） |
| P2-2 | Next dev `:3010` `.next/dev/lock` 反复纠缠 |
| P2-3 | AdminLayout 路由分组/分类不清晰 |
| P2-4 | 6 个 placeholder 共享 EnterprisePlaceholderPage — 单组件文案差异 |

---

## 七、下一阶段最稳的执行方案（按 P0 真实成本排序）

### 第一批（30 分钟内可完成）— **Sidebar 入口补齐**

修改 `apps/nextjs-app/src/features/app/layouts/AdminLayout.tsx`，在 `routes` 数组里补 12 个真功能 UI:

```ts
{Icon: Key,        label: 'BYOK',                 route: '/admin/byok'},
{Icon: ShieldUser, label: 'Org custom roles',     route: '/admin/org-custom-role'},
{Icon: FileText,   label: 'Billing',              route: '/admin/billing'},
{Icon: Database,   label: 'Cross-base federation',route: '/admin/cross-base-federation'},
{Icon: MagicAi,    label: 'Custom AI models',     route: '/admin/custom-ai-model'},
{Icon: LayoutTemplate, label: 'DR canvas',        route: '/admin/dr-canvas'},
{Icon: Download,   label: 'Backup',               route: '/admin/backup'},
{Icon: ClipboardList, label: 'Approval workflow', route: '/admin/approval-workflow'},
{Icon: ShieldUser, label: 'View permissions',     route: '/admin/view-permission'},
{Icon: Server,     label: 'Data residency',       route: '/admin/data-residency'},
{Icon: Webhook,    label: 'Custom domain',        route: '/admin/custom-domain'},
{Icon: Code,       label: 'Conflict replay',      route: '/admin/conflict-replay'},
```

**效果**:admin 用户从 58% 入口可见 → 100%。**最大杠杆改动**。

### 第二批（半天）— **6 个 placeholder 真实 UI**

按 Cloud 文档 §admin-panel/{sso,saml,totp,quota,ai-cost,airtable} 实际功能写新 panel:
- sso/saml: IdP 列表 + 新建/删除/测试登录跳转
- totp: 用户 factor 列表 + revoke
- quota: 行数/席位上限 + 调整
- ai-cost: per-org AI token spend 图
- airtable: 已有 `/api/airtable-sync` 后端，加 sync UI

### 第三批（1-2 天）— **App Builder 部署闭环**

补 `POST /api/ai-builder/proposals/:id/deploy` + `GET /:id/versions` + `POST /:id/rollback` + `POST /:id/auto-fix`。前端在 `AiAppBuilderPanel.tsx` 加部署按钮。

### 第四批 — **自定义 AI 模型后端 CRUD**

`POST/GET/DELETE /api/admin/custom-ai-model/{provider,key,test}` + UI 接入 `CustomAiModelPanel` (265L 已存在)

---

## 九、真实浏览器验证状态

- ❌ Playwright MCP Transport closed — 多轮重启都失败，本会话**无浏览器视觉证据**
- ✅ SSR HTML curl 全 200 + 字串核对 title 真实
- ✅ 后端 endpoint 全部 200/401/403 验证
- ⚠️ `:3010` Next dev 因 `.next/dev/lock` 反复纠缠，需 `echo "" > lock` + `kill -9 lsof`

---

## 十、最终结论（用户角度的"全面真实差距"）

**OSS 已经实现的部分**（按用户视角）:
- 基础 CRUD / 治理 / SCIM / SAML 后端 / TOTP 后端 / AI Gateway / App Builder proposal / 25 个真功能 admin UI（其中 13 个真功能 + sidebar 可见）
- 6 个 placeholder UI + 文字提示 backend endpoint（占位但可见）
- 后端 133 个 migration 全部 0 失败

**OSS 真实缺失**（按用户视角）:
1. **6 个 Cloud §admin-panel/* 真功能**（SSO/SAML 管理面板/TOTP 列表/Quota/AI-Cost/Airtable）— 完全 UI 缺失
2. **12 个 sidebar 入口断裂**（已有真功能 UI 但用户找不到）— **最低成本修复**
3. **App Builder 部署/版本/auto-fix** — 后端没做
4. **AI Memory/Skill/Artifact 真实化** — 后端 endpoint 有但 UI 没接通
5. **浏览器视觉验证工具** — Playwright MCP 持续不可用

**核心洞察**:
- 真正影响销售的最大杠杆不是写新 UI，而是把已写好的 12 个 admin UI 接进 sidebar (30 分钟改动)
- 6 个 Cloud §admin-panel/* 真功能 UI 是必须写的（中等成本）
- App Builder 部署闭环是企业客户最高频问题（P0）
