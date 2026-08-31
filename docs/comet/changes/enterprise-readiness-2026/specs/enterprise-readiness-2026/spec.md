# enterprise-readiness-2026 — spec

## AC-001 — Readiness 端点暴露 200 + 完整 JSON

- **Given** 后端已启动,`TEABLE_ADMIN_TOKEN=test-token`,无 `TEABLE_LICENSE_KEY`
- **When** `GET /api/admin/enterprise-readiness` 带 `Authorization: Bearer test-token` 头
- **Then** HTTP 200,响应体是上述 schema
- **And** `plan.level === "self_hosted"`
- **And** `summary.total === 18`
- **And** `capabilities` 字典的 key 集合 ⊇ `LicenseCapabilityService.ALL_CAPABILITIES` ∩ 企业能力子集

## AC-002 — 无 admin token → 401

- **Given** 后端已启动,无 `Authorization` 头
- **When** `GET /api/admin/enterprise-readiness`
- **Then** HTTP 401
- **And** 响应体不泄露任何内部模块信息

## AC-003 — Business license 后,plan 与 capabilities 联动

- **Given** `TEABLE_LICENSE_KEY=plan:business`
- **When** 重启后端并 `GET /api/admin/enterprise-readiness`
- **Then** `plan.level === "business"`,`plan.label` 含 "Business"
- **And** `capabilities.sso.enabled === true`
- **And** `capabilities.permission_matrix.enabled === true`
- **And** `capabilities.audit_log.enabled === true`
- **And** `capabilities.admin_panel.enabled === true`
- **And** `capabilities.custom_domain.enabled === true`
- **And** `summary.cloudBusinessParity` 字符串 ≥ `"16/18"`(允许 smtp/ip-allowlist 在没配的情况下 disabled)

## AC-004 — Free license 后,Business-only 能力全 false

- **Given** `TEABLE_LICENSE_KEY=plan:free`
- **When** 重启后端并 `GET /api/admin/enterprise-readiness`
- **Then** `plan.level === "free"`
- **And** `capabilities.sso.enabled === false`
- **And** `capabilities.permission_matrix.enabled === false`
- **And** `capabilities.admin_panel.enabled === false`
- **And** `capabilities.custom_domain.enabled === false`
- **And** `capabilities.audit_log.enabled === false`
- **And** `capabilities.ai_field.enabled === true`(free 也开 AI)
- **And** `capabilities.ai_chat.enabled === true`

## AC-005 — Capability 字典与 LicenseCapabilityService 完全一致

- **Given** `LicenseCapabilityService.ALL_CAPABILITIES` 有 N 项
- **When** 任何时候 `GET /api/admin/enterprise-readiness`
- **Then** 响应里 `capabilities` 字典包含 **N + 额外企业能力**(smtp/totp/scim/backup/oauth_server/ip_allowlist/trash/webhook/automation) 这些不出现在 license enum 但属于"已加载模块"的项
- **And** 任何在 `LicenseCapabilityService.ALL_CAPABILITIES` 中出现的企业能力(如 `sso`)在响应中一定存在 key

## AC-006 — 响应里不出现 secret

- **Given** 后端配置了 SMTP/JWT/private key 等 secret
- **When** `GET /api/admin/enterprise-readiness`
- **Then** 响应体 JSON 中搜索不到:
  - `password`
  - `secret`
  - `private_key`
  - `client_secret`
  - `TEABLE_` 原始 env 变量名
- **And** smtp 配置只用 `enabled + module + reason` 三元组表达

## AC-007 — e2e 脚本 4 段断言

- **Given** 干净 PG + Redis(全新 schema),`TEABLE_ADMIN_TOKEN=test-token`
- **When** `bash scripts/e2e-enterprise-readiness.sh`
- **Then** 4 段断言全部打印 `[OK]`
- **And** 脚本退出码 = 0
- **And** 日志 `/tmp/teable-e2e-readiness.log` 存在,大小 > 1KB
- **And** 启动失败的 backend stderr 也写入该 log

## AC-008 — e2e 脚本启动失败 → 非 0

- **Given** 后端启动失败(例如端口被占用)
- **When** `bash scripts/e2e-enterprise-readiness.sh`
- **Then** 脚本在 30s 内退出
- **And** 退出码 ≠ 0
- **And** 日志 `/tmp/teable-e2e-readiness.log` 包含启动失败的 stderr

## AC-009 — 单测覆盖 happy/401/capability map

- **Given** `enterprise-readiness.controller.spec.ts`
- **When** `pnpm --filter @teable/nestjs-backend test -- enterprise-readiness`
- **Then** 测试 3 个 case:
  - happy path 返回 200 + 完整 schema
  - 无 admin token 返回 401
  - capability map 与 LicenseCapabilityService 一致(用反射读 ALL_CAPABILITIES)

## AC-010 — 不破坏现有 10 个 stage

- **Given** 已合并的 stage-4-1/4-2/5b/6/7/8b/9/10/11/12 各自 controller
- **When** `bash scripts/e2e-enterprise-readiness.sh` 的启动段会 grep 启动日志
- **Then** 以下 10 个 controller 路径仍然 mapped:
  - `/api/auth/sso`, `/api/auth/sso/callback`, `/api/auth/saml/*`, `/api/admin/audit-log`, `/api/admin/open-api/*`, `/api/admin/custom-domain/*`, `/api/auth/sso/callback/saml-state-cleanup` 在 BullMQ register log 中出现, `/api/admin/rate-limit` / `/api/admin/retention` 在 capability 报告中出现

## AC-011 — e2e 脚本中所有 18 项能力都进入断言

- **Given** readiness 端点返回的 `capabilities` 字典
- **When** e2e 脚本解析响应
- **Then** 至少断言 14 个核心能力(sso, audit_log, permission_matrix, admin_panel, custom_domain, ai_field, ai_chat, ai_app_builder, cuppy_claw, automation, webhook, oauth_server, backup, trash, totp, scim, saml, password_share)的 `enabled` 字段
- **And** 在 `TEABLE_LICENSE_KEY=plan:business` 注入下,`enabled === true` 的数量 ≥ 14

## AC-012 — 端点能力枚举与 license enum 闭环

- **Given** `LicenseCapability` TypeScript union type
- **When** 编译时检查 `enterprise-readiness.service.ts` 中的 `CapabilityDescriptor` 类型
- **Then** 任何新增 capability 要么进入 `LicenseCapabilityService.ALL_CAPABILITIES`,要么明确标记为 `externalOnly`(smtp/totp/scim 等) — 通过 TypeScript 编译期类型保证
- **And** 单测断言:不存在"已加载但 capability 既不在 enum 也不在 externalOnly 名单"的孤儿项

## Implementation notes

- `EnterpriseReadinessService` 注入:`LicenseCapabilityService`, `LicenseService`, `PrismaService`, `PrismaClient`(主 db)
- 每个 capability 的 `enabled` 判定:对 license enum 中的项 → 读 `LicenseCapabilityService.isEnabled(cap)`;对 externalOnly 项 → 查 DB / config / module 存在性
- 单测 mock 模式:mock `LicenseCapabilityService` 的 `isEnabled`,mock `PrismaService` 返回空统计
- 端到端脚本:复用 `scripts/e2e-gap-fill.sh` 的 prisma + nest 启动模式;新增 `set -e -u` 严格模式 + 显式 trap 清理 node PID
- 不创建新 migration、不修改 prisma schema;新表只在 future stage 才加
- 端点路径命名:`/api/admin/enterprise-readiness`(全小写,中划线)— 与 `/api/admin/audit-log`、`/api/admin/custom-domain/*` 保持一致

