/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-MIGRATE: AI-assisted Airtable field mapping suggestions.
 *
 * Bridges the import pipeline to the R-AI-MODEL capability matrix so
 * the UI can label which LLM will be used when the user clicks
 * "Auto-map with AI". The actual mapping logic is rule-based (Cloud
 * §migrate uses a similar heuristic); the LLM call itself is delegated
 * to the ai-chat stack when the user confirms the plan.
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger } from '@nestjs/common';
import { AiModelResolverService, type IAiResolverResult } from '../ai/ai-model-resolver.service';

export interface ISourceField {
  /** Original field name from Airtable (or Notion / Sheets). */
  name: string;
  /** Source type — e.g. 'singleLineText', 'multipleAttachments', 'date'. */
  sourceType: string;
  /** Optional sample value for type inference. */
  sample?: unknown;
}

export interface ITargetField {
  /** Target field id in Teable. */
  id: string;
  /** Target field name. */
  name: string;
  /** Target field type — e.g. 'singleLineText', 'multipleAttachments'. */
  type: string;
}

export interface IMappingSuggestion {
  sourceFieldName: string;
  /** null when no confident match. */
  targetFieldId: string | null;
  targetFieldName: string | null;
  confidence: number;
  reason: string;
  /** Provenance — what produced this mapping. */
  source: 'name-match' | 'type-match' | 'fallback' | 'llm-deferred';
}

export interface IAiSuggestResult {
  /** Which model the eventual LLM call would use. */
  model: IAiResolverResult['config'];
  /** Model matrix source — 'matrix' or 'override'. */
  modelSource: IAiResolverResult['source'];
  /** Suggestions in source-field order. */
  suggestions: IMappingSuggestion[];
  /** Stats for the UI. */
  stats: { total: number; matched: number; unmatched: number; avgConfidence: number };
}

@Injectable()
export class AirtableImportAiSuggestService {
  private readonly logger = new Logger(AirtableImportAiSuggestService.name);

  /** Static type-compatibility matrix — kept conservative to avoid silent data loss. */
  private static readonly TYPE_COMPAT: Record<string, string[]> = {
    singleLineText: ['singleLineText', 'longText', 'email', 'url', 'phoneNumber'],
    longText: ['longText', 'singleLineText'],
    email: ['email', 'singleLineText'],
    url: ['url', 'singleLineText'],
    phoneNumber: ['phoneNumber', 'singleLineText'],
    number: ['number', 'currency', 'percent', 'rating', 'autoNumber'],
    currency: ['currency', 'number'],
    percent: ['percent', 'number'],
    rating: ['rating', 'number'],
    date: ['date'],
    multipleSelects: ['multipleSelects', 'singleSelect'],
    singleSelect: ['singleSelect', 'multipleSelects'],
    checkbox: ['checkbox'],
    multipleAttachments: ['multipleAttachments'],
    attachment: ['multipleAttachments', 'attachment'],
    barcode: ['singleLineText'],
    formula: ['formula'],
    rollup: ['rollup'],
    lookup: ['lookup'],
    count: ['number'],
    createdTime: ['createdTime'],
    lastModifiedTime: ['lastModifiedTime'],
    autoNumber: ['autoNumber', 'number'],
  };

  /** Normalize a field name for fuzzy comparison. */
  private normalize(name: string): string {
    return name
      .toLowerCase()
      .replace(/[\s_\-./]+/g, '')
      .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  }

  constructor(private readonly modelResolver: AiModelResolverService) {}

  /**
   * Build a mapping plan from source → target fields.
   *
   * Priority:
   *   1. Exact normalized name match          → confidence 1.0
   *   2. Type-compatible + prefix match       → confidence 0.7
   *   3. Type-compatible only (best by name)  → confidence 0.4
   *   4. No match                             → confidence 0 (targetFieldId=null)
   */
  suggest(sourceFields: ISourceField[], targetFields: ITargetField[]): IAiSuggestResult {
    const targetByName = new Map(targetFields.map((t) => [this.normalize(t.name), t]));
    const usedTargets = new Set<string>();

    const suggestions: IMappingSuggestion[] = sourceFields.map((sf) => {
      const normalized = this.normalize(sf.name);
      const exact = targetByName.get(normalized);
      if (exact && !usedTargets.has(exact.id)) {
        usedTargets.add(exact.id);
        return {
          sourceFieldName: sf.name,
          targetFieldId: exact.id,
          targetFieldName: exact.name,
          confidence: 1.0,
          reason: 'name-exact',
          source: 'name-match',
        };
      }

      // 2. Type-compatible + name prefix
      const compatible = (AirtableImportAiSuggestService.TYPE_COMPAT[sf.sourceType] ?? []).concat([
        sf.sourceType,
      ]);
      for (const t of targetFields) {
        if (usedTargets.has(t.id)) continue;
        if (!compatible.includes(t.type)) continue;
        const tNorm = this.normalize(t.name);
        if (tNorm.startsWith(normalized) || normalized.startsWith(tNorm)) {
          usedTargets.add(t.id);
          return {
            sourceFieldName: sf.name,
            targetFieldId: t.id,
            targetFieldName: t.name,
            confidence: 0.7,
            reason: 'type-and-name-prefix',
            source: 'type-match',
          };
        }
      }

      // 3. Type-compatible only — first unused
      for (const t of targetFields) {
        if (usedTargets.has(t.id)) continue;
        if (!compatible.includes(t.type)) continue;
        usedTargets.add(t.id);
        return {
          sourceFieldName: sf.name,
          targetFieldId: t.id,
          targetFieldName: t.name,
          confidence: 0.4,
          reason: 'type-only',
          source: 'type-match',
        };
      }

      // 4. No match — defer to LLM
      return {
        sourceFieldName: sf.name,
        targetFieldId: null,
        targetFieldName: null,
        confidence: 0,
        reason: 'no-confident-match',
        source: 'llm-deferred',
      };
    });

    const matched = suggestions.filter((s) => s.targetFieldId !== null);
    const totalConfidence = suggestions.reduce((acc, s) => acc + s.confidence, 0);
    const stats = {
      total: suggestions.length,
      matched: matched.length,
      unmatched: suggestions.length - matched.length,
      avgConfidence: suggestions.length === 0 ? 0 : totalConfidence / suggestions.length,
    };

    // Resolve which model the eventual LLM step would use.
    const resolved = this.modelResolver.resolve({ capability: 'chat', provider: 'openai' });

    return {
      model: resolved.config,
      modelSource: resolved.source,
      suggestions,
      stats,
    };
  }
}
