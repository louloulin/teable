/**
 * HTTP wrapper for the eval harness.
 *
 * `POST /api/admin/eval/run` — runs the seeded eval cases against the
 * real AI Builder pipeline (`OfflineBuilderProvider` →
 * `parseAndValidateProposal`) and returns the summary + per-case scores.
 *
 * For CI we expose the seed cases at `GET /api/admin/eval/cases` so a
 * reviewer can see what's being tested without having to clone the repo.
 *
 * License: AGPL-3.0
 */

import { Body, Controller, Get, Post } from '@nestjs/common';
import { HarnessSummary, runHarness, SchemaDoc } from './eval-harness';
import { SEED_EVAL_CASES } from './eval-fixtures';
import { runRealEvaluator } from './eval-runner';

interface RunRequest {
  /** Optional case-id → schema override (used only by smoke tests). */
  overrides?: Record<string, SchemaDoc>;
}

@Controller('api/admin/eval')
export class EvalHarnessController {
  @Get('cases')
  cases(): { id: string; tags: string[] }[] {
    return SEED_EVAL_CASES.map((c) => ({ id: c.id, tags: c.tags ?? [] }));
  }

  @Post('run')
  async run(@Body() req: RunRequest): Promise<{ summary: HarnessSummary }> {
    const overrides = req.overrides ?? {};
    const realPrompt = await runRealEvaluator(SEED_EVAL_CASES);
    const { summary } = await runHarness({
      cases: SEED_EVAL_CASES,
      runPrompt: async (prompt: string): Promise<SchemaDoc> => {
        const c = SEED_EVAL_CASES.find((x) => x.prompt === prompt);
        const override = c ? overrides[c.id] : undefined;
        if (override) return override;
        return realPrompt(prompt);
      },
    });
    return { summary };
  }
}
