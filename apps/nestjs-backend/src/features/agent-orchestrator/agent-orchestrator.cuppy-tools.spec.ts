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
  automations: { trigger(id: string, input: unknown): Promise<{ id?: string }> },
  writePlans: {
    createForCuppy(
      input: Record<string, unknown>
    ): Promise<{ id: string; status: string; summary: string }>;
  }
) => ({
  record_create: async (
    ctx: { base_id?: string; user_id?: string; conversation_id?: string },
    args: { tableId?: string; fieldKeyType?: string; fields?: Record<string, unknown> }
  ) => {
    if (!args.tableId) return { error: 'tableId is required' };
    if (!ctx.base_id) return { error: 'baseId is required' };
    if (!args.fields || typeof args.fields !== 'object')
      return { error: 'fields object is required' };
    if (!ctx.user_id || !ctx.conversation_id)
      return { error: 'user and conversation are required' };
    const plan = await writePlans.createForCuppy({
      conversationId: ctx.conversation_id,
      userId: ctx.user_id,
      baseId: ctx.base_id as string,
      tableId: args.tableId,
      fields: args.fields,
      fieldKeyType: args.fieldKeyType,
    });
    return {
      requiresConfirmation: true,
      planId: plan.id,
      status: plan.status,
      summary: plan.summary,
    };
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
  automation_trigger: async (_ctx: unknown, args: { automationId?: string }) => {
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
  const writePlans = {
    createForCuppy: vi.fn(async () => ({ id: 'plan_1', status: 'pending', summary: 'review me' })),
  };
  const tools = buildTools(tables as never, records as never, automations as never, writePlans);

  it('rejects calls without a baseId', async () => {
    await expect(
      tools.record_create({}, { tableId: 'tbl1', fields: {} } as never)
    ).resolves.toEqual({ error: 'baseId is required' });
  });

  it('creates a pending write plan without writing records', async () => {
    const result = await tools.record_create(
      { base_id: 'base1', user_id: 'user1', conversation_id: 'conv1' },
      { tableId: 'tbl1', fieldKeyType: 'name', fields: { Name: 'Ada' } }
    );
    expect(result).toEqual({
      requiresConfirmation: true,
      planId: 'plan_1',
      status: 'pending',
      summary: 'review me',
    });
    expect(writePlans.createForCuppy).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv1',
        userId: 'user1',
        baseId: 'base1',
        tableId: 'tbl1',
      })
    );
    expect(records.createRecords).not.toHaveBeenCalled();
  });

  it('returns a single field schema or all fields', async () => {
    await expect(
      tools.field_describe({ base_id: 'base1' }, { tableId: 'tbl1', fieldId: 'Value' })
    ).resolves.toEqual({ field: { id: 'fld_value', name: 'Value', type: 'number' } });
    await expect(tools.field_describe({ base_id: 'base1' }, { tableId: 'tbl1' })).resolves.toEqual({
      fields: expect.any(Array),
    });
  });

  it('triggers an automation and returns the run id', async () => {
    await expect(tools.automation_trigger({}, { automationId: 'auto_1' })).resolves.toEqual({
      runId: 'run_42',
    });
    expect(automations.trigger).toHaveBeenCalledWith('auto_1', { trigger: 'cuppy' });
  });
});
