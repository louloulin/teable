import { describe, expect, it, vi } from 'vitest';
import { AutomationActionCatalogAuthService } from '../automation-action-catalog/automation-action-catalog.auth.service';
import { AutomationTriggerCatalogAuthService } from '../automation-trigger-catalog/automation-trigger-catalog.auth.service';
import { AutomationController } from './automation.controller';

describe('AutomationController serialization', () => {
  it('serializes run dates while recursively redacting secrets', async () => {
    const controller = new AutomationController(
      {
        getRun: vi.fn().mockResolvedValue({
          id: 'run-1',
          automationId: 'auto-1',
          triggerType: 'button_clicked',
          status: 'succeeded',
          input: { token: 'secret' },
          output: { steps: [{ output: { apiKey: 'secret' } }] },
          error: null,
          retryCount: 0,
          parentRunId: null,
          version: 1,
          resumeFromStep: null,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          finishedAt: new Date('2026-01-01T00:00:01.000Z'),
          createdTime: new Date('2026-01-01T00:00:00.000Z'),
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never
    );

    const result = await controller.getRun('run-1');
    expect(result).toMatchObject({
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      createdTime: '2026-01-01T00:00:00.000Z',
      input: { token: '••••••••' },
      output: { steps: [{ output: { apiKey: '••••••••' } }] },
    });
  });

  it('exposes the registered action and trigger catalogs for the workflow editor', () => {
    const controller = new AutomationController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new AutomationActionCatalogAuthService({} as never),
      new AutomationTriggerCatalogAuthService({} as never)
    );

    const catalog = controller.getCatalog() as {
      actions: Array<{ type: string }>;
      triggers: Array<{ type: string }>;
      defaultAction: string;
      defaultTrigger: string;
    };

    expect(catalog.defaultAction).toBe('update_record');
    expect(catalog.defaultTrigger).toBe('record_created');
    expect(catalog.actions.map(({ type }) => type)).toContain('call_webhook');
    expect(catalog.actions.map(({ type }) => type)).toContain('send_teams_message');
    expect(catalog.actions.map(({ type }) => type)).toContain('send_feishu_message');
    expect(catalog.actions).toHaveLength(19);
    expect(catalog.triggers.map(({ type }) => type)).toContain('webhook_received');
    expect(catalog.triggers).toHaveLength(9);
  });
});
