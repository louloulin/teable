import { Response } from 'node-fetch';
import { Events } from '../../event-emitter/events';
import { AutomationEventListener } from './automation-event.listener';

vi.mock('../../utils/ssrf-http', () => ({ safeFetch: vi.fn() }));
const safeFetchMock = vi.mocked(await import('../../utils/ssrf-http')).safeFetch;

describe('AutomationEventListener', () => {
  it('exposes only configured action env through process.env and redacts outputs', async () => {
    const automation = {
      triggerRecordEvent: vi.fn().mockResolvedValue([
        {
          run: { id: 'run-script' },
          actions: [
            {
              type: 'run_script',
              orderIndex: 0,
              config: { script: 'return process.env.API_KEY;', env: { API_KEY: 'secret-value' } },
            },
          ],
        },
      ]),
      resolveSecretsForRun: vi.fn().mockResolvedValue({ API_KEY: 'secret-value' }),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const listener = new AutomationEventListener(
      automation as never,
      { dispatch: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
      { updateRecord: vi.fn() } as never,
      { sendMail: vi.fn() } as never
    );

    await listener.handle({
      name: Events.TABLE_RECORD_CREATE,
      payload: { tableId: 'tbl-script', record: { id: 'rec-script', fields: {} } },
      context: {},
    } as never);

    expect(automation.finishRun).toHaveBeenCalledWith(
      'run-script',
      expect.objectContaining({
        status: 'succeeded',
        output: expect.objectContaining({
          steps: expect.arrayContaining([expect.objectContaining({ output: '[REDACTED]' })]),
        }),
      })
    );
  });

  it('executes webhook actions for a record-created event and completes the run', async () => {
    const automation = {
      triggerRecordEvent: vi.fn().mockResolvedValue([
        {
          run: { id: 'run-1' },
          actions: [{ type: 'webhook', orderIndex: 0, config: { url: 'https://example.com' } }],
        },
      ]),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const webhook = { dispatch: vi.fn().mockResolvedValue({ delivered: true, status: 200 }) };
    const imBridge = { dispatch: vi.fn() };
    const recordOpenApi = { updateRecord: vi.fn() };
    const mailSender = { sendMail: vi.fn() };
    const listener = new AutomationEventListener(
      automation as never,
      webhook as never,
      imBridge as never,
      recordOpenApi as never,
      mailSender as never
    );

    await listener.handle({
      name: Events.TABLE_RECORD_CREATE,
      payload: { tableId: 'tbl-1', record: { id: 'rec-1', fields: {} } },
      context: { user: { id: 'usr-1', name: 'Alice', email: 'alice@example.com' } },
    } as never);

    expect(automation.triggerRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 'tbl-1', triggerType: 'record_created' })
    );
    expect(webhook.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', payload: expect.any(Object) })
    );
    expect(automation.finishRun).toHaveBeenCalledWith('run-1', { status: 'running' });
    expect(automation.finishRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'succeeded' })
    );
    expect(imBridge.dispatch).not.toHaveBeenCalled();
  });

  it('executes IM actions and stops after a failed action', async () => {
    const automation = {
      triggerRecordEvent: vi.fn().mockResolvedValue([
        {
          run: { id: 'run-2' },
          actions: [
            { type: 'teams', orderIndex: 0, config: { organizationId: 'org-1', text: 'hello' } },
            { type: 'webhook', orderIndex: 1, config: { url: 'https://should-not-run.example' } },
          ],
        },
      ]),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const webhook = { dispatch: vi.fn() };
    const imBridge = { dispatch: vi.fn().mockResolvedValue({ delivered: false }) };
    const recordOpenApi = { updateRecord: vi.fn() };
    const mailSender = { sendMail: vi.fn() };
    const listener = new AutomationEventListener(
      automation as never,
      webhook as never,
      imBridge as never,
      recordOpenApi as never,
      mailSender as never
    );

    await listener.handle({
      name: Events.TABLE_RECORD_UPDATE,
      payload: { tableId: 'tbl-2', record: { id: 'rec-2', fields: {} }, oldField: undefined },
      context: {},
    } as never);

    expect(imBridge.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-2', provider: 'teams' })
    );
    expect(webhook.dispatch).not.toHaveBeenCalled();
    expect(automation.finishRun).not.toHaveBeenCalledWith(
      'run-2',
      expect.objectContaining({ status: 'succeeded' })
    );
  });

  it('updates the triggered record with an update_record action', async () => {
    const automation = {
      triggerRecordEvent: vi.fn().mockResolvedValue([
        {
          run: { id: 'run-3' },
          actions: [
            {
              type: 'update_record',
              orderIndex: 0,
              config: { fields: { fldStatus: 'Done' } },
            },
          ],
        },
      ]),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const recordOpenApi = { updateRecord: vi.fn().mockResolvedValue({}) };
    const listener = new AutomationEventListener(
      automation as never,
      { dispatch: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
      recordOpenApi as never,
      { sendMail: vi.fn() } as never
    );

    await listener.handle({
      name: Events.TABLE_RECORD_CREATE,
      payload: { tableId: 'tbl-3', record: { id: 'rec-3', fields: {} } },
      context: {},
    } as never);

    expect(recordOpenApi.updateRecord).toHaveBeenCalledWith(
      'tbl-3',
      'rec-3',
      expect.objectContaining({ record: { fields: { fldStatus: 'Done' } } })
    );
    expect(automation.finishRun).toHaveBeenCalledWith(
      'run-3',
      expect.objectContaining({ status: 'succeeded' })
    );
  });

  it('sends an email action and fails the run when delivery fails', async () => {
    const automation = {
      triggerRecordEvent: vi.fn().mockResolvedValue([
        {
          run: { id: 'run-4' },
          actions: [
            {
              type: 'email',
              orderIndex: 0,
              config: { to: 'ops@example.com', subject: 'Automation alert', text: 'payload' },
            },
          ],
        },
      ]),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const mailSender = { sendMail: vi.fn().mockResolvedValue(false) };
    const listener = new AutomationEventListener(
      automation as never,
      { dispatch: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
      { updateRecord: vi.fn() } as never,
      mailSender as never
    );

    await listener.handle({
      name: Events.TABLE_RECORD_CREATE,
      payload: { tableId: 'tbl-4', record: { id: 'rec-4', fields: {} } },
      context: {},
    } as never);

    expect(mailSender.sendMail).toHaveBeenCalledWith({
      to: 'ops@example.com',
      subject: 'Automation alert',
      text: 'payload',
      html: undefined,
    });
    expect(automation.finishRun).toHaveBeenCalledWith('run-4', {
      status: 'failed',
      error: 'email delivery failed',
    });
  });

  it('executes create, get and HTTP actions', async () => {
    const automation = {
      triggerRecordEvent: vi.fn().mockResolvedValue([
        {
          run: { id: 'run-5' },
          actions: [
            {
              type: 'create_record',
              orderIndex: 0,
              config: { tableId: 'tbl-5', fields: { Name: 'New' } },
            },
            {
              type: 'get_records',
              orderIndex: 1,
              config: { tableId: 'tbl-5', query: { take: 1 } },
            },
            { type: 'http_request', orderIndex: 2, config: { url: 'https://example.com/hook' } },
          ],
        },
      ]),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const recordOpenApi = {
      createRecords: vi.fn().mockResolvedValue({ records: [] }),
      getRecords: vi.fn().mockResolvedValue({ records: [], extra: {} }),
    };
    safeFetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const listener = new AutomationEventListener(
      automation as never,
      { dispatch: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
      recordOpenApi as never,
      { sendMail: vi.fn() } as never
    );

    await listener.handle({
      name: Events.TABLE_RECORD_CREATE,
      payload: { tableId: 'tbl-5', record: { id: 'rec-5', fields: {} } },
      context: {},
    } as never);

    expect(recordOpenApi.createRecords).toHaveBeenCalledOnce();
    expect(recordOpenApi.getRecords).toHaveBeenCalledOnce();
    expect(safeFetchMock).toHaveBeenCalledOnce();
    expect(automation.finishRun).toHaveBeenCalledWith(
      'run-5',
      expect.objectContaining({ status: 'succeeded' })
    );
    safeFetchMock.mockReset();
  });

  it('dispatches schedule and webhook triggers directly', async () => {
    const automation = {
      triggerWithActions: vi
        .fn()
        .mockResolvedValue({ run: { id: 'run-6', status: 'pending' }, actions: [] }),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const listener = new AutomationEventListener(
      automation as never,
      { dispatch: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
      { updateRecord: vi.fn() } as never,
      { sendMail: vi.fn() } as never
    );

    await listener.dispatchTrigger('auto-6', 'schedule', { scheduledAt: 'now' });
    await listener.dispatchTrigger('auto-6', 'webhook_received', { value: 1 });
    expect(automation.triggerWithActions).toHaveBeenCalledTimes(2);
    expect(automation.finishRun).toHaveBeenCalledWith(
      'run-6',
      expect.objectContaining({ status: 'succeeded' })
    );
  });

  it('executes only the matching conditional branch and records the branch result', async () => {
    const automation = {
      triggerRecordEvent: vi.fn().mockResolvedValue([
        {
          run: { id: 'run-condition' },
          actions: [
            {
              type: 'conditional_logic',
              orderIndex: 0,
              config: {
                mode: 'all',
                conditions: [{ fieldId: 'status', operator: 'equals', value: 'approved' }],
                ifTrue: [{ type: 'run_script', config: { script: 'return "approved";' } }],
                ifFalse: [{ type: 'run_script', config: { script: 'return "rejected";' } }],
              },
            },
          ],
        },
      ]),
      resolveSecretsForRun: vi.fn().mockResolvedValue({}),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const listener = new AutomationEventListener(
      automation as never,
      { dispatch: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
      { updateRecord: vi.fn() } as never,
      { sendMail: vi.fn() } as never
    );

    await listener.handle({
      name: Events.TABLE_RECORD_CREATE,
      payload: { tableId: 'tbl-condition', record: { fields: { status: 'approved' } } },
      context: {},
    } as never);

    expect(automation.finishRun).toHaveBeenCalledWith(
      'run-condition',
      expect.objectContaining({
        status: 'succeeded',
        output: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({
              actionType: 'conditional_logic',
              output: expect.objectContaining({ branch: 'true', matched: true }),
            }),
          ]),
        }),
      })
    );
  });

  it('supports nested condition groups with OR and NOT semantics', async () => {
    const automation = {
      triggerRecordEvent: vi.fn().mockResolvedValue([
        {
          run: { id: 'run-nested-condition' },
          actions: [
            {
              type: 'conditional_logic',
              orderIndex: 0,
              config: {
                condition: {
                  operator: 'not',
                  groups: [
                    {
                      mode: 'any',
                      conditions: [{ fieldId: 'priority', operator: 'equals', value: 'low' }],
                    },
                  ],
                },
                ifTrue: [{ type: 'run_script', config: { script: 'return "high";' } }],
              },
            },
          ],
        },
      ]),
      resolveSecretsForRun: vi.fn().mockResolvedValue({}),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const listener = new AutomationEventListener(
      automation as never,
      { dispatch: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
      { updateRecord: vi.fn() } as never,
      { sendMail: vi.fn() } as never
    );

    await listener.handle({
      name: Events.TABLE_RECORD_CREATE,
      payload: { tableId: 'tbl-nested-condition', record: { fields: { priority: 'high' } } },
      context: {},
    } as never);

    expect(automation.finishRun).toHaveBeenCalledWith(
      'run-nested-condition',
      expect.objectContaining({ status: 'succeeded' })
    );
  });

  it('generates text with the configured AI model and interpolated payload values', async () => {
    const automation = {
      triggerRecordEvent: vi.fn().mockResolvedValue([
        {
          run: { id: 'run-ai-generate' },
          actions: [
            {
              type: 'ai_generate',
              orderIndex: 0,
              config: {
                prompt: 'Summarize {{record.fields.title}}',
                modelKey: 'openai@gpt-4o@teable',
              },
            },
          ],
        },
      ]),
      getBaseIdForRun: vi.fn().mockResolvedValue('base-ai'),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const aiService = { generateText: vi.fn().mockResolvedValue('generated summary') };
    const listener = new AutomationEventListener(
      automation as never,
      { dispatch: vi.fn() } as never,
      { dispatch: vi.fn() } as never,
      { updateRecord: vi.fn() } as never,
      { sendMail: vi.fn() } as never,
      undefined,
      aiService as never
    );

    await listener.handle({
      name: Events.TABLE_RECORD_CREATE,
      payload: { tableId: 'tbl-ai', record: { fields: { title: 'Quarterly report' } } },
      context: {},
    } as never);

    expect(aiService.generateText).toHaveBeenCalledWith('base-ai', {
      prompt: 'Summarize Quarterly report',
      modelKey: 'openai@gpt-4o@teable',
    });
    expect(automation.finishRun).toHaveBeenCalledWith(
      'run-ai-generate',
      expect.objectContaining({ status: 'succeeded' })
    );
  });

  it('executes catalog action aliases instead of treating them as unsupported', async () => {
    const automation = {
      triggerRecordEvent: vi.fn().mockResolvedValue([
        {
          run: { id: 'run-catalog-aliases' },
          actions: [
            {
              type: 'send_email',
              orderIndex: 0,
              config: { to: 'a@example.com', subject: 'Hi', body: 'Body' },
            },
            {
              type: 'call_webhook',
              orderIndex: 1,
              config: { url: 'https://example.com', payload: { ok: true } },
            },
            {
              type: 'notify_user',
              orderIndex: 2,
              config: { userId: 'usr-1', message: 'Done' },
            },
            {
              type: 'ai_prompt',
              orderIndex: 3,
              config: { model: 'gpt-4o-mini', prompt: 'Summarize' },
            },
            {
              type: 'send_teams_message',
              orderIndex: 4,
              config: { webhookUrl: 'https://webhook.office.com/x', text: 'Done' },
            },
          ],
        },
      ]),
      getBaseIdForRun: vi.fn().mockResolvedValue('base-catalog'),
      finishRun: vi.fn().mockResolvedValue({}),
    };
    const webhook = { dispatch: vi.fn().mockResolvedValue({ delivered: true, status: 200 }) };
    const mailSender = { sendMail: vi.fn().mockResolvedValue(true) };
    const notificationService = { sendCommonNotify: vi.fn().mockResolvedValue({ sentCount: 1 }) };
    const aiService = { generateText: vi.fn().mockResolvedValue('summary') };
    const teamsAdapter = {
      sendMessage: vi.fn().mockResolvedValue({ delivered: true, status: 200 }),
    };
    const listener = new AutomationEventListener(
      automation as never,
      webhook as never,
      { dispatch: vi.fn() } as never,
      { updateRecord: vi.fn() } as never,
      mailSender as never,
      undefined,
      aiService as never,
      notificationService as never,
      teamsAdapter as never
    );

    await listener.handle({
      name: Events.TABLE_RECORD_CREATE,
      payload: { tableId: 'tbl-catalog', record: { fields: {} } },
      context: {},
    } as never);

    expect(mailSender.sendMail).toHaveBeenCalled();
    expect(webhook.dispatch).toHaveBeenCalled();
    expect(notificationService.sendCommonNotify).toHaveBeenCalled();
    expect(aiService.generateText).toHaveBeenCalled();
    expect(teamsAdapter.sendMessage).toHaveBeenCalled();
    expect(automation.finishRun).toHaveBeenCalledWith(
      'run-catalog-aliases',
      expect.objectContaining({ status: 'succeeded' })
    );
  });
});
