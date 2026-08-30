CREATE TABLE IF NOT EXISTS "automation_secret" (
  "id" TEXT NOT NULL,
  "automation_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "encrypted_value" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_modified_by" TEXT,
  "last_modified_time" TIMESTAMP(3),
  CONSTRAINT "automation_secret_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_secret_automation_id_fkey"
    FOREIGN KEY ("automation_id") REFERENCES "automation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "automation_secret_automation_id_name_key"
  ON "automation_secret" ("automation_id", "name");
CREATE INDEX IF NOT EXISTS "automation_secret_automation_id_idx"
  ON "automation_secret" ("automation_id");
