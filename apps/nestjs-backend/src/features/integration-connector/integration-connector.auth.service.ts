import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyInstallUpdate,
  buildCatchHookUrl,
  buildInstallRow,
  generateWebhookSecret,
  hashPayload,
  isValidInstallStatusTransition,
  isValidProviderCode,
  resolveProvider,
} from './integration-connector.service';
import type {
  ICreateInstallInput,
  IIntegrationEventLog,
  IIntegrationInstall,
  IIntegrationProvider,
  IUpdateInstallInput,
  InstallStatus,
} from './integration-connector.types';

@Injectable()
export class IntegrationConnectorAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async listProviders(): Promise<IIntegrationProvider[]> {
    const rows = await this.prisma.integrationProvider.findMany({ orderBy: { code: 'asc' } });
    return rows.map(toProviderRow);
  }

  async ensureBundledProviders(): Promise<number> {
    const bundled = await import('./integration-connector.types').then(
      (m) => m.SUPPORTED_PROVIDERS
    );
    let created = 0;
    for (const b of bundled) {
      const existing = await this.prisma.integrationProvider.findUnique({
        where: { code: b.code },
      });
      if (existing) continue;
      const id = `prov_${b.code}`;
      await this.prisma.integrationProvider.create({
        data: {
          id,
          code: b.code,
          displayName: b.displayName,
          category: b.category,
          authType: b.authType,
          webhookStyle: b.webhookStyle,
          description: b.description,
          docsUrl: b.docsUrl,
          enabled: true,
        },
      });
      created += 1;
    }
    return created;
  }

  async getProvider(code: string): Promise<IIntegrationProvider | null> {
    const registered = await this.prisma.integrationProvider.findUnique({ where: { code } });
    return resolveProvider({ code, registered: registered ? toProviderRow(registered) : null });
  }

  async install(input: ICreateInstallInput): Promise<IIntegrationInstall> {
    if (!isValidProviderCode(input.providerCode))
      throw new BadRequestException('invalid providerCode');
    const provider = await this.getProvider(input.providerCode);
    if (!provider) throw new BadRequestException(`unknown provider: ${input.providerCode}`);
    if (!provider.enabled)
      throw new BadRequestException(`provider disabled: ${input.providerCode}`);
    const dup = await this.prisma.integrationInstall.findUnique({
      where: {
        organizationId_providerCode: {
          organizationId: input.organizationId,
          providerCode: input.providerCode,
        },
      },
    });
    if (dup) throw new ConflictException(`install exists: ${input.providerCode}`);
    const id = `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const webhookSecret =
      provider.webhookStyle === 'catch-hook' || provider.webhookStyle === 'push'
        ? generateWebhookSecret()
        : null;
    const row = buildInstallRow({ id, webhookSecret, ...input });
    const created = await this.prisma.integrationInstall.create({
      data: {
        id: row.id,
        organizationId: row.organizationId,
        providerCode: row.providerCode,
        status: row.status,
        externalAccountId: row.externalAccountId,
        accessTokenJson: row.accessTokenJson,
        refreshToken: row.refreshToken,
        scopesCsv: row.scopesCsv,
        webhookSecret: row.webhookSecret,
        expiresAt: row.expiresAt,
        installedBy: row.installedBy,
      },
    });
    return toInstallRow(created);
  }

  async update(
    organizationId: string,
    providerCode: string,
    update: IUpdateInstallInput
  ): Promise<IIntegrationInstall> {
    const existing = await this.prisma.integrationInstall.findUnique({
      where: { organizationId_providerCode: { organizationId, providerCode } },
    });
    if (!existing) throw new NotFoundException(`install not found: ${providerCode}`);
    if (
      update.status &&
      !isValidInstallStatusTransition(existing.status as InstallStatus, update.status)
    ) {
      throw new BadRequestException(
        `invalid status transition: ${existing.status} → ${update.status}`
      );
    }
    const merged = applyInstallUpdate(toInstallRow(existing), update);
    const updated = await this.prisma.integrationInstall.update({
      where: { organizationId_providerCode: { organizationId, providerCode } },
      data: {
        status: merged.status,
        accessTokenJson: merged.accessTokenJson,
        refreshToken: merged.refreshToken,
        scopesCsv: merged.scopesCsv,
        expiresAt: merged.expiresAt,
        externalAccountId: merged.externalAccountId,
        revokedAt: merged.status === 'revoked' ? new Date() : merged.revokedAt,
      },
    });
    return toInstallRow(updated);
  }

  async revoke(organizationId: string, providerCode: string): Promise<IIntegrationInstall> {
    return this.update(organizationId, providerCode, { status: 'revoked' });
  }

  async getInstall(
    organizationId: string,
    providerCode: string
  ): Promise<IIntegrationInstall | null> {
    const row = await this.prisma.integrationInstall.findUnique({
      where: { organizationId_providerCode: { organizationId, providerCode } },
    });
    return row ? toInstallRow(row) : null;
  }

  async getInstallById(installId: string): Promise<IIntegrationInstall | null> {
    const row = await this.prisma.integrationInstall.findUnique({ where: { id: installId } });
    return row ? toInstallRow(row) : null;
  }

  async listInstalls(organizationId: string): Promise<IIntegrationInstall[]> {
    const rows = await this.prisma.integrationInstall.findMany({ where: { organizationId } });
    return rows.map(toInstallRow);
  }

  /** Build the public catch-hook URL for a Catch-Hook style install. */
  buildCatchHookUrl(baseUrl: string, installId: string): string {
    return buildCatchHookUrl({ baseUrl, installId });
  }

  /** Record an event log entry (inbound or outbound). */
  async recordEvent(input: {
    installId: string;
    direction: 'inbound' | 'outbound';
    eventType: string;
    payloadHash?: string | null;
    status?: 'delivered' | 'failed' | 'pending' | 'throttled';
    attempts?: number;
    errorMessage?: string | null;
  }): Promise<IIntegrationEventLog> {
    const id = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.integrationEventLog.create({
      data: {
        id,
        installId: input.installId,
        direction: input.direction,
        eventType: input.eventType,
        payloadHash: input.payloadHash ?? null,
        status: input.status ?? 'delivered',
        attempts: input.attempts ?? 1,
        errorMessage: input.errorMessage ?? null,
      },
    });
    return toEventLogRow(row);
  }

  async listEvents(input: { installId: string; limit?: number }): Promise<IIntegrationEventLog[]> {
    const rows = await this.prisma.integrationEventLog.findMany({
      where: { installId: input.installId },
      orderBy: { receivedAt: 'desc' },
      take: Math.min(input.limit ?? 100, 1_000),
    });
    return rows.map(toEventLogRow);
  }

  /** Hash helper exposed for outbound payloads. */
  hashPayload(payload: string | Record<string, unknown>): string {
    return hashPayload(payload);
  }
}

function toProviderRow(r: {
  id: string;
  code: string;
  displayName: string;
  category: string;
  authType: string;
  webhookStyle: string;
  description: string | null;
  docsUrl: string | null;
  enabled: boolean;
  createdTime: Date;
}): IIntegrationProvider {
  return {
    id: r.id,
    code: r.code,
    displayName: r.displayName,
    category: r.category as IIntegrationProvider['category'],
    authType: r.authType as IIntegrationProvider['authType'],
    webhookStyle: r.webhookStyle as IIntegrationProvider['webhookStyle'],
    description: r.description,
    docsUrl: r.docsUrl,
    enabled: r.enabled,
    createdTime: r.createdTime,
  };
}

function toInstallRow(r: {
  id: string;
  organizationId: string;
  providerCode: string;
  status: string;
  externalAccountId: string | null;
  accessTokenJson: string | null;
  refreshToken: string | null;
  scopesCsv: string | null;
  webhookSecret: string | null;
  expiresAt: Date | null;
  installedBy: string;
  installedTime: Date;
  updatedTime: Date;
  revokedAt: Date | null;
}): IIntegrationInstall {
  return {
    id: r.id,
    organizationId: r.organizationId,
    providerCode: r.providerCode,
    status: r.status as IIntegrationInstall['status'],
    externalAccountId: r.externalAccountId,
    accessTokenJson: r.accessTokenJson,
    refreshToken: r.refreshToken,
    scopesCsv: r.scopesCsv,
    webhookSecret: r.webhookSecret,
    expiresAt: r.expiresAt,
    installedBy: r.installedBy,
    installedTime: r.installedTime,
    updatedTime: r.updatedTime,
    revokedAt: r.revokedAt,
  };
}

function toEventLogRow(r: {
  id: string;
  installId: string;
  direction: string;
  eventType: string;
  payloadHash: string | null;
  status: string;
  attempts: number;
  receivedAt: Date;
  errorMessage: string | null;
}): IIntegrationEventLog {
  return {
    id: r.id,
    installId: r.installId,
    direction: r.direction as IIntegrationEventLog['direction'],
    eventType: r.eventType,
    payloadHash: r.payloadHash,
    status: r.status as IIntegrationEventLog['status'],
    attempts: r.attempts,
    receivedAt: r.receivedAt,
    errorMessage: r.errorMessage,
  };
}
