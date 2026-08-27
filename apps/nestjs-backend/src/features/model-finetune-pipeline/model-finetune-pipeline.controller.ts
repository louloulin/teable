/**
 * Admin endpoint that triggers the fine-tune pipeline.
 *
 * `POST /api/admin/finetune/build` — fetches all feedback rows since the
 * last successful build, runs the pipeline, returns the manifest.  The
 * training runner (an external job, not in this repo) reads the manifest
 * and uploads the JSONL to OpenAI / Anthropic.
 *
 * The persistence layer (`loadFeedbackSince`) is intentionally left as a
 * seam — production wires Prisma here, tests pass an in-memory array.
 *
 * License: AGPL-3.0
 */

import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import {
  buildFineTuneFile,
  defaultOutputPath,
  FeedbackRow,
  FineTuneManifest,
  FineTuneTarget,
} from './model-finetune-pipeline';

export interface FeedbackLoader {
  loadFeedbackSince(sinceIso: string | undefined): Promise<FeedbackRow[]>;
}

interface BuildRequest {
  target: FineTuneTarget;
  /** ISO timestamp; defaults to "all history". */
  since?: string;
  /** Optional override path for the JSONL artifact. */
  output_path?: string;
}

// AI admin-panel capability gate — matches the pattern used by
// `admin-open-api.controller.ts` for `/api/admin/ai-settings`. Building the
// fine-tune artifact exposes AI-Builder feedback and training provenance;
// gate it behind the `ai` license cap.
const AiAdminGuard = LicenseCapabilityGuard.for('ai');

@Controller('api/admin/finetune')
@UseGuards(AiAdminGuard)
export class ModelFinetunePipelineController {
  constructor(@Inject('FEEDBACK_LOADER') private readonly loader: FeedbackLoader) {}

  @Post('build')
  async build(@Body() req: BuildRequest): Promise<FineTuneManifest> {
    const rows = await this.loader.loadFeedbackSince(req.since);
    const result = buildFineTuneFile({
      rows,
      target: req.target,
      output_path: req.output_path ?? defaultOutputPath(req.target),
    });
    return result.manifest;
  }
}
