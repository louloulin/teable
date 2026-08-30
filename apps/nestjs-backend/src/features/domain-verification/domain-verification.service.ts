import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { randomBytes } from 'crypto';
import { promises as dns } from 'dns';

import { CustomHttpException } from '../../custom.exception';
import { HttpErrorCode } from '@teable/core';

/**
 * Self-host-friendly domain verification scaffolding.
 *
 * Wire-in: zero changes to existing code. Acts as a pure additive service
 * other features (SSO, custom app domain) call into.
 *
 *   1. `claim(organizationId, domain)`        → returns TXT token to publish
 *   2. Operator adds `_teable-verify.<domain>` TXT record
 *   3. `verify(organizationId, domain)`       → polls DNS, sets status
 *   4. `bindSso / bindApp`                    → flips the secondary flags
 *   5. `revoke(organizationId, domain)`        → marks status=revoked
 */
@Injectable()
export class DomainVerificationService {
  private readonly logger = new Logger(DomainVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async claim(organizationId: string, domain: string, createdBy: string) {
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
    const token = existing?.verificationToken ?? randomBytes(16).toString('hex');
    return this.prisma.organizationDomain.upsert({
      where: { domain: clean },
      create: {
        organizationId,
        domain: clean,
        verificationToken: token,
        createdBy,
      },
      update: { verificationToken: token, status: 'pending', lastError: null },
    });
  }

  /**
   * DNS lookup for `_teable-verify.<domain>` TXT. Resolves `verified` when
   * any returned record equals the issued token; `failed` otherwise.
   * Network failures (NXDOMAIN, timeout) → status remains `pending` so the
   * caller can retry.
   */
  async verify(organizationId: string, domain: string) {
    const row = await this.prisma.organizationDomain.findUnique({ where: { domain } });
    if (!row || row.organizationId !== organizationId) {
      throw new CustomHttpException('domain not claimed', HttpErrorCode.NOT_FOUND);
    }
    const host = `_teable-verify.${row.domain}`;
    let txtRecords: string[][] = [];
    try {
      txtRecords = await dns.resolveTxt(host);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      const transient = code === 'ENOTFOUND' || code === 'ETIMEOUT' || code === 'ESERVFAIL';
      await this.prisma.organizationDomain.update({
        where: { id: row.id },
        data: {
          lastCheckedAt: new Date(),
          lastError: transient ? null : `${code}: ${(err as Error).message}`,
          status: transient ? row.status : 'failed',
        },
      });
      return { ok: false, transient, reason: code ?? 'unknown' };
    }

    const flat = txtRecords.map((chunk) => chunk.join(''));
    const matched = flat.includes(row.verificationToken);
    await this.prisma.organizationDomain.update({
      where: { id: row.id },
      data: {
        lastCheckedAt: new Date(),
        lastError: matched ? null : 'token mismatch',
        status: matched ? 'verified' : 'failed',
      },
    });
    return { ok: matched, transient: false, reason: matched ? undefined : 'token mismatch' };
  }

  async bindSso(organizationId: string, domain: string, enabled: boolean) {
    return this.updateFlag(organizationId, domain, { ssoBound: enabled });
  }

  async bindApp(organizationId: string, domain: string, appId: string | null) {
    return this.updateFlag(organizationId, domain, { boundAppId: appId });
  }

  async revoke(organizationId: string, domain: string) {
    const row = await this.prisma.organizationDomain.findUnique({ where: { domain } });
    if (!row || row.organizationId !== organizationId) {
      throw new CustomHttpException('domain not claimed', HttpErrorCode.NOT_FOUND);
    }
    return this.prisma.organizationDomain.update({
      where: { id: row.id },
      data: { status: 'revoked', revokedAt: new Date(), ssoBound: false, boundAppId: null },
    });
  }

  async list(organizationId: string) {
    return this.prisma.organizationDomain.findMany({
      where: { organizationId },
      orderBy: { createdTime: 'desc' },
    });
  }

  /**
   * True iff the email's domain has been verified AND bound to SSO. Used
   * by the SSO callback to short-circuit invite checks.
   */
  async isSsoDomainVerified(email: string): Promise<boolean> {
    const at = email.lastIndexOf('@');
    if (at < 0) return false;
    const domain = email.slice(at + 1).toLowerCase();
    const row = await this.prisma.organizationDomain.findUnique({ where: { domain } });
    return Boolean(row?.ssoBound && row.status === 'verified');
  }

  private async updateFlag(
    organizationId: string,
    domain: string,
    data: { ssoBound?: boolean; boundAppId?: string | null }
  ) {
    const row = await this.prisma.organizationDomain.findUnique({ where: { domain } });
    if (!row || row.organizationId !== organizationId) {
      throw new CustomHttpException('domain not claimed', HttpErrorCode.NOT_FOUND);
    }
    if (row.status !== 'verified' && (data.ssoBound || data.boundAppId)) {
      // Refuse to flip a binding flag on an unverified domain.
      throw new CustomHttpException('domain must be verified first', HttpErrorCode.UNPROCESSABLE_ENTITY);
    }
    return this.prisma.organizationDomain.update({
      where: { id: row.id },
      data,
    });
  }

  private normalizeDomain(raw: string): string | null {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length === 0 || trimmed.length > 253) return null;
    // Punycode-tolerant enough for ASCII; IDN conversion is a future-stage task.
    const domainRegex = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/;
    return domainRegex.test(trimmed) ? trimmed : null;
  }
}