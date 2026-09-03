/**
 * AI Chat export service (Stage 41 — Cloud §ai/ai-chat).
 *
 * Serialises a session + its messages as either Markdown or JSON for
 * sharing / documentation / archival. Pure code path, no schema changes.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { AiChatCitationService } from './ai-chat-citation.service';

export type ExportFormat = 'md' | 'json';

export interface IAiChatExportOptions {
  includeTimestamps?: boolean;
}

@Injectable()
export class AiChatExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly citations: AiChatCitationService
  ) {}

  async exportMarkdown(
    sessionId: string,
    options: IAiChatExportOptions = {}
  ): Promise<string> {
    const { session, messages } = await this.loadSession(sessionId);
    const lines: string[] = [];
    lines.push(`# Chat: ${session.title ?? sessionId}`);
    lines.push('');
    lines.push(`- Session: \`${session.id}\``);
    if (session.baseId) lines.push(`- Base: \`${session.baseId}\``);
    if (session.tableId) lines.push(`- Table: \`${session.tableId}\``);
    if (session.viewId) lines.push(`- View: \`${session.viewId}\``);
    lines.push(`- Model: \`${session.model}\``);
    if (session.skillName) lines.push(`- Skill: \`${session.skillName}\``);
    lines.push(`- Messages: ${messages.length}`);
    lines.push('');
    const citationCtx = {
      baseId: session.baseId,
      tableId: session.tableId,
      viewId: session.viewId,
      urlPrefix: '',
    };
    for (const m of messages) {
      const ts = options.includeTimestamps ? ` _(${m.createdTime.toISOString()})_` : '';
      lines.push(`## ${capitalize(m.role)}${ts}`);
      lines.push('');
      lines.push(this.citations.linkify(m.content, citationCtx));
      lines.push('');
    }
    return lines.join('\n');
  }

  async exportJson(
    sessionId: string,
    options: IAiChatExportOptions = {}
  ): Promise<string> {
    const { session, messages } = await this.loadSession(sessionId);
    const payload = {
      session: {
        id: session.id,
        title: session.title,
        baseId: session.baseId,
        tableId: session.tableId,
        viewId: session.viewId,
        model: session.model,
        createdBy: session.createdBy,
        createdTime: session.createdTime,
        updatedTime: session.updatedTime,
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        model: m.model,
        promptTokens: m.promptTokens,
        completionTokens: m.completionTokens,
        durationMs: m.durationMs,
        ...(options.includeTimestamps ? { createdTime: m.createdTime } : {}),
      })),
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(payload, null, 2);
  }

  async export(
    sessionId: string,
    format: ExportFormat = 'md',
    options: IAiChatExportOptions = {}
  ): Promise<string> {
    if (format === 'json') return this.exportJson(sessionId, options);
    return this.exportMarkdown(sessionId, options);
  }

  private async loadSession(sessionId: string): Promise<{
    session: {
      id: string;
      title: string | null;
      baseId: string | null;
      tableId: string | null;
      viewId: string | null;
      model: string;
      createdBy: string;
      createdTime: Date;
      updatedTime: Date;
      skillName?: string | null;
    };
    messages: Array<{
      id: string;
      role: string;
      content: string;
      model: string | null;
      promptTokens: number;
      completionTokens: number;
      durationMs: number;
      createdTime: Date;
    }>;
  }> {
    const session = await this.prisma.aiChatSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException(`chat session not found: ${sessionId}`);
    const messages = await this.prisma.aiChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdTime: 'asc' },
    });
    return {
      session: {
        id: session.id,
        title: session.title,
        baseId: session.baseId,
        tableId: session.tableId,
        viewId: session.viewId,
        model: session.model,
        createdBy: session.createdBy,
        createdTime: session.createdTime,
        updatedTime: session.updatedTime,
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        model: m.model,
        promptTokens: m.promptTokens,
        completionTokens: m.completionTokens,
        durationMs: m.durationMs,
        createdTime: m.createdTime,
      })),
    };
  }
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
