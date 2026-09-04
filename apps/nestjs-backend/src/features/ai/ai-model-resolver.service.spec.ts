/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-MODEL: capability × provider matrix test.
 *
 * Acceptance criterion from the V81 roadmap:
 *   "verify-enterprise.sh 新增 gate：4 capability × 3 provider = 12 个组合全 pass"
 *
 * 12 cases: {chat,field,automation,app_builder} × {openai,anthropic,MiniMax}
 */
import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_RESOLVER_MATRIX,
  AiModelResolverService,
  type AiCapability,
  type AiProviderId,
} from './ai-model-resolver.service';

const CAPABILITIES: AiCapability[] = ['chat', 'field', 'automation', 'app_builder'];
const PROVIDERS: AiProviderId[] = ['openai', 'anthropic', 'MiniMax'];

describe('AiModelResolverService (R-AI-MODEL)', () => {
  const svc = new AiModelResolverService();

  describe('taxonomy guards', () => {
    it('lists exactly 4 capabilities', () => {
      expect([...svc.listCapabilities()]).toEqual(CAPABILITIES);
    });
    it('lists exactly 3 providers', () => {
      expect([...svc.listProviders()]).toEqual(PROVIDERS);
    });
    it('isCapability + isProvider validate the unions', () => {
      expect(svc.isCapability('chat')).toBe(true);
      expect(svc.isCapability('summarize')).toBe(false);
      expect(svc.isProvider('openai')).toBe(true);
      expect(svc.isProvider('cohere')).toBe(false);
    });
  });

  describe('matrix: 4 capabilities × 3 providers = 12 cases', () => {
    for (const capability of CAPABILITIES) {
      for (const provider of PROVIDERS) {
        const tag = `${capability}/${provider}`;
        it(`resolves ${tag} from the matrix`, () => {
          const r = svc.resolve({ capability, provider });
          expect(r.source).toBe('matrix');
          expect(r.config.provider).toBe(provider);
          expect(r.config.model).toBe(AI_MODEL_RESOLVER_MATRIX[capability][provider]);
          expect(r.config.baseUrl).toMatch(/^https:\/\//);
          expect(r.config.contextWindow).toBeGreaterThan(0);
        });

        it(`legacy model string for ${tag} contains all 3 parts`, () => {
          const legacy = svc.formatLegacyModelString({ capability, provider });
          expect(legacy.split('@')).toHaveLength(3);
          expect(legacy.startsWith(`${provider}@`)).toBe(true);
          expect(legacy.endsWith('@teable')).toBe(true);
        });
      }
    }

    it('has exactly 12 (capability × provider) matrix entries', () => {
      let count = 0;
      for (const cap of CAPABILITIES) {
        for (const prov of PROVIDERS) {
          // touch every entry to make sure none is undefined
          expect(AI_MODEL_RESOLVER_MATRIX[cap][prov]).toBeTruthy();
          count++;
        }
      }
      expect(count).toBe(12);
    });
  });

  describe('override path', () => {
    it('returns the overrideModel verbatim with the provider defaults', () => {
      const r = svc.resolve({
        capability: 'chat',
        provider: 'openai',
        overrideModel: 'gpt-4.1-preview',
      });
      expect(r.source).toBe('override');
      expect(r.config.model).toBe('gpt-4.1-preview');
      expect(r.config.provider).toBe('openai');
      expect(r.config.supportsTools).toBe(true);
    });

    it('falls back to matrix when overrideModel is empty string', () => {
      const r = svc.resolve({
        capability: 'app_builder',
        provider: 'anthropic',
        overrideModel: '',
      });
      expect(r.source).toBe('matrix');
      expect(r.config.model).toBe(AI_MODEL_RESOLVER_MATRIX.app_builder.anthropic);
    });
  });

  describe('error paths', () => {
    it('throws on unknown capability', () => {
      expect(() =>
        svc.resolve({ capability: 'nope' as never, provider: 'openai' })
      ).toThrow(/Unsupported capability|nope/);
    });
    it('throws on unknown provider', () => {
      expect(() =>
        svc.resolve({ capability: 'chat', provider: 'cohere' as never })
      ).toThrow(/Unsupported provider|cohere/);
    });
  });

  describe('provider capability flags', () => {
    it('openai supports vision + tools', () => {
      const r = svc.resolve({ capability: 'chat', provider: 'openai' });
      expect(r.config.supportsVision).toBe(true);
      expect(r.config.supportsTools).toBe(true);
    });
    it('anthropic supports vision + tools', () => {
      const r = svc.resolve({ capability: 'chat', provider: 'anthropic' });
      expect(r.config.supportsVision).toBe(true);
      expect(r.config.supportsTools).toBe(true);
    });
    it('MiniMax does not advertise vision support', () => {
      const r = svc.resolve({ capability: 'chat', provider: 'MiniMax' });
      expect(r.config.supportsVision).toBe(false);
      expect(r.config.supportsTools).toBe(true);
    });
  });
});
