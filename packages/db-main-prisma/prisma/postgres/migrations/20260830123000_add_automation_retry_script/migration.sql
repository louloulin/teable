ALTER TYPE "AutomationTriggerType" ADD VALUE IF NOT EXISTS 'email_received';
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'run_script';

ALTER TABLE "automation_run"
  ADD COLUMN IF NOT EXISTS "parent_run_id" TEXT,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "resume_from_step" INTEGER;

CREATE INDEX IF NOT EXISTS "automation_run_parent_run_id_idx"
  ON "automation_run" ("parent_run_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automation_run_parent_run_id_fkey'
  ) THEN
    ALTER TABLE "automation_run"
      ADD CONSTRAINT "automation_run_parent_run_id_fkey"
      FOREIGN KEY ("parent_run_id") REFERENCES "automation_run"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
