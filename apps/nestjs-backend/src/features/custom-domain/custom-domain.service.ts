import { Injectable, Logger } from '@nestjs/common';
import { HttpErrorCode } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import { randomBytes } from 'crypto';

import { CustomHttpException } from '../../custom.exception';

/**
 * Default LB DNS name that operators CNAME their custom domain to. The
 * real load balancer / reverse proxy lives in the `teable-deployment`
 * repo (out of scope here); we only publish this name so the operator
 * knows what to point at.
 */
const DEFAULT_LB_DNS_NAME = 'lb.teable.cloud';

/**
 * Custom-domain admin surface.
 *
 *   - `checkDomain(domain)`              → `{ cnameTarget, verified }`
 *   - `claimDomain(domain, orgId, userId)` → upserts an `OrganizationDomain`
 *     row in `pending` status with a fresh verification token. The token
 *     is later matched by `DomainVerificationService.verify(...)` via
 *     the `_teable-verify.<domain>` TXT record.
 *
 * The CNAME target is *never* persisted on the row — it is computed at
 * read-time from the resolved env so environment changes take effect on
 * the next request without a service restart.
 */
@Injectable()
export class CustomDomainService {
  private readonly logger = new Logger(CustomDomainService.name);

  constructor(private readonly prisma: PrismaService) {}

  resolveCnameTarget(): string {
    return process.env.TEABLE_LB_DNS_NAME?.trim() || DEFAULT_LB_DNS_NAME;
  }

  async checkDomain(domain: string): Promise<{ cnameTarget: string; verified: boolean }> {
    const clean = this.normalizeDomain(domain);
    if (!clean) {
      throw new CustomHttpException('invalid domain', HttpErrorCode.VALIDATION_ERROR);
    }
    const row = await this.prisma.organizationDomain.findUnique({
      where: { domain: clean },
      select: { status: true },
    });
    return {
      cnameTarget: this.resolveCnameTarget(),
      verified: row?.status === 'verified',
    };
  }

  async claimDomain(domain: string, organizationId: string, createdBy: string) {
    const clean = this.normalizeDomain(domain);
    if (!clean) {
      throw new CustomHttpException('invalid domain', HttpErrorCode.VALIDATION_ERROR);
    }
    const existing = await this.prisma.organizationDomain.findUnique({
      where: { domain: clean },
    });
    if (existing && existing.organizationId !== organizationId) {
      throw new CustomHttpException('domain already claimed', HttpErrorCode.CONFLICT);
    }
    const verificationToken = randomBytes(16).toString('hex');
    return this.prisma.organizationDomain.upsert({
      where: { domain: clean },
      create: {
        organizationId,
        domain: clean,
        verificationToken,
        createdBy,
        status: 'pending',
      },
      update: { verificationToken, status: 'pending', lastError: null },
    });
  }

  private normalizeDomain(raw: string): string | null {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length === 0 || trimmed.length > 253) return null;
    const domainRegex = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/;
    return domainRegex.test(trimmed) ? trimmed : null;
  }
}