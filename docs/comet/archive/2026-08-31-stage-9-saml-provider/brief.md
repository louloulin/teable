# Stage 9 — SAML Provider

## Outcome

在 OSS 仓库中真实实现 SAML 2.0 provider 端点(SP-initiated AuthnRequest + ACS callback + 签名校验),复用既有 `SsoLoginState` BullMQ 清理路径(Stage 4.2),与 Stage 4 OIDC 走同一 `federated-sso` 模块的同一 `/api/auth/sso/login` 与 `/api/auth/sso/callback` 入口。这是 Supervisor `teable-oss-vs-cloud-gap-fill` 的 Stage 9 child change,覆盖 A1 / A10 / A11(全与 Stage 4.1 共享)。

## Scope

### Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Supervisor brief | `docs/comet/changes/teable-oss-vs-cloud-gap-fill/brief.md` | `complete` | A1/A10/A11 验收项 |
| Supervisor spec | `docs/comet/changes/teable-oss-vs-cloud-gap-fill/specs/teable-oss-vs-cloud-gap-fill/spec.md` §3.2 | `complete` | SSO callback 链路 |
| 既有 federated-sso | `apps/nestjs-backend/src/features/federated-sso/` | `complete` | `samlLoginUrl` / `validateSamlConfig` / `protocol: 'saml'` 已存在 |
| 既有 SSO controller | `apps/nestjs-backend/src/features/auth/auth.controller.ts` | `complete` | `/api/auth/sso/login` 与 `/api/auth/sso/callback` 复用入口 |

## 本 change 交付

1. `apps/nestjs-backend/src/features/federated-sso/saml-auth.service.ts`(新)— SAML AuthnRequest 构造 + ACS POST 验签 + 用户查找与登录
2. `apps/nestjs-backend/src/features/federated-sso/saml-auth.service.spec.ts`(新,≥3 用例)
3. `docs/comet/changes/stage-9-saml-provider/specs/stage-9-saml-provider/spec.md`(新)
4. `docs/comet/changes/stage-9-saml-provider/brief.md`(本文件)

# Non-goals

- 不复制 `teableio/teable-ee` 任何源代码。
- 不引入新 npm 依赖(优先 Node 内置 `crypto.verify` + `zlib`)。
- 不实现 IdP-initiated SSO。
- 不实现 SAML 单点登出(SLO)。
- 不实现 SAML metadata 端点(留待后续 stage)。

# Acceptance examples

- **A1** SSO callback 完整会话链路:`buildAuthnRequestUrl` → `handleCallback` 验签 → 返回 `userId`。
- **A10** Prisma migration 全部成功:本 child 不引入新表,`pnpm prisma migrate deploy` 与 `pnpm --filter @teable/db-main-prisma prisma generate` 均 0 失败。
- **A11** 单测全绿:`saml-auth.service.spec.ts` ≥3 用例,`pnpm --filter @teable/backend test-unit -- saml-auth.service.spec.ts` 0 失败。

# Constraints and invariants

- AGPL-3.0 合规:所有新源代码在本仓库内。
- 零现有热路径改动:`federated-sso.service.ts` / `auth.controller.ts` 主体一行不改。
- 零 npm 依赖:Node 内置 `crypto` + `zlib`。
