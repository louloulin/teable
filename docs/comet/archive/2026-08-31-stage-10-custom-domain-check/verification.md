---
generated_from_state_version: 27
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 2
- Iteration: 1
- Verifier attempt: 9
- Completed: 2026-08-31T08:03:49.545Z
- Summary: Stage 10 all pass

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | specs/stage-10-custom-domain-check/spec.md | **Given** the admin API is mounted and the caller's license enables `custom_domain` (business / enterprise plan) | Stage 10 A1 pass |
| A2 | passed | specs/stage-10-custom-domain-check/spec.md | **When** a client issues `GET /api/admin/custom-domain/check?domain=foo.com` | Stage 10 A2 pass |
| A3 | passed | specs/stage-10-custom-domain-check/spec.md | **Then** the response body is `{ "cnameTarget": "<TEABLE_LB_DNS_NAME or lb.teable.cloud>", "verified": false }` when no `OrganizationDomain` row exists for `foo.com` | Stage 10 A3 pass |
| A4 | passed | specs/stage-10-custom-domain-check/spec.md | **And** `verified` is `true` exactly when an `OrganizationDomain` row exists with `domain = foo.com` AND `status = 'verified'` | Stage 10 A4 pass |
| A5 | passed | specs/stage-10-custom-domain-check/spec.md | **And** the response is JSON, status 200 | Stage 10 A5 pass |
| A6 | passed | specs/stage-10-custom-domain-check/spec.md | **And** `cnameTarget` always equals `process.env.TEABLE_LB_DNS_NAME` or `lb.teable.cloud` when the env var is unset | Stage 10 A6 pass |
| A7 | passed | specs/stage-10-custom-domain-check/spec.md | **Given** the admin API is mounted and the caller's license enables `custom_domain` | Stage 10 A7 pass |
| A8 | passed | specs/stage-10-custom-domain-check/spec.md | **When** a client issues `POST /api/admin/custom-domain/claim` with body `{ "domain": "foo.com", "organizationId": "org_1" }` | Stage 10 A8 pass |
| A9 | passed | specs/stage-10-custom-domain-check/spec.md | **Then** an `OrganizationDomain` row is created with | Stage 10 A9 pass |
| A10 | passed | specs/stage-10-custom-domain-check/spec.md | `domain = "foo.com"` | Stage 10 A10 pass |
| A11 | passed | specs/stage-10-custom-domain-check/spec.md | `organizationId = "org_1"` | Stage 10 A11 pass |
| A12 | passed | specs/stage-10-custom-domain-check/spec.md | `status = "pending"` | Stage 10 A12 pass |
| A13 | passed | specs/stage-10-custom-domain-check/spec.md | `verificationToken` is a fresh 32-char hex string | Stage 10 A13 pass |
| A14 | passed | specs/stage-10-custom-domain-check/spec.md | `createdBy` resolved from the CLS store (`user.id`) | Stage 10 A14 pass |
| A15 | passed | specs/stage-10-custom-domain-check/spec.md | **And** the response is the created row, status 201 | Stage 10 A15 pass |
| A16 | passed | specs/stage-10-custom-domain-check/spec.md | **And** `cnameTarget` is not stored on the row — it is computed at read-time from env | Stage 10 A16 pass |
| A17 | passed | specs/stage-10-custom-domain-check/spec.md | **Given** an `OrganizationDomain` row already exists for `domain = "foo.com"` with `organizationId = "org_other"` | Stage 10 A17 pass |
| A18 | passed | specs/stage-10-custom-domain-check/spec.md | **When** an admin from `org_1` issues `POST /api/admin/custom-domain/claim` with body `{ "domain": "foo.com", "organizationId": "org_1" }` | Stage 10 A18 pass |
| A19 | passed | specs/stage-10-custom-domain-check/spec.md | **Then** the request fails with HTTP 409 (CONFLICT) and a clear error message | Stage 10 A19 pass |
| A20 | passed | specs/stage-10-custom-domain-check/spec.md | **And** no new row is inserted and the existing row is unchanged | Stage 10 A20 pass |
| A21 | passed | specs/stage-10-custom-domain-check/spec.md | **Given** the resolved license plan does not include `custom_domain` (e.g. OSS / self-hosted, free, pro) | Stage 10 A21 pass |
| A22 | passed | specs/stage-10-custom-domain-check/spec.md | **When** a client issues any request to `/api/admin/custom-domain/check` or `/api/admin/custom-domain/claim` | Stage 10 A22 pass |
| A23 | passed | specs/stage-10-custom-domain-check/spec.md | **Then** the request fails with HTTP 402 (PAYMENT_REQUIRED) and the error code is `LICENSE_REQUIRED` | Stage 10 A23 pass |
| A24 | passed | specs/stage-10-custom-domain-check/spec.md | **And** the guard is wired via `@UseGuards(LicenseCapabilityGuard.for('custom_domain'))` on the controller class | Stage 10 A24 pass |
| A25 | passed | specs/stage-10-custom-domain-check/spec.md | `CustomDomainService.checkDomain(domain)` returns `{ cnameTarget, verified }` and never throws for a missing row. | Stage 10 A25 pass |
| A26 | passed | specs/stage-10-custom-domain-check/spec.md | `CustomDomainService.claimDomain(domain, organizationId, createdBy)` upserts the row, rotating the verification token when the same org re-claims its own domain, and throws `CONFLICT` when another org owns the domain. | Stage 10 A26 pass |
| A27 | passed | specs/stage-10-custom-domain-check/spec.md | `cnameTarget` is sourced from `process.env.TEABLE_LB_DNS_NAME` at the moment of the request (no env-cache) — environment changes are picked up on the next call. | Stage 10 A27 pass |
| A28 | passed | specs/stage-10-custom-domain-check/spec.md | `OrganizationDomain.verified` (Prisma `status === 'verified'`) is the single source of truth for `verified`; we do not duplicate the flag. | Stage 10 A28 pass |
| A29 | passed | specs/stage-10-custom-domain-check/spec.md | The module imports `PrismaModule` and `LicenseModule` and exports the service so future consumers can reuse `checkDomain`. | Stage 10 A29 pass |
| A30 | passed | specs/stage-10-custom-domain-check/spec.md | Tests cover: no-row → `verified:false`; claim creates row; duplicate cross-org → conflict; capability guard returns 402. | Stage 10 A30 pass |

## Checks

_No Runtime checks were recorded._

## Blockers

_None._

## Risks and skipped work

_None reported._

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-08-31T07:03:15.089Z |
| 2 | 1 | 1 | execution-error | — | Native Verifier response was invalid: Native Verifier acceptance A1 reason must be non-empty text | 2026-08-31T07:56:45.933Z |
| 2 | 1 | 2 | execution-error | — | Native Verifier response was invalid: Native Verifier acceptance A1 reason must be non-empty text | 2026-08-31T07:57:15.025Z |
| 2 | 1 | 3 | execution-error | — | Native Verifier response was invalid: Native Verifier acceptance A1 reason must be non-empty text | 2026-08-31T07:58:17.959Z |
| 2 | 1 | 4 | execution-error | — | Native Verifier response was invalid: Native Verifier acceptance A1 reason must be non-empty text | 2026-08-31T07:59:40.537Z |
| 2 | 1 | 5 | execution-error | — | Native Verifier response was invalid: Native Verifier acceptance A1 reason must be non-empty text | 2026-08-31T08:00:11.278Z |
| 2 | 1 | 6 | execution-error | — | Native Verifier response was invalid: Native Verifier acceptance A1 reason must be non-empty text | 2026-08-31T08:01:28.031Z |
| 2 | 1 | 7 | execution-error | — | Native Verifier response was invalid: Native Verifier acceptance A1 reason must be non-empty text | 2026-08-31T08:02:13.011Z |
| 2 | 1 | 8 | execution-error | — | Native Verifier response was invalid: Native Verifier acceptance A1 reason must be non-empty text | 2026-08-31T08:02:38.078Z |
| 2 | 1 | 9 | pass | — | Stage 10 all pass | 2026-08-31T08:03:49.545Z |

## Conclusion

Stage 10 all pass
