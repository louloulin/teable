/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatArtifactService } from './ai-chat-artifact.service';

function buildPrisma() {
  const now = new Date();
  return {
    aiChatSession: {
      findUnique: vi.fn(async () => null),
    },
    aiChatArtifact: {
      create: vi.fn(async ({ data }: any) => ({
        ...data,
        createdTime: now,
        updatedTime: now,
      })),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data: d }: any) => ({ ...where, ...d })),
      delete: vi.fn(async () => ({})),
    },
  };
}

describe('AiChatArtifactService (Stage 50)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let svc: AiChatArtifactService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AiChatArtifactService(prisma as never);
  });

  it('create throws when session is missing', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce(null);
    await expect(
      svc.create({ sessionId: 's', title: 'T', content: 'C' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create persists a new artifact row', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({ id: 's' } as never);
    prisma.aiChatArtifact.create.mockResolvedValueOnce({
      id: 'aiaf_1',
      sessionId: 's',
      messageId: null,
      format: 'markdown',
      title: 'T',
      content: 'C',
      version: 1,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.create({ sessionId: 's', title: 'T', content: 'C' });
    expect(out.id).toBe('aiaf_1');
    expect(out.format).toBe('markdown');
    expect(prisma.aiChatArtifact.create).toHaveBeenCalledTimes(1);
  });

  it('create trims title and content length', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({ id: 's' } as never);
    prisma.aiChatArtifact.create.mockImplementationOnce(async ({ data }: any) => data);
    await svc.create({
      sessionId: 's',
      title: 'x'.repeat(500),
      content: 'y'.repeat(300_000),
    });
    const arg = prisma.aiChatArtifact.create.mock.calls[0][0];
    expect(arg.data.title.length).toBe(200);
    expect(arg.data.content.length).toBe(200_000);
  });

  it('getById throws when missing', async () => {
    prisma.aiChatArtifact.findUnique.mockResolvedValueOnce(null);
    await expect(svc.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getById returns DTO when present', async () => {
    prisma.aiChatArtifact.findUnique.mockResolvedValueOnce({
      id: 'aiaf_1',
      sessionId: 's',
      messageId: 'm',
      format: 'mermaid',
      title: 'Flow',
      content: 'graph TD; A-->B',
      version: 3,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.getById('aiaf_1');
    expect(out.format).toBe('mermaid');
    expect(out.version).toBe(3);
  });

  it('listBySession maps rows to DTOs', async () => {
    prisma.aiChatArtifact.findMany.mockResolvedValueOnce([
      { id: 'aiaf_1', sessionId: 's', messageId: null, format: 'table', title: 'T1', content: '|a|b|\n|-|-|\n|1|2|', version: 1, createdTime: new Date(), updatedTime: new Date() },
    ] as never);
    const out = await svc.listBySession('s');
    expect(out.length).toBe(1);
    expect(out[0].format).toBe('table');
  });

  it('update increments version and merges partial fields', async () => {
    prisma.aiChatArtifact.findUnique.mockResolvedValueOnce({
      id: 'aiaf_1',
      title: 'Old',
      content: 'old',
      format: 'markdown',
      version: 5,
    } as never);
    prisma.aiChatArtifact.update.mockImplementationOnce(async ({ where, data }: any) => ({ ...where, ...data }));
    const out = await svc.update('aiaf_1', { content: 'new' });
    expect(out.version).toBe(6);
    expect(out.content).toBe('new');
    expect(out.title).toBe('Old');
  });

  it('update throws when missing', async () => {
    prisma.aiChatArtifact.findUnique.mockResolvedValueOnce(null);
    await expect(svc.update('missing', { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delete throws when missing', async () => {
    prisma.aiChatArtifact.findUnique.mockResolvedValueOnce(null);
    await expect(svc.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delete returns { deleted: true } when present', async () => {
    prisma.aiChatArtifact.findUnique.mockResolvedValueOnce({ id: 'aiaf_1' } as never);
    prisma.aiChatArtifact.delete.mockResolvedValueOnce({} as never);
    const out = await svc.delete('aiaf_1');
    expect(out.deleted).toBe(true);
  });

  describe('detectFromMessage', () => {
    it('detects mermaid block', () => {
      const content = 'Here is a diagram:\n\n```mermaid\ngraph TD; A-->B\n```\nDone.';
      const detected = svc.detectFromMessage(content);
      expect(detected.some((d) => d.format === 'mermaid')).toBe(true);
      expect(detected.find((d) => d.format === 'mermaid')?.content).toContain('graph TD');
    });

    it('detects html block', () => {
      const content = '```html\n<div>Hello world</div>\n```';
      const detected = svc.detectFromMessage(content);
      expect(detected.some((d) => d.format === 'html')).toBe(true);
    });

    it('detects markdown table (>=2 data rows)', () => {
      const content = '统计：\n\n| 名字 | 数量 |\n|---|---|\n| A | 10 |\n| B | 20 |\n';
      const detected = svc.detectFromMessage(content);
      expect(detected.some((d) => d.format === 'table')).toBe(true);
      expect(detected.find((d) => d.format === 'table')?.title).toBe('名字');
    });

    it('ignores single-row tables', () => {
      const content = '| a | b |\n|---|---|\n| 1 | 2 |';
      const detected = svc.detectFromMessage(content);
      expect(detected.some((d) => d.format === 'table')).toBe(false);
    });

    it('returns [] for plain prose', () => {
      const detected = svc.detectFromMessage('Just some text without any structures.');
      expect(detected).toEqual([]);
    });
  });
});
