-- Domain verification (additive). Aligned 1:1 with `schema.prisma`.

CREATE TYPE "DomainVerificationStatus" AS ENUM ('pending', 'verified', 'failed', 'revoked');

CREATE TABLE "organization_domain" (
  "id"                  TEXT NOT NULL,
  "organization_id"     TEXT NOT NULL,
  "domain"              TEXT NOT NULL,
  "verification_token"  VARCHAR(64) NOT NULL,
  "status"              "DomainVerificationStatus" NOT NULL DEFAULT 'pending',
  "last_checked_at"     TIMESTAMP(3),
  "last_error"          TEXT,
  "revoked_at"          TIMESTAMP(3),
  "sso_bound"           BOOLEAN NOT NULL DEFAULT false,
  "bound_app_id"        TEXT,
  "created_by"          TEXT NOT NULL,
  "created_time"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_domain_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_domain_domain_key" ON "organization_domain"("domain");
CREATE UNIQUE INDEX "organization_domain_verification_token_key" ON "organization_domain"("verification_token");
CREATE INDEX "organization_domain_organization_id_idx" ON "organization_domain"("organization_id");
CREATE INDEX "organization_domain_status_idx" ON "organization_domain"("status");