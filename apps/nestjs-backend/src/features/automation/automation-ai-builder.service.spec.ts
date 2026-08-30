import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AutomationAiBuilderService } from './automation-ai-builder.service';

describe('AutomationAiBuilderService', () => {
  it('generates a safe disabled offline draft', async () => {
    const service = new AutomationAiBuilderService({ generateText: vi.fn() } as never);
    const result = await service.generate({
      baseId: 'base-1',
      prompt: 'Send an email when a task is created',
      offline: true,
    });
    expect(result.source).toBe('offline');
    expect(result.draft.enabled).toBe(false);
    expect(result.draft.triggers[0]?.type).toBe('record_created');
    expect(result.draft.actions[0]?.type).toBe('email');
    expect(result.draft.actions[0]!).toMatchObject({ config: { to: '{{trigger.user.email}}' } });
  });

  it('calls the configured AI provider and validates its JSON', async () => {
    const ai = {
      generateText: vi.fn().mockResolvedValue(
        JSON.stringify({
          name: 'Notify',
          description: 'Notify',
          enabled: true,
          triggers: [{ type: 'webhook_received', config: { secret: '{{secrets.HOOK}}' } }],
          actions: [{ type: 'webhook', config: { url: '{{secrets.HOOK_URL}}' } }],
        })
      ),
    };
    const service = new AutomationAiBuilderService(ai as never);
    const result = await service.generate({
      baseId: 'base-1',
      prompt: 'Send webhook',
      modelKey: 'm',
    });
    expect(ai.generateText).toHaveBeenCalledWith(
      'base-1',
      expect.objectContaining({ modelKey: 'm' })
    );
    expect(result.source).toBe('ai');
    expect(result.draft.enabled).toBe(false);
  });

  it('rejects plaintext credentials from the model', async () => {
    const ai = {
      generateText: vi.fn().mockResolvedValue(
        JSON.stringify({
          name: 'Unsafe',
          triggers: [{ type: 'webhook_received', config: {} }],
          actions: [{ type: 'http_request', config: { apiKey: 'plaintext' } }],
        })
      ),
    };
    const service = new AutomationAiBuilderService(ai as never);
    await expect(service.generate({ baseId: 'base-1', prompt: 'Call an API' })).rejects.toThrow(
      BadRequestException
    );
  });

  it('surfaces provider failures as service unavailable', async () => {
    const service = new AutomationAiBuilderService({
      generateText: vi.fn().mockRejectedValue(new Error('missing provider')),
    } as never);
    await expect(
      service.generate({ baseId: 'base-1', prompt: 'Create a workflow' })
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
