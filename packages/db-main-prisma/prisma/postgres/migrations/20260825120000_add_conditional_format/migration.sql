-- Stage 18 — conditional formatting rules per view.
--
-- Each rule applies to either a single field on the view (when
-- field_id is set) or to the whole row (when field_id is null). The
-- `style` payload is JSON so we can extend the rendering options
-- without further migrations; the `value` payload is whatever the
-- operator compares against (also JSON for parity).
--
-- `priority` is the application order — lower number applies first so
-- later (higher-priority) rules override earlier ones. We store rules
-- ordered by priority DESC for display purposes (most important first).
--
-- The table is intentionally not FK-linked to `view` to avoid the
-- migration ordering trap. We rely on application-side enforcement.

CREATE TABLE IF NOT EXISTS "conditional_format_rule" (
  "id"                TEXT PRIMARY KEY,
  "view_id"           TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "field_id"          TEXT,
  "operator"          TEXT NOT NULL,
  "value"             JSONB,
  "style"             JSONB NOT NULL,
  "priority"          INTEGER NOT NULL DEFAULT 100,
  "enabled"           BOOLEAN NOT NULL DEFAULT true,
  "created_time"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_modified_time" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "conditional_format_rule_operator_chk"
    CHECK ("operator" IN ('eq','neq','gt','lt','contains','empty','not_empty','in'))
);

CREATE INDEX IF NOT EXISTS "conditional_format_rule_view_idx"
  ON "conditional_format_rule" ("view_id", "priority" DESC);

CREATE INDEX IF NOT EXISTS "conditional_format_rule_field_idx"
  ON "conditional_format_rule" ("view_id", "field_id");