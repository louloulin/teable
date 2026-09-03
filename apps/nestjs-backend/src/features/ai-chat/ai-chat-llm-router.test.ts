/**
 * AI Chat LLM router tests (R60).
 *
 * Covers the three-mode router:
 *   - readFeatureFlag (env parsing)
 *   - decideLlmRoute (legacy / provider / echo)
 *   - buildEchoReply (deterministic, hint gating)
 *   - runLlmRoutedTurn (provider / echo / legacy fallback)
 *
 * Pure-helper tests — no Prisma, no DI container.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FEATURE_FLAG_ENV,
  buildEchoReply,
  decideLlmRoute,
  readFeatureFlag,
  runLlmRoutedTurn,
} from './ai-chat-llm-router';
import type { AiChatLlmService } from './ai-chat-llm.service';

type ResolveProviderConfig = AiChatLlmService['resolveProviderConfig'];
type RunFn = AiChatLlmService['run'];

const originalEnv = process.env[FEATURE_FLAG_ENV];

beforeEach(() => {
  delete process.env[FEATURE_FLAG_ENV];
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env[FEATURE_FLAG_ENV];
  } else {
    process.env[FEATURE_FLAG_ENV] = originalEnv;
  }
});

/* ─── readFeatureFlag ────────────────────────────────────────────── */

describe('readFeatureFlag', () => {
  it('defaults to false when env var is unset', () => {
    expect(readFeatureFlag({})).toBe(false);
  });

  it('returns true for truthy values (1/true/yes/on)', () => {
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: '1' })).toBe(true);
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: 'true' })).toBe(true);
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: 'TRUE' })).toBe(true);
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: 'yes' })).toBe(true);
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: 'on' })).toBe(true);
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: '  On  ' })).toBe(true);
  });

  it('returns false for falsy / unknown values', () => {
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: '0' })).toBe(false);
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: 'false' })).toBe(false);
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: 'off' })).toBe(false);
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: '' })).toBe(false);
    expect(readFeatureFlag({ [FEATURE_FLAG_ENV]: 'maybe' })).toBe(false);
  });
});

/* ─── decideLlmRoute ───────────────────────────────────────────── */

describe('decideLlmRoute', () => {
  const setting = {} as Parameters<ResolveProviderConfig>[0];

  it('returns legacy when feature flag is off', () => {
    const decision = decideLlmRoute(setting, {});
    expect(decision).toEqual({
      mode: 'legacy',
      reason: 'feature flag disabled',
      flagEnabled: false,
    });
  });

  it('returns echo when flag is on but no provider configured', () => {
    const service = {
      resolveProviderConfig: () => null,
    } as unknown as Pick<AiChatLlmService, 'resolveProviderConfig'>;
    const decision = decideLlmRoute(setting, { [FEATURE_FLAG_ENV]: '1' }, service);
    expect(decision.mode).toBe('echo');
    expect(decision.flagEnabled).toBe(true);
    expect(decision.reason).toMatch(/missing/);
  });

  it('returns provider when flag is on and provider is configured', () => {
    const service = {
      resolveProviderConfig: () => ({
        configured: true,
        provider: 'openai',
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-test',
        source: 'env',
      }),
    } as unknown as Pick<AiChatLlmService, 'resolveProviderConfig'>;
    const decision = decideLlmRoute(setting, { [FEATURE_FLAG_ENV]: 'true' }, service);
    expect(decision).toEqual({
      mode: 'provider',
      reason: 'flag enabled + provider configured',
      flagEnabled: true,
    });
  });
});

/* ─── buildEchoReply ───────────────────────────────────────────── */

describe('buildEchoReply', () => {
  it('acknowledges the user message verbatim', () => {
    const seen = new Set<string>();
    const { text, shouldShowUpgradeHint } = buildEchoReply({
      userMessage: 'hello there',
      toolNames: [],
      seenHints: seen,
    });
    expect(text).toContain('hello there');
    expect(shouldShowUpgradeHint).toBe(true);
    expect(seen.size).toBe(1);
  });

  it('only shows the upgrade hint on the first turn per baseId', () => {
    const seen = new Set<string>();
    const first = buildEchoReply({
      userMessage: 'first',
      toolNames: ['list_tables'],
      baseId: 'bse123',
      seenHints: seen,
    });
    const second = buildEchoReply({
      userMessage: 'second',
      toolNames: ['list_tables'],
      baseId: 'bse123',
      seenHints: seen,
    });
    const third = buildEchoReply({
      userMessage: 'third',
      toolNames: ['list_tables'],
      baseId: 'bse_other',
      seenHints: seen,
    });
    expect(first.shouldShowUpgradeHint).toBe(true);
    expect(second.shouldShowUpgradeHint).toBe(false);
    expect(third.shouldShowUpgradeHint).toBe(true);
    expect(first.text).toContain('list_tables');
    expect(second.text).not.toContain('built-in fallback');
    expect(third.text).toContain('built-in fallback');
  });

  it('is deterministic — same inputs produce same text', () => {
    const a = buildEchoReply({
      userMessage: 'ping',
      toolNames: [],
      seenHints: new Set(),
    });
    const b = buildEchoReply({
      userMessage: 'ping',
      toolNames: [],
      seenHints: new Set(),
    });
    expect(a.text).toBe(b.text);
  });

  it('truncates very long user messages', () => {
    const longMessage = 'a'.repeat(500);
    const seen = new Set<string>();
    const { text } = buildEchoReply({
      userMessage: longMessage,
      toolNames: [],
      seenHints: seen,
    });
    expect(text).toContain('…');
    expect(text.length).toBeLessThanOrEqual(1500);
  });
});

/* ─── runLlmRoutedTurn ─────────────────────────────────────────── */

describe('runLlmRoutedTurn', () => {
  const args = {
    messages: [{ role: 'user', content: 'hello' }],
    baseId: 'bse_test',
    systemPrompt: 'You are helpful.',
  } as unknown as Parameters<typeof runLlmRoutedTurn>[0];

  it('returns source=provider when flag is on and provider configured', async () => {
    const expected = {
      text: 'real LLM answer',
      toolCalls: [],
      citations: [],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, chunks: 1 },
      steps: 1,
      finishReason: 'stop',
      provider: 'openai',
      configured: true,
    };
    const llmService = {
      resolveProviderConfig: () => ({
        configured: true,
        provider: 'openai',
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-test',
        source: 'env',
      }),
      toInternalDescriptors: () => [],
      run: (async () => expected) as unknown as RunFn,
    } as unknown as AiChatLlmService;

    const out = await runLlmRoutedTurn(args, {} as never, {
      llmService,
      env: { [FEATURE_FLAG_ENV]: '1' },
    });
    expect(out.source).toBe('provider');
    if (out.source === 'provider') {
      expect(out.result.text).toBe('real LLM answer');
    }
  });

  it('returns source=echo when flag is on but provider missing', async () => {
    const llmService = {
      resolveProviderConfig: () => null,
      toInternalDescriptors: () => [
        { name: 'list_tables', description: 'List tables', parameters: [] },
      ],
      run: (async () => {
        throw new Error('should not be called');
      }) as unknown as RunFn,
    } as unknown as AiChatLlmService;

    const out = await runLlmRoutedTurn(args, {} as never, {
      llmService,
      env: { [FEATURE_FLAG_ENV]: '1' },
    });
    expect(out.source).toBe('echo');
    if (out.source === 'echo') {
      expect(out.result.text).toContain('hello');
      expect(out.result.text).toContain('list_tables');
      expect(out.result.configured).toBe(false);
    }
  });

  it('falls back to empty echo when flag is off (legacy caller)', async () => {
    const llmService = {
      resolveProviderConfig: () => null,
      toInternalDescriptors: () => [],
      run: (async () => {
        throw new Error('should not be called');
      }) as unknown as RunFn,
    } as unknown as AiChatLlmService;

    const out = await runLlmRoutedTurn(args, {} as never, {
      llmService,
      env: {},
    });
    expect(out.source).toBe('echo');
    if (out.source === 'echo') {
      expect(out.result.text).toBe('');
    }
  });
});
