/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-3: AI Chat voice transcription service unit test.
 *
 * Uses the native fetch monkey-patch instead of `vi.mock` to keep the
 * test deterministic across Node 18+/20+/22+. The global `fetch` is
 * stubbed before each test and restored afterwards.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatVoiceService } from './ai-chat-voice.service';

const ORIGINAL_API_KEY = process.env.OPENAI_API_KEY;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  process.env.OPENAI_API_KEY = 'sk-test-fake';
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock = vi.fn();
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_API_KEY;
  }
  delete process.env.WHISPER_MODEL;
});

const sampleInput = {
  buffer: Buffer.from('webm-binary-data'),
  filename: 'voice.webm',
  mimeType: 'audio/webm',
};

describe('AiChatVoiceService', () => {
  describe('transcribe validation', () => {
    it('rejects empty payload', async () => {
      const svc = new AiChatVoiceService();
      await expect(
        svc.transcribe({ ...sampleInput, buffer: Buffer.alloc(0) })
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects payload above OpenAI 25MB hard limit', async () => {
      const svc = new AiChatVoiceService();
      const oversized = Buffer.alloc(26 * 1024 * 1024);
      await expect(
        svc.transcribe({ ...sampleInput, buffer: oversized })
      ).rejects.toMatchObject({ status: 400 });
    });

    it('reports when OPENAI_API_KEY is missing', async () => {
      delete process.env.OPENAI_API_KEY;
      const svc = new AiChatVoiceService();
      await expect(svc.transcribe(sampleInput)).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('OPENAI_API_KEY is not configured'),
      });
    });
  });

  describe('transcribe happy path', () => {
    it('returns trimmed text + language + duration + model', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          text: '  Hello world  ',
          language: 'en',
          duration: 2.5,
        }),
      });

      const svc = new AiChatVoiceService();
      const out = await svc.transcribe(sampleInput);

      expect(out.text).toBe('Hello world');
      expect(out.language).toBe('en');
      expect(out.durationSec).toBe(2.5);
      expect(out.model).toBe('whisper-1');

      // Verify fetch was called with multipart + Authorization header
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer sk-test-fake');
      expect(init.body).toBeInstanceOf(FormData);
    });

    it('respects WHISPER_MODEL override', async () => {
      process.env.WHISPER_MODEL = 'whisper-large-v3';
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ text: 'ok' }),
      });

      const svc = new AiChatVoiceService();
      const out = await svc.transcribe({ ...sampleInput, language: 'es' });
      expect(out.model).toBe('whisper-large-v3');

      // language param was forwarded in FormData
      const form = fetchMock.mock.calls[0][1].body as FormData;
      expect(form.get('language')).toBe('es');
    });

    it('warns but does not throw when Whisper returns empty text', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ text: '' }),
      });

      const svc = new AiChatVoiceService();
      const out = await svc.transcribe(sampleInput);
      expect(out.text).toBe('');
      expect(out.model).toBe('whisper-1');
    });
  });

  describe('transcribe failure modes', () => {
    it('surfaces HTTP 4xx as BadRequest', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      });

      const svc = new AiChatVoiceService();
      await expect(svc.transcribe(sampleInput)).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('HTTP 429'),
      });
    });

    it('surfaces fetch transport errors', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));

      const svc = new AiChatVoiceService();
      await expect(svc.transcribe(sampleInput)).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('transport failed'),
      });
    });
  });
});
