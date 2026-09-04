import { Injectable, Logger, BadRequestException } from '@nestjs/common';

export interface ITranscribeInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  language?: string;
}

export interface ITranscribeResult {
  text: string;
  language?: string;
  durationSec?: number;
  model: string;
}

interface IWhisperVerboseResponse {
  text?: string;
  language?: string;
  duration?: number;
  segments?: Array<unknown>;
}

/**
 * AI Chat voice transcription service (R-CHAT-3).
 *
 * Accepts a recorded audio blob from the ChatPanel mic button,
 * forwards it to OpenAI Whisper via the public REST API, and returns
 * the transcript so the user can edit/discard before sending as a
 * normal message.
 *
 * The REST path is used directly to avoid pulling the full `openai`
 * SDK into the backend (Whisper is a single endpoint, the SDK adds
 * ~2 MB of node_modules).
 *
 * Endpoint:  POST https://api.openai.com/v1/audio/transcriptions
 * Auth:      Bearer ${OPENAI_API_KEY}
 * Body:      multipart/form-data with `file`, `model`, optional `language`
 */
@Injectable()
export class AiChatVoiceService {
  private readonly logger = new Logger(AiChatVoiceService.name);
  private readonly endpoint = 'https://api.openai.com/v1/audio/transcriptions';
  private readonly defaultModel = process.env.WHISPER_MODEL ?? 'whisper-1';
  private readonly maxBytes = 25 * 1024 * 1024; // OpenAI hard limit

  async transcribe(input: ITranscribeInput): Promise<ITranscribeResult> {
    if (!input.buffer || input.buffer.length === 0) {
      throw new BadRequestException('Audio payload is empty');
    }
    if (input.buffer.length > this.maxBytes) {
      throw new BadRequestException(
        `Audio payload exceeds ${this.maxBytes} bytes (OpenAI Whisper limit)`
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'OPENAI_API_KEY is not configured; voice input is unavailable'
      );
    }

    const form = new FormData();
    const blob = new Blob([new Uint8Array(input.buffer)], { type: input.mimeType });
    form.append('file', blob, input.filename);
    form.append('model', this.defaultModel);
    form.append('response_format', 'verbose_json');
    if (input.language) {
      form.append('language', input.language);
    }

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      });
    } catch (error) {
      this.logger.error(
        `Whisper transport failed for ${input.filename}: ${(error as Error).message}`
      );
      throw new BadRequestException(
        `Voice transcription transport failed: ${(error as Error).message}`
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `Whisper returned ${response.status} for ${input.filename}: ${detail.slice(0, 200)}`
      );
      throw new BadRequestException(
        `Voice transcription failed: HTTP ${response.status}`
      );
    }

    const payload = (await response.json()) as IWhisperVerboseResponse;
    const text = payload.text?.trim() ?? '';
    if (!text) {
      this.logger.warn(
        `Whisper returned empty text for ${input.filename} (${input.buffer.length} bytes)`
      );
    }

    return {
      text,
      language: payload.language ?? input.language,
      durationSec: payload.duration,
      model: this.defaultModel,
    };
  }
}
