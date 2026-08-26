# G2-005 Capability Matrix

**Source of truth**: `apps/nestjs-backend/src/features/license/license-capability.service.ts` (`PLAN_CAPABILITIES` + `ALL_CAPABILITIES`, 2026-08-26)
**Plan limits source**: `apps/nestjs-backend/src/features/license/quota/quota.constants.ts` (`PLAN_LIMITS`, 2026-08-26)
**Change**: `comet/g2-005-business-enterprise-e2e-smoke` (target `agent/chong/df9d120d2105-stage6-audit-log`)
**Generated**: 2026-08-26 — G2-005 Build deliverable (brief scope item #9, "可观察" constraint)

This file is the **readable acceptance index** for G2-005. It mirrors the
runtime tables verbatim. Any drift between this document and the source code
must be reconciled in the source — do not patch this doc to "match reality"
without also patching `license-capability.service.ts` / `quota.constants.ts`.

---

## Capability × plan matrix

| Capability               | free | pro | business | enterprise | self_hosted (OSS)            |
| ------------------------ | :--: | :-: | :------: | :--------: | :--------------------------- |
| `ai_chat`                |  ✓   |  ✓  |    ✓     |     ✓      | (guard 放行,isEnabled=false) |
| `ai_field`               |      |  ✓  |    ✓     |     ✓      |                               |
| `ai_app_builder`         |      |  ✓  |    ✓     |     ✓      |                               |
| `cuppy_claw`             |      |  ✓  |    ✓     |     ✓      |                               |
| `audit_log`              |      |  ✓  |    ✓     |     ✓      |                               |
| `sso`                    |      |     |    ✓     |     ✓      |                               |
| `permission_matrix`      |      |     |    ✓     |     ✓      |                               |
| `custom_app_domain`      |      |     |    ✓     |     ✓      |                               |
| `custom_domain`          |      |     |    ✓     |     ✓      |                               |
| `admin_panel`            |      |     |    ✓     |     ✓      |                               |
| `users_read`             |      |     |    ✓     |     ✓      |                               |
| `spaces_read`            |      |     |    ✓     |     ✓      |                               |
| `templates_read`         |      |     |    ✓     |     ✓      |                               |
| `ai`                     |      |     |    ✓     |     ✓      |                               |
| `quota_view`             |      |     |    ✓     |     ✓      |                               |
| `automation`             |      |     |    ✓     |     ✓      |                               |
| `webhook`                |      |     |    ✓     |     ✓      |                               |
| `audit_log_query`        |      |     |    ✓     |     ✓      |                               |

**Key invariants**

- `LicenseCapabilityGuard.canActivate()` returns `true` for `self_hosted` even when `isEnabled(cap) === false` (OSS zero-impact: guard does NOT throw on default install).
- `free` / `pro` guard on business-only capability throws `HttpErrorCode.LICENSE_REQUIRED` (HTTP 402).
- `enterprise` has the same capability set as `business` (no enterprise-only caps today — by design, per brief non-goal).
- `self_hosted` ≠ `free`: `free` throws 402 on business caps, `self_hosted` does not.

---

## Plan limits matrix

`PLAN_LIMITS` from `quota.constants.ts` (canonical values; if these move, update both source and this doc in the same change).

| Plan         | rowLimit   | attachmentByteLimit | automationRunLimit | aiCreditLimit | apiRequestLimitPerSec |
| ------------ | ---------: | ------------------: | -----------------: | ------------: | --------------------: |
| `free`       |    `1_000` |              `1 GB` |              `100` |        `200` |                  `10` |
| `pro`        |  `250_000` |             `10 GB` |           `25_000` |      `1_000` |                  `50` |
| `business`   |`1_000_000` |            `100 GB` |          `100_000` |      `2_000` |                 `100` |
| `enterprise` |     `null` |               null |               null |         null |                  null |
| `self_hosted`|     `null` |               null |               null |         null |                  null |

`null` ⇒ unlimited (`isUnlimited()` returns `true`).

---

## Acceptance cross-reference

| Brief ID  | Capability / behavior                                                         | Source line(s)                          |
| --------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| A1        | business snapshot: sso/permission_matrix/admin_panel/automation/webhook/audit_log_query all `true` | `license-capability.service.ts:53-72`    |
| A2        | enterprise snapshot: all 18 caps `true`                                       | `license-capability.service.ts:73-92`    |
| A3        | pro snapshot: business-only caps all `false` (strict no-leak)                 | `license-capability.service.ts:46-52`    |
| A4        | free snapshot: only `ai_chat=true`                                             | `license-capability.service.ts:45`       |
| A5        | guard(`sso`): throws 402 on free/pro, passes business/enterprise/self_hosted | `license-capability.guard.ts:32-39`      |
| A6        | guard(`automation`): passes business, throws 402 on pro                       | `license-capability.guard.ts:35-38`      |
| A7        | `resolve('plan:business:seats=42')` returns PLAN_LIMITS.business + seat override | `license.service.ts` + `quota.constants.ts:49-53` |
| A8        | `resolve('plan:enterprise')` returns all-null effectiveLimits + `isUnlimited` true | `quota.constants.ts:60-64`                |
| A9        | self_hosted: snapshot all false, guard passes (OSS zero-impact)               | `license-capability.guard.ts:32-34`      |
| A10/A13   | ≥35 `it()` in `e2e-business-enterprise-smoke.spec.ts`, 39 today               | `__tests__/e2e-business-enterprise-smoke.spec.ts` |
| A11       | diff against target branch is source + spec + docs only (no handler LOGIC)    | git diff `agent/chong/df9d120d2105-stage6-audit-log --name-only` |
| A12       | 0 new npm deps (no package.json / pnpm-workspace.yaml change)                 | git diff `**/package.json` `pnpm-workspace.yaml` |

---

## Notes for G2-010 regression

When G2-010 ships the global regression wave, treat this file as the
authoritative expected-truth for these 5 plans. Re-run the smoke (`vitest run
src/features/license/__tests__/e2e-business-enterprise-smoke.spec.ts`) — it
must stay 39/39 green. Any future change that touches the PLAN_CAPABILITIES
table or the LicenseCapabilityGuard must re-validate every cell of this
matrix.