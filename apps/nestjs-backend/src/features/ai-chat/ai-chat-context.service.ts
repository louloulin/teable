/**
 * AI Chat context resolver (Stage 37 — Cloud §ai/ai-chat).
 *
 * Given a chat session that carries `tableId` / `viewId`, this service
 * resolves the live table metadata (id, name, fields with name+type) and
 * (optionally) a sample of up to 20 view rows. The output is a structured
 * context block that the chat service injects as a system-prompt prefix
 * so the assistant can reference the user's current page.
 *
 * Errors during resolution are swallowed and logged: chat sessions must
 * degrade gracefully (reply without context) rather than fail outright
 * if a table was renamed or deleted mid-conversation.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { RecordService } from '../record/record.service';

export interface IAiChatContext {
  tableId: string;
  viewId: string | null;
  tableName: string;
  fields: ReadonlyArray<{ id: string; name: string; type: string }>;
  rows: ReadonlyArray<Record<string, unknown>>;
  rowCount: number;
}

export const MAX_CONTEXT_ROWS = 20;
export const MAX_CONTEXT_FIELD_VALUE_LENGTH = 200;

@Injectable()
export class AiChatContextService {
  private readonly logger = new Logger(AiChatContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly recordService?: RecordService
  ) {}

  /**
   * Resolve a context block for the given session. Returns `null` when no
   * `tableId` is set so the chat service can skip prompt injection.
   */
  async resolve(input: {
    tableId: string | null;
    viewId: string | null;
  }): Promise<IAiChatContext | null> {
    if (!input.tableId) return null;
    try {
      const table = await this.prisma.tableMeta.findUnique({
        where: { id: input.tableId },
        select: {
          id: true,
          name: true,
          fields: {
            where: { deletedTime: null },
            orderBy: { order: 'asc' },
            select: { id: true, name: true, type: true },
          },
        },
      });
      if (!table) {
        this.logger.warn(`resolve: table ${input.tableId} not found`);
        return null;
      }
      const ctx: IAiChatContext = {
        tableId: table.id,
        viewId: input.viewId,
        tableName: table.name,
        fields: table.fields ?? [],
        rows: [],
        rowCount: 0,
      };
      if (input.viewId && this.recordService) {
        try {
          const projection = table.fields.slice(0, 12).map((f) => f.id);
          const records = await this.recordService.getRecordsFields(
            input.tableId,
            {
              viewId: input.viewId,
              fieldKeyType: 'id' as never,
              projection,
              take: MAX_CONTEXT_ROWS,
            } as never,
            false
          );
          ctx.rows = records.map((r) => trimRowValues(r.fields));
          ctx.rowCount = ctx.rows.length;
        } catch (error) {
          this.logger.warn(
            `resolve: failed to fetch view rows for view=${input.viewId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      return ctx;
    } catch (error) {
      this.logger.warn(
        `resolve: table lookup failed for ${input.tableId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * Render a context block as a single string suitable for injection at
   * the top of the chat prompt. Returns `''` when `ctx` is `null`.
   */
  render(ctx: IAiChatContext | null): string {
    if (!ctx) return '';
    const lines: string[] = [];
    lines.push(`Table: ${ctx.tableName} (${ctx.tableId})`);
    if (ctx.viewId) {
      lines.push(`Active view: ${ctx.viewId}`);
    }
    if (ctx.fields.length > 0) {
      lines.push('Fields:');
      for (const field of ctx.fields) {
        lines.push(`  - ${field.name} (${field.type}, id=${field.id})`);
      }
    }
    if (ctx.rows.length > 0) {
      lines.push(`Sample rows (${ctx.rowCount}, truncated):`);
      for (const [idx, row] of ctx.rows.entries()) {
        const parts: string[] = [];
        for (const [key, value] of Object.entries(row)) {
          const fieldName = ctx.fields.find((f) => f.id === key)?.name ?? key;
          parts.push(`${fieldName}=${formatValue(value)}`);
        }
        lines.push(`  ${idx + 1}. ${parts.join(', ')}`);
      }
    }
    return lines.join('\n');
  }
}

function trimRowValues(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    out[key] = truncateValue(value);
  }
  return out;
}

function truncateValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > MAX_CONTEXT_FIELD_VALUE_LENGTH
      ? value.slice(0, MAX_CONTEXT_FIELD_VALUE_LENGTH) + '…'
      : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 5).map(truncateValue);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).slice(0, MAX_CONTEXT_FIELD_VALUE_LENGTH);
    } catch {
      return '[unserializable]';
    }
  }
  return value;
}

function formatValue(value: unknown): string {
  if (value == null) return '∅';
  if (typeof value === 'string') {
    const trimmed = value.length > 40 ? value.slice(0, 40) + '…' : value;
    return `"${trimmed}"`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).slice(0, 60);
    } catch {
      return '[obj]';
    }
  }
  return String(value);
}
