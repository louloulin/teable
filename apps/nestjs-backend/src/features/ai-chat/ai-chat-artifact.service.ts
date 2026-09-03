/**
 * AI Chat artifact service (Stage 50 — Cloud §ai/ai-chat Artifact).
 *
 * Artifacts are persistent AI-generated outputs (charts, reports, HTML
 * pages, Markdown tables) shown as cards in the chat and viewable in an
 * independent viewer even after the chat session ends.
 *
 * Capabilities:
 *   - `create` / `getById` / `listBySession` / `update` (creates new
 *     version) / `delete`
 *   - `detectFromMessage(content)` — extracts code blocks, Markdown tables,
 *     Mermaid diagrams from an assistant message and returns descriptors
 *     for the chat turn to auto-persist.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

export type ArtifactFormat = 'markdown' | 'html' | 'chart' | 'table' | 'mermaid';

export interface IAiChatArtifact {
  id: string;
  sessionId: string;
  messageId: string | null;
  format: ArtifactFormat;
  title: string;
  content: string;
  version: number;
  createdTime: Date;
  updatedTime: Date;
}

export interface ICreateArtifactInput {
  sessionId: string;
  messageId?: string;
  format?: ArtifactFormat;
  title: string;
  content: string;
}

export interface IUpdateArtifactInput {
  title?: string;
  content?: string;
  format?: ArtifactFormat;
}

export interface IDetectedArtifact {
  format: ArtifactFormat;
  title: string;
  content: string;
}

const ARTIFACT_ID_PREFIX = 'aiaf';
const MAX_TITLE_LEN = 200;
const MAX_CONTENT_LEN = 200_000;

@Injectable()
export class AiChatArtifactService {
  private readonly logger = new Logger(AiChatArtifactService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: ICreateArtifactInput): Promise<IAiChatArtifact> {
    const session = await this.prisma.aiChatSession.findUnique({
      where: { id: input.sessionId },
    });
    if (!session) throw new NotFoundException(`chat session not found: ${input.sessionId}`);
    const id = `${ARTIFACT_ID_PREFIX}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.aiChatArtifact.create({
      data: {
        id,
        sessionId: input.sessionId,
        messageId: input.messageId ?? null,
        format: input.format ?? 'markdown',
        title: input.title.slice(0, MAX_TITLE_LEN),
        content: input.content.slice(0, MAX_CONTENT_LEN),
      },
    });
    return toArtifact(row);
  }

  async getById(artifactId: string): Promise<IAiChatArtifact> {
    const row = await this.prisma.aiChatArtifact.findUnique({ where: { id: artifactId } });
    if (!row) throw new NotFoundException(`artifact not found: ${artifactId}`);
    return toArtifact(row);
  }

  async listBySession(sessionId: string): Promise<IAiChatArtifact[]> {
    const rows = await this.prisma.aiChatArtifact.findMany({
      where: { sessionId },
      orderBy: { createdTime: 'desc' },
      take: 100,
    });
    return rows.map(toArtifact);
  }

  /**
   * Update an artifact — increments version (Cloud "保留历史版本" requirement).
   */
  async update(artifactId: string, input: IUpdateArtifactInput): Promise<IAiChatArtifact> {
    const existing = await this.prisma.aiChatArtifact.findUnique({ where: { id: artifactId } });
    if (!existing) throw new NotFoundException(`artifact not found: ${artifactId}`);
    const row = await this.prisma.aiChatArtifact.update({
      where: { id: artifactId },
      data: {
        title: input.title ? input.title.slice(0, MAX_TITLE_LEN) : existing.title,
        content: input.content ? input.content.slice(0, MAX_CONTENT_LEN) : existing.content,
        format: input.format ?? existing.format,
        version: existing.version + 1,
      },
    });
    return toArtifact(row);
  }

  async delete(artifactId: string): Promise<{ id: string; deleted: boolean }> {
    const existing = await this.prisma.aiChatArtifact.findUnique({ where: { id: artifactId } });
    if (!existing) throw new NotFoundException(`artifact not found: ${artifactId}`);
    await this.prisma.aiChatArtifact.delete({ where: { id: artifactId } });
    return { id: artifactId, deleted: true };
  }

  /**
   * Heuristic detector — extracts likely artifacts from assistant content.
   * Returns 0–N descriptors; the caller decides whether to persist them.
   *
   * Detection rules (Cloud "图表和报告" examples):
   *   - Fenced ```mermaid ... ``` block → format='mermaid'
   *   - Fenced ```html block → format='html'
   *   - Markdown table (≥2 lines, `| ... |`) → format='table'
   *   - Otherwise returns []
   */
  detectFromMessage(content: string): IDetectedArtifact[] {
    const out: IDetectedArtifact[] = [];

    // Mermaid blocks
    const mermaidMatches = Array.from(content.matchAll(/```mermaid\s*\n([\s\S]*?)```/g));
    for (const m of mermaidMatches) {
      const body = (m[1] ?? '').trim();
      if (!body) continue;
      out.push({
        format: 'mermaid',
        title: inferTitle(body, 'Mermaid Diagram'),
        content: body,
      });
    }

    // HTML blocks
    const htmlMatches = Array.from(content.matchAll(/```html\s*\n([\s\S]*?)```/g));
    for (const m of htmlMatches) {
      const body = (m[1] ?? '').trim();
      if (!body) continue;
      out.push({
        format: 'html',
        title: inferTitle(body, 'HTML Page'),
        content: body,
      });
    }

    // Markdown tables: contiguous run of `|...|` lines
    const lines = content.split('\n');
    let i = 0;
    while (i < lines.length) {
      if (!/^\s*\|.*\|.*$/.test(lines[i] ?? '')) {
        i += 1;
        continue;
      }
      const start = i;
      while (i < lines.length && /^\s*\|.*\|.*$/.test(lines[i] ?? '')) i += 1;
      const block = lines.slice(start, i).join('\n').trim();
      const allRows = block.split('\n').filter((l) => !/^\s*\|[-:\s|]+\|\s*$/.test(l));
      // Need a header row + >=2 data rows to count as a real artifact
      if (allRows.length >= 3) {
        const headerCells = (allRows[0] ?? '').split('|').map((c) => c.trim()).filter(Boolean);
        const title = headerCells[0] ?? 'Markdown Table';
        out.push({
          format: 'table',
          title: title.slice(0, MAX_TITLE_LEN),
          content: block,
        });
      }
    }

    return out;
  }
}

function inferTitle(body: string, fallback: string): string {
  // Try first comment-style title inside the block, else first non-empty line
  const commentMatch = body.match(/(?:^|\n)\s*(?:%|#|<!--)\s*(?:title|chart|figure)?\s*:?\s*(.+?)\s*(?:%|#|-->)?\s*(?:\n|$)/i);
  if (commentMatch?.[1]) return commentMatch[1].slice(0, MAX_TITLE_LEN);
  const firstLine = body.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  return (firstLine ?? fallback).slice(0, MAX_TITLE_LEN);
}

function toArtifact(row: {
  id: string;
  sessionId: string;
  messageId: string | null;
  format: string;
  title: string;
  content: string;
  version: number;
  createdTime: Date;
  updatedTime: Date;
}): IAiChatArtifact {
  return {
    id: row.id,
    sessionId: row.sessionId,
    messageId: row.messageId,
    format: row.format as ArtifactFormat,
    title: row.title,
    content: row.content,
    version: row.version,
    createdTime: row.createdTime,
    updatedTime: row.updatedTime,
  };
}
