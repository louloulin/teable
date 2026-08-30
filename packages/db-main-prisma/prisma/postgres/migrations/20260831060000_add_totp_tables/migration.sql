-- Stage 22 — TOTP 2FA tables for the gap-fill branch.
CREATE TABLE IF NOT EXISTS "meta"."user_totp_factor" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'SHA1',
    "digits" INTEGER NOT NULL DEFAULT 6,
    "period" INTEGER NOT NULL DEFAULT 30,
    "last_counter" BIGINT NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_totp_factor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "user_totp_factor_user_id_idx" ON "meta"."user_totp_factor" ("user_id");

CREATE TABLE IF NOT EXISTS "meta"."user_totp_backup_code" (
    "id" TEXT NOT NULL,
    "factor_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_totp_backup_code_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_totp_backup_code_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "meta"."user_totp_factor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "user_totp_backup_code_factor_id_idx" ON "meta"."user_totp_backup_code" ("factor_id");
