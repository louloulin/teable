# Teable OSS vs Cloud 完整补齐 — 完整目标规格

> 本规格是 Supervisor Change 的端到端能力契约,描述归档后整个仓库在 Business 等价能力上的行为。各 child change 负责把对应 stage 真实实现并接入。本规格本身**不要求 child 直接引用**;child 通过自己的 Spec 表达具体行为,Verifier 在所有 child 完成后,在 Supervisor 集成分支上按本规格的 AC-001 ~ AC-007 验收。

## 1. 能力目标

对照 teable Cloud 商业版 Business 档位的能力清单,本 change 在 AGPL-3.0 自托管 OSS 范围内真实实现:

| 能力域 | 来源档位 | OSS 落地要求 |
|--------|---------|-------------|
| SSO 单点登录 + callback 完整会话 | Business | OIDC 登录返回本地 session;SAML 可选 |
| 审计日志 | Business | record / permission / SSO / quota 关键路径埋点;可分页检索 |
| 权限矩阵热路径生效 | Business | row filter 注入 Prisma where;hidden 字段读写均拒绝 |
| 管理面板后端 API | Business | `/api/admin/*` 用户/空间/模板/AI/配额路由 |
| 自定义应用域名(子集) | Business | CNAME 检测 + 反代提示 |
| AI 能力细分计费 | Pro+ | ai_field / ai_app_builder / cuppy_claw / ai_chat 分别闸 |
| 配额 retention 差异化 | Free/Pro/Business | record history 2 周/1 年/3 年;automation 2 周/1 年/1 年 |
| API 速率限制按档位 | 全档 | 激活 license 后按 plan 限流 |

## 2. 数据模型增量

下列表通过 Prisma migration 增量加入,**不**改任何已有 schema:

- `audit_log` — (id, actor_id, action, resource_type, resource_id, payload jsonb, ip, ua, created_at) + 按 (actor_id, created_at desc) / (resource_type, resource_id, created_at desc) 索引
- `sso_login_state` — 已在 Stage 4 落地,本 change 不再新增
- `saml_*` — SAML provider 表(若进入 Stage 9)

## 3. 运行时行为

### 3.1 能力闸

任何 Business-only 路由顶层挂 `LicenseCapabilityGuard.for('<cap>')`,缺位 → 统一抛 `402 LICENSE_REQUIRED`。能力位判定由 `LicenseCapabilityService` 单一事实来源给出,plan → cap 的映射与 Stage 8(已落地)一致。

### 3.2 SSO callback 完整会话

- 用户访问 `GET /api/auth/sso/login?emailHint=alice@acme.com`,系统按 email 域查 SsoIdentityProvider,302 到 IdP authorize 端点
- IdP 回调 `/api/auth/sso/callback?state=&code=`,系统:
  1. 校验 state 未消费且未过期
  2. 用 auth code 换 id_token + access_token
  3. RS256 + kid 验签 + iss/aud/exp 校验
  4. `SsoAuthService.resolveLocalUser(provider, claims)` find-or-create 本地 user(`email_verified=false` 拒绝、email 域不匹配拒绝)
  5. 通过现有 `SessionService.createSession(userId, requestMeta)` 写 session cookie
  6. 标记 `SsoLoginState.consumed=true`,302 到目标 redirect URL

### 3.3 审计日志

- `AuditLogService.record(eventType, payload, ctx)` 接收事件,失败时**不**回滚业务事务
- sink 默认 `LocalJsonlAuditSink`(写 `<data_dir>/audit/YYYY-MM-DD.jsonl`),可切换 `S3CompatibleAuditSink`(可选 install)
- 埋点位置(覆盖即可,具体由 child Stage 6 决定):
  - record create/update/delete
  - permission role create/update/delete / member add+remove / role enable-disable
  - SSO login success/failure
  - quota hit / plan change
  - license key activate

### 3.4 权限矩阵热路径

- `RecordQueryPermissionInterceptor` 在 record list 入口执行:
  1. 解析 `:baseId/:tableId`
  2. 调 `PermissionMatrixService.resolveRolesForUser(baseId, userId)`
  3. 若角色集非空,AND 合并 `mergeRecordFilters(roles, tableId)`,stash 到 `req.permission.filter`
  4. 投影响应:hidden 字段 = `null`
- `RecordQueryPermissionService` 在 record list 查询时读 `req.permission.filter`,注入 Prisma `where`,与原 `where` 用 `AND` 合并
- `PermissionMutationGuard` 在 record create/update/delete 入口:
  1. `assertActionAllowed(roles, tableId, action)`
  2. `assertFieldEditAllowed(req, tableId, baseId)`(hidden 字段 → 403)

### 3.5 AI 细分计费

- `AiService.createField()` / `summarize()` / `translate()` 入口各调 `this.caps.require('ai_field')`
- `AiService.chat()` / `explainQuery()` 入口各调 `this.caps.require('ai_chat')`
- `AiService.buildApp()` / `AiService.runAgent()` 各调 `this.caps.require('ai_app_builder')` / `cuppy_claw`
- 每次调用前 `quotaService.consume(spaceId, 'ai_credits', 1)`

### 3.6 自定义应用域名

- `GET /api/admin/custom-domain/check?domain=foo.com` 返回 `{ cnameTarget, verified: boolean }`
- `POST /api/admin/custom-domain/claim` 创 `organization_domain` 行(CNAME 目标 = 反代 LB DNS 名)
- 前端 reverse proxy + LB 配置在 `teable-deployment` 仓库;本仓库仅 API

### 3.7 配额 retention 差异化

- 在 record history cleanup job 中按 plan 取 TTL:
  - self_hosted / free: 14 天
  - pro: 365 天
  - business: 1095 天(record) / 365 天(automation)
- 在 automation run cleanup job 中按 plan 取 TTL(同上,automation 单独)
- 启用 license 激活后,定时任务(已在 Stage 1 QuotaService 雏形中)按 plan 调整 TTL

### 3.8 API 速率限制按档位

- `ApiThrottleGuard`(新)读 `LicenseCapabilityService.getPlan()`,按 plan 取 throttle 限额:
  - self_hosted: 默认无限
  - free / pro / business: 10 req/s(以 pricing 页为准)
- `app.module.ts` 注册到全局 APP_GUARD

## 4. 验收项

完整验收 ID 在 children.yaml 的 `acceptance_index` 中记录。本规格对应编号 A1-A11:

- **A1** SSO callback 完整会话链路:从 `/api/auth/sso/login` 走完到本地 session cookie 写入,后续 `/api/auth/profile` 返回正确 user。覆盖 `specs/teable-oss-vs-cloud-gap-fill/spec.md` §3.2
- **A2** 审计日志存在与可检索:任何 record create/update/delete 在 DB 留对应 `audit_log` 行,可在 `/api/admin/audit-log` 分页筛选。覆盖 §3.3
- **A3** 权限矩阵热路径生效:hidden 字段在 list 响应中为 `null`,PATCH 写 hidden 字段返回 `403 RESTRICTED_RESOURCE`,row filter 实际缩小查询结果。覆盖 §3.4
- **A4** AI 细分计费:free plan 调 ai_field 返回 `402 LICENSE_REQUIRED`;pro plan 调 cuppy_claw 返回 `402`;business plan 调 ai_app_builder 不返错。覆盖 §3.5
- **A5** 自定义应用域名端点:`/api/admin/custom-domain/check?domain=foo.com` 返回 cnameTarget。覆盖 §3.6
- **A6** 配额 retention 差异化:plan 切到 business 后,record history cleanup 保留期内记录保留,过期记录被删除。覆盖 §3.7
- **A7** API 速率限制按档位:business plan 下超过 10 req/s 返回 429;self_hosted plan 默认无限。覆盖 §3.8
- **A8** License 激活联动:设 `TEABLE_LICENSE_KEY=plan:business`,启动后所有 spaces 自动切到 business plan。覆盖 §3.1
- **A9** SsoLoginState BullMQ 清理:超过 5 分钟的 state 行被删除,DB 中无残留。覆盖 Stage 4.2 行为
- **A10** Prisma migration 全部成功:测试库顺序应用 0 失败,prisma generate 拿到全部枚举。覆盖 §2
- **A11** 单测全绿:`pnpm test` 在 `apps/nestjs-backend` 0 失败,新模块单元测试覆盖所有决策点。

## 5. 反例与边界

- **失败 idempotency**:任何重复请求产生相同最终状态(sso callback 重放 → state consumed,无新 session)
- **失败降级**:`AuditLogService.record()` 抛错时业务事务继续
- **失败拒绝**:`email_verified=false`、email 域不匹配、未验证域注册 IdP → 显式 `403`/`400`,**不**静默放行
- **能力位缺位**:任何 Business-only 路由统一 `402 LICENSE_REQUIRED`,**不**触达下游 handler
- **rate limit 公平性**:self_hosted 默认无限 ≠ 关闭节流;启用 license 后才进入按 plan 节流

## 6. 边界与不属于本规格

- Cloud 独占运营组件:Stripe 增购、发票、SLA、客服、公有云多区部署 — 见 `brief.md` Non-goals
- 前端 UI 改动(`apps/nextjs-app`)— 不在本 change scope
- `teableio/teable-ee` 任何源代码 — 不复制

