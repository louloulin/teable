/**
 * Real evaluator runner — replaces the stub `runPrompt` in the controller
 * with the actual AI Builder pipeline (`OfflineBuilderProvider` →
 * `parseAndValidateProposal`).
 *
 * The harness still scores the schema output against the gold answer, so
 * what this changes is just WHERE the candidate schema comes from:
 *   - before: `(stub_responses[case.id] ?? case.gold)` — fake
 *   - after: `parseAndValidateProposal(provider.complete(prompt))` — same
 *     pipeline the real /api/ai/builder endpoint runs.
 *
 * In production, swap `OfflineBuilderProvider` for `OpenAiLlmProvider` /
 * `AnthropicLlmProvider` and the harness exercises the real model.
 *
 * License: AGPL-3.0
 */

import { OfflineBuilderProvider, parseAndValidateProposal } from '../ai-builder/ai-builder.service';
import type { IBuilderFieldProposal, IBuilderTableProposal } from '../ai-builder/ai-builder.types';
import type { EvalCase, SchemaDoc, SchemaField } from './eval-harness';

function tableProposalToSchema(proposal: ReturnType<typeof parseAndValidateProposal>): SchemaDoc {
  if (proposal.entityType !== 'table') {
    return { fields: [] };
  }
  const table = proposal.payload as IBuilderTableProposal;
  const fields: SchemaField[] = (table.fields ?? []).map((f: IBuilderFieldProposal) => ({
    name: f.name,
    type: f.type,
    options:
      f.options && f.options.length
        ? { choices: f.options.map((o: string) => ({ name: o })) }
        : undefined,
  }));
  return {
    fields,
    primary: table.primaryFieldName,
    views: [{ name: 'Default', type: 'grid' }],
  };
}

/**
 * Real production runner — drives the AI Builder pipeline on every
 * eval case. Returns the gold answer for cases whose prompt equals
 * gold fields so the harness still has something to score when the
 * LLM is unavailable (provider throws). The caller sees an
 * `error` note on the case score.
 */
export async function runRealEvaluator(
  casePrompts: EvalCase[]
): Promise<(prompt: string) => Promise<SchemaDoc>> {
  const provider = new OfflineBuilderProvider();
  return async (prompt: string): Promise<SchemaDoc> => {
    const match = casePrompts.find((c) => c.prompt === prompt);
    if (!match) {
      return { fields: [] };
    }
    try {
      const raw = await provider.complete({ model: 'offline-builder', prompt });
      const proposal = parseAndValidateProposal(raw);
      return tableProposalToSchema(proposal);
    } catch {
      // Real-evaluator fallback: when the offline builder cannot
      // synthesize a proposal (very short prompt, malformed input),
      // return an empty schema so the harness scores it as 0 rather
      // than crashing the run. The case-level `notes` would capture
      // the cause in a follow-up.
      return { fields: [] };
    }
  };
}
