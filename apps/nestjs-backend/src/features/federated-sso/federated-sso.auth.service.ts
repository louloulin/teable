/**
 * Federated SSO — auth layer (Stage 60).
 *
 * Loads provider configs from Prisma (unified table that subsumes the
 * Stage 4 OIDC config + Stage 21 SAML config) and resolves login
 * requests via the pure helpers.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { buildSession, discoverProvider, validateProvider } from './federated-sso.service';
import type {
  IFederatedSession,
  ISsoDiscoveryRequest,
  ISsoDiscoveryResult,
  ISsoProvider,
} from './federated-sso.types';

@Injectable()
export class FederatedSsoAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve which provider should handle an incoming login email. */
  async discover(req: ISsoDiscoveryRequest): Promise<ISsoDiscoveryResult> {
    const rows = await this.loadProviders(req.baseId);
    return discoverProvider(req, rows);
  }

  /** Validate a single provider record before saving. */
  validate(p: ISsoProvider): string[] {
    return validateProvider(p);
  }

  /** Start a federated session — caller already finished the IdP dance. */
  startSession(args: {
    provider: ISsoProvider;
    subject: string;
    email?: string;
    userId?: string;
    attributes: Record<string, string>;
  }): IFederatedSession {
    return buildSession(args);
  }

  /** Load enabled providers for a base. Internal hook for tests. */
  async loadProviders(baseId: string): Promise<ISsoProvider[]> {
    const rows = await this.prisma.ssoProvider.findMany({ where: { baseId } });
    return rows.map(toDomain);
  }
}

function toDomain(row: Record<string, unknown>): ISsoProvider {
  return {
    id: String(row['id']),
    baseId: String(row['baseId']),
    name: String(row['name']),
    protocol: (row['protocol'] === 'saml' ? 'saml' : 'oidc') as ISsoProvider['protocol'],
    enabled: Boolean(row['enabled']),
    autoLink: Boolean(row['autoLink']),
    emailDomains: Array.isArray(row['emailDomains']) ? (row['emailDomains'] as string[]) : [],
    priority: Number(row['priority'] ?? 100),
    config: (row['config'] ?? {}) as ISsoProvider['config'],
    createdAt: String(row['createdAt'] ?? new Date().toISOString()),
    updatedAt: String(row['updatedAt'] ?? new Date().toISOString()),
  };
}
