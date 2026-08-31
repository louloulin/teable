-- Durable storage for the self-hosted IP allowlist (Stage 25).
--
-- The `OrganizationIpAllowlist` model is declared in `schema.prisma`, but
-- no prior migration created the underlying table. Without this fix the
-- `IpAllowlistAuthService` would throw at runtime on the first
-- `organizationIpAllowlist.create(...)` call, and
-- `/api/admin/enterprise-readiness` would permanently report
-- `ip_allowlist` as `disabled` with reason `no_rules_configured` even on
-- instances with rules configured.
--
-- The statement is idempotent so this migration is safe to re-run on
-- databases that already contain the table (e.g. environments where the
-- table was created manually as a hotfix).

CREATE TABLE IF NOT EXISTS "organization_ip_allowlist" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "cidr" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'block',
  "note" TEXT,
  "created_by" TEXT NOT NULL,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "organization_ip_allowlist_organization_id_idx"
  ON "organization_ip_allowlist" ("organization_id");
