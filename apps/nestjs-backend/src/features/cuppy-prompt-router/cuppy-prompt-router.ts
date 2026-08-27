/**
 * Cuppy prompt router — turns a free-form IM message into:
 *   - the system prompt the agent should run with
 *   - the narrowed set of tools the agent should see
 *
 * The classifier is intentionally LLM-backed (no hand-rolled keyword soup)
 * because new intents are added continuously and a hot-fix retraining loop
 * (see `model-finetune-pipeline`, T-13-03) is part of the operating model.
 * For deployments without an LLM we fall back to a deterministic keyword
 * classifier that maps a small closed set of high-volume intents to known
 * tool bundles.
 *
 * Intents supported in v1:
 *   - "schema_question"      — user asks about field/table structure
 *   - "record_lookup"        — user wants a record by id / natural key
 *   - "record_create"        — user wants to insert a new row
 *   - "automation_trigger"   — user wants to fire a saved automation
 *   - "casual_chat"          — anything else; falls through to a base prompt
 *
 * The router is deliberately stateless — the orchestrator owns the
 * conversation memory.  This file is the "what tools / what persona" layer.
 *
 * License: AGPL-3.0
 */

export type Intent =
  | 'schema_question'
  | 'record_lookup'
  | 'record_create'
  | 'automation_trigger'
  | 'casual_chat';

export interface RouteDecision {
  system: string;
  tools: string[];
  intent: Intent;
  /** Confidence in the classification, 0..1. Useful for telemetry. */
  confidence: number;
}

/** LLM-backed intent classifier interface. Implemented in production by the
 *  same LLM client used elsewhere; this file only depends on the shape. */
export interface IntentClassifier {
  classify(args: {
    /** Last few user messages + scratchpad snapshot for context. */
    recent: string[];
    /** Latest message text. */
    text: string;
  }): Promise<{ intent: Intent; confidence: number }>;
}

const BASE_SYSTEM = `You are Cuppy, the teable assistant.  Help users with their tables, records, automations, and integrations.  Be concise.  When unsure, ask one clarifying question rather than guessing.`;

const INTENT_SYSTEM: Record<Intent, string> = {
  schema_question: `${BASE_SYSTEM}\nThe user is asking about a table or field schema. Prefer answering with explicit column/field names and data types from the live schema. If you need to fetch the schema, use the schema_query tool.`,
  record_lookup: `${BASE_SYSTEM}\nThe user wants to look up one or more records. Prefer the record_query tool and report what you find; ask only if the natural key is ambiguous.`,
  record_create: `${BASE_SYSTEM}\nThe user wants to create a record. Use the record_create tool; confirm field values with the user only when the schema leaves ambiguity that affects outcome.`,
  automation_trigger: `${BASE_SYSTEM}\nThe user wants to trigger an automation. Use the automation_trigger tool; report the resulting run id.`,
  casual_chat: BASE_SYSTEM,
};

const INTENT_TOOLS: Record<Intent, string[]> = {
  schema_question: ['schema_query', 'field_describe'],
  record_lookup: ['record_query', 'schema_query'],
  record_create: ['record_create', 'schema_query'],
  automation_trigger: ['automation_trigger', 'automation_list'],
  casual_chat: [],
};

/**
 * Deterministic fallback classifier — used when no LLM is wired so the
 * router still works in tests and offline dev.  Matches the first high-
 * confidence keyword and otherwise returns `casual_chat`.
 */
export function classifyKeyword(text: string): { intent: Intent; confidence: number } {
  const lower = text.toLowerCase();
  if (/\b(field|column|schema|table)\b/.test(lower)) {
    return { intent: 'schema_question', confidence: 0.6 };
  }
  if (/\b(find|lookup|search|show)\b.*\b(record|row|entry)\b/.test(lower)) {
    return { intent: 'record_lookup', confidence: 0.6 };
  }
  if (/\b(add|create|insert|new)\b.*\b(row|record|entry)\b/.test(lower)) {
    return { intent: 'record_create', confidence: 0.6 };
  }
  if (/\b(trigger|run|fire)\b.*\b(automation|workflow)\b/.test(lower)) {
    return { intent: 'automation_trigger', confidence: 0.6 };
  }
  return { intent: 'casual_chat', confidence: 0.4 };
}

export class CuppyPromptRouter {
  constructor(private readonly classifier?: IntentClassifier) {}

  async route(args: {
    /** Recent user messages for context; the orchestrator passes the last
     *  up-to-4 turns. */
    recent: string[];
    text: string;
  }): Promise<RouteDecision> {
    let classified: { intent: Intent; confidence: number };
    try {
      classified = this.classifier
        ? await this.classifier.classify({ recent: args.recent, text: args.text })
        : classifyKeyword(args.text);
    } catch {
      // Classifier blew up — degrade to casual chat rather than blocking.
      classified = { intent: 'casual_chat', confidence: 0 };
    }

    return {
      intent: classified.intent,
      confidence: classified.confidence,
      system: INTENT_SYSTEM[classified.intent],
      tools: INTENT_TOOLS[classified.intent],
    };
  }
}
