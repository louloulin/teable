/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-1: AI Chat selection ref service.
 *
 * Persists the rows / columns / cells / ranges the user has attached to
 * a chat session. The chat panel renders one chip per ref and the
 * prompt builder re-renders the selection block on every turn.
 *
 * Storage is keyed by (sessionId, refKey). `refKey` is supplied by the
 * client (deterministic — e.g. `{tableId}:row:{recordId}`) and the
 * service upserts on collision, so re-selecting the same row is
 * idempotent rather than producing duplicates.
 *
 * Selection types are restricted to four values via CHECK constraint in
 * SQL and validated again in service code (defense in depth — the
 * constraint is the source of truth for backend).
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { PermissionService } from '../auth/permission.service';

export type AiChatSelectionType = 'row' | 'column' | 'cell' | 'range';

export const AI_CHAT_SELECTION_TYPES: readonly AiChatSelectionType[] = [
  'row',
  'column',
  'cell',
  'range',
];

export interface IAiChatSelectionRef {
  id: string;
  sessionId: string;
  tableId: string;
  viewId: string | null;
  selectionType: AiChatSelectionType;
  refKey: string;
  refValue: Record<string, unknown>;
  displayLabel: string;
  rowCount: number | null;
  createdBy: string;
  createdTime: Date;
}

export interface IAddSelectionInput {
  sessionId: string;
  userId: string;
  tableId: string;
  viewId?: string | null;
  selectionType: AiChatSelectionType;
  refKey: string;
  refValue: Record<string, unknown>;
  displayLabel: string;
  rowCount?: number | null;
}

const MAX_REF_KEY_LEN = 200;
const MAX_LABEL_LEN = 200;

@Injectable()
export class AiChatSelectionRefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService
  ) {}

  private async loadSession(sessionId: string, userId: string) {
    const session = await this.prisma.aiChatSession.findUnique({ where: { id: sessionId } });
    if (!session || session.createdBy !== userId) {
      throw new NotFoundException('chat session not found');
    }
    if (session.baseId) {
      await this.permissionService.validPermissions(session.baseId, ['base|read']);
    }
    return session;
  }

  private validateInput(input: IAddSelectionInput): void {
    if (!AI_CHAT_SELECTION_TYPES.includes(input.selectionType)) {
      throw new BadRequestException(`unsupported selection type: ${input.selectionType}`);
    }
    if (!input.tableId || typeof input.tableId !== 'string') {
      throw new BadRequestException('tableId is required');
    }
    if (!input.refKey || typeof input.refKey !== 'string') {
      throw new BadRequestException('refKey is required');
    }
    if (input.refKey.length > MAX_REF_KEY_LEN) {
      throw new BadRequestException(`refKey must be <= ${MAX_REF_KEY_LEN} chars`);
    }
    if (!input.displayLabel || typeof input.displayLabel !== 'string') {
      throw new BadRequestException('displayLabel is required');
    }
    if (input.displayLabel.length > MAX_LABEL_LEN) {
      throw new BadRequestException(`displayLabel must be <= ${MAX_LABEL_LEN} chars`);
    }
    if (!input.refValue || typeof input.refValue !== 'object' || Array.isArray(input.refValue)) {
      throw new BadRequestException('refValue must be an object');
    }
  }

  async list(sessionId: string, userId: string): Promise<IAiChatSelectionRef[]> {
    await this.loadSession(sessionId, userId);
    const rows = await this.prisma.aiChatSelectionRef.findMany({
      where: { sessionId },
      orderBy: { createdTime: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      tableId: r.tableId,
      viewId: r.viewId,
      selectionType: r.selectionType as AiChatSelectionType,
      refKey: r.refKey,
      refValue: r.refValue as Record<string, unknown>,
      displayLabel: r.displayLabel,
      rowCount: r.rowCount,
      createdBy: r.createdBy,
      createdTime: r.createdTime,
    }));
  }

  async add(input: IAddSelectionInput): Promise<IAiChatSelectionRef> {
    await this.loadSession(input.sessionId, input.userId);
    this.validateInput(input);

    const id = `sel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const row = await this.prisma.aiChatSelectionRef.upsert({
      where: {
        sessionId_refKey: {
          sessionId: input.sessionId,
          refKey: input.refKey,
        },
      },
      create: {
        id,
        sessionId: input.sessionId,
        tableId: input.tableId,
        viewId: input.viewId ?? null,
        selectionType: input.selectionType,
        refKey: input.refKey,
        refValue: input.refValue as object,
        displayLabel: input.displayLabel,
        rowCount: input.rowCount ?? null,
        createdBy: input.userId,
      },
      update: {
        tableId: input.tableId,
        viewId: input.viewId ?? null,
        selectionType: input.selectionType,
        refValue: input.refValue as object,
        displayLabel: input.displayLabel,
        rowCount: input.rowCount ?? null,
      },
    });

    return {
      id: row.id,
      sessionId: row.sessionId,
      tableId: row.tableId,
      viewId: row.viewId,
      selectionType: row.selectionType as AiChatSelectionType,
      refKey: row.refKey,
      refValue: row.refValue as Record<string, unknown>,
      displayLabel: row.displayLabel,
      rowCount: row.rowCount,
      createdBy: row.createdBy,
      createdTime: row.createdTime,
    };
  }

  async remove(refId: string, userId: string): Promise<{ deleted: boolean }> {
    const row = await this.prisma.aiChatSelectionRef.findUnique({ where: { id: refId } });
    if (!row) return { deleted: false };
    await this.loadSession(row.sessionId, userId);
    await this.prisma.aiChatSelectionRef.delete({ where: { id: refId } });
    return { deleted: true };
  }

  async clearTable(
    sessionId: string,
    tableId: string,
    userId: string
  ): Promise<{ deleted: number }> {
    await this.loadSession(sessionId, userId);
    const result = await this.prisma.aiChatSelectionRef.deleteMany({
      where: { sessionId, tableId },
    });
    return { deleted: result.count };
  }

  /**
   * Render the persisted selection refs as a prompt block. Grouped by
   * tableId so the LLM sees context like:
   *
   *   <selection table=tblA>
   *   - (row) "Order #1234"
   *   - (row) "Order #1235"
   *   </selection>
   *   <selection table=tblB>
   *   - (column) "Status"
   *   </selection>
   *
   * Returns empty string when there are no refs (no <selection> tags).
   */
  renderPrompt(refs: IAiChatSelectionRef[]): string {
    if (!refs.length) return '';

    const byTable = new Map<string, IAiChatSelectionRef[]>();
    for (const ref of refs) {
      const list = byTable.get(ref.tableId) ?? [];
      list.push(ref);
      byTable.set(ref.tableId, list);
    }

    const blocks: string[] = [];
    for (const [tableId, list] of byTable) {
      const lines = list.map(
        (r) =>
          `- (${r.selectionType}) "${r.displayLabel}"` +
          (r.rowCount != null ? ` [${r.rowCount} rows]` : '')
      );
      blocks.push(`<selection table=${tableId}>\n${lines.join('\n')}\n</selection>`);
    }
    return blocks.join('\n');
  }
}
