ALTER TYPE "AutomationTriggerType" ADD VALUE IF NOT EXISTS 'record_matches_conditions';
ALTER TYPE "AutomationTriggerType" ADD VALUE IF NOT EXISTS 'button_clicked';
ALTER TYPE "AutomationTriggerType" ADD VALUE IF NOT EXISTS 'form_submitted';
ALTER TYPE "AutomationTriggerType" ADD VALUE IF NOT EXISTS 'webhook_received';

ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'create_record';
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'get_records';
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'http_request';
