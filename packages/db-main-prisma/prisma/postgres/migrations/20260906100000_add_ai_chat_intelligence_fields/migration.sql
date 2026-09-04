-- R-CHAT-2: AI Chat session intelligence fields.
--
-- Per-session overrides for the model picker and the reasoning-intensity
-- slider (`smart_level`). When either is null, the global default from
-- `meta.setting.ai_config` applies (see AiChatSmartLevelService.resolve).
--
-- `allowed_tools` is a JSON array of tool names the session is allowed
-- to invoke (e.g. ["table.read", "record.create"]). `low` smart level
-- restricts this to read-only tools; `medium` adds comments; `high`
-- allows write tools. See ai-chat-intelligence.service.ts.

ALTER TABLE "meta"."ai_chat_session"
    ADD COLUMN IF NOT EXISTS "smart_level"  TEXT
        CHECK ("smart_level" IS NULL OR "smart_level" IN ('low', 'medium', 'high'));

ALTER TABLE "meta"."ai_chat_session"
    ADD COLUMN IF NOT EXISTS "token_budget" INTEGER;

ALTER TABLE "meta"."ai_chat_session"
    ADD COLUMN IF NOT EXISTS "allowed_tools" JSONB;

