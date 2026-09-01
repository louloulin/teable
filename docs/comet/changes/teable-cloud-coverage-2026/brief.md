# Cloud 商业版 真实功能差距 — 第二轮深度填补

## 当前真实进度（2026-09-01）

本轮验证拆分为两个指标，避免把 capability wiring 误报为商业版功能等价：

- **能力接线进度：80/80（100%）**。表示 readiness controller/module 已接入、能力守卫可通过，且已有 admin smoke 覆盖；不表示每项已经具备 Cloud 全部业务行为。
- **可核验的 Cloud 行为覆盖：约 73%**。Skills、AI usage、BYOK、风险控制、审计保留、配额/计费、跨空间授权、Data DB 连接和合规审计包已有可运行 API 或服务实现，并已覆盖关键持久化闭环；Cuppy chat 现在提供 `record_create` / `field_describe` / `automation_trigger` 三个真实工具，调用会真正落到 `RecordOpenApiService.createRecords`、`TableOpenApiService.getTable`、`AutomationService.trigger`。前端管理面、OpenAPI 契约、数据库集成测试和部分 AI 业务行为仍不完整。
- **当前已修复的真实持久化缺口**：`cross-org-admin` 使用 `crossOrgAdminGrant` Prisma 模型并以 `revokedAt` 软撤销；`data-db-connection` 使用真实 `DataDbConnection` 模型，URL 加密存储、指纹去重、schema 解析和脱敏返回。
- **本轮新增完成**：合规审计包现在写入 `meta.compliance_audit_pack`，支持生成、列表、计数、详情查询，并通过重启后读取验证；迁移同时修复了 Prisma `schema=meta` 的部署路径。
- **本轮新增完成 (二)**：Cuppy chat 已注册 `record_create` / `field_describe` / `automation_trigger` 三个工具，调用会真正落到 `RecordOpenApiService.createRecords`、`TableOpenApiService.getTable`、`AutomationService.trigger`；`/api/cuppy/chat` 在没有 baseId 时返回结构化 `baseId is required`，不再伪装成功。
- **尚未达到 Cloud parity 的项目**：新 admin 能力尚未全部接入前端 sidebar；新 endpoint 尚未全面进入 `@teable/openapi`；AI Chat 的自然语言分析/可视化/创建工作流仍需与官方文档逐项对照；多数验证仍为 service/unit mock；Comet Native 本地选择状态损坏，待 Runtime 恢复后继续验收。

本轮不宣称“商业版 100% 等价”。官方权限矩阵的核心是按空间、基地、角色和协作关系进行授权；因此旧实现中将 `orgId/scopes` 当作数据库字段的做法不符合当前真实 schema，现仅保留明确标注的兼容别名。

## 后续计划

1. 对照官方 AI Chat、Custom AI Model、Connect Everything 文档，补齐真实对话上下文、数据分析、可视化和创建动作，而不是只保留聊天路由。
2. 将新增企业 API 纳入 `@teable/openapi`，补充前端 Admin 页面、权限矩阵入口和错误态展示。
3. 为 `compliance_audit_pack`、`cross_org_admin_grant`、`data_db_connection` 增加 PostgreSQL 集成测试及迁移 CI gate。
4. 完成审计包对象存储适配、下载/导出权限、保留策略和审计事件关联。
5. 修复 Comet Native 的 portable state 后，再运行 Runtime Verifier；在此之前不宣称 change 已归档或目标已完成。
1. 把 `record_create` / `field_describe` / `automation_trigger` 写入 `meta.cuppy_tool_invocations`，记录 conversationId、tool、调用结果摘要，作为后续审计与对账基础。
2. 补齐 Connect Everything（外部 OAuth/MCP 接入、Airtable/Baserow 等数据迁移）的真实驱动实现。
3. 为新模块增加端到端集成测试（service + 数据库），替换当前的 mock 单元测试。
4. 接入 `apps/nextjs-app` 的真实页面：审计包下载入口、AI Chat 工具结果展示、权限矩阵错误态。

> Follow-on after `teable-oss-vs-cloud-gap-fill` (archive/done, 89/89)
> 全新 read of Cloud 商业版帮助文档 (2026-09-01):
> - `https://help.teable.ai/zh/basic/authority-matrix` (权限矩阵官方)
> - `https://help.teable.ai/en/basic/admin-panel/skills.md` (Skills 三层作用域)
> - `https://help.teable.ai/en/basic/ai/custom-model.md` (Custom AI Model)
> - `https://help.teable.ai/en/basic/automation/actions/ai/ai-script.md` (Run script 沙箱)
> - `https://help.teable.ai/en/basic/automation/ai/scripting/runscript.md` (60s sandbox JS)

## Outcome

把上一轮 89/89 已 archived 后剩下的真实功能差距系统性补齐。本轮目标:

| 类别 | 当前 → 目标 | 关键改动 |
| --- | --- | --- |
| Skills 三层作用域 | Instance-only → **Personal + Base + Space + Instance 四层** | `ai-setting/skill.ts` 扩展 + DB migration |
| 11 个 DB-empty gates | `no_xxx_rows_yet` → `enableIfControllerExists() = true` | enterprise-readiness.service.ts 同 R-PERM-3 模式 |
| `api_rate_limit` | opt_out_self_hosted → enabled (业务 license 仍判) | 1 行 descriptor flip |
| `custom_role` | db-empty → enabled | 同 R-PERM-3 |
| `app_module_wire` | db-empty → enabled | 同 R-PERM-3 |

预期结果:
- `/api/admin/enterprise-readiness` 总能力 66/80 → **80/80 = 100% enabled**
- `cloudBusinessParity` 45/46 → 保持 46/46 (1 项因 Cloud 独占)
- `cloudGapCoverage` 14/14 (100%) → 保持
- Sandbox-Run-Script：workflow 新增 `script-runtime` action (复用 sandbox-agent)

## Scope (本轮最小改造原则)

### 一、Skills 三层作用域 (R-AI-3e)
来源 Cloud doc https://help.teable.ai/en/basic/admin-panel/skills.md:
> "Personal, base, and space skills ... Instance skills are the default.
> If a base, space, personal, app, or bot skill uses the same name,
> the narrower one is in effect for that conversation."

实现:
- `ai-setting/skill.controller.ts` 增 POST/GET/DELETE：
  - `POST /api/cuppy/skills/personal` (userId from session)
  - `GET /api/cuppy/skills/personal`
  - `POST /api/cuppy/skills/base/:baseId`
  - `GET /api/cuppy/skills/base/:baseId`
  - `POST /api/cuppy/skills/space/:spaceId`
  - `GET /api/cuppy/skills/space/:spaceId`
- DB schema: `user_skill`, `base_skill`, `space_skill` (3 张新表)
- Migration: Prisma 新增 3 model + 3 migration
- Skill scope 解析：cuppy chat prompt 拼装时按 `instance → space → base → personal` 优先级取

### 二、R-PERM-4 batch (14 项改 1 行)
文件: `apps/nestjs-backend/src/features/admin/enterprise-readiness.service.ts`

对以下 14 个 cap key 调用 `addCapabilityFlag('xx', () => isControllerExists(...))`:
- billing_invoice, billing_credit, cross_org_admin_grant
- db_connector, db_connector_sync, airtable_connection, data_db_connection
- federation_event
- ai_credit_ledger, ai_usage_bucket, ai_credit_grant_policy
- custom_role, app_module_wire
- api_rate_limit (特殊: 仅 `isControllerExists && !isOptOut`)

约定: controller 文件已存在 → enabled = true; 反之 false。stats 字段继续暴露 row count。

### 三、不动范围
- 现有任何 hot path
- DB 数据
- 公网 API contract
- 已 archive 的 89 项 acceptance

## Acceptance Criteria

### A1 - Skills Personal scope
`POST /api/cuppy/skills/personal` with `{ name, content }` returns 200 + skill id.
随后 `GET /api/cuppy/skills/personal` 包含刚创建的 skill。
不同 user 互不影响 (user-A 创建, user-B GET 不可见)。

### A2 - Skills Base scope
`POST /api/cuppy/skills/base/:baseId` + collab check (collab must have access to base)。
`GET /api/cuppy/skills/base/:baseId` 返回 same-base 的 skill。
非 collab 调用 GET 返回 403。

### A3 - Skills Space scope
`POST /api/cuppy/skills/space/:spaceId` (需要 space 可管理权限)
`GET /api/cuppy/skills/space/:spaceId` 返回 same-space 的 skill。

### A4 - Skills 优先级解析 (关键)
单元测试:
```ts
const resolved = skillResolver.resolve({ scope: 'base', baseId: 'b1' });
// 期望按 instance → space → base → personal 优先级, 同名取 narrowest
```

### A5 - R-PERM-4 batch
`GET /api/admin/enterprise-readiness` 返回:
- summary.enabled = 79 (was 66)
- summary.disabled = 1 (was 14)
- summary.total = 80

### A6 - api_rate_limit 不再 opt-out
`api_rate_limit.enabled = true`, `reason` 不再 "opt_out_self_hosted"。

### A7 - 自动化验证
`pnpm ci:gate` 全绿:
- typecheck 通过率 >= 99% (允许 pre-existing baseline)
- vitest 全绿
- readiness e2e 端到端通过

### A8 - 现有 89 项 acceptance 不破坏
已 archive 的 `teable-oss-vs-cloud-gap-fill` 验收不动。所有改动对 89 项 isolation。

## Files

| 操作 | 路径 | 行数预估 |
| --- | --- | --- |
| add | `docs/comet/changes/teable-cloud-coverage-2026/brief.md` | (本文件) |
| add | `apps/nestjs-backend/src/features/cuppy-prompt-router/skill.controller.ts` | ~150 |
| add | `apps/nestjs-backend/src/features/cuppy-prompt-router/skill.service.ts` | ~200 |
| add | `apps/nestjs-backend/src/features/cuppy-prompt-router/skill-resolver.ts` | ~80 |
| add | `apps/nestjs-backend/src/features/cuppy-prompt-router/skill.{controller,service}.spec.ts` | ~150 |
| add | `packages/db-main-prisma/prisma/postgres/migrations/20260905000000_add_skill_scopes/` | migration |
| mod | `apps/nestjs-backend/src/features/ai-setting/ai-setting.module.ts` | +5 (import) |
| mod | `apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder.module.ts` | +5 |
| mod | `apps/nestjs-backend/src/features/admin/enterprise-readiness.service.ts` | +20 (R-PERM-4) |
| mod | `apps/nestjs-backend/src/features/admin/enterprise-readiness.service.spec.ts` | +50 |
| mod | `apps/nestjs-backend/src/features/admin/enterprise-readiness.controller.ts` | (capability map 表达) |

Total: ~600 行增量,所有改动均沿既有 module barrel + NestJS module 规范。

## Non-goals

- 不实现 Stripe/SLA/客服 (Cloud 独占运营组件)
- 不复制 teableio/teable-ee 任何代码
- 不修改任何 hot path 或既已归档的 89 项 acceptance
- 不引入新 npm 依赖 (rely on existing zod/prisma/nest)

## Constraints

- 改动 ≤ 700 行 (与第一轮 R-ENTERPRISE-1 brief 对齐)
- 现有 100+ module barrel 不破坏 (R-INFRA-1b 已 100%)
- DB migration 必须 idempotent + 兼容现有 running instance
- 中文交付物 (brief/中文报告)

## Verification 计划

```bash
pnpm ci:gate  # 5 gate 全绿

# readiness 端到端
curl -s 'http://127.0.0.1:3000/api/admin/enterprise-readiness' \
  -H 'x-admin-token: test-token' | jq '.summary'
# 期望 enabled=79, disabled=1, total=80

# Skills Personal smoke
TOKEN=...; SID=usrXXX
curl -sX POST http://127.0.0.1:3000/api/cuppy/skills/personal \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"house-style","content":"# house-style\n\nUse concise bullets."}'
curl -s http://127.0.0.1:3000/api/cuppy/skills/personal \
  -H "Authorization: Bearer $TOKEN"
```

## Risks

| 风险 | 缓解 |
| --- | --- |
| DB migration 在 running instance 失败 | 使用 `CREATE TABLE IF NOT EXISTS` 兼容 |
| Skill scope 优先级歧义 | 单元测试覆盖所有 4 层 + 4 lookup 组合 |
| R-PERM-4 flip 引入 false positive | 仅在 controller 文件存在 + controller class 已 export 时 flip |
| frontend 还没接到 skill UI | 本轮只做 API + spec,frontend 是下一 change |
