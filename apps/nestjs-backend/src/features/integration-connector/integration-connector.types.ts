/**
 * Integration Connector — Stage 33 types.
 *
 * Public connector registry + per-org install + delivery audit.
 * Patterned after Zapier "Catch Hook" / Make "Webhooks" — the
 * connector is identified by URL, payloads are forwarded as-is,
 * and each install gets its own delivery log for retries.
 */

export type IntegrationCategory =
  | 'automation'
  | 'messaging'
  | 'crm'
  | 'productivity'
  | 'storage'
  | 'custom';

export type IntegrationAuthType = 'none' | 'api-key' | 'oauth2' | 'webhook-only';

export type IntegrationWebhookStyle = 'catch-hook' | 'subscribe' | 'poll' | 'push';

export type InstallStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'error';

export type EventDirection = 'outbound' | 'inbound';

export type DeliveryStatus = 'delivered' | 'failed' | 'pending' | 'throttled';

export interface IIntegrationProvider {
  id: string;
  code: string;
  displayName: string;
  category: IntegrationCategory;
  authType: IntegrationAuthType;
  webhookStyle: IntegrationWebhookStyle;
  description: string | null;
  docsUrl: string | null;
  enabled: boolean;
  createdTime: Date;
}

export interface IIntegrationInstall {
  id: string;
  organizationId: string;
  providerCode: string;
  status: InstallStatus;
  externalAccountId: string | null;
  /** Encrypted token blob — body is opaque JSON, never plaintext in DB. */
  accessTokenJson: string | null;
  refreshToken: string | null;
  scopesCsv: string | null;
  /** Per-install webhook secret used to sign outbound payloads. */
  webhookSecret: string | null;
  expiresAt: Date | null;
  installedBy: string;
  installedTime: Date;
  updatedTime: Date;
  revokedAt: Date | null;
}

export interface IIntegrationEventLog {
  id: string;
  installId: string;
  direction: EventDirection;
  eventType: string;
  payloadHash: string | null;
  status: DeliveryStatus;
  attempts: number;
  receivedAt: Date;
  errorMessage: string | null;
}

export interface ICreateInstallInput {
  organizationId: string;
  providerCode: string;
  installedBy: string;
  externalAccountId?: string | null;
  accessTokenJson?: string | null;
  refreshToken?: string | null;
  scopesCsv?: string | null;
  expiresAt?: Date | null;
}

export interface IUpdateInstallInput {
  status?: InstallStatus;
  accessTokenJson?: string | null;
  refreshToken?: string | null;
  scopesCsv?: string | null;
  expiresAt?: Date | null;
  externalAccountId?: string | null;
}

export interface ICatchHookDelivery {
  installId: string;
  eventType: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  receivedAt: Date;
}

export const SUPPORTED_PROVIDERS: ReadonlyArray<{
  code: string;
  displayName: string;
  category: IntegrationCategory;
  authType: IntegrationAuthType;
  webhookStyle: IntegrationWebhookStyle;
  description: string;
  docsUrl: string;
}> = [
  {
    code: 'zapier',
    displayName: 'Zapier',
    category: 'automation',
    authType: 'webhook-only',
    webhookStyle: 'catch-hook',
    description: 'Forward row events to any Zap via Zapier Catch Hook.',
    docsUrl: 'https://zapier.com/help/create/code-webhooks/trigger-zaps-from-webhooks',
  },
  {
    code: 'make',
    displayName: 'Make',
    category: 'automation',
    authType: 'webhook-only',
    webhookStyle: 'catch-hook',
    description: 'Trigger Make scenarios from row events via Webhooks module.',
    docsUrl: 'https://www.make.com/en/help/tools/webhooks',
  },
  {
    code: 'n8n',
    displayName: 'n8n',
    category: 'automation',
    authType: 'webhook-only',
    webhookStyle: 'catch-hook',
    description: 'Send events into n8n workflows via Webhook node.',
    docsUrl: 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/',
  },
  {
    code: 'slack',
    displayName: 'Slack',
    category: 'messaging',
    authType: 'oauth2',
    webhookStyle: 'push',
    description: 'Post messages to Slack channels when records change.',
    docsUrl: 'https://api.slack.com/web',
  },
  {
    code: 'hubspot',
    displayName: 'HubSpot',
    category: 'crm',
    authType: 'oauth2',
    webhookStyle: 'subscribe',
    description: 'Sync contacts and deals between Teable and HubSpot.',
    docsUrl: 'https://developers.hubspot.com/docs/api/overview',
  },
  {
    code: 'google-sheets',
    displayName: 'Google Sheets',
    category: 'productivity',
    authType: 'oauth2',
    webhookStyle: 'subscribe',
    description: 'Bi-directional sync with Google Sheets spreadsheets.',
    docsUrl: 'https://developers.google.com/sheets/api',
  },
];
