# stage-10-custom-domain-check — spec

## AC-001 — GET /api/admin/custom-domain/check returns CNAME target

- **Given** the admin API is mounted and the caller's license enables
  `custom_domain` (business / enterprise plan)
- **When** a client issues `GET /api/admin/custom-domain/check?domain=foo.com`
- **Then** the response body is
  `{ "cnameTarget": "<TEABLE_LB_DNS_NAME or lb.teable.cloud>", "verified": false }`
  when no `OrganizationDomain` row exists for `foo.com`
- **And** `verified` is `true` exactly when an `OrganizationDomain` row
  exists with `domain = foo.com` AND `status = 'verified'`
- **And** the response is JSON, status 200
- **And** `cnameTarget` always equals `process.env.TEABLE_LB_DNS_NAME` or
  `lb.teable.cloud` when the env var is unset

## AC-002 — POST /api/admin/custom-domain/claim creates a row

- **Given** the admin API is mounted and the caller's license enables
  `custom_domain`
- **When** a client issues `POST /api/admin/custom-domain/claim` with body
  `{ "domain": "foo.com", "organizationId": "org_1" }`
- **Then** an `OrganizationDomain` row is created with
  - `domain = "foo.com"`
  - `organizationId = "org_1"`
  - `status = "pending"`
  - `verificationToken` is a fresh 32-char hex string
  - `createdBy` resolved from the CLS store (`user.id`)
- **And** the response is the created row, status 201
- **And** `cnameTarget` is not stored on the row — it is computed at
  read-time from env

## AC-003 — Claim rejects duplicate domain for a different org

- **Given** an `OrganizationDomain` row already exists for
  `domain = "foo.com"` with `organizationId = "org_other"`
- **When** an admin from `org_1` issues
  `POST /api/admin/custom-domain/claim` with body
  `{ "domain": "foo.com", "organizationId": "org_1" }`
- **Then** the request fails with HTTP 409 (CONFLICT) and a clear error
  message
- **And** no new row is inserted and the existing row is unchanged

## AC-004 — Capability guard rejects when `custom_domain` is not enabled

- **Given** the resolved license plan does not include `custom_domain`
  (e.g. OSS / self-hosted, free, pro)
- **When** a client issues any request to
  `/api/admin/custom-domain/check` or `/api/admin/custom-domain/claim`
- **Then** the request fails with HTTP 402 (PAYMENT_REQUIRED) and the
  error code is `LICENSE_REQUIRED`
- **And** the guard is wired via
  `@UseGuards(LicenseCapabilityGuard.for('custom_domain'))` on the
  controller class

## Implementation notes

- `CustomDomainService.checkDomain(domain)` returns
  `{ cnameTarget, verified }` and never throws for a missing row.
- `CustomDomainService.claimDomain(domain, organizationId, createdBy)`
  upserts the row, rotating the verification token when the same org
  re-claims its own domain, and throws `CONFLICT` when another org owns
  the domain.
- `cnameTarget` is sourced from `process.env.TEABLE_LB_DNS_NAME` at the
  moment of the request (no env-cache) — environment changes are picked
  up on the next call.
- `OrganizationDomain.verified` (Prisma `status === 'verified'`) is the
  single source of truth for `verified`; we do not duplicate the flag.
- The module imports `PrismaModule` and `LicenseModule` and exports the
  service so future consumers can reuse `checkDomain`.
- Tests cover: no-row → `verified:false`; claim creates row; duplicate
  cross-org → conflict; capability guard returns 402.