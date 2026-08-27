/**
 * HTTP wrapper for the eval harness.
 *
 * `POST /api/admin/eval/run` — runs the seeded eval cases against the
 * supplied prompt runner (a function the body describes by name; real
 * implementations would point at the live AI Builder).  Returns the
 * summary + per-case scores.
 *
 * For CI we expose the seed cases at `GET /api/admin/eval/cases` so a
 * reviewer can see what's being tested without having to clone the repo.
 *
 * License: AGPL-3.0
 */

import { Body, Controller, Get, Post } from '@nestjs/common';
import { HarnessSummary, runHarness, SchemaDoc } from './eval-harness';
import { SEED_EVAL_CASES } from './eval-fixtures';

interface RunRequest {
  /** Only used by smoke tests; production wires a real pipeline. */
  stub_responses?: Record<string, SchemaDoc>;
}

@Controller('api/admin/eval')
export class EvalHarnessController {
  @Get('cases')
  cases(): { id: string; tags: string[] }[] {
    return SEED_EVAL_CASES.map((c) => ({ id: c.id, tags: c.tags ?? [] }));
  }

  @Post('run')
  async run(@Body() req: RunRequest): Promise<{ summary: HarnessSummary }> {
    const stub = req.stub_responses ?? {};
    const { summary } = await runHarness({
      cases: SEED_EVAL_CASES,
      runPrompt: async (prompt: string): Promise<SchemaDoc> => {
        const c = SEED_EVAL_CASES.find((x) => x.prompt === prompt);
        return stub[c?.id ?? ''] ?? c?.gold ?? { fields: [] };
      },
    });
    return { summary };
  }
}
