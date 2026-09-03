/**
 * AI Chat skills service (Stage 38 — Cloud §ai/ai-chat).
 *
 * Built-in skills are short, named system prompts the user can invoke by
 * prefixing their message with `@<skill>`. The current minimal catalog:
 *
 *   @base    — Summarize / describe the current base (tables + counts).
 *   @table   — Describe the schema of the current table in detail.
 *   @record  — Interpret or summarize a specific record by id.
 *
 * Skills are resolved client-side from the message prefix; the backend
 * only stores the rendered system prompt. This keeps skills version-able
 * and observable without coupling the chat turn to a specific LLM call.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { AiChatContextService } from './ai-chat-context.service';
import { PrismaService } from '@teable/db-main-prisma';

export interface IAiChatSkill {
  /** Stable identifier used in `@<name>` prefixes. */
  name: string;
  /** Human-readable title for UI display. */
  title: string;
  /** Short description of what the skill does. */
  description: string;
  /** Tags help with autocomplete filtering. */
  tags: ReadonlyArray<string>;
}

export interface IAiChatSkillMatch {
  skill: IAiChatSkill;
  /** The user message with the `@<skill>` token removed. */
  remainder: string;
  /** Rendered system prompt for the skill (may be empty if context missing). */
  systemPrompt: string;
}

const SKILL_CATALOG: ReadonlyArray<IAiChatSkill> = [
  {
    name: 'base',
    title: '@base — 总结当前 Base',
    description:
      '列出当前 Base 下的表与每个表的字段数 / 记录数，给出业务定位。',
    tags: ['summary', 'overview'],
  },
  {
    name: 'table',
    title: '@table — 描述当前表',
    description:
      '详述当前表的字段（名称、类型、说明），列出样本记录并解释用途。',
    tags: ['schema', 'fields'],
  },
  {
    name: 'record',
    title: '@record — 解释单条记录',
    description:
      '读取用户消息中提供的 recordId，输出该记录的字段含义与关联。',
    tags: ['record', 'detail'],
  },
];

@Injectable()
export class AiChatSkillService {
  private readonly logger = new Logger(AiChatSkillService.name);

  constructor(
    @Optional() private readonly contextService?: AiChatContextService,
    @Optional() private readonly prisma?: PrismaService
  ) {}

  listSkills(): ReadonlyArray<IAiChatSkill> {
    return SKILL_CATALOG;
  }

  /**
   * Match a user message against the skill catalog. Returns null when no
   * skill prefix is present. The remainder is the original message with
   * the leading `@<skill>` token stripped.
   */
  match(userMessage: string): { skill: IAiChatSkill; remainder: string } | null {
    const trimmed = userMessage.trim();
    const match = /^@([a-zA-Z][a-zA-Z0-9_-]*)\b/.exec(trimmed);
    if (!match) return null;
    const name = match[1].toLowerCase();
    const skill = SKILL_CATALOG.find((s) => s.name === name);
    if (!skill) return null;
    const remainder = trimmed.slice(match[0].length).trim();
    return { skill, remainder };
  }

  /**
   * Build the rendered system prompt for a skill. Returns an empty string
   * when no skill matches or required context is missing.
   */
  async buildPrompt(input: {
    skill: IAiChatSkill;
    remainder: string;
    session: { baseId: string | null; tableId: string | null; viewId: string | null };
  }): Promise<string> {
    switch (input.skill.name) {
      case 'base':
        return this.buildBasePrompt(input.session.baseId);
      case 'table':
        return this.buildTablePrompt(input.session.tableId, input.session.viewId);
      case 'record':
        return this.buildRecordPrompt(input.session.tableId, input.remainder);
      default:
        return '';
    }
  }

  private async buildBasePrompt(baseId: string | null): Promise<string> {
    if (!baseId || !this.prisma) return '';
    try {
      const tables = await this.prisma.tableMeta.findMany({
        where: { baseId, deletedTime: null },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, _count: { select: { fields: true } } },
      });
      if (tables.length === 0) return '';
      const lines: string[] = [
        `Base ${baseId} contains ${tables.length} table(s):`,
      ];
      for (const t of tables) {
        lines.push(`  - ${t.name} (id=${t.id}, ${t._count.fields} field${t._count.fields === 1 ? '' : 's'})`);
      }
      lines.push('');
      lines.push(
        'Your task: produce a one-paragraph business overview of this base plus a 1-line description of each table. Output in the user\'s language.'
      );
      return lines.join('\n');
    } catch (error) {
      this.logger.warn(
        `buildBasePrompt failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return '';
    }
  }

  private async buildTablePrompt(
    tableId: string | null,
    viewId: string | null
  ): Promise<string> {
    if (!tableId || !this.contextService) return '';
    const ctx = await this.contextService.resolve({ tableId, viewId });
    if (!ctx) return '';
    const tableBlock = this.contextService.render(ctx);
    return [
      'You are describing the user\'s current table.',
      tableBlock,
      '',
      'Produce:',
      '1. A one-sentence summary of what this table represents.',
      '2. A bullet list of every field with its semantic role.',
      '3. (If sample rows present) three sample rows the user can paste as reference.',
    ].join('\n');
  }

  private async buildRecordPrompt(
    tableId: string | null,
    remainder: string
  ): Promise<string> {
    if (!tableId) return '';
    const recordId = extractRecordId(remainder);
    if (!recordId) return '';
    return [
      `The user is asking about record ${recordId} in table ${tableId}.`,
      'Produce a one-paragraph interpretation of this record\'s role, plus',
      'a bullet list of every visible field and its meaning.',
      'If the record id is unknown, ask the user to verify it.',
    ].join('\n');
  }
}

function extractRecordId(text: string): string | null {
  const match = /\brec([A-Za-z0-9]{14,})\b|\b(rec[A-Za-z0-9_-]{14,})\b/i.exec(text);
  return match?.[0] ?? null;
}
