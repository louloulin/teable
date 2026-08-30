/**
 * AI field streaming controller — Round 12 T-14.
 *
 * SSE endpoint that streams tokens for a single AI field cell. The actual
 * LLM call is made by `AiService.generateTextStream`; this controller only
 * owns the Express response wiring (headers, abort signal, drain) via
 * `AiStreamingService`. The existing `ai.controller.ts` is untouched — this
 * route is its own controller to keep the streaming surface separate.
 *
 * Hard constraints honored:
 *   - Zero new npm dependencies — uses `@nestjs/common` + the existing
 *     `ai-streaming.service.ts` plumbing.
 *   - No edits to `ai.controller.ts` / `ai.service.ts` core handler bodies.
 *   - Replicates the `AiChatGuard` + `Permissions('base|read')` pattern from
 *     the existing AI controller.
 */
import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { IFieldAIConfig } from '@teable/core';
import { FieldKeyType, HttpErrorCode } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import type { Response } from 'express';
import { z } from 'zod';
import { CustomHttpException } from '../../custom.exception';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { RecordService } from '../record/record.service';
import { buildAiFieldPrompt, collectAiFieldSourceIds } from './ai-field-prompt.builder';
import { AiStreamingService, type IStreamChunk } from './ai-streaming.service';
import { AiService } from './ai.service';

const AiChatGuard = LicenseCapabilityGuard.for('ai_chat');

const aiStreamQuerySchema = z.object({
  recordId: z.string().min(1),
  tableId: z.string().min(1),
});
type IAiStreamQuery = z.infer<typeof aiStreamQuerySchema>;

@Controller('api/:baseId/ai/stream')
@UseGuards(AiChatGuard)
export class AiStreamingController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiStreamingService: AiStreamingService,
    private readonly recordService: RecordService,
    private readonly prismaService: PrismaService
  ) {}

  /**
   * Open an SSE stream for the AI cell at `:fieldId` of `recordId`.
   *
   * The route mirrors the existing `api/:baseId/ai/*` surface so the same
   * `AiChatGuard` + `Permissions('base|read')` chain applies — the streaming
   * endpoint is gated identically to the chat endpoint. Server-side prompt
   * resolution mirrors the listener-driven auto-fill path so streamed output
   * matches what would have been persisted asynchronously.
   */
  @Get(':fieldId')
  @Permissions('base|read')
  async streamField(
    @Param('baseId') baseId: string,
    @Param('fieldId') fieldId: string,
    @Query(new ZodValidationPipe(aiStreamQuerySchema)) query: IAiStreamQuery,
    @Res() res: Response,
    // Wire the abort signal up to the request lifecycle so a client disconnect
    // cancels the upstream LLM call mid-stream.
    @Req() req: { on(event: 'close', listener: () => void): unknown }
  ): Promise<void> {
    const abortController = new AbortController();

    req.on('close', () => {
      try {
        abortController.abort();
      } catch {
        // already aborted
      }
    });

    const { recordId, tableId } = query;
    const prompt = await this.resolveFieldPrompt({ tableId, fieldId, recordId });

    this.aiStreamingService.prepareStreamResponse(res);

    const chunks: AsyncIterable<IStreamChunk> = this.aiService.generateTextStream(
      baseId,
      { prompt, modelKey: undefined },
      abortController.signal,
      false
    );

    await this.aiStreamingService.streamChunks(res, chunks, abortController.signal);
  }

  /**
   * Resolve the prompt for an AI field cell by loading the field's `aiConfig`
   * from the field row and the source cell values from the record. Returns
   * a plain prompt string ready for `AiService.generateTextStream`.
   */
  private async resolveFieldPrompt(args: {
    tableId: string;
    fieldId: string;
    recordId: string;
  }): Promise<string> {
    const { fieldId, tableId, recordId } = args;

    const field = await this.prismaService.txClient().field.findFirst({
      where: { id: fieldId, tableId, deletedTime: null },
      select: { id: true, aiConfig: true },
    });
    if (!field) {
      throw new CustomHttpException(`AI field not found: ${fieldId}`, HttpErrorCode.NOT_FOUND, {
        localization: { i18nKey: 'httpErrors.field.notFoundInTable' },
      });
    }

    const aiConfig = (
      field.aiConfig ? JSON.parse(field.aiConfig as string) : null
    ) as IFieldAIConfig | null;
    if (!aiConfig?.type) {
      throw new CustomHttpException(
        `Field ${fieldId} is not an AI field`,
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: { i18nKey: 'httpErrors.ai.generateFailed' },
        }
      );
    }

    // Read the record with the source field projection. The permission check
    // inside `RecordService.getRecord` enforces `record|read` semantics for
    // the base, so we don't need an additional gate here.
    const record = await this.recordService.getRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
    });
    const recordFields = ((record as { fields?: Record<string, unknown> }).fields ?? {}) as Record<
      string,
      unknown
    >;
    const sourceIds = collectAiFieldSourceIds(aiConfig);
    const valueMap: Record<string, string> = {};
    for (const srcId of sourceIds) {
      const raw = recordFields[srcId];
      if (raw == null) continue;
      valueMap[srcId] = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }

    const prompt = buildAiFieldPrompt({ config: aiConfig, fieldValueById: valueMap });
    if (!prompt) {
      throw new CustomHttpException(
        'Unable to build prompt for AI field',
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: { i18nKey: 'httpErrors.ai.generateFailed' },
        }
      );
    }
    return prompt;
  }
}
