# Spec — Stage 9: SAML Provider

## 1. 能力目标(Capabilities)

在 OSS 仓库 `apps/nestjs-backend/src/features/federated-sso/` 真实新增 SAML 2.0 SP-initiated AuthnRequest + ACS callback + 签名校验路径。复用既有 `SsoLoginState` BullMQ 清理、session cookie、`/api/auth/sso/login` + `/api/auth/sso/callback` 入口;OIDC 与 SAML 共用 `federated-sso` 模块。

## 2. 运行时(Runtime)

### 2.1 SAML AuthnRequest(SP → IdP)

`SamlAuthService.buildAuthnRequestUrl(cfg, state, acsUrl)`:

- 输入:`cfg`(含 `ssoUrl` / `entityId` / `certificate`)、`state`(SsoLoginState.id,5 分钟 TTL,Stage 4.2 自动清理)、`acsUrl`。
- 输出:形如 `<ssoUrl>?SAMLRequest=<deflate-base64 AuthnRequest>&RelayState=<state>`。
- `SAMLRequest` = `<samlp:AuthnRequest ID="_<uuid>" Version="2.0" IssueInstant="<ISO>" AssertionConsumerServiceURL="<acs-url>" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"><saml:Issuer><cfg.entityId></saml:Issuer></samlp:AuthnRequest>` + DEFLATE 压缩 + base64。

### 2.2 SAML ACS Callback(IdP → SP)

`SamlAuthService.handleCallback({ samlResponseB64, relayState })`:

1. `SAMLResponse` base64 解码 + INFLATE 解压 → XML DOM。
2. 从 `<ds:Signature><ds:KeyInfo><ds:X509Certificate>` 提取 IdP 证书。
3. `crypto.verify('RSA-SHA256', signedInfoCanonical, cfg.certificate, signatureValue)` 验签;失败抛 `CustomHttpException('SAML signature verification failed', 403)`。
4. 提取 `<AttributeStatement>` 中 `email` / `name` / `email_verified`:
   - `email_verified` 必须严格 == `true` → 否则 `403 EMAIL_NOT_VERIFIED`。
5. 查 user:存在 → `update lastSignTime`;不存在 → 拒绝(无自动创建,留给 admin invite 流程)。
6. 返回 `{ userId, relayState }`。

## 3. 验收(Acceptance)

### AC-001 — SAML AuthnRequest URL 生成(A1)

- **GIVEN** IdP `ssoUrl="https://idp.example.com/sso"`、`entityId="https://teable.example.com"`
- **WHEN** `samlAuthService.buildAuthnRequestUrl(cfg, "state-uuid-1234", "https://teable.example.com/acs")`
- **THEN** 返回 URL 形如 `https://idp.example.com/sso?SAMLRequest=<base64>&RelayState=state-uuid-1234`;`SAMLRequest` 解码后包含 `<samlp:AuthnRequest>` + `<saml:Issuer>https://teable.example.com</saml:Issuer>` + 合法 `AssertionConsumerServiceURL`。

### AC-002 — SAML ACS 签名校验 + 用户登录(A1)

- **GIVEN** 预生成 SAML Response XML(签名正确,`email="alice@acme.com"`、`name="Alice"`、`email_verified=true`),本地 user 已存在
- **WHEN** `handleCallback({ samlResponseB64, relayState: "valid-state" })`
- **THEN** 返回 `{ userId: 'user-1', relayState: 'valid-state' }`;`prisma.user.update` 被调用一次,`lastSignTime` 已更新。

### AC-003 — SAML 失败拒绝

- **GIVEN** SAMLResponse 缺少 `<Assertion>` 标签
- **WHEN** `handleCallback` with malformed XML
- **THEN** 抛 `CustomHttpException('SAML response missing Assertion', 403)`;不返回 userId。

- **GIVEN** `email_verified` 属性为 `false`
- **WHEN** `handleCallback` with `email_verified=false`
- **THEN** 抛 `CustomHttpException('SAML email not verified', 403)`;不返回 userId。

### AC-004 — Prisma migration 完整(A10)

- **GIVEN** 本 child 不引入新表 / 新字段(`SsoIdentityProvider.config` 已有 JSONB 列存 SAML config)
- **WHEN** `pnpm --filter @teable/db-main-prisma prisma migrate deploy` + `prisma generate`
- **THEN** 两个命令均 0 失败;`SsoProviderType` 枚举仍包含 `'oidc' | 'saml'`。

### AC-005 — 单元测试覆盖(A11)

- **GIVEN** `saml-auth.service.spec.ts` ≥3 用例
- **WHEN** `pnpm --filter @teable/backend test-unit -- saml-auth.service.spec.ts`
- **THEN** 至少 3 个 `it` 通过:AuthnRequest URL 格式正确 / `email_verified=false` 抛 403 / config 缺字段抛 VALIDATION_ERROR。

## 4. 反例与边界(Anti-examples / Boundaries)

- **失败降级**:`crypto.verify` 抛错时,**不**返回 userId。
- **失败拒绝**:`email_verified=false` → 显式 403。
- **不引入新 npm 依赖**:Node 内置 `crypto` + `zlib`。
- **不可变主体**:`federated-sso.service.ts` / `auth.controller.ts` / `prisma` schema 一行不改。

## 5. 边界与不属于本规格(Out of scope)

- Cloud 独占:`teableio/teable-ee` 任何源代码 — 不复制。
- 前端 UI(`apps/nextjs-app`) — 不改。
- IdP-initiated SSO — 留待后续 stage。
- SAML SLO — 留待后续 stage。
- SAML metadata XML 端点 — 留待后续 stage。
- API 速率限制按档位(Stage 12 覆盖) — 本 child 不重复节流。
