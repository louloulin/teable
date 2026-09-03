/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiChatToolsService,
  TOOL_COUNT_RECORDS,
  TOOL_GET_RECORDS,
  TOOL_LIST_FIELDS,
  TOOL_LIST_TABLES,
  TOOL_SEARCH_RECORDS,
} from './ai-chat-tools.service';

function buildPrisma() {
  const now = new Date();
  return {
    tableMeta: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
    },
    $queryRawUnsafe: vi.fn(async () => []),
  };
}

describe('AiChatToolsService (Stage 48)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let svc: AiChatToolsService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AiChatToolsService(prisma as never);
  });

  it('listTables returns a Markdown bullet list of tables', async () => {
    prisma.tableMeta.findMany.mockResolvedValueOnce([
      { id: 'tbl1', name: 'Tasks' },
      { id: 'tbl2', name: 'Users' },
    ] as never);
    const out = await svc.listTables('b1');
    expect(out.ok).toBe(true);
    expect(out.rows).toBe(2);
    expect(out.markdown).toContain('Tasks');
    expect(out.markdown).toContain('tbl1');
  });

  it('listTables returns empty marker when base has no tables', async () => {
    prisma.tableMeta.findMany.mockResolvedValueOnce([] as never);
    const out = await svc.listTables('b1');
    expect(out.ok).toBe(true);
    expect(out.rows).toBe(0);
    expect(out.markdown).toContain('no tables');
  });

  it('listFields resolves a table by name and lists fields', async () => {
    prisma.tableMeta.findFirst.mockResolvedValueOnce({
      id: 'tbl1',
      name: 'Tasks',
      fields: [
        { id: 'fld1', name: 'Title', type: 'singleLineText', description: 'Title' },
        { id: 'fld2', name: 'Status', type: 'singleSelect', description: null },
      ],
    } as never);
    const out = await svc.listFields('b1', 'Tasks');
    expect(out.ok).toBe(true);
    expect(out.rows).toBe(2);
    expect(out.markdown).toContain('Title');
    expect(out.markdown).toContain('Status');
    expect(out.markdown).toContain('tbl1');
  });

  it('listFields returns "not found" when the table name does not exist', async () => {
    prisma.tableMeta.findFirst.mockResolvedValueOnce(null);
    const out = await svc.listFields('b1', 'Missing');
    expect(out.ok).toBe(false);
    expect(out.markdown).toContain('not found');
  });

  it('countRecords resolves table by id and calls recordService.getAllRecordCount', async () => {
    prisma.tableMeta.findFirst.mockResolvedValueOnce({
      id: 'tbl1',
      name: 'Tasks',
      dbTableName: 'tasks_physical',
    } as never);
    const recordService = { getAllRecordCount: vi.fn(async () => 42) } as never;
    const svcWithRecord = new AiChatToolsService(prisma as never, recordService);
    const out = await svcWithRecord.countRecords('b1', 'tbl1');
    expect(out.ok).toBe(true);
    expect(out.rows).toBe(42);
    expect(out.markdown).toContain('**42**');
    expect(recordService.getAllRecordCount).toHaveBeenCalledWith('tasks_physical', 'tbl1');
  });

  it('countRecords falls back to raw COUNT(*) when recordService is absent', async () => {
    prisma.tableMeta.findFirst.mockResolvedValueOnce({
      id: 'tbl1',
      name: 'Tasks',
      dbTableName: 'tasks_physical',
    } as never);
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 17n }] as never);
    const out = await svc.countRecords('b1', 'tbl1');
    expect(out.ok).toBe(true);
    expect(out.rows).toBe(17);
    expect(out.markdown).toContain('**17**');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('COUNT(*)')
    );
  });

  it('countRecords returns "not found" when tableId is unresolved', async () => {
    prisma.tableMeta.findFirst.mockResolvedValueOnce(null);
    const out = await svc.countRecords('b1', 'unknown');
    expect(out.ok).toBe(false);
    expect(out.markdown).toContain('not found');
  });

  it('searchRecords with empty query returns early', async () => {
    const out = await svc.searchRecords('b1', 'Tasks', '   ', 5);
    expect(out.ok).toBe(false);
    expect(out.markdown).toContain('Empty query');
  });

  it('searchRecords still works on numeric/boolean values (matches via String coercion)', async () => {
    prisma.tableMeta.findFirst.mockResolvedValueOnce({
      id: 'tbl1',
      name: 'Tasks',
      dbTableName: 'tasks_physical',
      fields: [
        { id: 'fld1', name: 'Count', type: 'number', cellValueType: 'number', dbFieldName: 'count' },
      ],
    } as never);
    const recordService = {
      getRecordsFields: vi.fn(async () => [
        { id: 'rec1', fields: { fld1: 42 } },
        { id: 'rec2', fields: { fld1: 7 } },
      ]),
    } as never;
    const svcWithRecord = new AiChatToolsService(prisma as never, recordService);
    const out = await svcWithRecord.searchRecords('b1', 'Tasks', '42', 5);
    expect(out.ok).toBe(true);
    expect(out.rows).toBe(1);
    expect(out.markdown).toContain('Count');
  });

  it('searchRecords pulls records via recordService and filters in JS', async () => {
    prisma.tableMeta.findFirst.mockResolvedValueOnce({
      id: 'tbl1',
      name: 'Tasks',
      dbTableName: 'tasks_physical',
      fields: [
        { id: 'fld1', name: 'Title', type: 'singleLineText', cellValueType: 'string', dbFieldName: 'title' },
      ],
    } as never);
    const recordService = {
      getRecordsFields: vi.fn(async () => [
        { id: 'rec1', fields: { fld1: 'Urgent task' } },
        { id: 'rec2', fields: { fld1: 'Routine work' } },
        { id: 'rec3', fields: { fld1: 'Another URGENT item' } },
      ]),
    } as never;
    const svcWithRecord = new AiChatToolsService(prisma as never, recordService);
    const out = await svcWithRecord.searchRecords('b1', 'Tasks', 'urgent', 5);
    expect(out.ok).toBe(true);
    expect(out.rows).toBe(2);
    expect(out.markdown).toContain('Urgent task');
    expect(out.markdown).toContain('URGENT item');
    expect(recordService.getRecordsFields).toHaveBeenCalledWith(
      'tbl1',
      expect.objectContaining({ take: expect.any(Number) }),
      false
    );
  });

  it('invoke dispatches by tool name and returns results', async () => {
    prisma.tableMeta.findMany.mockResolvedValueOnce([{ id: 'tbl1', name: 'Tasks' }] as never);
    const out = await svc.invoke(TOOL_LIST_TABLES, { baseId: 'b1' });
    expect(out.toolName).toBe(TOOL_LIST_TABLES);
    expect(out.ok).toBe(true);

    const fields = await svc.invoke(TOOL_LIST_FIELDS, { baseId: 'b1', tableName: 'Tasks' });
    expect(fields.toolName).toBe(TOOL_LIST_FIELDS);

    const count = await svc.invoke(TOOL_COUNT_RECORDS, { baseId: 'b1', tableId: 'tbl1' });
    expect(count.toolName).toBe(TOOL_COUNT_RECORDS);

    const records = await svc.invoke(TOOL_GET_RECORDS, { baseId: 'b1', tableId: 'tbl1', limit: 5 });
    expect(records.toolName).toBe(TOOL_GET_RECORDS);

    const search = await svc.invoke(TOOL_SEARCH_RECORDS, { baseId: 'b1', tableName: 'Tasks', query: 'foo', limit: 5 });
    expect(search.toolName).toBe(TOOL_SEARCH_RECORDS);
  });

  it('invoke returns "Unknown tool" for unregistered tool names', async () => {
    const out = await svc.invoke('not_a_tool', { baseId: 'b1' });
    expect(out.ok).toBe(false);
    expect(out.markdown).toContain('Unknown tool');
  });

  it('listTools returns 5 descriptors with names and required params', () => {
    const tools = svc.listTools();
    expect(tools.length).toBe(5);
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        TOOL_LIST_TABLES,
        TOOL_LIST_FIELDS,
        TOOL_COUNT_RECORDS,
        TOOL_GET_RECORDS,
        TOOL_SEARCH_RECORDS,
      ])
    );
    const getRecs = tools.find((t) => t.name === TOOL_GET_RECORDS)!;
    expect(getRecs.parameters.some((p) => p.name === 'limit' && !p.required)).toBe(true);
  });
});
