import { Injectable } from '@nestjs/common';

import { AiService } from '../ai/ai.service';
import type { ILlmProvider } from './ai-builder.service';

@Injectable()
export class AiServiceBuilderProvider implements ILlmProvider {
  constructor(private readonly aiService: AiService) {}

  complete(input: { model: string; prompt: string; baseId?: string }): Promise<string> {
    if (!input.baseId) {
      throw new Error('baseId is required for AI Builder generation');
    }
    return this.aiService.generateText(input.baseId, { prompt: input.prompt }, true);
  }
}
