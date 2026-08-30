ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'send_email';
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'call_webhook';
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'notify_user';
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'ai_prompt';
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'send_teams_message';
