/**
 * JS / Python SDK — Stage 38 types.
 *
 * First-party SDK platform: registered apps, personal access tokens
 * with hash-only storage, and per-call usage logs. Server-side
 * helpers are pure so the published SDK packages can call into
 * them via the existing REST API.
 */

export type SdkLanguage = 'js' | 'python' | 'go' | 'java' | 'ruby' | 'other';

export type SdkTokenStatus = 'active' | 'expired' | 'revoked';

export type SdkOutcome = 'ok' | 'rate-limited' | 'unauthorized' | 'error';

export type SdkChannel = 'stable' | 'beta' | 'deprecated';

export interface ISdkApp {
  id: string;
  organizationId: string;
  name: string;
  language: SdkLanguage;
  homepageUrl: string | null;
  redirectUrl: string | null;
  scopesCsv: string;
  clientId: string;
  clientSecretHash: string | null;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
  revokedAt: Date | null;
}

export interface ISdkToken {
  id: string;
  appId: string;
  organizationId: string;
  userId: string | null;
  label: string;
  tokenHash: string;
  tokenLastFour: string;
  scopesCsv: string;
  status: SdkTokenStatus;
  createdBy: string;
  createdTime: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/** Plaintext token, returned to the user ONCE at creation time. */
export interface ISdkTokenReveal extends ISdkToken {
  plaintext: string;
}

export interface ISdkUsageLog {
  id: string;
  appId: string;
  tokenId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  bytesIn: number;
  bytesOut: number;
  outcome: SdkOutcome;
  occurredAt: Date;
}

export interface ISdkRelease {
  id: string;
  language: SdkLanguage;
  version: string;
  changelog: string | null;
  artifactUrl: string | null;
  publishedAt: Date;
  channel: SdkChannel;
}

export interface IRegisterAppInput {
  organizationId: string;
  name: string;
  language: SdkLanguage;
  homepageUrl?: string | null;
  redirectUrl?: string | null;
  scopesCsv: string;
  description?: string | null;
  createdBy: string;
}

export interface IMintTokenInput {
  appId: string;
  organizationId: string;
  userId?: string | null;
  label: string;
  scopesCsv: string;
  createdBy: string;
  expiresAt?: Date | null;
}

export interface IRecordUsageInput {
  appId: string;
  tokenId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  bytesIn?: number;
  bytesOut?: number;
  outcome: SdkOutcome;
}

export interface IPublishReleaseInput {
  language: SdkLanguage;
  version: string;
  changelog?: string | null;
  artifactUrl?: string | null;
  channel?: SdkChannel;
}

export const SUPPORTED_LANGUAGES: ReadonlyArray<SdkLanguage> = [
  'js',
  'python',
  'go',
  'java',
  'ruby',
  'other',
];
export const SUPPORTED_CHANNELS: ReadonlyArray<SdkChannel> = ['stable', 'beta', 'deprecated'];

export const DEFAULT_TOKEN_PREFIX = 'tblk_';
