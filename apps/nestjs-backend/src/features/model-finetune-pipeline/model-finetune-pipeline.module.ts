/**
 * NestJS module — registers the fine-tune controller.
 *
 * `FEEDBACK_LOADER` is the `@Inject` token the controller depends on. The
 * production loader reads `ai_builder_proposal` rows directly — those rows
 * carry the natural-language prompt + the JSON proposal, and their `status`
 * column (draft / approved / rejected / applied) is the rating signal we
 * need to flip into `up`/`down`.  A separate `ai_builder_feedback` table
 * exists for per-edit outcome telemetry but is intentionally not the
 * training source: the proposal JSON the user actually saw is the better
 * ground truth.
 *
 * Mapping (status → training rating):
 *   - approved, applied → 'up'   (the user accepted the schema)
 *   - rejected          → 'down' (the user rejected the schema)
 *   - draft             → skip   (no signal yet)
 *
 * Tests pass an in-memory loader via `useValue`; production uses the
 * factory below which constructs the Prisma-backed implementation lazily
 * so the module can be imported in tests without a live database.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import type { FeedbackRow } from './model-finetune-pipeline';
import { ModelFinetunePipelineController } from './model-finetune-pipeline.controller';

const FEEDBACK_LOADER = 'FEEDBACK_LOADER';

export interface IFeedbackLoader {
  loadFeedbackSince(sinceIso: string | undefined): Promise<FeedbackRow[]>;
}

function statusToRating(status: string): 'up' | 'down' | null {
  if (status === 'approved' || status === 'applied') return 'up';
  if (status === 'rejected') return 'down';
  return null;
}

export const ModelFinetunePipelineFeedbackLoaderProvider = {
  provide: FEEDBACK_LOADER,
  useFactory: (prisma: PrismaService): IFeedbackLoader => ({
    async loadFeedbackSince(sinceIso: string | undefined): Promise<FeedbackRow[]> {
      const where: { createdTime?: { gte: Date } } = {};
      if (sinceIso) {
        const parsed = new Date(sinceIso);
        if (!Number.isNaN(parsed.getTime())) {
          where.createdTime = { gte: parsed };
        }
      }
      const rows = await prisma.aiBuilderProposal.findMany({
        where,
        orderBy: { createdTime: 'asc' },
      });
      const out: FeedbackRow[] = [];
      for (const row of rows) {
        const rating = statusToRating(String(row.status));
        if (!rating) continue;
        out.push({
          id: String(row.id),
          prompt: String(row.sourcePrompt),
          completion: String(row.proposalJson),
          rating,
          created_at: row.createdTime.toISOString(),
        });
      }
      return out;
    },
  }),
  inject: [PrismaService],
};

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [ModelFinetunePipelineController],
  providers: [ModelFinetunePipelineFeedbackLoaderProvider],
})
export class ModelFinetunePipelineModule {}
