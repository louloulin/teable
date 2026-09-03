/**
 * AI Chat citation linking service (Stage 42 — Cloud §ai/ai-chat).
 *
 * Scans assistant (and user) text for known entity identifiers and
 * renders them as Markdown / HTML links so the export can be navigated
 * directly. This is purely additive: no schema changes, no provider
 * changes — just a post-processor on chat text.
 *
 * Detected patterns:
 *   - bse[\\w]{10,}    → /base/{id}
 *   - tbl[\\w]{10,}    → /base/{baseId}/table/{id} (baseId inferred from
 *     session when available, else generic)
 *   - viw[\\w]{10,}    → /base/{baseId}/table/{tableId}/view/{id}
 *   - fld[\\w]{10,}    → /base/{baseId}/table/{tableId}#field-{id}
 *   - rec[\\w]{14,}    → /base/{baseId}/table/{tableId}/{id}
 *
 * A small registry is passed in by the export service so it can supply
 * the user's current baseId/tableId when the text doesn't include it.
 */

import { Injectable } from '@nestjs/common';

export interface IAiChatCitationContext {
  baseId?: string | null;
  tableId?: string | null;
  viewId?: string | null;
  /** Base URL prefix (defaults to '/'). */
  urlPrefix?: string;
}

export interface IAiChatCitationLink {
  type: 'base' | 'table' | 'view' | 'field' | 'record';
  id: string;
  href: string;
}

const PATTERNS: Array<{
  type: IAiChatCitationLink['type'];
  regex: RegExp;
}> = [
  { type: 'base', regex: /\bbse[A-Za-z0-9]{10,}\b/g },
  { type: 'table', regex: /\btbl[A-Za-z0-9]{10,}\b/g },
  { type: 'view', regex: /\bviw[A-Za-z0-9]{10,}\b/g },
  { type: 'field', regex: /\bfld[A-Za-z0-9]{10,}\b/g },
  { type: 'record', regex: /\brec[A-Za-z0-9_-]{14,}\b/g },
];

@Injectable()
export class AiChatCitationService {
  /**
   * Extract all entity references in a string. Deduplicates by id+type.
   */
  extract(text: string): IAiChatCitationLink[] {
    if (!text) return [];
    const seen = new Set<string>();
    const out: IAiChatCitationLink[] = [];
    for (const { type, regex } of PATTERNS) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        const id = m[0];
        const key = `${type}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type, id, href: '' });
      }
    }
    return out;
  }

  /**
   * Resolve hrefs for the extracted references using the session context.
   */
  resolve(
    refs: ReadonlyArray<IAiChatCitationLink>,
    ctx: IAiChatCitationContext
  ): IAiChatCitationLink[] {
    const prefix = ctx.urlPrefix ?? '';
    const baseId = ctx.baseId ?? 'unknown';
    const tableId = ctx.tableId ?? 'unknown';
    return refs.map((ref) => {
      switch (ref.type) {
        case 'base':
          return { ...ref, href: `${prefix}/base/${ref.id}` };
        case 'table':
          return { ...ref, href: `${prefix}/base/${baseId}/table/${ref.id}` };
        case 'view':
          return { ...ref, href: `${prefix}/base/${baseId}/table/${tableId}/view/${ref.id}` };
        case 'field':
          return { ...ref, href: `${prefix}/base/${baseId}/table/${tableId}#field-${ref.id}` };
        case 'record':
          return { ...ref, href: `${prefix}/base/${baseId}/table/${tableId}/${ref.id}` };
        default:
          return ref;
      }
    });
  }

  /**
   * Render entity references in the text as Markdown links.
   * Preserves the original text; only the matched tokens are wrapped.
   */
  linkify(text: string, ctx: IAiChatCitationContext): string {
    if (!text) return '';
    let out = text;
    const refs = this.resolve(this.extract(text), ctx);
    for (const ref of refs) {
      const re = new RegExp(`\\b${escapeRegex(ref.id)}\\b`);
      out = out.replace(re, `[${ref.id}](${ref.href})`);
    }
    return out;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
