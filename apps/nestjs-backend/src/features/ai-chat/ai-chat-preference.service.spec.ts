/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatPreferenceService } from './ai-chat-preference.service';

function buildPrisma(input: {
  settingContent?: string | null;
}) {
  return {
    setting: {
      findUnique: vi.fn(async () =>
        input.settingContent === undefined
          ? null
          : { name: 'aiConfig', content: input.settingContent }
      ),
      upsert: vi.fn(async ({ create, update }: any) => ({
        name: 'aiConfig',
        content: update?.content ?? create?.content ?? '',
      })),
    },
  };
}

describe('AiChatPreferenceService (Stage 43)', () => {
  let svc: AiChatPreferenceService;

  beforeEach(() => {
    svc = new AiChatPreferenceService(buildPrisma({}) as never);
  });

  it('returns empty object when no setting row exists', async () => {
    const out = await svc.get('u1');
    expect(out).toEqual({});
  });

  it('returns the user preferences from aiConfig.chatPreferences', async () => {
    const prisma = buildPrisma({
      settingContent: JSON.stringify({
        chatPreferences: {
          u1: { outputLanguage: 'zh-CN', responseLength: 'concise', tone: 'friendly' },
          u2: { outputLanguage: 'en' },
        },
      }),
    });
    const s = new AiChatPreferenceService(prisma as never);
    const out = await s.get('u1');
    expect(out.outputLanguage).toBe('zh-CN');
    expect(out.responseLength).toBe('concise');
    expect(out.tone).toBe('friendly');
  });

  it('update() upserts merged preferences for the user', async () => {
    const prisma = buildPrisma({
      settingContent: JSON.stringify({ chatPreferences: { u1: { tone: 'friendly' } } }),
    });
    const s = new AiChatPreferenceService(prisma as never);
    const out = await s.update('u1', { outputLanguage: 'en', responseLength: 'detailed' });
    expect(out.tone).toBe('friendly'); // preserved
    expect(out.outputLanguage).toBe('en');
    expect(out.responseLength).toBe('detailed');
  });

  it('update() rejects invalid responseLength / tone silently', async () => {
    const prisma = buildPrisma({});
    const s = new AiChatPreferenceService(prisma as never);
    const out = await s.update('u1', {
      responseLength: 'garbage' as never,
      tone: 'screaming' as never,
      outputLanguage: 'valid',
    });
    expect(out.responseLength).toBeUndefined();
    expect(out.tone).toBeUndefined();
    expect(out.outputLanguage).toBe('valid');
  });

  it('render() builds a prompt fragment from non-default preferences', () => {
    const out = svc.render({
      outputLanguage: 'zh-CN',
      responseLength: 'concise',
      tone: 'friendly',
      disclaimer: true,
    });
    expect(out).toContain('Reply in language "zh-CN"');
    expect(out).toContain('Response length: concise');
    expect(out).toContain('Tone: friendly');
    expect(out).toContain('accuracy disclaimer');
  });

  it('render() omits defaults and returns empty for empty input', () => {
    expect(svc.render({})).toBe('');
    expect(svc.render({ outputLanguage: 'auto', responseLength: 'normal', tone: 'neutral' })).toBe('');
  });

  it('gracefully degrades when JSON parsing fails', async () => {
    const prisma = buildPrisma({ settingContent: 'not-json{{{' });
    const s = new AiChatPreferenceService(prisma as never);
    const out = await s.get('u1');
    expect(out).toEqual({});
  });
});
