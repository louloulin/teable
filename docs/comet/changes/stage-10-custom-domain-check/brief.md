# Stage 10 — Custom Domain Check / Claim API (A5/A10/A11)

## Outcome

Expose a license-gated admin API in `apps/nestjs-backend` that lets a tenant
check whether a custom domain has been claimed+verified and lets an
authorized admin reserve the domain before the operator publishes DNS records.
This is the OSS-side counterpart of the cloud load-balancer / reverse-proxy
wiring that lives in the separate `teable-deployment` repo.

## Scope

- `GET  /api/admin/custom-domain/check?domain=foo.com`
  → `{ cnameTarget: string, verified: boolean }`
  - `cnameTarget` always reflects the configured LB DNS name so the operator
    knows which CNAME to publish.
  - `verified` is `true` only when an `OrganizationDomain` row exists for
    `domain` AND its `status` is `verified`.
- `POST /api/admin/custom-domain/claim`
  body `{ domain: string, organizationId: string }` → creates an
  `OrganizationDomain` row whose CNAME target is the value of
  `TEABLE_LB_DNS_NAME` (default `lb.teable.cloud`), with status `pending`
  and a fresh verification token.
- Both routes gated by `@LicenseCapabilityGuard.for('custom_domain')`,
  which throws 402 `LICENSE_REQUIRED` when the current license plan does
  not include the capability.
- New `custom_domain` capability string added to `LicenseCapabilityService`,
  enabled for `business` / `enterprise` plans (mirroring the existing
  `custom_app_domain` posture).
- The new `CustomDomainModule` is wired into `app.module.ts` next to
  `DomainVerificationModule`.

## Non-goals

- Reverse-proxy / load-balancer provisioning lives in the
  `teable-deployment` repo and is out of scope for this change. We only
  publish the LB DNS name as `cnameTarget`; we never mutate cloud
  resources.
- DNS verification (TXT lookup, status flipping) is already implemented by
  `DomainVerificationService` and is reused only via the model — not
  reimplemented here.
- UI / frontend work is downstream.

## Acceptance examples

- **A5** `GET /api/admin/custom-domain/check?domain=foo.com` returns
  `{ cnameTarget: "<lb dns>", verified: false }` for a never-claimed
  domain, and `{ cnameTarget: "<lb dns>", verified: true }` after a
  verified `OrganizationDomain` row exists.
- **A10** Prisma migrations apply with zero failures and the new code
  references the existing `OrganizationDomain` model without schema
  changes.
- **A11** `pnpm --filter @teable/nestjs-backend test` runs the new unit
  tests (≥ 4 cases) with zero failures, covering: no-row check returns
  `verified=false`, claim creates a row, duplicate claim rejects,
  capability guard rejects when `custom_domain` is not enabled.

## Constraints and invariants

- AGPL-3.0: this is the OSS repo; no proprietary-only branches.
- Zero hot-path rewrites: no changes to `auth.service.ts`,
  `record-open-api.service.ts`, `ai.service.ts`.
- Zero new npm dependencies: the service reuses Prisma and the existing
  `HttpErrorCode` / `CustomHttpException` surface.
- The new module only writes to `OrganizationDomain`; no schema changes.
- `cnameTarget` always reflects the resolved env value (no caching layer
  that could drift).

## Decisions

- Reuse `OrganizationDomain` as the source of truth instead of creating
  a parallel table. Verification status is already tracked there.
- The `check` endpoint never throws on a missing row — it returns
  `verified: false` so the operator can poll.
- `claim` rejects duplicate domains owned by a *different* org with a
  `CONFLICT` error; re-claiming the same domain for the same org
  upserts and rotates the verification token (matches the existing
  `DomainVerificationService.claim` semantics).

## Open questions

- None blocking. Cloud-side UI flow is owned by the consumer team and
  will be specified there.

## Verification expectations

- Unit tests cover the four decision points listed under A11.
- Manual smoke: `GET /api/admin/custom-domain/check?domain=acme.com`
  under the OSS plan returns 402 (capability not enabled); flipping
  `TEABLE_LICENSE_KEY=plan:business` and reissuing the request returns
  the CNAME target.
- Build: `pnpm --filter @teable/nestjs-backend build` succeeds; no new
  TypeScript errors introduced.