/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Email domain claim — NestJS auth service (Stage 72).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyDnsCheck,
  canClaimMore,
  matchCandidate,
  normalizeClaim,
  renderVerificationRecord,
  shouldAutoJoin,
  validateClaim,
  validateDomain,
} from './email-domain-claim.service';
import type {
  ClaimMode,
  ClaimStatus,
  IAutoJoinCandidate,
  IClaimAuditEntry,
  IEmailDomainClaim,
} from './email-domain-claim.types';

@Injectable()
export class EmailDomainClaimAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a domain. */
  validateDomain(domain: string): string | null {
    return validateDomain(domain);
  }

  /** Validate a claim. */
  validate(claim: IEmailDomainClaim): string | null {
    return validateClaim(claim);
  }

  /** Normalize a claim. */
  normalize(input: {
    id: string;
    orgId: string;
    domain: string;
    token?: string;
    status?: ClaimStatus;
    mode?: ClaimMode;
    defaultRoleId?: string | null;
  }): IEmailDomainClaim {
    return normalizeClaim(input);
  }

  /** Render the verification record an admin must publish. */
  renderDnsRecord(claim: Pick<IEmailDomainClaim, 'domain' | 'token'>) {
    return renderVerificationRecord(claim);
  }

  /** Persist a claim. */
  async upsertClaim(claim: IEmailDomainClaim): Promise<IEmailDomainClaim> {
    const err = validateClaim(claim);
    if (err) throw new Error(`invalid claim: ${err}`);
    await this.prisma.emailDomainClaim.upsert({
      where: { id: claim.id },
      create: {
        id: claim.id,
        orgId: claim.orgId,
        domain: claim.domain,
        token: claim.token,
        status: claim.status,
        mode: claim.mode,
        defaultRoleId: claim.defaultRoleId,
        lastCheckedAt: claim.lastCheckedAt ? new Date(claim.lastCheckedAt) : null,
        lastError: claim.lastError,
        verifiedAt: claim.verifiedAt ? new Date(claim.verifiedAt) : null,
        createdAt: new Date(claim.createdAt),
        updatedAt: new Date(claim.updatedAt),
      },
      update: {
        domain: claim.domain,
        token: claim.token,
        status: claim.status,
        mode: claim.mode,
        defaultRoleId: claim.defaultRoleId,
        lastCheckedAt: claim.lastCheckedAt ? new Date(claim.lastCheckedAt) : null,
        lastError: claim.lastError,
        verifiedAt: claim.verifiedAt ? new Date(claim.verifiedAt) : null,
        updatedAt: new Date(claim.updatedAt),
      },
    });
    return claim;
  }

  /** Load a claim by id. */
  async loadClaim(id: string): Promise<IEmailDomainClaim | null> {
    const row = await this.prisma.emailDomainClaim.findUnique({ where: { id } });
    return row ? toClaim(row) : null;
  }

  /** List claims for an org. */
  async listClaims(orgId: string): Promise<IEmailDomainClaim[]> {
    const rows = await this.prisma.emailDomainClaim.findMany({ where: { orgId } });
    return rows.map(toClaim);
  }

  /** Find a verified claim matching an email. */
  async findMatchingClaim(email: string): Promise<IEmailDomainClaim | null> {
    const at = email.lastIndexOf('@');
    if (at < 0) return null;
    const domain = email.slice(at + 1).toLowerCase();
    const rows = await this.prisma.emailDomainClaim.findMany({
      where: { domain, status: 'verified' },
    });
    return rows[0] ? toClaim(rows[0]) : null;
  }

  /** Apply a DNS check (uses resolver callback for the TXT value). */
  async checkDomain(input: {
    claimId: string;
    /// Resolver returns the raw TXT value (without prefix) or null.
    resolve: (domain: string) => Promise<string | null>;
  }) {
    const claim = await this.loadClaim(input.claimId);
    if (!claim) throw new Error('claim not found');
    const observed = await input.resolve(claim.domain);
    return applyDnsCheck({
      claim,
      observedValue: observed === null ? null : `teable-verify=${observed}`,
    });
  }

  /** Decide if a user is a candidate for auto-join. */
  match(claim: IEmailDomainClaim, email: string): IAutoJoinCandidate | null {
    return matchCandidate({ claim, email });
  }

  /** Decide if the candidate should be auto-joined. */
  shouldAutoJoin(claim: IEmailDomainClaim, candidate: IAutoJoinCandidate): boolean {
    return shouldAutoJoin({ claim, candidate });
  }

  /** Whether the org can claim another domain. */
  canClaimMore(currentCount: number): boolean {
    return canClaimMore(currentCount);
  }

  /** Record an audit entry. */
  async recordAudit(entry: IClaimAuditEntry): Promise<IClaimAuditEntry> {
    await this.prisma.emailDomainClaimAudit.create({
      data: {
        id: entry.id,
        orgId: entry.orgId,
        domain: entry.domain,
        action: entry.action,
        actorId: entry.actorId,
        details: entry.details,
        createdAt: new Date(entry.createdAt),
      },
    });
    return entry;
  }
}

function toClaim(row: Record<string, unknown>): IEmailDomainClaim {
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    domain: String(row['domain']),
    token: String(row['token']),
    status: String(row['status']) as ClaimStatus,
    mode: String(row['mode']) as ClaimMode,
    defaultRoleId:
      row['defaultRoleId'] === null || row['defaultRoleId'] === undefined
        ? null
        : String(row['defaultRoleId']),
    lastCheckedAt:
      row['lastCheckedAt'] === null || row['lastCheckedAt'] === undefined
        ? null
        : new Date(String(row['lastCheckedAt'])).toISOString(),
    lastError: row['lastError'] === null ? null : String(row['lastError'] ?? ''),
    verifiedAt:
      row['verifiedAt'] === null || row['verifiedAt'] === undefined
        ? null
        : new Date(String(row['verifiedAt'])).toISOString(),
    createdAt: new Date(String(row['createdAt'] ?? Date.now())).toISOString(),
    updatedAt: new Date(String(row['updatedAt'] ?? Date.now())).toISOString(),
  };
}
