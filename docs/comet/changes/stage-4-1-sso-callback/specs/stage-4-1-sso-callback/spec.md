# Stage 4.1 — SSO callback 接通本地会话

> 本 spec 描述归档后 Stage 4.1 的完整行为。父 change `teable-oss-vs-cloud-gap-fill` 中 §3.2 已经给出 6 步契约,本 spec 把它落到 NestJS 现有模块结构中。Verifier 在本 child 集成分支上按 AC-001 ~ AC-008 验收。

## 1. 能力目标

完成一次完整 SSO 登录闭环:从用户访问 `/api/auth/sso/login` 到本地 session cookie 写入,使后续 `/api/auth/profile` 返回已登录 user。本 child **只**做 callback 接通 + session 写入,不修改 OIDC 验签核心。

## 2. 数据模型增量

无新增表。`SsoLoginState` / `SsoIdentityProvider` / `OrganizationDomain` / `User` / `audit_log` 均已在 Stage 4 / Stage 3.5 / 既有 audit 子系统 落地。

## 3. 运行时行为

### 3.1 路由与权限

- `GET /api/auth/sso/login?emailHint=alice@acme.com` — 已存在(`SsoController`),不变。
- `GET /api/auth/sso/callback?state=&code=` — 由 `SsoAuthService.handleCallback()` 实现。
- `POST /api/auth/sso/logout` — 已存在,不变。
- 全部路由顶层挂 `@LicenseCapabilityGuard.for('sso')`,缺位 → `402 LICENSE_REQUIRED`。

### 3.2 callback 6 步

1. **state 校验**:`SsoLoginState.findFirst({ where: { id: stateRaw, consumedAt: null, expiresAt: { gt: new Date() } } })`;查不到 → `400 INVALID_STATE`。
2. **code → token**:`OidcTokenClient.exchange(provider, code)`(mock-friendly,测试用本地 JWKS)。
3. **id_token 验签**:`jose.jwtVerify(idToken, jwks, { issuer, audience })`;失败 → 401 INVALID_ID_TOKEN。
4. **本地 user resolve**:`SsoAuthService.resolveLocalUser(provider, claims)`:
   - `claims.email_verified === false` → 拒绝。
   - 域不在 `OrganizationDomain.verified=true` 列表 → 拒绝。
   - 否则 find-or-create `User`,返回 `user`。
5. **写 session**:`SessionService.createSession(userId, requestMeta)` — 写 Prisma `Session` 表 + Set-Cookie + 返回 redirectUrl。
6. **state consumed**:`SsoLoginState.update({ where: { id }, data: { consumedAt: new Date() } })`,302 到 redirectUrl。

第 1 / 第 6 步在 `$transaction` 内;第 5 步失败时事务回滚(无孤儿 state)。

### 3.3 失败拒绝

| 触发 | 状态码 | 错误码 |
|------|--------|--------|
| state 不存在 / 已过期 / 已消费 | 400 | `INVALID_STATE` |
| email_verified=false | 403 | `EMAIL_NOT_VERIFIED` |
| email 域未验证 | 403 | `DOMAIN_NOT_VERIFIED` |
| IdP 未注册 | 404 | `IDENTITY_PROVIDER_NOT_FOUND` |
| license 缺位 | 402 | `LICENSE_REQUIRED` |
| id_token 验签失败 | 401 | `INVALID_ID_TOKEN` |

### 3.4 审计

复用既有 `audit_log` 表 + `AuditScope.emitAtomic()` + `AuditLogListener.handleAuditLogEmit`(`@Audit` 装饰器 → `AUDIT_LOG_EMIT` 事件 → 监听器写行)。

新增事件值:
- `Events.USER_SSO_LOGIN_SUCCESS = 'user.sso.login.success'` — callback 成功,`req.login()` 之前。
- `Events.USER_SSO_LOGIN_FAILURE = 'user.sso.login.failure'` — 任一失败拒绝,事务回滚之前。

埋点位置:
- `SsoAuthService.completeCallback()` 顶层 `@Audit({ action: Events.USER_SSO_LOGIN_SUCCESS, emit: true })`。
- `SsoAuthService.handleCallback()` 顶层 try/catch,catch 块 `this.auditScope.emitAtomic({ action: Events.USER_SSO_LOGIN_FAILURE, payload: { reason } })`。
- `auditScope.emitAtomic()` 失败 → 业务事务**不**回滚(与现有 `AuditScope` 约定一致)。

## 4. 验收项

- **AC-001** state 重放防御:同一 state 二次调 callback → 第二次 400 INVALID_STATE。
- **AC-002** email_verified=false 拒绝:mock claims `email_verified=false` → 403 EMAIL_NOT_VERIFIED,**不**写 cookie。
- **AC-003** 域不匹配拒绝:`email=mallory@evil.com`、OrgDomain 仅 `acme.com` → 403 DOMAIN_NOT_VERIFIED。
- **AC-004** session 写入:Set-Cookie 含 session cookie;后续 `/api/auth/profile` 用该 cookie 返回 user(与 callback 中 user 同 id)。
- **AC-005** license 闸:未设 license → `GET /api/auth/sso/login` 返回 402 LICENSE_REQUIRED。
- **AC-006** 事务回滚:第 5 步强制失败 → state `consumedAt` 为 null,DB 无残留 session 行。
- **AC-007** 审计埋点:`stage-6` archive 后,callback 成功在 `audit_log` 留一行(`event_type='sso.login.success'`,`actor_id=user.id`)。
- **AC-008** 单元测试:`sso-auth.service.spec.ts` 至少 8 个 it(),全部 pass。

## 5. 反例与边界

- 同一 user 多次 SSO login:每次都创建新的 `SsoLoginState` 行,callback 后各自 consumed。
- session cookie 与现有 email/password 登录 cookie 同名同域,共用现有 `Session` 表。
- 不处理 OIDC `prompt=none` / silent re-auth(本 child 不在 scope)。

## 6. 边界与不属于本 spec

- `SsoLoginState` 5min TTL 过期清理 → `stage-4-2`。
- SAML provider → `stage-9`。
- 真正 `AuditLogService` 实现 → `stage-6`(本 child 仅 noop 占位)。
- IdP 注册端点(POST `/api/auth/sso/idp`)已在 Stage 4,本 child 不动。