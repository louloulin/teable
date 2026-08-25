import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildAppRow,
  buildTokenRow,
  constantTimeEquals,
  foldUsage,
  generateApiToken,
  generateClientId,
  generateClientSecret,
  hashSecret,
  isTokenExpired,
  isValidLanguage,
  isValidOutcome,
  isValidTokenStatusTransition,
  isValidVersion,
  parseScopes,
  stringifyScopes,
  tokenLastFour,
} from './sdk-platform.service';
import type {
  IMintTokenInput,
  IPublishReleaseInput,
  IRecordUsageInput,
  IRegisterAppInput,
  ISdkApp,
  ISdkRelease,
  ISdkToken,
  ISdkTokenReveal,
  ISdkUsageLog,
  SdkLanguage,
  SdkTokenStatus,
} from './sdk-platform.types';

@Injectable()
export class SdkPlatformAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Convert to safe wrapper that ignores unused import in build pipeline. */
  private static readonly _foldUsage = foldUsage;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _bindKeep = SdkPlatformAuthService._foldUsage;

  async registerApp(input: IRegisterAppInput): Promise<ISdkApp> {
    if (!isValidLanguage(input.language)) throw new BadRequestException('invalid language');
    if (input.scopesCsv.trim().length === 0) throw new BadRequestException('scopes required');
    const id = `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const clientId = generateClientId();
    const row = buildAppRow({ id, clientId, ...input });
    const created = await this.prisma.sdkApp.create({
      data: {
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        language: row.language,
        homepageUrl: row.homepageUrl,
        redirectUrl: row.redirectUrl,
        scopesCsv: row.scopesCsv,
        clientId: row.clientId,
        description: row.description,
        createdBy: row.createdBy,
      },
    });
    return toAppRow(created);
  }

  async rotateClientSecret(appId: string): Promise<{ app: ISdkApp; plaintext: string }> {
    const existing = await this.prisma.sdkApp.findUnique({ where: { id: appId } });
    if (!existing) throw new NotFoundException(`app not found: ${appId}`);
    const plaintext = generateClientSecret();
    const hash = hashSecret(plaintext);
    const updated = await this.prisma.sdkApp.update({
      where: { id: appId },
      data: { clientSecretHash: hash, updatedTime: new Date() },
    });
    return { app: toAppRow(updated), plaintext };
  }

  async verifyClientCredentials(input: {
    clientId: string;
    clientSecret: string;
  }): Promise<ISdkApp | null> {
    const app = await this.prisma.sdkApp.findUnique({ where: { clientId: input.clientId } });
    if (!app || !app.clientSecretHash || !app.enabled) return null;
    return constantTimeEquals(app.clientSecretHash, hashSecret(input.clientSecret))
      ? toAppRow(app)
      : null;
  }

  async listApps(organizationId: string): Promise<ISdkApp[]> {
    const rows = await this.prisma.sdkApp.findMany({ where: { organizationId } });
    return rows.map(toAppRow);
  }

  async getApp(appId: string): Promise<ISdkApp | null> {
    const row = await this.prisma.sdkApp.findUnique({ where: { id: appId } });
    return row ? toAppRow(row) : null;
  }

  async revokeApp(appId: string): Promise<ISdkApp> {
    const existing = await this.prisma.sdkApp.findUnique({ where: { id: appId } });
    if (!existing) throw new NotFoundException(`app not found: ${appId}`);
    const updated = await this.prisma.sdkApp.update({
      where: { id: appId },
      data: { revokedAt: new Date(), enabled: false },
    });
    return toAppRow(updated);
  }

  /** Mint a token; returns the plaintext ONCE. */
  async mintToken(input: IMintTokenInput): Promise<ISdkTokenReveal> {
    const app = await this.prisma.sdkApp.findUnique({ where: { id: input.appId } });
    if (!app) throw new NotFoundException(`app not found: ${input.appId}`);
    if (!app.enabled) throw new BadRequestException('app disabled');
    const plaintext = generateApiToken();
    const id = `tok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildTokenRow({
      id,
      tokenHash: hashSecret(plaintext),
      tokenLastFour: tokenLastFour(plaintext),
      ...input,
    });
    const created = await this.prisma.sdkToken.create({
      data: {
        id: row.id,
        appId: row.appId,
        organizationId: row.organizationId,
        userId: row.userId,
        label: row.label,
        tokenHash: row.tokenHash,
        tokenLastFour: row.tokenLastFour,
        scopesCsv: row.scopesCsv,
        createdBy: row.createdBy,
        expiresAt: row.expiresAt,
      },
    });
    return { ...toTokenRow(created), plaintext };
  }

  /** Resolve a plaintext token to its DB row (used by auth middleware). */
  async resolveToken(plaintext: string): Promise<ISdkToken | null> {
    if (!plaintext.startsWith('tblk_')) return null;
    const hash = hashSecret(plaintext);
    const row = await this.prisma.sdkToken.findUnique({ where: { tokenHash: hash } });
    if (!row) return null;
    const token = toTokenRow(row);
    if (token.status !== 'active') return null;
    if (isTokenExpired({ expiresAt: token.expiresAt })) return null;
    return token;
  }

  async revokeToken(tokenId: string): Promise<ISdkToken> {
    const existing = await this.prisma.sdkToken.findUnique({ where: { id: tokenId } });
    if (!existing) throw new NotFoundException(`token not found: ${tokenId}`);
    const from = existing.status as SdkTokenStatus;
    if (!isValidTokenStatusTransition(from, 'revoked')) {
      throw new BadRequestException(`invalid status transition: ${from} → revoked`);
    }
    const updated = await this.prisma.sdkToken.update({
      where: { id: tokenId },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    return toTokenRow(updated);
  }

  async listTokens(organizationId: string): Promise<ISdkToken[]> {
    const rows = await this.prisma.sdkToken.findMany({ where: { organizationId } });
    return rows.map(toTokenRow);
  }

  async touchLastUsed(tokenId: string): Promise<void> {
    await this.prisma.sdkToken.update({
      where: { id: tokenId },
      data: { lastUsedAt: new Date() },
    });
  }

  async recordUsage(input: IRecordUsageInput): Promise<ISdkUsageLog> {
    if (!isValidOutcome(input.outcome)) throw new BadRequestException('invalid outcome');
    const id = `usage_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.sdkUsageLog.create({
      data: {
        id,
        appId: input.appId,
        tokenId: input.tokenId ?? null,
        method: input.method,
        path: input.path,
        statusCode: input.statusCode,
        durationMs: input.durationMs,
        bytesIn: input.bytesIn ?? 0,
        bytesOut: input.bytesOut ?? 0,
        outcome: input.outcome,
      },
    });
    return toUsageLogRow(row);
  }

  async listUsage(input: { appId: string; limit?: number }): Promise<ISdkUsageLog[]> {
    const rows = await this.prisma.sdkUsageLog.findMany({
      where: { appId: input.appId },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(input.limit ?? 200, 5_000),
    });
    return rows.map(toUsageLogRow);
  }

  foldUsage(
    records: ReadonlyArray<IRecordUsageInput & { id?: string; occurredAt?: Date }>
  ): ReturnType<typeof foldUsage> {
    return foldUsage(records);
  }

  async publishRelease(input: IPublishReleaseInput): Promise<ISdkRelease> {
    if (!isValidLanguage(input.language)) throw new BadRequestException('invalid language');
    if (!isValidVersion(input.version)) throw new BadRequestException('invalid version');
    const dup = await this.prisma.sdkRelease.findUnique({
      where: { language_version: { language: input.language, version: input.version } },
    });
    if (dup) throw new ConflictException(`release exists: ${input.language} ${input.version}`);
    const id = `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.sdkRelease.create({
      data: {
        id,
        language: input.language,
        version: input.version,
        changelog: input.changelog ?? null,
        artifactUrl: input.artifactUrl ?? null,
        channel: input.channel ?? 'stable',
      },
    });
    return toReleaseRow(row);
  }

  async listReleases(language: SdkLanguage): Promise<ISdkRelease[]> {
    const rows = await this.prisma.sdkRelease.findMany({
      where: { language },
      orderBy: { publishedAt: 'desc' },
    });
    return rows.map(toReleaseRow);
  }

  async latestRelease(
    language: SdkLanguage,
    channel: 'stable' | 'beta' | 'deprecated' = 'stable'
  ): Promise<ISdkRelease | null> {
    const rows = await this.prisma.sdkRelease.findMany({
      where: { language, channel },
      orderBy: { publishedAt: 'desc' },
      take: 1,
    });
    return rows[0] ? toReleaseRow(rows[0]) : null;
  }

  parseScopes(csv: string): string[] {
    return parseScopes(csv);
  }

  stringifyScopes(scopes: ReadonlyArray<string>): string {
    return stringifyScopes(scopes);
  }
}

function toAppRow(r: {
  id: string;
  organizationId: string;
  name: string;
  language: string;
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
}): ISdkApp {
  return {
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    language: r.language as SdkLanguage,
    homepageUrl: r.homepageUrl,
    redirectUrl: r.redirectUrl,
    scopesCsv: r.scopesCsv,
    clientId: r.clientId,
    clientSecretHash: r.clientSecretHash,
    description: r.description,
    enabled: r.enabled,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
    revokedAt: r.revokedAt,
  };
}

function toTokenRow(r: {
  id: string;
  appId: string;
  organizationId: string;
  userId: string | null;
  label: string;
  tokenHash: string;
  tokenLastFour: string;
  scopesCsv: string;
  status: string;
  createdBy: string;
  createdTime: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}): ISdkToken {
  return {
    id: r.id,
    appId: r.appId,
    organizationId: r.organizationId,
    userId: r.userId,
    label: r.label,
    tokenHash: r.tokenHash,
    tokenLastFour: r.tokenLastFour,
    scopesCsv: r.scopesCsv,
    status: r.status as SdkTokenStatus,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    lastUsedAt: r.lastUsedAt,
    expiresAt: r.expiresAt,
    revokedAt: r.revokedAt,
  };
}

function toUsageLogRow(r: {
  id: string;
  appId: string;
  tokenId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  bytesIn: number;
  bytesOut: number;
  outcome: string;
  occurredAt: Date;
}): ISdkUsageLog {
  return {
    id: r.id,
    appId: r.appId,
    tokenId: r.tokenId,
    method: r.method,
    path: r.path,
    statusCode: r.statusCode,
    durationMs: r.durationMs,
    bytesIn: r.bytesIn,
    bytesOut: r.bytesOut,
    outcome: r.outcome as ISdkUsageLog['outcome'],
    occurredAt: r.occurredAt,
  };
}

function toReleaseRow(r: {
  id: string;
  language: string;
  version: string;
  changelog: string | null;
  artifactUrl: string | null;
  publishedAt: Date;
  channel: string;
}): ISdkRelease {
  return {
    id: r.id,
    language: r.language as SdkLanguage,
    version: r.version,
    changelog: r.changelog,
    artifactUrl: r.artifactUrl,
    publishedAt: r.publishedAt,
    channel: r.channel as ISdkRelease['channel'],
  };
}
