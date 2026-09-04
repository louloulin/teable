/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-3: AI Chat voice controller unit test.
 *
 * Exercises the multipart validation in the controller without booting
 * the real Nest container — FileInterceptor is replaced with a fake
 * that injects the supplied `Express.Multer.File`-shaped object.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatVoiceController } from './ai-chat-voice.controller';
import type { AiChatVoiceService } from './ai-chat-voice.service';

const ORIGINAL_API_KEY = process.env.OPENAI_API_KEY;

interface IMockFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function mockFile(overrides: Partial<IMockFile> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'voice.webm',
    encoding: '7bit',
    mimetype: 'audio/webm',
    size: 16,
    buffer: Buffer.from('webm'),
    ...overrides,
  } as Express.Multer.File;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  process.env.OPENAI_API_KEY = 'sk-test-fake';
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ text: 'transcribed', language: 'en', duration: 1.0 }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_API_KEY;
  }
});

function makeSut() {
  const voice = {
    transcribe: vi.fn().mockResolvedValue({
      text: 'transcribed',
      language: 'en',
      durationSec: 1.0,
      model: 'whisper-1',
    }),
  } as unknown as AiChatVoiceService;
  const ctrl = new AiChatVoiceController(voice);
  return { ctrl, voice };
}

describe('AiChatVoiceController', () => {
  it('passes through a well-formed multipart audio file', async () => {
    const { ctrl, voice } = makeSut();
    const out = await ctrl.transcribe(mockFile(), { language: 'en' });
    expect(voice.transcribe).toHaveBeenCalledTimes(1);
    expect(voice.transcribe).toHaveBeenCalledWith({
      buffer: expect.any(Buffer),
      filename: 'voice.webm',
      mimeType: 'audio/webm',
      language: 'en',
    });
    expect(out).toEqual({
      text: 'transcribed',
      language: 'en',
      durationSec: 1.0,
      model: 'whisper-1',
    });
  });

  it('rejects when no file is uploaded (400)', async () => {
    const { ctrl, voice } = makeSut();
    await expect(ctrl.transcribe(undefined, {})).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Missing audio file'),
    });
    expect(voice.transcribe).not.toHaveBeenCalled();
  });

  it('rejects unsupported MIME types (400)', async () => {
    const { ctrl, voice } = makeSut();
    const file = mockFile({
      mimetype: 'text/plain',
      originalname: 'evil.txt',
      buffer: Buffer.from('text'),
    });
    await expect(ctrl.transcribe(file, {})).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Unsupported audio MIME type'),
    });
    expect(voice.transcribe).not.toHaveBeenCalled();
  });

  it('falls back to audio/<ext> when mimetype is application/octet-stream', async () => {
    const { ctrl, voice } = makeSut();
    const file = mockFile({
      mimetype: 'application/octet-stream',
      originalname: 'voice.ogg',
    });
    await ctrl.transcribe(file, {});
    expect(voice.transcribe).toHaveBeenCalledWith({
      buffer: file.buffer,
      filename: 'voice.ogg',
      mimeType: 'application/octet-stream',
      language: undefined,
    });
  });

  it('fills default filename when originalname is missing', async () => {
    const { ctrl, voice } = makeSut();
    const file = mockFile({ originalname: '', mimetype: 'audio/mp4' });
    await ctrl.transcribe(file, {});
    expect(voice.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'voice.mp4' })
    );
  });
});
