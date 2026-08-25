-- Stage 17 — view-level permission
-- Adds a fine-grained access control list on top of views: a user or role
-- can be granted read / write / owner permission, or explicitly denied
-- access. The owner of the table (creator of the view) always has owner
-- permission and is not stored explicitly.
--
-- Schema notes:
--   * subject_id stores either a user_id or a role_id; subject_kind
--     disambiguates. We intentionally do not model user-vs-role
--     differently here so a single ACL row covers both kinds.
--   * permission is stored as text rather than enum so we can grow the
--     set ('read' / 'write' / 'owner' / 'denied') without migrations.
--   * On view deletion, all permission rows are cascade-deleted; this
--     keeps the ACL table small and avoids dangling references.

CREATE TABLE IF NOT EXISTS "view_permission" (
  "id"                TEXT PRIMARY KEY,
  "view_id"           TEXT NOT NULL,
  "subject_kind"      TEXT NOT NULL,
  "subject_id"        TEXT NOT NULL,
  "permission"        TEXT NOT NULL,
  "created_time"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_modified_time" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "view_permission_subject_kind_chk"
    CHECK ("subject_kind" IN ('user', 'role')),
  CONSTRAINT "view_permission_permission_chk"
    CHECK ("permission" IN ('read', 'write', 'owner', 'denied'))
);

CREATE INDEX IF NOT EXISTS "view_permission_view_id_idx"
  ON "view_permission" ("view_id");

CREATE INDEX IF NOT EXISTS "view_permission_subject_idx"
  ON "view_permission" ("subject_kind", "subject_id");

CREATE UNIQUE INDEX IF NOT EXISTS "view_permission_unique_idx"
  ON "view_permission" ("view_id", "subject_kind", "subject_id");