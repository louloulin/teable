/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Interceptor guard — NestJS auth service (Stage 92).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildAudit,
  buildError,
  isAuthorized,
  outcomeFor,
} from './interceptor-guard.service';
import type {
  AuditAction,
  IAuditRecord,
  IAuthContext,
  IErrorEnvelope,
} from './interceptor-guard.types';
import { MAX_AUDIT_CONTEXT_KEYS } from './interceptor-guard.types';

@Injectable()
export class InterceptorGuardAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Authorize a request, returning an audit record and outcome. */
  async authorize(input: {
    ctx: IAuthContext;
    requiredRoles?: ReadonlyArray<string>;
    traceId: string;
    now: string;
  }): Promise<{ allowed: boolean; audit: IAuditRecord }> {
    const allowed = isAuthorized({ ctx: input.ctx, requiredRoles: input.requiredRoles });
    const audit = buildAudit({
      ctx: input.ctx,
      outcome: outcomeFor({
        ctx: input.ctx,
        requiredRoles: input.requiredRoles,
        errored: false,
      }),
      traceId: input.traceId,
      now: input.now,
    });
    return { allowed, audit };
  }

  /** Build a normalized error envelope. */
  makeError(input: {
    code: 'unauthorized' | 'forbidden' | 'rate_limited' | 'validation' | 'not_found' | 'conflict' | 'internal';
    message: string;
    traceId: string;
  }): IErrorEnvelope {
    return buildError(input);
  }

  /** Persist an audit record. */
  async recordAudit(input: { audit: IAuditRecord }): Promise<IAuditRecord> {
    if (Object.keys(input.audit.context).length > MAX_AUDIT_CONTEXT_KEYS) {
      throw new Error(`audit context cap ${MAX_AUDIT_CONTEXT_KEYS}`);
    }
    await this.prisma.guardAudit.upsert({
      where: { id: input.audit.traceId },
      create: {
        id: input.audit.traceId,
        action: input.audit.action,
        principal: input.audit.principal,
        resourceId: input.audit.resourceId || null,
        outcome: input.audit.outcome,
        context: input.audit.context as object,
        occurredAt: new Date(input.audit.occurredAt),
      },
      update: {
        action: input.audit.action,
        principal: input.audit.principal,
        resourceId: input.audit.resourceId || null,
        outcome: input.audit.outcome,
        context: input.audit.context as object,
      },
    });
    return input.audit;
  }

  /** Combined helper: authorize + record. */
  async guard(input: {
    ctx: IAuthContext;
    requiredRoles?: ReadonlyArray<string>;
    traceId: string;
    now: string;
  }): Promise<{ allowed: boolean; error?: IErrorEnvelope; audit: IAuditRecord }> {
    const { allowed, audit } = await this.authorize(input);
    const error = allowed
      ? undefined
      : this.makeError({
          code: input.ctx.principal ? 'forbidden' : 'unauthorized',
          message: input.ctx.principal ? 'forbidden' : 'unauthorized',
          traceId: input.traceId,
        });
    await this.recordAudit({ audit });
    return { allowed, error, audit };
  }

  /** Read back audit records by trace id. */
  async findAuditByTrace(input: { traceId: string }): Promise<IAuditRecord | null> {
    const row = await this.prisma.guardAudit.findUnique({ where: { id: input.traceId } });
    if (!row) return null;
    return rowToAudit(row);
  }

  /** Aggregate stats by action — used by the explorer / health page. */
  async countByAction(input: { action: AuditAction }): Promise<number> {
    return this.prisma.guardAudit.count({ where: { action: input.action } });
  }
}

function rowToAudit(r: Record<string, unknown>): IAuditRecord {
  const occurredAtRaw = r['occurredAt'];
  const occurredAt =
    typeof occurredAtRaw === 'string'
      ? occurredAtRaw
      : new Date(occurredAtRaw as string).toISOString();
  return {
    action: r['action'] as AuditAction,
    principal: String(r['principal']),
    resourceId: String(r['resourceId'] ?? ''),
    outcome: r['outcome'] as 'ok' | 'denied' | 'error',
    traceId: String(r['id']),
    occurredAt,
    context: (r['context'] as Record<string, string>) ?? {},
  };
}