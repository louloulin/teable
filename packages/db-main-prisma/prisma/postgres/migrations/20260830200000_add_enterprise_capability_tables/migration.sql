-- Durable storage for self-hosted enterprise capability modules.
-- All statements are idempotent so this migration is safe on an existing
-- self-hosted database that may already contain part of the feature set.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
CREATE INDEX IF NOT EXISTS "users_organization_id_idx" ON "users" ("organization_id");
ALTER TABLE "permission_role" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
CREATE INDEX IF NOT EXISTS "permission_role_organization_id_idx" ON "permission_role" ("organization_id");

CREATE TABLE IF NOT EXISTS "approval_workflow" (
  "id" TEXT PRIMARY KEY,
  "base_id" TEXT NOT NULL,
  "table_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "strategy" TEXT NOT NULL,
  "approver_ids_json" TEXT NOT NULL,
  "threshold" INTEGER,
  "expires_in_hours" INTEGER,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "base_id" TEXT;
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "recipient_user_id" TEXT;
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "link" TEXT;
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "source_id" TEXT;
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "notification_center_recipient_idx" ON "notification" ("recipient_user_id", "read_at", "created_time");
CREATE INDEX IF NOT EXISTS "approval_workflow_base_table_idx" ON "approval_workflow" ("base_id", "table_id");

CREATE TABLE IF NOT EXISTS "approval_request" (
  "id" TEXT PRIMARY KEY,
  "base_id" TEXT NOT NULL,
  "table_id" TEXT NOT NULL,
  "record_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "requester_user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "payload_json" TEXT NOT NULL,
  "approver_ids_json" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3),
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "approval_request_record_idx" ON "approval_request" ("record_id");
CREATE INDEX IF NOT EXISTS "approval_request_workflow_idx" ON "approval_request" ("workflow_id");

CREATE TABLE IF NOT EXISTS "approval_decision" (
  "id" TEXT PRIMARY KEY,
  "request_id" TEXT NOT NULL,
  "approver_user_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "comment" TEXT,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "approval_decision_request_idx" ON "approval_decision" ("request_id");

CREATE TABLE IF NOT EXISTS "field_experiment" (
  "id" TEXT PRIMARY KEY,
  "base_id" TEXT NOT NULL,
  "table_id" TEXT NOT NULL,
  "field_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "variants" JSONB NOT NULL,
  "salt" TEXT NOT NULL,
  "started_at" TIMESTAMP(3),
  "ended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "field_experiment_lookup_idx" ON "field_experiment" ("base_id", "table_id", "field_id", "status");

CREATE TABLE IF NOT EXISTS "field_experiment_assignment" (
  "experiment_id" TEXT NOT NULL,
  "record_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "bucket" DOUBLE PRECISION NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("experiment_id", "record_id")
);

CREATE TABLE IF NOT EXISTS "field_experiment_exposure" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "experiment_id" TEXT NOT NULL,
  "assignment_id" TEXT NOT NULL,
  "record_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "outcome" TEXT,
  "value" DOUBLE PRECISION,
  "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "field_experiment_exposure_experiment_idx" ON "field_experiment_exposure" ("experiment_id");

CREATE TABLE IF NOT EXISTS "byok_llm_key" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "ciphertext_ref" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "verified_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "provider_tpm_cap" INTEGER NOT NULL DEFAULT 0,
  "org_daily_cap" INTEGER NOT NULL DEFAULT 0,
  "isolation" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "byok_llm_key_org_idx" ON "byok_llm_key" ("org_id");

CREATE TABLE IF NOT EXISTS "byok_llm_usage" (
  "org_id" TEXT NOT NULL,
  "key_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "tokens" BIGINT NOT NULL DEFAULT 0,
  "cost_cents" BIGINT NOT NULL DEFAULT 0,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "errors" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("org_id", "key_id", "day")
);

CREATE TABLE IF NOT EXISTS "byok_llm_attempt" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" TEXT NOT NULL,
  "key_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "tokens" BIGINT NOT NULL,
  "cost_cents" BIGINT NOT NULL,
  "succeeded" BOOLEAN NOT NULL,
  "at_iso" TIMESTAMP(3) NOT NULL,
  "hash" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "byok_llm_attempt_lookup_idx" ON "byok_llm_attempt" ("org_id", "key_id", "at_iso");

CREATE TABLE IF NOT EXISTS "scim_push_subscription" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "signing_secret" TEXT NOT NULL,
  "filter" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "scim_push_subscription_org_idx" ON "scim_push_subscription" ("org_id");

CREATE TABLE IF NOT EXISTS "scim_push_event" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "external_id" TEXT,
  "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "scim_push_event_org_time_idx" ON "scim_push_event" ("org_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "scim_push_delivery" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMP(3),
  "last_status_code" INTEGER,
  "last_error" TEXT,
  "next_retry_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "scim_push_delivery_event_idx" ON "scim_push_delivery" ("event_id");
CREATE INDEX IF NOT EXISTS "scim_push_delivery_subscription_idx" ON "scim_push_delivery" ("subscription_id");

CREATE TABLE IF NOT EXISTS "webhook_bridge" (
  "id" TEXT PRIMARY KEY,
  "base_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "auth" JSONB NOT NULL,
  "target" TEXT NOT NULL,
  "event_types" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "webhook_bridge_base_idx" ON "webhook_bridge" ("base_id");

CREATE TABLE IF NOT EXISTS "sso_provider" (
  "id" TEXT PRIMARY KEY,
  "base_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "protocol" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "auto_link" BOOLEAN NOT NULL DEFAULT false,
  "email_domains" JSONB NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "config" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "sso_provider_base_enabled_idx" ON "sso_provider" ("base_id", "enabled");

CREATE TABLE IF NOT EXISTS "encryption_key" (
  "id" TEXT PRIMARY KEY,
  "kid" TEXT NOT NULL UNIQUE,
  "algorithm" TEXT NOT NULL,
  "alias" TEXT,
  "state" TEXT NOT NULL,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retired_at" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "masking_policy" (
  "id" TEXT PRIMARY KEY,
  "base_id" TEXT NOT NULL,
  "table_id" TEXT NOT NULL,
  "field_id" TEXT NOT NULL,
  "strategy" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "allowed_roles_json" TEXT NOT NULL,
  "partial_json" TEXT,
  "regex_rules_json" TEXT,
  "label" TEXT,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "masking_policy_lookup_idx" ON "masking_policy" ("base_id", "table_id", "field_id");

CREATE TABLE IF NOT EXISTS "masked_field_row" (
  "id" TEXT PRIMARY KEY,
  "base_id" TEXT NOT NULL,
  "table_id" TEXT NOT NULL,
  "record_id" TEXT NOT NULL,
  "field_id" TEXT NOT NULL,
  "policy_id" TEXT NOT NULL,
  "viewer_user_id" TEXT NOT NULL,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "masked_field_row_lookup_idx" ON "masked_field_row" ("base_id", "record_id", "created_time");

CREATE TABLE IF NOT EXISTS "db_connector" (
  "id" TEXT PRIMARY KEY,
  "base_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "encrypted_config_json" TEXT NOT NULL,
  "incremental_field" TEXT,
  "schedule" TEXT NOT NULL DEFAULT '',
  "target_table_id" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_sync_at" TIMESTAMP(3),
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "db_connector_base_idx" ON "db_connector" ("base_id");

CREATE TABLE IF NOT EXISTS "db_connector_sync" (
  "id" TEXT PRIMARY KEY,
  "connector_id" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "rows_fetched" INTEGER NOT NULL DEFAULT 0,
  "rows_written" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3),
  "error_message" TEXT,
  "triggered_by" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "db_connector_sync_lookup_idx" ON "db_connector_sync" ("connector_id", "started_at");

CREATE TABLE IF NOT EXISTS "notification_delivery" (
  "id" TEXT PRIMARY KEY,
  "notification_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "sent_at" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "notification_delivery_notification_idx" ON "notification_delivery" ("notification_id");

CREATE TABLE IF NOT EXISTS "notification_preference" (
  "user_id" TEXT PRIMARY KEY,
  "channels_json" TEXT NOT NULL,
  "quiet_hours_start" INTEGER,
  "quiet_hours_end" INTEGER
);

CREATE TABLE IF NOT EXISTS "presence_session" (
  "id" TEXT PRIMARY KEY,
  "base_id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "scope_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "cursor_json" TEXT,
  "last_heartbeat_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "connected_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "presence_session_scope_idx" ON "presence_session" ("base_id", "scope", "scope_id");
CREATE INDEX IF NOT EXISTS "presence_session_expiry_idx" ON "presence_session" ("expires_at");

CREATE TABLE IF NOT EXISTS "org_quota_envelope" (
  "org_id" TEXT PRIMARY KEY,
  "caps" JSONB NOT NULL,
  "policy" TEXT NOT NULL,
  "soft_fraction" DOUBLE PRECISION NOT NULL,
  "window_seconds" INTEGER,
  "notes" TEXT
);

CREATE TABLE IF NOT EXISTS "org_quota_fairness" (
  "org_id" TEXT PRIMARY KEY,
  "deficits" JSONB NOT NULL,
  "last_grant_by_base" JSONB NOT NULL,
  "total_grants" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "org_quota_overage" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" TEXT NOT NULL,
  "base_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "attempted_at" TIMESTAMP(3) NOT NULL,
  "requested_units" BIGINT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "org_quota_overage_lookup_idx" ON "org_quota_overage" ("org_id", "attempted_at");

CREATE TABLE IF NOT EXISTS "billing_line_item" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "base_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "incurred_at" TIMESTAMP(3) NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit_price_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "description" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "billing_line_item_lookup_idx" ON "billing_line_item" ("org_id", "incurred_at");

CREATE TABLE IF NOT EXISTS "billing_credit" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "applied_at" TIMESTAMP(3) NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "billing_credit_lookup_idx" ON "billing_credit" ("org_id", "applied_at");

CREATE TABLE IF NOT EXISTS "billing_rollup" (
  "org_id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "gross_minor" INTEGER NOT NULL,
  "credits_minor" INTEGER NOT NULL,
  "net_minor" INTEGER NOT NULL,
  "line_count" INTEGER NOT NULL,
  "base_count" INTEGER NOT NULL,
  "dunning_level" TEXT NOT NULL,
  "by_kind" JSONB NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("org_id", "period", "currency")
);

CREATE TABLE IF NOT EXISTS "region_write_lease" (
  "resource_key" TEXT PRIMARY KEY,
  "region_id" TEXT NOT NULL,
  "holder_id" TEXT NOT NULL,
  "acquired_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "generation" INTEGER NOT NULL,
  "state" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "region_write_lease_region_idx" ON "region_write_lease" ("region_id");

CREATE TABLE IF NOT EXISTS "region_conflict" (
  "id" TEXT PRIMARY KEY,
  "resource_key" TEXT NOT NULL,
  "winner_region" TEXT NOT NULL,
  "loser_region" TEXT NOT NULL,
  "winner_version" INTEGER NOT NULL,
  "loser_version" INTEGER NOT NULL,
  "resolution" TEXT NOT NULL,
  "detected_at" TIMESTAMP(3) NOT NULL,
  "replayed_at" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "region_conflict_lookup_idx" ON "region_conflict" ("resource_key", "detected_at");

CREATE TABLE IF NOT EXISTS "region_replay_queue" (
  "id" TEXT PRIMARY KEY,
  "conflict_id" TEXT NOT NULL,
  "region_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "enqueued_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "region_replay_queue_lookup_idx" ON "region_replay_queue" ("region_id", "next_attempt_at");

CREATE TABLE IF NOT EXISTS "widget_instance" (
  "id" TEXT PRIMARY KEY,
  "dashboard_id" TEXT NOT NULL,
  "definition" TEXT NOT NULL,
  "binding" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "options" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "widget_instance_dashboard_idx" ON "widget_instance" ("dashboard_id", "created_at");

CREATE TABLE IF NOT EXISTS "map_view_config" (
  "table_id" TEXT PRIMARY KEY,
  "config" TEXT NOT NULL
);
