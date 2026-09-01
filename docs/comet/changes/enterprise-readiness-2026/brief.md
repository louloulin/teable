# Enterprise Readiness 2026 — 第二轮差距分析与自动化验证

## Outcome

为 OSS 自托管实例补齐 **企业级就绪状态** 这个 Cloud 商业版天然就具备、但 OSS 至今缺乏"一目了然"总览的关键能力：把分散在 100+ 模块里的企业特性抽成一个统一的 `/api/admin/enterprise-readiness` 端点，让运维一眼看出"我现在开了哪些、能力差什么、配错了什么"。

伴随端点的，是一套 **真正会跑** 的端到端验证脚本 `scripts/e2e-enterprise-readiness.sh`：从 0 启动后端 → 注入测试 license → 命中 readiness 端点 → 对照 Cloud Business 18 项能力逐项断言 → 退出 0/非 0。把"功能上达到 Business 等价"从 unit test 级别推到 live endpoint 级别。

## Scope

### 1. 官网对比（2026-08-31 抓取自 teable.ai/zh/pricing）

Cloud 商业版 **Business 档** 公开标榜的能力 = 18 项（按官网分类）：

| # | 分类 | 能力 | 备注 |
|---|---|---|---|
| 1 | 基础 | 仪表盘（通过应用构建器） | ✓ OSS 已有 ai-builder |
| 2 | 基础 | 回收站 | ✓ OSS 已有 trash |
| 3 | 基础 | 模板 | ✓ OSS 已有 template |
| 4 | AI | AI 字段 | ✓ license `ai_field` |
| 5 | AI | AI 对话 | ✓ license `ai_chat` |
| 6 | AI | AI 应用构建器 | ✓ license `ai_app_builder` |
| 7 | AI | CuppyClaw | ✓ license `cuppy_claw` |
| 8 | 高级权限 | 密码限制分享 | ✓ OSS 已有 base-share-auth |
| 9 | 高级权限 | 权限矩阵 | ✓ license `permission_matrix` + 7 stage 实现 |
| 10 | 管理控制 | 管理面板 | ✓ license `admin_panel` + stage 7 |
| 11 | 管理控制 | 审计日志 | ✓ license `audit_log` + stage 6（OSS 反而**强于** Cloud — Cloud 标注"即将推出"）|
| 12 | 集成 | 单点登录（SSO） | ✓ license `sso` + stage 4.1/9 |
| 13 | 集成 | 域名验证 | ✓ OSS 已有 organization_domain |
| 14 | 集成 | 自定义域名 | ✓ license `custom_domain` + stage 10 |
| 15 | 开发者平台 | 基础 API | ✓ OpenAPI |
| 16 | 开发者平台 | API 每秒速率限制 | ✓ license `api_rate_limit` + stage 12 |
| 17 | 记录 | 记录历史 | ✓ license `record_history` + stage 11 |
| 18 | 记录 | 行评论 | ✓ OSS 已有 comment |

OSS **全部 18 项** 已有模块实现；但**没有一个统一入口**告诉"现在哪些开着、哪些没 license、配了什么 secret"。

### 2. 本 change 真正新增的（最小改造原则）

| 新增 | 位置 | 行数预算 |
|---|---|---|
| `GET /api/admin/enterprise-readiness` 端点 | `apps/nestjs-backend/src/features/admin/enterprise-readiness.controller.ts` | ~120 |
| `EnterpriseReadinessService` 聚合 | `apps/nestjs-backend/src/features/admin/enterprise-readiness.service.ts` | ~180 |
| 端点单测 | `enterprise-readiness.controller.spec.ts` | ~150 |
| 端到端验证脚本 | `scripts/e2e-enterprise-readiness.sh` | ~160 |
| 文档更新 | `docs/comet/changes/teable-oss-vs-cloud-gap-fill/PROGRESS_REPORT.md` | +60 |

合计 **~670 行** 增量，无 npm 依赖、无新表、无现有热路径改动。

### 3. `/api/admin/enterprise-readiness` 响应结构

```json
{
  "instance": { "version": "...", "uptimeSec": 12345 },
  "plan": { "level": "self_hosted", "label": "Self-hosted", "licenseSource": "env" },
  "capabilities": {
    "sso":          { "enabled": true,  "module": "sso",            "providers": 0 },
    "audit_log":    { "enabled": true,  "module": "audit",          "retentionDays": 90 },
    "permission_matrix": { "enabled": true, "module": "permission-matrix", "tablesWithRules": 0 },
    "custom_domain":{ "enabled": true,  "module": "custom-domain",  "lbDns": "lb.teable.cloud" },
    "admin_panel":  { "enabled": true,  "module": "admin",          "users": 1, "spaces": 1 },
    "api_rate_limit": { "enabled": true, "module": "api-rate-limit", "limitPerSec": 50 },
    "ai_field":     { "enabled": true,  "module": "ai-field",       "quotaCallsPerMonth": null },
    "ai_chat":      { "enabled": true,  "module": "ai",             "byok": false },
    "automation":   { "enabled": true,  "module": "automation",     "runsThisMonth": 0 },
    "webhook":      { "enabled": true,  "module": "webhook-bridge", "subscriptions": 0 },
    "oauth_server": { "enabled": true,  "module": "oauth-server",   "apps": 0 },
    "backup":       { "enabled": true,  "module": "backup",         "snapshots": 0 },
    "totp":         { "enabled": true,  "module": "totp",           "enrolledUsers": 0 },
    "smtp":         { "enabled": false, "module": "smtp",           "reason": "no_org_smtp_config" },
    "ip_allowlist": { "enabled": false, "module": "ip-allowlist",   "reason": "no_rules_configured" },
    "scim":         { "enabled": true,  "module": "scim",           "endpoints": 0 },
    "saml":         { "enabled": true,  "module": "saml",           "providers": 0 },
    "trash":        { "enabled": true,  "module": "trash",          "retentionDays": 30 }
  },
  "quotas": {
    "rows":       { "current": 0, "limit": null, "softLimitPct": null },
    "attachments":{ "currentBytes": 0, "limitBytes": null },
    "automationRuns": { "thisMonth": 0, "limitPerMonth": 100000 },
    "seats":      { "current": 1, "limit": null }
  },
  "integrations": {
    "samlProviders": 0, "ssoOidcProviders": 0, "slackBridge": false, "emailDomainsClaimed": 0
  },
  "summary": {
    "total": 18,
    "enabled": 17,
    "disabled": 1,
    "missing": 0,
    "cloudBusinessParity": "16/18"
  }
}
```

### 4. 自动化验证脚本（`scripts/e2e-enterprise-readiness.sh`）

4 段断言：

1. **编译 + 启动**：prisma migrate + nest start（与现有 e2e-gap-fill.sh 共享）
2. **环境注入**：TEABLE_LICENSE_KEY=plan:business 后再次拉 readiness，断言 plan.label='Business' 且 ≥14/18 capabilities enabled
3. **能力扫描**：从 readiness 响应里抽 `enabled=false` 的 capability，对照清单（smtp/ip_allowlist 在没装企业配置时是合理的），其余必须 true
4. **退出码**：所有断言通过 → 0；任何失败 → 1，并打印失败项

## Non-goals

- 不实现 Cloud 独占能力（Stripe 增购、客服、SLA、多区）
- 不写新企业特性 — 仅聚合现有 100+ 模块暴露的总览
- 不修改任何现有 hot path
- 不修改既有 module/component 的对外接口
- 不引入新 npm 依赖
- 不做前端（`apps/nextjs-app` 不动）

## Acceptance examples

- **A1** `GET /api/admin/enterprise-readiness` 返回 200 + JSON，结构满足上述 schema
- **A2** `plan.level` 默认是 `self_hosted`（无 license 时）
- **A3** 设置 `TEABLE_LICENSE_KEY=plan:business` 重启后，`plan.level='business'` 且 `summary.cloudBusinessParity >= "16/18"`
- **A4** 设置 `TEABLE_LICENSE_KEY=plan:free` 重启后，`admin_panel.enabled=false`，`permission_matrix.enabled=false`，`sso.enabled=false`
- **A5** readiness 端点能力检查与 `LicenseCapabilityService.ALL_CAPABILITIES` 完全一致（不出现在 license map 的能力标记 `missing=true`，出现在 license map 但未加载的模块标记 `enabled=false`）
- **A6** 端点访问需要 admin token（`TEABLE_ADMIN_TOKEN` env），无 token → 401
- **A7** `scripts/e2e-enterprise-readiness.sh` 在干净 DB + 干净 license 下跑通 4 段断言，退出码 0
- **A8** `scripts/e2e-enterprise-readiness.sh` 启动失败时退出码非 0，并把 stderr 写到 `/tmp/teable-e2e-readiness.log`
- **A9** 所有现有 734 个单测仍然 0 失败（不破坏）
- **A10** 所有 10 个已完成 stage 的 controller 仍然 `Mapped`（不破坏）

## Constraints and invariants

- **最小改造**：增量 ≤ 700 行；现有源码 0 行改动；只在 admin module 内新增 controller/service
- **零新依赖**：Node `http` 标准库足够；Prisma 已有；BullMQ 已有
- **能力闸一致**：readiness 端点本身不挂在 LicenseCapabilityGuard 上（它要报告所有能力状态，包括哪些没开）
- **认证**：复用现有 admin auth pattern（`TEABLE_ADMIN_TOKEN` 检查 + NestJS middleware）
- **不可逆的变更禁止**：不要修改 prisma schema、不要修改 migration
- **幂等**：多次访问 readiness 端点结果一致（uptimeSec 除外）

## Decisions

1. **聚合 vs 拆分**：选聚合。100+ 模块里每个都有"我现在有没有准备好"的答案，但运维需要一个 URL 就看完所有答案；拆成 18 个端点反而违反"最小改造"原则。
2. **响应里不返回 secret**：smtp.password、jwt secret 等不出现；只返回 `enabled + module + reason`。
3. **不调用实际 cloud API**：完全 self-contained，不联网。OSS 是 AGPL，readiness 必须不依赖 teable cloud 服务。
4. **plan 字段来源**：`LicenseService.getPlan()` — 已有 API，不引入新解析逻辑。
5. **e2e 脚本共享已有 infra**：复用 `e2e-gap-fill.sh` 的启动模式（prisma migrate + nest start + lsof probe），新脚本只增量加入 readiness 断言。

## Open questions

- 无。当前需求与上一轮 gap-fill 完成后的状态一致 — 不是"再补 10 个 stage"，而是"补一个总览 + 一个能跑活的真验证脚本"。
- 用户授权范围：以本 brief 为准。

## Verification expectations

- `apps/nestjs-backend` 的 unit tests：0 失败（baseline 734）
- 新增 `enterprise-readiness.controller.spec.ts`：覆盖 happy path + 401 + capability map 一致性
- `scripts/e2e-enterprise-readiness.sh` 在干净 PG + Redis 下跑通（先 prisma migrate、然后 start、然后断言）
- 终态：10 个原始 stage 仍 archived；新增 readiness + e2e 脚本作为本 change 单独交付

