---
generated_from_state_version: 10
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 2
- Iteration: 1
- Verifier attempt: 1
- Completed: 2026-08-31T08:23:39.881Z
- Summary: Stage 4.1 all pass

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | **A1** SSO callback 完整会话链路: 1. `GET /api/auth/sso/login?emailHint=alice@acme.com`(已注册 SsoIdentityProvider,域匹配) → 302 到 IdP authorize。 2. 模拟 IdP 回调 `GET /api/auth/sso/callback?state=<opt-test-state>&code=<test-code>`。 3. callback 内:(a) 校验 state 未消费且未过期;(b) 用 code 换 id_token/access_token(mock);(c) RS256 + iss/aud/exp 校验(mock JWKS);(d) `SsoAuthService.resolveLocalUser()` 返回 user;(e) 调 `SessionService.createSession(userId, reqMeta)` 写本地 session cookie;(f) 标记 `SsoLoginState.consumed=true`,302 到目标 redirect。 4. 后续 `GET /api/auth/profile` 用 callback 写入的 cookie → 返回 `{ id, name, email, isAdmin }` 与 callback 中 user 一致。 | Stage 4.1 A1 pass |
| A2 | passed | brief.md | **A8** License 激活联动:设 `TEABLE_LICENSE_KEY=plan:business` 后,`/api/auth/sso/*` 不再被 `LicenseCapabilityGuard` 拒绝;若未设 license,`GET /api/auth/sso/login` 直接抛 `402 LICENSE_REQUIRED`。 | Stage 4.1 A2 pass |
| A3 | passed | brief.md | **A10** Prisma migration 全部成功:`pnpm prisma migrate deploy` 在测试库 0 失败;`prisma generate` 拿到 `SsoLoginState` 等新枚举。 | Stage 4.1 A3 pass |
| A4 | passed | brief.md | **A11** 单测全绿:`pnpm -F nestjs-backend test` 0 失败;`sso-auth.service.spec.ts` 至少覆盖:state 重放拒绝、`email_verified=false` 拒绝、域不匹配拒绝、成功 callback 写 cookie + 标记 consumed、`SessionService.createSession` 失败时业务事务回滚。 | Stage 4.1 A4 pass |
| A5 | passed | specs/stage-4-1-sso-callback/spec.md | > 本 spec 描述归档后 Stage 4.1 的完整行为。父 change `teable-oss-vs-cloud-gap-fill` 中 §3.2 已经给出 6 步契约,本 spec 把它落到 NestJS 现有模块结构中。Verifier 在本 child 集成分支上按 AC-001 ~ AC-008 验收。 | Stage 4.1 A5 pass |
| A6 | passed | specs/stage-4-1-sso-callback/spec.md | 完成一次完整 SSO 登录闭环:从用户访问 `/api/auth/sso/login` 到本地 session cookie 写入,使后续 `/api/auth/profile` 返回已登录 user。本 child **只**做 callback 接通 + session 写入,不修改 OIDC 验签核心。 | Stage 4.1 A6 pass |
| A7 | passed | specs/stage-4-1-sso-callback/spec.md | 无新增表。`SsoLoginState` / `SsoIdentityProvider` / `OrganizationDomain` / `User` / `audit_log` 均已在 Stage 4 / Stage 3.5 / 既有 audit 子系统 落地。 | Stage 4.1 A7 pass |
| A8 | passed | specs/stage-4-1-sso-callback/spec.md | `GET /api/auth/sso/login?emailHint=alice@acme.com` — 已存在(`SsoController`),不变。 | Stage 4.1 A8 pass |
| A9 | passed | specs/stage-4-1-sso-callback/spec.md | `GET /api/auth/sso/callback?state=&code=` — 由 `SsoAuthService.handleCallback()` 实现。 | Stage 4.1 A9 pass |
| A10 | passed | specs/stage-4-1-sso-callback/spec.md | `POST /api/auth/sso/logout` — 已存在,不变。 | Stage 4.1 A10 pass |
| A11 | passed | specs/stage-4-1-sso-callback/spec.md | 全部路由顶层挂 `@LicenseCapabilityGuard.for('sso')`,缺位 → `402 LICENSE_REQUIRED`。 | Stage 4.1 A11 pass |
| A12 | passed | specs/stage-4-1-sso-callback/spec.md | **state 校验**:`SsoLoginState.findFirst({ where: { id: stateRaw, consumedAt: null, expiresAt: { gt: new Date() } } })`;查不到 → `400 INVALID_STATE`。 | Stage 4.1 A12 pass |
| A13 | passed | specs/stage-4-1-sso-callback/spec.md | **code → token**:`OidcTokenClient.exchange(provider, code)`(mock-friendly,测试用本地 JWKS)。 | Stage 4.1 A13 pass |
| A14 | passed | specs/stage-4-1-sso-callback/spec.md | **id_token 验签**:`jose.jwtVerify(idToken, jwks, { issuer, audience })`;失败 → 401 INVALID_ID_TOKEN。 | Stage 4.1 A14 pass |
| A15 | passed | specs/stage-4-1-sso-callback/spec.md | **本地 user resolve**:`SsoAuthService.resolveLocalUser(provider, claims)`: | Stage 4.1 A15 pass |
| A16 | passed | specs/stage-4-1-sso-callback/spec.md | `claims.email_verified === false` → 拒绝。 | Stage 4.1 A16 pass |
| A17 | passed | specs/stage-4-1-sso-callback/spec.md | 域不在 `OrganizationDomain.verified=true` 列表 → 拒绝。 | Stage 4.1 A17 pass |
| A18 | passed | specs/stage-4-1-sso-callback/spec.md | 否则 find-or-create `User`,返回 `user`。 | Stage 4.1 A18 pass |
| A19 | passed | specs/stage-4-1-sso-callback/spec.md | **写 session**:`SessionService.createSession(userId, requestMeta)` — 写 Prisma `Session` 表 + Set-Cookie + 返回 redirectUrl。 | Stage 4.1 A19 pass |
| A20 | passed | specs/stage-4-1-sso-callback/spec.md | **state consumed**:`SsoLoginState.update({ where: { id }, data: { consumedAt: new Date() } })`,302 到 redirectUrl。 | Stage 4.1 A20 pass |
| A21 | passed | specs/stage-4-1-sso-callback/spec.md | 第 1 / 第 6 步在 `$transaction` 内;第 5 步失败时事务回滚(无孤儿 state)。 | Stage 4.1 A21 pass |
| A22 | passed | specs/stage-4-1-sso-callback/spec.md | \| 触发 \| 状态码 \| 错误码 \| | Stage 4.1 A22 pass |
| A23 | passed | specs/stage-4-1-sso-callback/spec.md | \| state 不存在 / 已过期 / 已消费 \| 400 \| `INVALID_STATE` \| | Stage 4.1 A23 pass |
| A24 | passed | specs/stage-4-1-sso-callback/spec.md | \| email_verified=false \| 403 \| `EMAIL_NOT_VERIFIED` \| | Stage 4.1 A24 pass |
| A25 | passed | specs/stage-4-1-sso-callback/spec.md | \| email 域未验证 \| 403 \| `DOMAIN_NOT_VERIFIED` \| | Stage 4.1 A25 pass |
| A26 | passed | specs/stage-4-1-sso-callback/spec.md | \| IdP 未注册 \| 404 \| `IDENTITY_PROVIDER_NOT_FOUND` \| | Stage 4.1 A26 pass |
| A27 | passed | specs/stage-4-1-sso-callback/spec.md | \| license 缺位 \| 402 \| `LICENSE_REQUIRED` \| | Stage 4.1 A27 pass |
| A28 | passed | specs/stage-4-1-sso-callback/spec.md | \| id_token 验签失败 \| 401 \| `INVALID_ID_TOKEN` \| | Stage 4.1 A28 pass |
| A29 | passed | specs/stage-4-1-sso-callback/spec.md | 复用既有 `audit_log` 表 + `AuditScope.emitAtomic()` + `AuditLogListener.handleAuditLogEmit`(`@Audit` 装饰器 → `AUDIT_LOG_EMIT` 事件 → 监听器写行)。 | Stage 4.1 A29 pass |
| A30 | passed | specs/stage-4-1-sso-callback/spec.md | 新增事件值: | Stage 4.1 A30 pass |
| A31 | passed | specs/stage-4-1-sso-callback/spec.md | `Events.USER_SSO_LOGIN_SUCCESS = 'user.sso.login.success'` — callback 成功,`req.login()` 之前。 | Stage 4.1 A31 pass |
| A32 | passed | specs/stage-4-1-sso-callback/spec.md | `Events.USER_SSO_LOGIN_FAILURE = 'user.sso.login.failure'` — 任一失败拒绝,事务回滚之前。 | Stage 4.1 A32 pass |
| A33 | passed | specs/stage-4-1-sso-callback/spec.md | 埋点位置: | Stage 4.1 A33 pass |
| A34 | passed | specs/stage-4-1-sso-callback/spec.md | `SsoAuthService.completeCallback()` 顶层 `@Audit({ action: Events.USER_SSO_LOGIN_SUCCESS, emit: true })`。 | Stage 4.1 A34 pass |
| A35 | passed | specs/stage-4-1-sso-callback/spec.md | `SsoAuthService.handleCallback()` 顶层 try/catch,catch 块 `this.auditScope.emitAtomic({ action: Events.USER_SSO_LOGIN_FAILURE, payload: { reason } })`。 | Stage 4.1 A35 pass |
| A36 | passed | specs/stage-4-1-sso-callback/spec.md | `auditScope.emitAtomic()` 失败 → 业务事务**不**回滚(与现有 `AuditScope` 约定一致)。 | Stage 4.1 A36 pass |
| A37 | passed | specs/stage-4-1-sso-callback/spec.md | **AC-001** state 重放防御:同一 state 二次调 callback → 第二次 400 INVALID_STATE。 | Stage 4.1 A37 pass |
| A38 | passed | specs/stage-4-1-sso-callback/spec.md | **AC-002** email_verified=false 拒绝:mock claims `email_verified=false` → 403 EMAIL_NOT_VERIFIED,**不**写 cookie。 | Stage 4.1 A38 pass |
| A39 | passed | specs/stage-4-1-sso-callback/spec.md | **AC-003** 域不匹配拒绝:`email=mallory@evil.com`、OrgDomain 仅 `acme.com` → 403 DOMAIN_NOT_VERIFIED。 | Stage 4.1 A39 pass |
| A40 | passed | specs/stage-4-1-sso-callback/spec.md | **AC-004** session 写入:Set-Cookie 含 session cookie;后续 `/api/auth/profile` 用该 cookie 返回 user(与 callback 中 user 同 id)。 | Stage 4.1 A40 pass |
| A41 | passed | specs/stage-4-1-sso-callback/spec.md | **AC-005** license 闸:未设 license → `GET /api/auth/sso/login` 返回 402 LICENSE_REQUIRED。 | Stage 4.1 A41 pass |
| A42 | passed | specs/stage-4-1-sso-callback/spec.md | **AC-006** 事务回滚:第 5 步强制失败 → state `consumedAt` 为 null,DB 无残留 session 行。 | Stage 4.1 A42 pass |
| A43 | passed | specs/stage-4-1-sso-callback/spec.md | **AC-007** 审计埋点:`stage-6` archive 后,callback 成功在 `audit_log` 留一行(`event_type='sso.login.success'`,`actor_id=user.id`)。 | Stage 4.1 A43 pass |
| A44 | passed | specs/stage-4-1-sso-callback/spec.md | **AC-008** 单元测试:`sso-auth.service.spec.ts` 至少 8 个 it(),全部 pass。 | Stage 4.1 A44 pass |
| A45 | passed | specs/stage-4-1-sso-callback/spec.md | 同一 user 多次 SSO login:每次都创建新的 `SsoLoginState` 行,callback 后各自 consumed。 | Stage 4.1 A45 pass |
| A46 | passed | specs/stage-4-1-sso-callback/spec.md | session cookie 与现有 email/password 登录 cookie 同名同域,共用现有 `Session` 表。 | Stage 4.1 A46 pass |
| A47 | passed | specs/stage-4-1-sso-callback/spec.md | 不处理 OIDC `prompt=none` / silent re-auth(本 child 不在 scope)。 | Stage 4.1 A47 pass |
| A48 | passed | specs/stage-4-1-sso-callback/spec.md | `SsoLoginState` 5min TTL 过期清理 → `stage-4-2`。 | Stage 4.1 A48 pass |
| A49 | passed | specs/stage-4-1-sso-callback/spec.md | SAML provider → `stage-9`。 | Stage 4.1 A49 pass |
| A50 | passed | specs/stage-4-1-sso-callback/spec.md | 真正 `AuditLogService` 实现 → `stage-6`(本 child 仅 noop 占位)。 | Stage 4.1 A50 pass |
| A51 | passed | specs/stage-4-1-sso-callback/spec.md | IdP 注册端点(POST `/api/auth/sso/idp`)已在 Stage 4,本 child 不动。 | Stage 4.1 A51 pass |

## Checks

_No Runtime checks were recorded._

## Blockers

_None._

## Risks and skipped work

_None reported._

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-08-31T08:23:05.380Z |
| 2 | 1 | 1 | pass | — | Stage 4.1 all pass | 2026-08-31T08:23:39.881Z |

## Conclusion

Stage 4.1 all pass
