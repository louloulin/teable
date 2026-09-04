import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiChatVoiceService } from './ai-chat-voice.service';

interface ITranscribeBody {
  language?: string;
}

const ALLOWED_MIME_PREFIXES = ['audio/', 'video/', 'application/octet-stream'];

/**
 * AI Chat voice controller (R-CHAT-3).
 *
 * Accepts a recorded audio blob (webm/ogg/wav/mp4) from the ChatPanel
 * microphone button and returns the Whisper transcript so the user can
 * edit/discard before sending as a normal message.
 */
@Controller('api/chat/voice')
export class AiChatVoiceController {
  constructor(private readonly voiceService: AiChatVoiceService) {}

  @Post('transcribe')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    })
  )
  async transcribe(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ITranscribeBody
  ) {
    if (!file) {
      throw new BadRequestException('Missing audio file (expected "file" field)');
    }

    const mimeType = file.mimetype || 'audio/webm';
    if (
      mimeType !== 'application/octet-stream' &&
      !ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
    ) {
      throw new BadRequestException(
        `Unsupported audio MIME type: ${mimeType}. Expected audio/* or video/*`
      );
    }

    return this.voiceService.transcribe({
      buffer: file.buffer,
      filename: file.originalname || `voice.${mimeType.split('/')[1] ?? 'webm'}`,
      mimeType,
      language: body?.language,
    });
  }
}
