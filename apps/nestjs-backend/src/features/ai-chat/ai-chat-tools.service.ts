/**
 * AI Chat tools service (Stage 48 — Cloud §ai/ai-chat Function Calling).
 *
 * Implements "server-side tool use" so AI Chat can actually answer data
 * questions instead of falling back to "抱歉，我无法访问数据库".
 *
 * Five read-only tools are exposed:
 *   - list_tables(baseId)                          → all tables in a base
 *   - list_fields(baseId, tableName)               → fields of a table (resolves name → id)
 *   - count_records(baseId, tableId)               → total record count
 *   - get_records(baseId, tableId, limit)          → first N records (Markdown table)
 *   - search_records(baseId, tableName, query, limit) → string-match records
 *
 * Each tool returns a Markdown snippet suitable for injection into the
 * chat prompt as an "Available data" block. Errors are logged and return
 * a short Markdown error line so the model can degrade gracefully.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { RecordService } from '../record/record.service';

export const MAX_TOOL_ROWS = 50;
export const MAX_TOOL_CELL_LEN = 120;
export const TOOL_LIST_TABLES = 'list_tables';
export const TOOL_LIST_FIELDS = 'list_fields';
export const TOOL_COUNT_RECORDS = 'count_records';
export const TOOL_GET_RECORDS = 'get_records';
export const TOOL_SEARCH_RECORDS = 'search_records';

export interface IAiChatToolDescriptor {
  name: string;
  description: string;
  parameters: ReadonlyArray<{
    name: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    description: string;
  }>;
}

export const AI_CHAT_TOOLS: ReadonlyArray<IAiChatToolDescriptor> = [
  {
    name: TOOL_LIST_TABLES,
    description: 'List all tables (id + name) inside a Teable base.',
    parameters: [{ name: 'baseId', type: 'string', required: true, description: 'Base id' }],
  },
  {
    name: TOOL_LIST_FIELDS,
    description: 'List all fields of a specific table, given by name.',
    parameters: [
      { name: 'baseId', type: 'string', required: true, description: 'Base id' },
      { name: 'tableName', type: 'string', required: true, description: 'Human table name' },
    ],
  },
  {
    name: TOOL_COUNT_RECORDS,
    description: 'Return the total number of records in a table.',
    parameters: [
      { name: 'baseId', type: 'string', required: true, description: 'Base id' },
      { name: 'tableId', type: 'string', required: true, description: 'Table id' },
    ],
  },
  {
    name: TOOL_GET_RECORDS,
    description: 'Fetch the first N records of a table as a Markdown table.',
    parameters: [
      { name: 'baseId', type: 'string', required: true, description: 'Base id' },
      { name: 'tableId', type: 'string', required: true, description: 'Table id' },
      { name: 'limit', type: 'number', required: false, description: 'Max rows (default 10, max 50)' },
    ],
  },
  {
    name: TOOL_SEARCH_RECORDS,
    description: 'Find records whose text fields contain the given query (case-insensitive).',
    parameters: [
      { name: 'baseId', type: 'string', required: true, description: 'Base id' },
      { name: 'tableName', type: 'string', required: true, description: 'Human table name' },
      { name: 'query', type: 'string', required: true, description: 'Search term' },
      { name: 'limit', type: 'number', required: false, description: 'Max rows (default 10)' },
    ],
  },
];

export interface IAiChatToolResult {
  toolName: string;
  ok: boolean;
  markdown: string;
  rows?: number;
}

@Injectable()
export class AiChatToolsService {
  private readonly logger = new Logger(AiChatToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly recordService?: RecordService
  ) {}

  /** Return all available tool descriptors (for `GET /api/chat/tools`). */
  listTools(): ReadonlyArray<IAiChatToolDescriptor> {
    return AI_CHAT_TOOLS;
  }

  /**
   * Resolve a table id from either an id-like string (`tbl*`) or a
   * human-readable name. Returns `null` when nothing matches.
   */
  async resolveTableId(baseId: string, tableRef: string): Promise<string | null> {
    if (!baseId || !tableRef) return null;
    const trimmed = tableRef.trim();
    if (trimmed.startsWith('tbl')) return trimmed;
    const found = await this.prisma.tableMeta.findFirst({
      where: { baseId, deletedTime: null, name: trimmed },
      select: { id: true },
    });
    return found?.id ?? null;
  }

  /** list_tables */
  async listTables(baseId: string): Promise<IAiChatToolResult> {
    try {
      const tables = await this.prisma.tableMeta.findMany({
        where: { baseId, deletedTime: null },
        orderBy: { order: 'asc' },
        select: { id: true, name: true },
      });
      if (tables.length === 0) {
        return { toolName: TOOL_LIST_TABLES, ok: true, markdown: '_(no tables in this base)_', rows: 0 };
      }
      const lines = tables.map((t) => `- ${t.name} (\`${t.id}\`)`).join('\n');
      return {
        toolName: TOOL_LIST_TABLES,
        ok: true,
        markdown: `**Tables in base ${baseId}:**\n${lines}`,
        rows: tables.length,
      };
    } catch (error) {
      return this.fail(TOOL_LIST_TABLES, error);
    }
  }

  /** list_fields */
  async listFields(baseId: string, tableName: string): Promise<IAiChatToolResult> {
    try {
      const table = await this.prisma.tableMeta.findFirst({
        where: { baseId, deletedTime: null, name: tableName },
        select: {
          id: true,
          name: true,
          fields: {
            where: { deletedTime: null },
            orderBy: { order: 'asc' },
            select: { id: true, name: true, type: true, description: true },
          },
        },
      });
      if (!table) {
        return { toolName: TOOL_LIST_FIELDS, ok: false, markdown: `Table "${tableName}" not found in base ${baseId}.`, rows: 0 };
      }
      if (table.fields.length === 0) {
        return { toolName: TOOL_LIST_FIELDS, ok: true, markdown: `**${tableName}** has no fields.`, rows: 0 };
      }
      const lines = table.fields
        .map((f) => `- ${f.name} _(${f.type}, id=\`${f.id}\`)_${f.description ? ` — ${f.description}` : ''}`)
        .join('\n');
      return {
        toolName: TOOL_LIST_FIELDS,
        ok: true,
        markdown: `**Fields of ${tableName} (\`${table.id}\`):**\n${lines}`,
        rows: table.fields.length,
      };
    } catch (error) {
      return this.fail(TOOL_LIST_FIELDS, error);
    }
  }

  /** count_records */
  async countRecords(baseId: string, tableId: string): Promise<IAiChatToolResult> {
    try {
      const table = await this.prisma.tableMeta.findFirst({
        where: { baseId, deletedTime: null, OR: [{ id: tableId }, { name: tableId }] },
        select: { id: true, name: true, dbTableName: true },
      });
      if (!table) {
        return { toolName: TOOL_COUNT_RECORDS, ok: false, markdown: `Table "${tableId}" not found.`, rows: 0 };
      }
      let count = 0;
      if (this.recordService?.getAllRecordCount) {
        count = await this.recordService.getAllRecordCount(table.dbTableName, table.id);
      } else {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
          `SELECT COUNT(*)::bigint AS count FROM "${table.dbTableName}"`
        );
        count = rows?.[0]?.count ? Number(rows[0].count) : 0;
      }
      return {
        toolName: TOOL_COUNT_RECORDS,
        ok: true,
        markdown: `**${table.name}** has **${count}** records.`,
        rows: count,
      };
    } catch (error) {
      return this.fail(TOOL_COUNT_RECORDS, error);
    }
  }

  /** get_records */
  async getRecords(
    baseId: string,
    tableId: string,
    limit = 10
  ): Promise<IAiChatToolResult> {
    try {
      const resolved = await this.resolveTableId(baseId, tableId);
      if (!resolved) {
        return { toolName: TOOL_GET_RECORDS, ok: false, markdown: `Table "${tableId}" not found.`, rows: 0 };
      }
      if (!this.recordService) {
        return { toolName: TOOL_GET_RECORDS, ok: false, markdown: 'RecordService unavailable.', rows: 0 };
      }
      const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 10), MAX_TOOL_ROWS);
      const tableMeta = await this.prisma.tableMeta.findUnique({
        where: { id: resolved },
        select: {
          name: true,
          fields: {
            where: { deletedTime: null },
            orderBy: { order: 'asc' },
            take: 12,
            select: { id: true, name: true, type: true },
          },
        },
      });
      if (!tableMeta) {
        return { toolName: TOOL_GET_RECORDS, ok: false, markdown: `Table meta not found.`, rows: 0 };
      }
      const projection = tableMeta.fields.map((f) => f.id);
      const records = await this.recordService.getRecordsFields(
        resolved,
        {
          fieldKeyType: 'id' as never,
          projection,
          take: safeLimit,
        } as never,
        false
      );
      const md = recordsToMarkdown(records, tableMeta.fields, tableMeta.name);
      return { toolName: TOOL_GET_RECORDS, ok: true, markdown: md, rows: records.length };
    } catch (error) {
      return this.fail(TOOL_GET_RECORDS, error);
    }
  }

  /** search_records */
  async searchRecords(
    baseId: string,
    tableName: string,
    query: string,
    limit = 10
  ): Promise<IAiChatToolResult> {
    try {
      const q = query.trim();
      if (!q) {
        return { toolName: TOOL_SEARCH_RECORDS, ok: false, markdown: 'Empty query.', rows: 0 };
      }
      const table = await this.prisma.tableMeta.findFirst({
        where: { baseId, deletedTime: null, OR: [{ id: tableName }, { name: tableName }] },
        select: {
          id: true,
          name: true,
          dbTableName: true,
          fields: {
            where: { deletedTime: null },
            orderBy: { order: 'asc' },
            take: 12,
            select: { id: true, name: true, type: true, cellValueType: true, dbFieldName: true },
          },
        },
      });
      if (!table) {
        return { toolName: TOOL_SEARCH_RECORDS, ok: false, markdown: `Table "${tableName}" not found.`, rows: 0 };
      }
      const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 10), MAX_TOOL_ROWS);
      const lowerQ = q.toLowerCase();
      // Pull a candidate window via the RecordService; filter in JS so the
      // search handles multi-byte text + different column types uniformly.
      if (!this.recordService) {
        return { toolName: TOOL_SEARCH_RECORDS, ok: false, markdown: 'RecordService unavailable.', rows: 0 };
      }
      const projection = table.fields.map((f) => f.id);
      const records = await this.recordService.getRecordsFields(
        table.id,
        { fieldKeyType: 'id' as never, projection, take: MAX_TOOL_ROWS } as never,
        false
      );
      const matched = records
        .filter((r) => {
          const fields = r.fields ?? {};
          return Object.values(fields).some((v) => {
            if (v == null) return false;
            if (typeof v === 'string') return v.toLowerCase().includes(lowerQ);
            if (typeof v === 'number' || typeof v === 'boolean') return String(v).toLowerCase().includes(lowerQ);
            return false;
          });
        })
        .slice(0, safeLimit);
      const md = recordsToMarkdown(matched, table.fields, table.name);
      return { toolName: TOOL_SEARCH_RECORDS, ok: true, markdown: md, rows: matched.length };
    } catch (error) {
      return this.fail(TOOL_SEARCH_RECORDS, error);
    }
  }

  /**
   * Dispatcher used by the controller when an external caller wants to
   * invoke a specific tool manually (e.g. for debugging).
   */
  async invoke(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<IAiChatToolResult> {
    const baseId = String(args.baseId ?? '');
    switch (toolName) {
      case TOOL_LIST_TABLES:
        return this.listTables(baseId);
      case TOOL_LIST_FIELDS:
        return this.listFields(baseId, String(args.tableName ?? ''));
      case TOOL_COUNT_RECORDS:
        return this.countRecords(baseId, String(args.tableId ?? ''));
      case TOOL_GET_RECORDS:
        return this.getRecords(baseId, String(args.tableId ?? ''), Number(args.limit ?? 10));
      case TOOL_SEARCH_RECORDS:
        return this.searchRecords(baseId, String(args.tableName ?? ''), String(args.query ?? ''), Number(args.limit ?? 10));
      default:
        return { toolName, ok: false, markdown: `Unknown tool: ${toolName}`, rows: 0 };
    }
  }

  private fail(toolName: string, error: unknown): IAiChatToolResult {
    this.logger.warn(`${toolName} failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      toolName,
      ok: false,
      markdown: `_(tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)})_`,
      rows: 0,
    };
  }
}

function recordsToMarkdown(
  records: ReadonlyArray<{ fields: Record<string, unknown> }>,
  fields: ReadonlyArray<{ id: string; name: string }>,
  tableName: string
): string {
  if (records.length === 0) return `**${tableName}** returned 0 rows.`;
  const headers = fields.map((f) => f.name);
  const lines: string[] = [];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const r of records) {
    const row = fields
      .map((f) => formatCell(r.fields?.[f.id]))
      .map((c) => c.replace(/\|/g, '\\|'))
      .join(' | ');
    lines.push(`| ${row} |`);
  }
  return `**${tableName}** (${records.length} rows):\n\n${lines.join('\n')}`;
}

function rowsToMarkdown(
  rows: ReadonlyArray<Record<string, unknown>>,
  fields: ReadonlyArray<{ id: string; name: string }>,
  tableName: string
): string {
  if (rows.length === 0) return `**${tableName}** has no matches.`;
  const headers = fields.map((f) => f.name);
  const lines: string[] = [];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const r of rows) {
    const row = fields
      .map((f) => formatCell(r[f.id]))
      .map((c) => c.replace(/\|/g, '\\|'))
      .join(' | ');
    lines.push(`| ${row} |`);
  }
  return `**${tableName}** (${rows.length} matches):\n\n${lines.join('\n')}`;
}

function formatCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const s = value.length > MAX_TOOL_CELL_LEN ? value.slice(0, MAX_TOOL_CELL_LEN) + '…' : value;
    return s.replace(/\n/g, ' ');
  }
  if (typeof value === 'object') return JSON.stringify(value).slice(0, MAX_TOOL_CELL_LEN);
  return String(value);
}
