-- Stage 20 — backup / restore API
--
-- A backup is a point-in-time snapshot of a single base. We persist a
-- manifest row pointing at an on-disk archive (default: TEABLE_BACKUP_DIR
-- or /tmp/teable-backups) plus the size + a status enum. The actual
-- record payloads live in the archive file; we keep a JSON manifest
-- here for listing + restore coordination.
--
-- Restore is run as a queued job; each attempt is tracked in
-- backup_restore_log so we can show progress and surface failures.

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BackupStatus') THEN
    CREATE TYPE "BackupStatus" AS ENUM ('pending', 'complete', 'failed');
  END IF;
END
$do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RestoreStatus') THEN
    CREATE TYPE "RestoreStatus" AS ENUM ('queued', 'running', 'complete', 'failed');
  END IF;
END
$do$;

CREATE TABLE IF NOT EXISTS "backup_snapshot" (
  "id"                TEXT PRIMARY KEY,
  "base_id"           TEXT NOT NULL,
  "created_by"        TEXT NOT NULL,
  "status"            "BackupStatus" NOT NULL DEFAULT 'pending',
  "size_bytes"        BIGINT NOT NULL DEFAULT 0,
  "archive_path"      TEXT NOT NULL,
  "manifest"          JSONB,
  "error_message"     TEXT,
  "created_time"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_modified_time" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "backup_snapshot_base_idx"
  ON "backup_snapshot" ("base_id", "created_time" DESC);

CREATE INDEX IF NOT EXISTS "backup_snapshot_status_idx"
  ON "backup_snapshot" ("status");

CREATE TABLE IF NOT EXISTS "backup_restore_log" (
  "id"                TEXT PRIMARY KEY,
  "snapshot_id"       TEXT NOT NULL,
  "target_base_id"    TEXT NOT NULL,
  "status"            "RestoreStatus" NOT NULL DEFAULT 'queued',
  "started_time"      TIMESTAMPTZ,
  "finished_time"     TIMESTAMPTZ,
  "rows_restored"     INTEGER NOT NULL DEFAULT 0,
  "error_message"     TEXT,
  "created_time"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "backup_restore_log_snapshot_idx"
  ON "backup_restore_log" ("snapshot_id", "created_time" DESC);

CREATE INDEX IF NOT EXISTS "backup_restore_log_status_idx"
  ON "backup_restore_log" ("status");