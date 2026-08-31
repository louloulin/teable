# Outcome

把 Supervisor Change `teable-oss-vs-cloud-gap-fill` 中划定的 Stage 4.1 在本 worktree 真实实现:把已有 Stage 4 OIDC 验签结果(commit `ad55ecaf4`)接到 `auth.service.ts` 的本地会话写入路径,让浏览器走完 `/api/auth/sso/login → IdP → /api/auth/sso/callback`,落地本地 session cookie,使后续 `/api/auth/profile` 返回该 user。本 child 是 Supervisor acceptance `A1 / A8 / A10 / A11` 的最小真实落地。

# Scope

## Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Supervisor brief | `../teable-oss-vs-cloud-gap-fill/brief.md` §"Stage 4.1" | `complete` | 本 child 的范围与 A1 验收 |
| Supervisor spec | `../teable-oss-vs-cloud-gap-fill/specs/teable-oss-vs-cloud-gap-fill/spec.md` §3.2 | `complete` | 6 步运行时行为契约 |
| 已落地 Stage 4 | commit `ad55ecaf4`(OIDC scaffolding)+ `d0d1e13cb`(resolveLocalUser) | `complete` | 本 child 的事实基础 |
| `apps/nestjs-backend/src/features/auth/open-api/auth.service.ts` | worktree 文件 | `complete` | 现有 session 写入路径 |

## Inherited constraints(来自 Supervisor)

- **AGPL-3.0 / 零热路径改动**:`auth.service.ts` **主体不变**;session cookie 复用现有 `passport req.login(user)` 路径(与 `LocalAuthController.signup` 行为一致),不新建 session API。
- **零新增 npm 依赖**。
- **Prisma migration 幂等**:本 child **不**新增表(`SsoLoginState` / `SsoIdentityProvider` / `OrganizationDomain` / `User` / `audit_log` 均已存在)。
- **能力闸**:`@LicenseCapabilityGuard.for('sso')` 顶层挂在 `/api/auth/sso/*` 路由。
- **审计**:复用既有 `audit_log` 表 + `AuditScope.emitAtomic()` + `@Audit` 装饰器 + `AUDIT_LOG_EMIT` 监听器(在 `event-emitter/events/event.enum.ts` 已存在)。仅在 `Events` 枚举增 `USER_SSO_LOGIN_SUCCESS` / `USER_SSO_LOGIN_FAILURE` 两个值;**不**新建 audit 子系统。

# Non-goals

- 不实现 SAML(由 `stage-9-saml-provider` 负责)。
- 不实现 `SsoLoginState` 过期清理(由 `stage-4-2-sso-state-cleanup` 负责)。
- 不改 IdP discovery / metadata 拉取 / 验签核心(已在 Stage 4)。
- 不重写 `auth.service.ts` 现有 email/password 登录逻辑。
- 不动 `apps/nextjs-app` 前端。

# Acceptance examples

> 验收以 Supervisor acceptance `A1 / A8 / A10 / A11` 的语义为准;具体可观察步骤如下。

- **A1** SSO callback 完整会话链路:
  1. `GET /api/auth/sso/login?emailHint=alice@acme.com`(已注册 SsoIdentityProvider,域匹配) → 302 到 IdP authorize。
  2. 模拟 IdP 回调 `GET /api/auth/sso/callback?state=<opt-test-state>&code=<test-code>`。
  3. callback 内:(a) 校验 state 未消费且未过期;(b) 用 code 换 id_token/access_token(mock);(c) RS256 + iss/aud/exp 校验(mock JWKS);(d) `SsoAuthService.resolveLocalUser()` 返回 user;(e) 调 `SessionService.createSession(userId, reqMeta)` 写本地 session cookie;(f) 标记 `SsoLoginState.consumed=true`,302 到目标 redirect。
  4. 后续 `GET /api/auth/profile` 用 callback 写入的 cookie → 返回 `{ id, name, email, isAdmin }` 与 callback 中 user 一致。
- **A8** License 激活联动:设 `TEABLE_LICENSE_KEY=plan:business` 后,`/api/auth/sso/*` 不再被 `LicenseCapabilityGuard` 拒绝;若未设 license,`GET /api/auth/sso/login` 直接抛 `402 LICENSE_REQUIRED`。
- **A10** Prisma migration 全部成功:`pnpm prisma migrate deploy` 在测试库 0 失败;`prisma generate` 拿到 `SsoLoginState` 等新枚举。
- **A11** 单测全绿:`pnpm -F nestjs-backend test` 0 失败;`sso-auth.service.spec.ts` 至少覆盖:state 重放拒绝、`email_verified=false` 拒绝、域不匹配拒绝、成功 callback 写 cookie + 标记 consumed、`SessionService.createSession` 失败时业务事务回滚。

# Constraints and invariants

- **零现有 hot path 改动**:`auth.service.ts` 主体不变;只新增 `/api/auth/sso/callback` 路由 + 在 `SsoController` 内复用现有 OIDC 验签结果。
- **失败 idempotency**:state 重放 → `consumed=true` 已存在,拒绝再次创建 session(返回 400 INVALID_STATE),**不**静默放行。
- **失败拒绝**:`email_verified=false` → 403;`email` 域不在 `OrganizationDomain.verified=true` 列表 → 403;未注册 IdP → 404 IDENTITY_PROVIDER_NOT_FOUND。
- **审计 noop 适配器**:**不适用**。复用既有 `@Audit({emit: true})` 装饰器模式(`session.service.ts` 已示范)。

# Decisions

1. **回调路径全部放在 `SsoController`**(已存在,无需新建 controller);`SsoAuthService.handleCallback()` 为纯函数,接收 `(provider, code, stateRaw, requestMeta)`,返回 `{user, redirectUrl}`。
2. **session cookie 写入**:复用现有 `AuthService.signSessionCookies()` / `setCookie()` 工具,本 child **不**新增 cookie API;若现有 auth.service 内部细节未公开,新建 `SessionService.createSession(userId, requestMeta)` 包一层,签名/过期/cookie name 与现有保持一致。
3. **state 重放防御**:依赖 `SsoLoginState.consumed=true` 标记,callback 第一步查 `SsoLoginState.consumed=true && createdAt+10min>now()` 直接拒绝。
4. **失败事务**:`SsoLoginState` 写入与 `User` find-or-create 在同一 Prisma `$transaction`;`SessionService.createSession` 失败时,事务回滚,**不**留孤儿 state。
5. **审计埋点方式**:在 `SsoController.handleCallbackGet` 顶层用 `@Audit({ action: Events.USER_SSO_LOGIN_SUCCESS, emit: true })` 装饰 `SsoAuthService.completeCallback()` 方法;失败分支在 `SsoAuthService.handleCallback()` 内 try/catch,失败时调 `auditScope.emitAtomic({ action: Events.USER_SSO_LOGIN_FAILURE, ... })`(复用现有 `audit-log.emit` 监听器,自动写 `audit_log` 行)。`Events.USER_SSO_LOGIN_SUCCESS` / `USER_SSO_LOGIN_FAILURE` 在 `event.enum.ts` 增 2 行。
6. **session cookie 写入**:通过 `req.login(user, callback)` 复用 passport-session serializer(`session.serializer.ts` 已存在),与 `LocalAuthController.signup` 同路径;**不**新建 session service。

# Open questions

- 无。所有 stage-4.1 行为已在 Supervisor brief / spec 中固化。

# Verification expectations

- 单元测试 `sso-auth.service.spec.ts` 覆盖全部决策点 + 异常分支(已列 A11)。
- 端到端脚本 `scripts/sso-callback-e2e.sh`(本 child 落地):
  1. `pnpm prisma migrate deploy` → 0 失败。
  2. 启动 `nestjs-backend`(测试 license = `plan:business`)。
  3. POST `/api/auth/sso/idp`(注册 mock IdP + 域 claim)→ 201。
  4. GET `/api/auth/sso/login?emailHint=...` → 302,捕获 `state`。
  5. 模拟 IdP 回调(替换 `iss/aud/kid` mock JWKS)。
  6. 验证响应 Set-Cookie 含 session cookie + 302 redirect。
  7. 用 cookie GET `/api/auth/profile` → 返回 user。
  8. **重放**:再调一次 callback → 400 INVALID_STATE,无新 session。
- `git diff comet/stage-4-1-sso-callback..comet/teable-oss-vs-cloud-gap-fill` 仅本 child 改动文件,**不**触碰 supervisor 已落地的 6 个 commit。