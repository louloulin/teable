/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiChatContextService,
  MAX_CONTEXT_ROWS,
} from './ai-chat-context.service';

function buildPrisma(table: any) {
  return {
    tableMeta: {
      findUnique: vi.fn(async () => table ?? null),
    },
  };
}

function buildRecordService(records: Array<{ id: string; fields: Record<string, unknown> }>) {
  return {
    getRecordsFields: vi.fn(async () => records),
  };
}

describe('AiChatContextService (Stage 37)', () => {
  let svc: AiChatContextService;

  beforeEach(() => {
    svc = new AiChatContextService(
      buildPrisma({
        id: 'tblX',
        name: 'Tasks',
        fields: [
          { id: 'fldTitle', name: 'Title', type: 'singleLineText' },
          { id: 'fldStatus', name: 'Status', type: 'singleSelect' },
          { id: 'fldNotes', name: 'Notes', type: 'longText' },
        ],
      }) as never
    );
  });

  it('returns null when tableId is null', async () => {
    const out = await svc.resolve({ tableId: null, viewId: null });
    expect(out).toBeNull();
  });

  it('returns null when the table does not exist', async () => {
    const prisma = buildPrisma(null);
    const empty = new AiChatContextService(prisma as never);
    const out = await empty.resolve({ tableId: 'tblMissing', viewId: null });
    expect(out).toBeNull();
  });

  it('resolves table schema without view rows when viewId is missing', async () => {
    const out = await svc.resolve({ tableId: 'tblX', viewId: null });
    expect(out).not.toBeNull();
    expect(out!.tableName).toBe('Tasks');
    expect(out!.fields.map((f) => f.name)).toEqual(['Title', 'Status', 'Notes']);
    expect(out!.rows).toHaveLength(0);
    expect(out!.rowCount).toBe(0);
  });

  it('includes up to MAX_CONTEXT_ROWS view rows when viewId + RecordService are present', async () => {
    const records = [
      { id: 'rec1', fields: { fldTitle: 'Hello', fldStatus: 'open' } },
      { id: 'rec2', fields: { fldTitle: 'World', fldStatus: 'closed' } },
    ];
    const enriched = new AiChatContextService(
      buildPrisma({
        id: 'tblX',
        name: 'Tasks',
        fields: [
          { id: 'fldTitle', name: 'Title', type: 'singleLineText' },
          { id: 'fldStatus', name: 'Status', type: 'singleSelect' },
        ],
      }) as never,
      buildRecordService(records) as never
    );
    const out = await enriched.resolve({ tableId: 'tblX', viewId: 'viw1' });
    expect(out).not.toBeNull();
    expect(out!.rowCount).toBe(2);
    expect(out!.rows[0]).toEqual({ fldTitle: 'Hello', fldStatus: 'open' });
  });

  it('gracefully degrades when recordService throws', async () => {
    const broken = new AiChatContextService(
      buildPrisma({
        id: 'tblX',
        name: 'Tasks',
        fields: [{ id: 'fldTitle', name: 'Title', type: 'singleLineText' }],
      }) as never,
      {
        getRecordsFields: vi.fn(async () => {
          throw new Error('db down');
        }),
      } as never
    );
    const out = await broken.resolve({ tableId: 'tblX', viewId: 'viw1' });
    expect(out).not.toBeNull();
    expect(out!.rows).toHaveLength(0);
  });

  it('truncates very long cell values before injecting them', async () => {
    const longValue = 'x'.repeat(500);
    const records = [
      { id: 'rec1', fields: { fldTitle: longValue } },
    ];
    const enriched = new AiChatContextService(
      buildPrisma({
        id: 'tblX',
        name: 'Tasks',
        fields: [{ id: 'fldTitle', name: 'Title', type: 'singleLineText' }],
      }) as never,
      buildRecordService(records) as never
    );
    const out = await enriched.resolve({ tableId: 'tblX', viewId: 'viw1' });
    const titleCell = out!.rows[0].fldTitle as string;
    expect(titleCell.length).toBeLessThanOrEqual(200 + 1); // truncated with ellipsis
    expect(titleCell.endsWith('…')).toBe(true);
  });

  it('renders a structured prompt block including table + fields + rows', () => {
    const rendered = svc.render({
      tableId: 'tblX',
      viewId: 'viw1',
      tableName: 'Tasks',
      fields: [
        { id: 'fldTitle', name: 'Title', type: 'singleLineText' },
        { id: 'fldStatus', name: 'Status', type: 'singleSelect' },
      ],
      rows: [{ fldTitle: 'Hello', fldStatus: 'open' }],
      rowCount: 1,
    });
    expect(rendered).toContain('Table: Tasks (tblX)');
    expect(rendered).toContain('Active view: viw1');
    expect(rendered).toContain('- Title (singleLineText, id=fldTitle)');
    expect(rendered).toContain('Sample rows (1, truncated)');
    expect(rendered).toContain('Title="Hello"');
  });

  it('render() returns empty string for null context', () => {
    expect(svc.render(null)).toBe('');
  });

  it('exposes the MAX_CONTEXT_ROWS constant', () => {
    expect(MAX_CONTEXT_ROWS).toBe(20);
  });
});
