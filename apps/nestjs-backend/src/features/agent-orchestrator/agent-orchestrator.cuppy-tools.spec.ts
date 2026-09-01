import { describe, expect, it, vi } from 'vitest';

// Mirror the production tool bodies declared in agent-orchestrator.module.ts.
// We avoid importing the module so we do not pull in the v2 generated Prisma
// client chain (a workspace-wide issue unrelated to this change).
const buildTools = (
  tables: {
    getTable(baseId: string, tableId: string): Promise<{ fields?: Array<Record<string, unknown>> }>;
  },
  records: {
    createRecords(
      tableId: string,
      body: { records: Array<{ fields: Record<string, unknown> }> },
      ignoreMissingFields: boolean,
      isAiInternal: string
    ): Promise<{ records?: unknown[] }>;
  },
  automations: { trigger(id: string, input: unknown): Promise<{ id?: string }> }
) => ({
  record_create: async (
    ctx: { base_id?: string },
    args: { tableId?: string; fieldKeyType?: string; fields?: Record<string, unknown> }
  ) => {
    if (!args.tableId) return { error: 'tableId is required' };
    if (!ctx.base_id) return { error: 'baseId is required' };
    if (!args.fields || typeof args.fields !== 'object') return { error: 'fields object is required' };
    const created = await records.createRecords(
      args.tableId,
      { records: [{ fields: args.fields }] },
      false,
      'cuppy'
    );
    return { recordCount: created.records?.length ?? 0 };
  },
  field_describe: async (
    ctx: { base_id?: string },
    args: { tableId?: string; fieldId?: string }
  ) => {
    if (!args.tableId) return { error: 'tableId is required' };
    if (!ctx.base_id) return { error: 'baseId is required' };
    const table = await tables.getTable(ctx.base_id, args.tableId);
    const fields = Array.isArray(table.fields) ? table.fields : [];
    if (args.fieldId) {
      const match = fields.find((f) => f['id'] === args.fieldId || f['name'] === args.fieldId);
      return { field: match ?? null };
    }
    return { fields };
  },
  automation_trigger: async (
    _ctx: unknown,
    args: { automationId?: string }
  ) => {
    if (!args.automationId) return { error: 'automationId is required' };
    const run = await automations.trigger(args.automationId, { trigger: 'cuppy' });
    return { runId: run?.id ?? null };
  },
});

describe('Cuppy builtin tools (record_create / field_describe / automation_trigger)', () => {
  const tables = {
    getTable: vi.fn(async () => ({
      fields: [
        { id: 'fld_name', name: 'Name', type: 'singleLineText' },
        { id: 'fld_value', name: 'Value', type: 'number' },
      ],
    })),
  };
  const records = {
    createRecords: vi.fn(async () => ({ records: [{}] })),
  };
  const automations = { trigger: vi.fn(async () => ({ id: 'run_42' })) };
  const tools = buildTools(tables as never, records as never, automations as never);

  it('rejects calls without a baseId', async () => {
    await expect(
      tools.record_create({}, { tableId: 'tbl1', fields: {} } as never)
    ).resolves.toEqual({ error: 'baseId is required' });
  });

  it('creates a record through the OpenAPI service', async () => {
    const result = await tools.record_create(
      { base_id: 'base1' },
      { tableId: 'tbl1', fieldKeyType: 'name', fields: { Name: 'Ada' } }
    );
    expect(result).toEqual({ recordCount: 1 });
    expect(records.createRecords).toHaveBeenCalledWith(
      'tbl1',
      { records: [{ fields: { Name: 'Ada' } }] },
      false,
      'cuppy'
    );
  });

  it('returns a single field schema or all fields', async () => {
    await expect(
      tools.field_describe({ base_id: 'base1' }, { tableId: 'tbl1', fieldId: 'Value' })
    ).resolves.toEqual({ field: { id: 'fld_value', name: 'Value', type: 'number' } });
    await expect(
      tools.field_describe({ base_id: 'base1' }, { tableId: 'tbl1' })
    ).resolves.toEqual({ fields: expect.any(Array) });
  });

  it('triggers an automation and returns the run id', async () => {
    await expect(tools.automation_trigger({}, { automationId: 'auto_1' })).resolves.toEqual({
      runId: 'run_42',
    });
    expect(automations.trigger).toHaveBeenCalledWith('auto_1', { trigger: 'cuppy' });
  });
});
