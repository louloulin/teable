/**
 * AI Chat NestJS module (Stage 35–44 — Cloud §ai/ai-chat).
 */

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AiSettingModule } from '../ai-setting/ai-setting.module';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { AiChatContextService } from './ai-chat-context.service';
import { AiChatController } from './ai-chat.controller';
import { AiChatAuthService } from './ai-chat.auth.service';
import { AiChatSkillService } from './ai-chat-skill.service';
import { AiChatMemoryService } from './ai-chat-memory.service';
import { AiChatSearchService } from './ai-chat-search.service';
import { AiChatExportService } from './ai-chat-export.service';
import { AiChatCitationService } from './ai-chat-citation.service';
import { AiChatPreferenceService } from './ai-chat-preference.service';
import { AiChatUsageService } from './ai-chat-usage.service';
import { AiChatToolsService } from './ai-chat-tools.service';
import { AiChatLongTaskService } from './ai-chat-long-task.service';
import { AiChatArtifactService } from './ai-chat-artifact.service';
import { AiChatSmartLevelService } from './ai-chat-smart-level.service';
import { AiChatQueueService } from './ai-chat-queue.service';
import { AiChatWritePlanService } from './ai-chat-write-plan.service';
import { AiChatWriteSurfaceService } from './ai-chat-write-surface.service';
import { AiChatNodeRefService } from './ai-chat-node-ref.service';
import { AiChatSelectionRefService } from './ai-chat-selection-ref.service';
import { AiChatIntelligenceService } from './ai-chat-intelligence.service';
import { AiChatVoiceService } from './ai-chat-voice.service';
import { AiChatVoiceController } from './ai-chat-voice.controller';
import { AiChatAttachmentExtractor } from './ai-chat-attachment-extractor.service';
import { AiChatAttachmentParserService } from './ai-chat-attachment-parser.service';
import { AiChatAttachmentTokenService } from './ai-chat-attachment-token.service';
import { AiChatLlmService } from './ai-chat-llm.service';
import { AiChatLongTaskProcessor } from './ai-chat-long-task.processor';
import { AI_CHAT_LONG_TASK_QUEUE } from './ai-chat-long-task.service';
import { EventJobModule } from '../../event-emitter/event-job/event-job.module';

@Module({
  imports: [
    AiModule,
    AiSettingModule,
    RecordOpenApiModule,
    EventJobModule.registerQueue(AI_CHAT_LONG_TASK_QUEUE),
  ],
  controllers: [AiChatController, AiChatVoiceController],
  providers: [
    AiChatAuthService,
    AiChatContextService,
    AiChatSkillService,
    AiChatMemoryService,
    AiChatSearchService,
    AiChatExportService,
    AiChatCitationService,
    AiChatPreferenceService,
    AiChatUsageService,
    AiChatToolsService,
    AiChatLongTaskService,
    AiChatArtifactService,
    AiChatSmartLevelService,
    AiChatQueueService,
    AiChatWritePlanService,
    AiChatWriteSurfaceService,
    AiChatNodeRefService,
    AiChatSelectionRefService,
    AiChatVoiceService,
    AiChatAttachmentExtractor,
    AiChatAttachmentParserService,
    AiChatAttachmentTokenService,
    AiChatLongTaskProcessor,
    AiChatLlmService,
    AiChatIntelligenceService,
  ],
  exports: [
    AiChatAuthService,
    AiChatContextService,
    AiChatSkillService,
    AiChatMemoryService,
    AiChatSearchService,
    AiChatExportService,
    AiChatCitationService,
    AiChatPreferenceService,
    AiChatUsageService,
    AiChatToolsService,
    AiChatLongTaskService,
    AiChatArtifactService,
    AiChatSmartLevelService,
    AiChatQueueService,
    AiChatWritePlanService,
    AiChatWriteSurfaceService,
    AiChatNodeRefService,
    AiChatSelectionRefService,
    AiChatIntelligenceService,
    AiChatVoiceService,
    AiChatAttachmentExtractor,
    AiChatAttachmentParserService,
    AiChatAttachmentTokenService,
    AiChatLlmService,
    AiChatIntelligenceService,
  ],
})
export class AiChatModule {}
