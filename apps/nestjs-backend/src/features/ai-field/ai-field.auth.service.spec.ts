/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { AiFieldAuthService } from './ai-field.auth.service';

interface IMockAiFieldTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockRunTable {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockTemplateTable {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  aiField: IMockAiFieldTable;
  aiFieldRun: IMockRunTable;
  aiFieldTemplate: IMockTemplateTable;
}

const now = new Date('2026-08-25T00:00:00Z');

const buildPrisma = (): IMockPrisma => ({
  aiField: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      status: 'enabled',
      lastRunAt: null,
      lastErrorMessage: null,
      createdTime: now,
      updatedTime: now,
    })),
    update: vi.fn(async ({ where, data }) => ({ ...where, ...data, updatedTime: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    delete: vi.fn(async () => null),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  aiFieldRun: {
    create: vi.fn(async ({ data }) => ({ ...data, startedAt: now, finishedAt: now })),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  aiFieldTemplate: {
    create: vi.fn(async ({ data }) => ({ ...data, createdTime: now, updatedTime: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    delete: vi.fn(async () => null),
  },
});

describe('AiFieldAuthService (Stage 31)', () => {
  let prisma: IMockPrisma;
  let svc: AiFieldAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AiFieldAuthService(prisma as never);
  });

  describe('createAiField', () => {
    it('creates a classify field', async () => {
      const f = await svc.createAiField({
        baseId: 'b',
        tableId: 't',
        fieldId: 'f',
        operation: 'classify',
        model: 'gpt-4o-mini',
        sourceFieldIds: ['fld_1'],
        config: { labels: ['bug', 'feature'] },
        createdBy: 'u',
      });
      expect(f.status).toBe('enabled');
      expect(f.operation).toBe('classify');
    });

    it('rejects invalid operation', async () => {
      await expect(
        svc.createAiField({
          baseId: 'b',
          tableId: 't',
          fieldId: 'f',
          operation: 'embed' as never,
          model: 'gpt-4o-mini',
          sourceFieldIds: ['x'],
          config: { targetLang: 'zh' },
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects invalid model', async () => {
      await expect(
        svc.createAiField({
          baseId: 'b',
          tableId: 't',
          fieldId: 'f',
          operation: 'translate',
          model: 'gpt-9',
          sourceFieldIds: ['x'],
          config: { targetLang: 'zh' },
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects empty source fields', async () => {
      await expect(
        svc.createAiField({
          baseId: 'b',
          tableId: 't',
          fieldId: 'f',
          operation: 'translate',
          model: 'gpt-4o-mini',
          sourceFieldIds: [],
          config: { targetLang: 'zh' },
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects invalid config (translate targetLang)', async () => {
      await expect(
        svc.createAiField({
          baseId: 'b',
          tableId: 't',
          fieldId: 'f',
          operation: 'translate',
          model: 'gpt-4o-mini',
          sourceFieldIds: ['x'],
          config: { targetLang: '' },
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate', async () => {
      prisma.aiField.findUnique.mockResolvedValueOnce({ id: 'dup' });
      await expect(
        svc.createAiField({
          baseId: 'b',
          tableId: 't',
          fieldId: 'f',
          operation: 'classify',
          model: 'gpt-4o-mini',
          sourceFieldIds: ['x'],
          config: { labels: ['a'] },
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateAiField / deleteAiField', () => {
    it('updates model', async () => {
      prisma.aiField.findUnique.mockResolvedValueOnce({
        id: 'a',
        baseId: 'b',
        tableId: 't',
        fieldId: 'f',
        operation: 'classify',
        model: 'gpt-4o-mini',
        sourceFieldIds: 'fld_1',
        configJson: '{"labels":["a","b"]}',
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      const out = await svc.updateAiField('a', { model: 'gpt-4o' });
      expect(out.model).toBe('gpt-4o');
    });

    it('rejects invalid transition', async () => {
      prisma.aiField.findUnique.mockResolvedValueOnce({
        id: 'a',
        baseId: 'b',
        tableId: 't',
        fieldId: 'f',
        operation: 'classify',
        model: 'gpt-4o-mini',
        sourceFieldIds: 'fld_1',
        configJson: '{"labels":["a","b"]}',
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      await expect(svc.updateAiField('a', { status: 'enabled' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('throws on missing', async () => {
      await expect(svc.updateAiField('missing', { status: 'paused' })).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('deleteAiField cascades runs', async () => {
      prisma.aiField.findUnique.mockResolvedValueOnce({ id: 'a' });
      await svc.deleteAiField('a');
      expect(prisma.aiFieldRun.deleteMany).toHaveBeenCalledWith({ where: { aiFieldId: 'a' } });
    });
  });

  describe('recordRun / listRuns / foldUsageFor', () => {
    it('records a run + updates lastRunAt', async () => {
      prisma.aiField.findUnique.mockResolvedValueOnce({
        id: 'a',
        baseId: 'b',
        tableId: 't',
        fieldId: 'f',
        operation: 'classify',
        model: 'gpt-4o-mini',
        sourceFieldIds: 'fld_1',
        configJson: '{"labels":["a","b"]}',
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      const r = await svc.recordRun({
        aiFieldId: 'a',
        recordId: 'r1',
        inputText: 'hello',
        stubOutput: 'a',
        status: 'ok',
      });
      expect(r.status).toBe('ok');
    });

    it('records failed run + sets lastErrorMessage', async () => {
      prisma.aiField.findUnique.mockResolvedValueOnce({
        id: 'a',
        baseId: 'b',
        tableId: 't',
        fieldId: 'f',
        operation: 'classify',
        model: 'gpt-4o-mini',
        sourceFieldIds: 'fld_1',
        configJson: '{"labels":["a","b"]}',
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      const r = await svc.recordRun({
        aiFieldId: 'a',
        recordId: 'r1',
        inputText: 'x',
        status: 'failed',
        errorMessage: 'bad',
      });
      expect(r.status).toBe('failed');
    });

    it('rejects run on missing field', async () => {
      await expect(
        svc.recordRun({ aiFieldId: 'missing', recordId: 'r', inputText: 'x', status: 'ok' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listRuns passes through', async () => {
      prisma.aiFieldRun.findMany.mockResolvedValueOnce([
        {
          id: 'r',
          aiFieldId: 'a',
          recordId: 'r1',
          status: 'ok',
          inputText: 'x',
          outputText: 'y',
          promptTokens: 1,
          completionTokens: 1,
          model: 'm',
          durationMs: 100,
          errorMessage: null,
          startedAt: now,
          finishedAt: now,
        },
      ]);
      const out = await svc.listRuns('a');
      expect(out).toHaveLength(1);
    });

    it('foldUsageFor aggregates', async () => {
      prisma.aiFieldRun.findMany.mockResolvedValueOnce([
        { status: 'ok', promptTokens: 5, completionTokens: 3, durationMs: 50 } as never,
        { status: 'failed', promptTokens: 1, completionTokens: 0, durationMs: 20 } as never,
      ]);
      const agg = await svc.foldUsageFor('a');
      expect(agg.total).toBe(2);
      expect(agg.promptTokens).toBe(6);
    });
  });

  describe('template CRUD', () => {
    it('creates a template', async () => {
      const t = await svc.createTemplate({
        operation: 'classify',
        name: 'default',
        promptTemplate: '...',
        createdBy: 'u',
      });
      expect(t.operation).toBe('classify');
    });

    it('rejects invalid operation', async () => {
      await expect(
        svc.createTemplate({
          operation: 'weird' as never,
          name: 'x',
          promptTemplate: '...',
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects empty name', async () => {
      await expect(
        svc.createTemplate({
          operation: 'classify',
          name: '   ',
          promptTemplate: '...',
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate', async () => {
      prisma.aiFieldTemplate.findUnique.mockResolvedValueOnce({ id: 'dup' });
      await expect(
        svc.createTemplate({
          operation: 'classify',
          name: 'x',
          promptTemplate: '...',
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('pure-helper passthroughs', () => {
    it('renderPrompt', () => {
      expect(svc.renderPrompt({ template: '{{a}}', variables: { a: 'x' } })).toBe('x');
    });

    it('guardOutput', () => {
      const out = svc.guardOutput({
        operation: 'classify',
        config: { labels: ['bug'] },
        rawOutput: 'this is a bug',
      });
      expect(out).toBe('bug');
    });

    it('estimateTokens', () => {
      expect(svc.estimateTokens('hello world')).toBe(3);
    });

    it('foldRuns empty', () => {
      expect(svc.foldRuns([]).total).toBe(0);
    });
  });
});
