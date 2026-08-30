CREATE TABLE IF NOT EXISTS "announcement" (
    "id" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link_text" TEXT,
    "link_url" TEXT,
    "audience" TEXT NOT NULL,
    "target_ids" JSONB NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "withdrawn_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_modified_at" TIMESTAMP(3),
    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "announcement_starts_at_ends_at_withdrawn_at_idx"
  ON "announcement"("starts_at", "ends_at", "withdrawn_at");
CREATE INDEX IF NOT EXISTS "announcement_created_time_idx"
  ON "announcement"("created_time");

CREATE TABLE IF NOT EXISTS "announcement_dismissal" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dismissed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "announcement_dismissal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "announcement_dismissal_announcement_id_fkey"
      FOREIGN KEY ("announcement_id") REFERENCES "announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_dismissal_announcement_id_user_id_key"
  ON "announcement_dismissal"("announcement_id", "user_id");
CREATE INDEX IF NOT EXISTS "announcement_dismissal_user_id_dismissed_at_idx"
  ON "announcement_dismissal"("user_id", "dismissed_at");
