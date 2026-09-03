import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { PermissionService } from '../auth/permission.service';

export type AiChatNodeKind = 'table' | 'view' | 'app' | 'automation' | 'folder';

export interface IAiChatNodeRef {
  id: string;
  sessionId: string;
  kind: AiChatNodeKind;
  refId: string;
  label: string;
  createdBy: string;
  createdTime: Date;
}

@Injectable()
export class AiChatNodeRefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService
  ) {}

  private async session(sessionId: string, userId: string) {
    const session = await this.prisma.aiChatSession.findUnique({ where: { id: sessionId } });
    if (!session || session.createdBy !== userId) throw new NotFoundException('chat session not found');
    if (session.baseId) await this.permissionService.validPermissions(session.baseId, ['base|read']);
    return session;
  }

  private async canonicalize(
    baseId: string,
    input: { kind: string; refId: string }
  ): Promise<{ kind: AiChatNodeKind; refId: string; label: string }> {
    switch (input.kind) {
      case 'table': {
        const table = await this.prisma.tableMeta.findFirst({
          where: { id: input.refId, baseId, deletedTime: null },
          select: { id: true, name: true },
        });
        if (!table) throw new NotFoundException('table not found in Base');
        await this.permissionService.validPermissions(table.id, ['table|read']);
        return { kind: 'table', refId: table.id, label: table.name };
      }
      case 'view': {
        const view = await this.prisma.view.findFirst({
          where: { id: input.refId, deletedTime: null, table: { baseId, deletedTime: null } },
          select: { id: true, name: true, tableId: true },
        });
        if (!view) throw new NotFoundException('view not found in Base');
        await this.permissionService.validPermissions(view.tableId, ['table|read']);
        await this.permissionService.validPermissions(view.id, ['view|read']);
        return { kind: 'view', refId: view.id, label: view.name };
      }
      case 'automation': {
        const automation = await this.prisma.automation.findFirst({
          where: { id: input.refId, baseId },
          select: { id: true, name: true },
        });
        if (!automation) throw new NotFoundException('automation not found in Base');
        await this.permissionService.validPermissions(automation.id, ['automation|read']);
        return { kind: 'automation', refId: automation.id, label: automation.name };
      }
      case 'app': {
        const app = await this.prisma.appInstance.findFirst({
          where: { id: input.refId, baseId },
          select: { id: true, name: true },
        });
        if (!app) throw new NotFoundException('app not found in Base');
        await this.permissionService.validPermissions(app.id, ['app|read']);
        return { kind: 'app', refId: app.id, label: app.name };
      }
      case 'folder': {
        const folder = await this.prisma.baseNodeFolder.findFirst({
          where: { id: input.refId, baseId },
          select: { id: true, name: true },
        });
        if (!folder) throw new NotFoundException('folder not found in Base');
        return { kind: 'folder', refId: folder.id, label: folder.name };
      }
      default:
        throw new BadRequestException('unsupported node kind');
    }
  }

  async list(sessionId: string, userId: string): Promise<IAiChatNodeRef[]> {
    await this.session(sessionId, userId);
    const rows = await this.prisma.aiChatNodeRef.findMany({
      where: { sessionId },
      orderBy: { createdTime: 'asc' },
    });
    return rows as IAiChatNodeRef[];
  }

  async add(input: { sessionId: string; userId: string; kind: string; refId: string }) {
    const session = await this.session(input.sessionId, input.userId);
    if (!session.baseId) throw new BadRequestException('node references require a Base session');
    const canonical = await this.canonicalize(session.baseId, input);
    const id = `aicn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.aiChatNodeRef.upsert({
      where: { sessionId_kind_refId: { sessionId: input.sessionId, kind: canonical.kind, refId: canonical.refId } },
      create: { id, sessionId: input.sessionId, createdBy: input.userId, ...canonical },
      update: { label: canonical.label },
    });
    return row as IAiChatNodeRef;
  }

  async remove(sessionId: string, userId: string, nodeId: string): Promise<{ deleted: boolean }> {
    await this.session(sessionId, userId);
    const result = await this.prisma.aiChatNodeRef.deleteMany({ where: { id: nodeId, sessionId } });
    return { deleted: result.count > 0 };
  }

  async refresh(sessionId: string, userId: string): Promise<IAiChatNodeRef[]> {
    const session = await this.session(sessionId, userId);
    if (!session.baseId) return [];
    const rows = await this.list(sessionId, userId);
    const valid: IAiChatNodeRef[] = [];
    for (const row of rows) {
      try {
        const canonical = await this.canonicalize(session.baseId, row);
        valid.push({ ...row, ...canonical });
      } catch {
        await this.prisma.aiChatNodeRef.deleteMany({ where: { id: row.id, sessionId } });
      }
    }
    return valid;
  }

  async renderPrompt(sessionId: string, userId: string): Promise<string> {
    const refs = await this.refresh(sessionId, userId);
    if (refs.length === 0) return '';
    return [
      'Authorized @ references for this AI Chat session:',
      ...refs.map((ref) => `- @${ref.kind}: ${ref.label} (id: ${ref.refId})`),
      'Use only these referenced resource IDs with permission-checked tools. Do not access unrelated resources.',
    ].join('\n');
  }
}
