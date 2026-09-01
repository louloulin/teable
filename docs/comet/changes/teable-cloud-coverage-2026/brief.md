# Cloud 商业版 真实功能差距 — 第二轮深度填补

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
