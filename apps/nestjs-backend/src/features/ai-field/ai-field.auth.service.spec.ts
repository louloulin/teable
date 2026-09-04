/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import type { AiService } from '../ai/ai.service';
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
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockTemplateTable {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
interface IMockAiGenerationTaskTable {
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}

interface IMockPrisma {
  tableMeta: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  aiField: IMockAiFieldTable;
  aiFieldRun: IMockRunTable;
  aiFieldTemplate: IMockTemplateTable;
  aiGenerationTask: IMockAiGenerationTaskTable;
}

const now = new Date('2026-08-25T00:00:00Z');

const buildPrisma = (): IMockPrisma => ({
  tableMeta: {
    findUnique: vi.fn(async () => null),
  },
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
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  aiFieldTemplate: {
    create: vi.fn(async ({ data }) => ({ ...data, createdTime: now, updatedTime: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    delete: vi.fn(async () => null),
  },
  aiGenerationTask: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }) => ({ ...data, createdTime: now, updatedTime: now })),
    update: vi.fn(async ({ where, data: update }) => ({ ...update, ...where })),
    updateMany: vi.fn(async () => ({ count: 0 })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
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
      prisma.aiField.findUnique.mockResolvedValue({
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

    it('executes a real configured model and persists the generated output', async () => {
      prisma.aiField.findUnique.mockResolvedValue({
        id: 'a',
        baseId: 'b',
        tableId: 't',
        fieldId: 'f',
        operation: 'summarize',
        model: 'MiniMax-M3',
        sourceFieldIds: 'fld_1',
        configJson: JSON.stringify({ maxLength: 100, style: 'concise', language: 'english' }),
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      const generateText = vi.fn().mockResolvedValue('Generated summary');
      const ai = {
        getAIConfig: vi.fn().mockResolvedValue({ aiGatewayApiKey: 'gateway-key' }),
        generateText,
      };
      svc = new AiFieldAuthService(prisma as never, ai as never);

      const run = await svc.executeRun({ aiFieldId: 'a', recordId: 'r1', inputText: 'hello' });

      expect(generateText).toHaveBeenCalledWith(
        'b',
        expect.objectContaining({ modelKey: 'aiGateway@MiniMax-M3@teable' })
      );
      expect(run.status).toBe('ok');
      expect(run.outputText).toBe('Generated summary');
      expect(run.promptTokens).toBeGreaterThan(0);
      expect(run.completionTokens).toBeGreaterThan(0);
    });

    it('deduplicates an automatic run for the same successful input', async () => {
      const existing = {
        id: 'existing-run',
        aiFieldId: 'a',
        recordId: 'r1',
        status: 'ok',
        inputText: 'hello',
        outputText: 'cached output',
        promptTokens: 1,
        completionTokens: 2,
        model: 'MiniMax-M3',
        durationMs: 10,
        errorMessage: null,
        startedAt: now,
        finishedAt: now,
      };
      prisma.aiFieldRun.findFirst.mockResolvedValueOnce(existing);
      const generateText = vi.fn();
      prisma.aiField.findUnique.mockResolvedValueOnce({ id: 'a' });
      svc = new AiFieldAuthService(prisma as never, { generateText } as never);

      const run = await svc.executeRun({ aiFieldId: 'a', recordId: 'r1', inputText: 'hello' });

      expect(run.outputText).toBe('cached output');
      expect(generateText).not.toHaveBeenCalled();
    });

    it('allows a forced manual rerun to bypass deduplication', async () => {
      prisma.aiFieldRun.findFirst.mockResolvedValueOnce({ id: 'existing-run' });
      prisma.aiField.findUnique.mockResolvedValue({
        id: 'a',
        baseId: 'b',
        operation: 'summarize',
        model: 'MiniMax-M3',
        configJson: '{"maxLength":100,"style":"concise"}',
        status: 'enabled',
      });
      const generateText = vi.fn().mockResolvedValue('forced output');
      svc = new AiFieldAuthService(prisma as never, { generateText } as never);

      const run = await svc.executeRun({
        aiFieldId: 'a',
        recordId: 'r1',
        inputText: 'hello',
        force: true,
      });

      expect(run.outputText).toBe('forced output');
      expect(prisma.aiFieldRun.findFirst).not.toHaveBeenCalled();
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('retries a temporary provider error and records rate-limited after exhaustion', async () => {
      vi.stubEnv('AI_FIELD_RETRY_ATTEMPTS', '1');
      vi.stubEnv('AI_FIELD_RETRY_BASE_MS', '0');
      prisma.aiField.findUnique.mockResolvedValue({
        id: 'a',
        baseId: 'b',
        operation: 'summarize',
        model: 'MiniMax-M3',
        configJson: '{"maxLength":100,"style":"concise"}',
        status: 'enabled',
      });
      const generateText = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('rate limit'), { status: 429 }));
      svc = new AiFieldAuthService(prisma as never, { generateText } as never);

      const run = await svc.executeRun({ aiFieldId: 'a', recordId: 'r1', inputText: 'hello' });

      expect(generateText).toHaveBeenCalledTimes(2);
      expect(run.status).toBe('rate-limited');
      vi.unstubAllEnvs();
    });

    it('limits concurrent provider executions', async () => {
      vi.stubEnv('AI_FIELD_MAX_CONCURRENCY', '1');
      const resolvers: Array<(value: string) => void> = [];
      prisma.aiField.findUnique.mockResolvedValue({
        id: 'a',
        baseId: 'b',
        operation: 'summarize',
        model: 'MiniMax-M3',
        configJson: '{"maxLength":100,"style":"concise"}',
        status: 'enabled',
      });
      const generateText = vi.fn(
        () => new Promise<string>((resolve) => resolvers.push(resolve))
      );
      svc = new AiFieldAuthService(prisma as never, { generateText } as never);

      const first = svc.executeRun({ aiFieldId: 'a', recordId: 'r1', inputText: 'one' });
      const second = svc.executeRun({ aiFieldId: 'a', recordId: 'r2', inputText: 'two' });
      await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(1));
      expect(resolvers).toHaveLength(1);
      resolvers[0]('first');
      await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(2));
      resolvers[1]('second');
      await Promise.all([first, second]);
      vi.unstubAllEnvs();
    });

    it('triggers on record create and writes the result to the target field', async () => {
      prisma.tableMeta.findUnique.mockResolvedValueOnce({ baseId: 'b' });
      prisma.aiField.findMany.mockResolvedValueOnce([
        {
          id: 'a',
          baseId: 'b',
          tableId: 't',
          fieldId: 'target',
          sourceFieldIds: 'source',
          status: 'enabled',
          createdTime: now,
        },
      ]);
      prisma.aiField.findUnique.mockResolvedValue({
        id: 'a',
        baseId: 'b',
        tableId: 't',
        fieldId: 'f',
        operation: 'summarize',
        model: 'MiniMax-M3',
        sourceFieldIds: 'source',
        configJson: '{"maxLength":100,"style":"concise"}',
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      const generateText = vi.fn().mockResolvedValue('Generated output');
      const simpleUpdateRecords = vi.fn().mockResolvedValue([]);
      svc = new AiFieldAuthService(
        prisma as never,
        { generateText } as never,
        { simpleUpdateRecords } as never
      );

      await svc.onRecordCreate({
        payload: { tableId: 't', record: { id: 'r1', fields: { source: 'hello' } } },
      } as never);

      expect(generateText).toHaveBeenCalledWith(
        'b',
        expect.objectContaining({ modelKey: 'aiGateway@MiniMax-M3@teable' })
      );
      expect(simpleUpdateRecords).toHaveBeenCalledWith('t', {
        fieldKeyType: 'id',
        typecast: false,
        records: [{ id: 'r1', fields: { target: 'Generated output' } }],
      });
    });

    it('triggers on record update only when a source field changes', async () => {
      prisma.tableMeta.findUnique.mockResolvedValueOnce({ baseId: 'b' });
      prisma.aiField.findMany.mockResolvedValueOnce([
        {
          id: 'a',
          baseId: 'b',
          tableId: 't',
          fieldId: 'target',
          sourceFieldIds: 'source',
          status: 'enabled',
          createdTime: now,
        },
      ]);
      prisma.aiField.findUnique.mockResolvedValue({
        id: 'a',
        baseId: 'b',
        tableId: 't',
        fieldId: 'f',
        operation: 'summarize',
        model: 'MiniMax-M3',
        sourceFieldIds: 'source',
        configJson: '{"maxLength":100,"style":"concise"}',
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      const generateText = vi.fn().mockResolvedValue('Generated update output');
      const simpleUpdateRecords = vi.fn().mockResolvedValue([]);
      svc = new AiFieldAuthService(
        prisma as never,
        { generateText } as never,
        { simpleUpdateRecords } as never
      );

      await svc.onRecordUpdate({
        payload: {
          tableId: 't',
          oldField: undefined,
          record: { id: 'r1', fields: { source: { newValue: 'updated' } } },
        },
      } as never);

      expect(generateText).toHaveBeenCalledTimes(1);
      expect(simpleUpdateRecords).toHaveBeenCalledWith('t', {
        fieldKeyType: 'id',
        typecast: false,
        records: [{ id: 'r1', fields: { target: 'Generated update output' } }],
      });
    });

    it('does not retrigger when an AI update changes only the target field', async () => {
      prisma.tableMeta.findUnique.mockResolvedValueOnce({ baseId: 'b' });
      prisma.aiField.findMany.mockResolvedValueOnce([
        {
          id: 'a',
          baseId: 'b',
          tableId: 't',
          fieldId: 'target',
          sourceFieldIds: 'source',
          status: 'enabled',
          createdTime: now,
        },
      ]);
      const generateText = vi.fn();
      const simpleUpdateRecords = vi.fn();
      svc = new AiFieldAuthService(
        prisma as never,
        { generateText } as never,
        { simpleUpdateRecords } as never
      );

      await svc.onOperationUpdate({
        reqParams: { tableId: 't' },
        resolveData: [{ id: 'r1', fields: { target: 'AI output' } }],
      });

      expect(generateText).not.toHaveBeenCalled();
      expect(simpleUpdateRecords).not.toHaveBeenCalled();
    });

    it('rejects run on missing field', async () => {
      await expect(
        svc.recordRun({ aiFieldId: 'missing', recordId: 'r', inputText: 'x', status: 'ok' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolves {{fieldName}} placeholders in a custom prompt against rowFields', async () => {
      prisma.aiField.findUnique
        .mockResolvedValueOnce({
          id: 'aif_custom',
        baseId: 'bse',
        tableId: 'tbl',
        fieldId: 'fld_target',
        operation: 'custom',
        model: 'MiniMax-M3',
        sourceFieldIds: 'fld_name,fld_score',
        configJson: JSON.stringify({
          prompt: 'Rewrite {{fld_name}} (score {{fld_score}}) in one sentence.',
        }),
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      } as never);
      prisma.aiField.findUnique.mockResolvedValueOnce({
        id: 'aif_custom',
        baseId: 'bse',
        tableId: 'tbl',
        fieldId: 'fld_target',
        operation: 'custom',
        model: 'MiniMax-M3',
        sourceFieldIds: 'fld_name,fld_score',
        configJson: JSON.stringify({
          prompt: 'Rewrite {{fld_name}} (score {{fld_score}}) in one sentence.',
        }),
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      } as never);
      const ai = { generateText: vi.fn().mockResolvedValueOnce('rewritten text') } as unknown as AiService;
      const customSvc = new AiFieldAuthService(prisma as never, ai, undefined, undefined);
      const run = await customSvc.executeRun({
        aiFieldId: 'aif_custom',
        recordId: 'rec',
        inputText: 'hello world',
        force: true,
        rowFields: { fld_name: 'Alice', fld_score: 95 },
      });
      expect(run.status).toBe('ok');
      expect(run.outputText).toBe('rewritten text');
      // Verify the placeholder-resolved prompt was actually sent to the provider
      const lastCall = ((ai.generateText as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] || []) as unknown as { prompt?: string }[];
      expect(lastCall[1].prompt).toContain('Rewrite Alice (score 95) in one sentence.');
    });

    it('resolves unknown placeholders to empty string in custom prompt', async () => {
      prisma.aiField.findUnique
        .mockResolvedValueOnce({
          id: 'aif_custom2',
        baseId: 'bse',
        tableId: 'tbl',
        fieldId: 'fld_target',
        operation: 'custom',
        model: 'MiniMax-M3',
        sourceFieldIds: 'fld_name',
        configJson: JSON.stringify({ prompt: 'Known: {{fld_name}}, Unknown: {{fld_missing}}.' }),
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      } as never);
      prisma.aiField.findUnique.mockResolvedValueOnce({
        id: 'aif_custom2',
        baseId: 'bse',
        tableId: 'tbl',
        fieldId: 'fld_target',
        operation: 'custom',
        model: 'MiniMax-M3',
        sourceFieldIds: 'fld_name',
        configJson: JSON.stringify({ prompt: 'Known: {{fld_name}}, Unknown: {{fld_missing}}.' }),
        configHash: 'h',
        status: 'enabled',
        lastRunAt: null,
        lastErrorMessage: null,
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      } as never);
      const ai = { generateText: vi.fn().mockResolvedValueOnce('ok') } as unknown as AiService;
      const customSvc = new AiFieldAuthService(prisma as never, ai, undefined, undefined);
      await customSvc.executeRun({
        aiFieldId: 'aif_custom2',
        recordId: 'r',
        inputText: 'x',
        force: true,
        rowFields: { fld_name: 'Bob' },
      });
      const lastCall = ((ai.generateText as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] || []) as unknown as { prompt?: string }[];
      expect(lastCall[1].prompt).toBe('Known: Bob, Unknown: .');
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

  describe('startBatchGeneration idempotency', () => {
    const aiFieldRow = {
      id: 'aif_x',
      baseId: 'bse1',
      tableId: 'tbl1',
      fieldId: 'fld1',
      operation: 'summarize',
      model: 'MiniMax-M3',
      sourceFieldIds: 'fld_src',
      configJson: '{}',
      configHash: 'h',
      status: 'enabled',
      lastRunAt: null,
      lastErrorMessage: null,
      createdBy: 'u',
      createdTime: now,
      updatedTime: now,
    };

    it('rejects when a batch task is already active for the same table', async () => {
      prisma.aiField.findUnique.mockResolvedValueOnce(aiFieldRow as never);
      prisma.aiGenerationTask.findFirst.mockResolvedValueOnce({
        id: 'aigt_existing',
        status: 'processing',
        totalCount: 5,
        trigger: 'fill-empty',
      } as never);
      await expect(
        svc.startBatchGeneration({
          aiFieldId: 'aif_x',
          mode: 'fill-empty',
          createdBy: 'u',
        })
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.aiGenerationTask.create).not.toHaveBeenCalled();
    });

    it('allows a new batch task when no active task exists', async () => {
      prisma.aiField.findUnique.mockResolvedValueOnce(aiFieldRow as never);
      prisma.aiGenerationTask.findFirst.mockResolvedValueOnce(null);
      prisma.aiGenerationTask.create.mockResolvedValueOnce({
        id: 'aigt_new',
        status: 'waiting',
      } as never);
      const out = await svc.startBatchGeneration({
        aiFieldId: 'aif_x',
        mode: 'entire-column',
        createdBy: 'u',
      });
      expect(out.taskId).toBe('aigt_new');
      expect(prisma.aiGenerationTask.create).toHaveBeenCalledTimes(1);
    });
  });


  describe('startBatchGeneration persistent queue', () => {
    const aiFieldRow = {
      id: 'aif_q',
      baseId: 'bse1',
      tableId: 'tbl_q',
      fieldId: 'fld1',
      operation: 'summarize',
      model: 'MiniMax-M3',
      sourceFieldIds: 'fld_src',
      configJson: '{}',
      configHash: 'h',
      status: 'enabled',
      lastRunAt: null,
      lastErrorMessage: null,
      createdBy: 'u',
      createdTime: now,
      updatedTime: now,
    };

    function buildQueue() {
      return {
        add: vi.fn(async () => ({ id: 'job' })),
        addBulk: vi.fn(async () => undefined),
      };
    }

    it('enqueues a BullMQ job when a queue is provided and skips setImmediate', async () => {
      const queue = buildQueue();
      prisma.aiField.findUnique.mockResolvedValueOnce(aiFieldRow as never);
      prisma.aiGenerationTask.findFirst.mockResolvedValueOnce(null);
      prisma.aiGenerationTask.create.mockResolvedValueOnce({
        id: 'aigt_q1',
        status: 'waiting',
      } as never);
      const svcWithQueue = new AiFieldAuthService(prisma as never, undefined, undefined, undefined, undefined, queue as never);
      const out = await svcWithQueue.startBatchGeneration({
        aiFieldId: 'aif_q',
        mode: 'fill-empty',
        createdBy: 'u',
        idempotencyKey: 'batch:42',
      });
      expect(out.taskId).toBe('aigt_q1');
      expect(queue.add).toHaveBeenCalledTimes(1);
      const [name, payload, opts] = (
        queue.add as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls[0];
      expect(name).toBe('process');
      expect(payload).toEqual({ taskId: 'aigt_q1' });
      expect(opts).toMatchObject({ jobId: 'aigt_q1' });
    });

    it('returns the existing task when an idempotency key is reused and skips enqueue', async () => {
      const queue = buildQueue();
      prisma.aiField.findUnique.mockResolvedValueOnce(aiFieldRow as never);
      prisma.aiGenerationTask.findFirst.mockResolvedValueOnce({
        id: 'aigt_existing',
        status: 'waiting',
        totalCount: 3,
      } as never);
      const svcWithQueue = new AiFieldAuthService(prisma as never, undefined, undefined, undefined, undefined, queue as never);
      const out = await svcWithQueue.startBatchGeneration({
        aiFieldId: 'aif_q',
        mode: 'fill-empty',
        createdBy: 'u',
        idempotencyKey: 'batch:duplicate',
      });
      expect(out.taskId).toBe('aigt_existing');
      expect(out.totalCount).toBe(3);
      expect(prisma.aiGenerationTask.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('processBatchTask short-circuits when lease claim fails', async () => {
      prisma.aiGenerationTask.findUnique.mockResolvedValueOnce({
        id: 'aigt_lease',
        status: 'processing',
        cancelRequested: false,
      } as never);
      prisma.aiGenerationTask.updateMany.mockResolvedValueOnce({ count: 0 });
      await svc.processBatchTask('aigt_lease');
      expect(prisma.aiGenerationTask.update).not.toHaveBeenCalled();
    });

    it('processBatchTask honors prior cancelRequested before claiming the lease', async () => {
      prisma.aiGenerationTask.findUnique.mockResolvedValueOnce({
        id: 'aigt_cancel',
        status: 'waiting',
        cancelRequested: true,
      } as never);
      prisma.aiGenerationTask.updateMany.mockResolvedValueOnce({ count: 1 });
      await svc.processBatchTask('aigt_cancel');
      expect(prisma.aiGenerationTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'aigt_cancel' }),
          data: expect.objectContaining({ status: 'cancelled' }),
        })
      );
    });

    it('cancelBatchTask sets errorCode=TASK_CANCELED, heartbeat and clears lease', async () => {
      prisma.aiGenerationTask.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.aiGenerationTask.findUnique.mockResolvedValueOnce({
        id: 'aigt_x',
        baseId: 'bse1',
        tableId: 'tbl_q',
        trigger: 'fill-empty',
        status: 'cancelled',
        totalCount: 0,
        completedCount: 0,
        failedCount: 0,
        cancelRequested: true,
        lastError: null,
        errorCode: 'TASK_CANCELED',
        attempt: 1,
        maxAttempts: 3,
        heartbeatAt: now,
        leaseUntil: null,
        retryAt: null,
        tenantId: null,
        correlationId: null,
        idempotencyKey: null,
        startedTime: now,
        finishedTime: now,
        createdTime: now,
        updatedTime: now,
      } as never);
      const out = await svc.cancelBatchTask('aigt_x');
      if (!out) throw new Error('out is null');
      expect(out.status).toBe('cancelled');
      expect(out.errorCode).toBe('TASK_CANCELED');
      const call = (
        prisma.aiGenerationTask.updateMany as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).toMatchObject({
        status: 'cancelled',
        cancelRequested: true,
        errorCode: 'TASK_CANCELED',
        leaseUntil: null,
      });
    });

    it('recoverExpiredBatchTasks returns expired rows to waiting and bulk-enqueues them', async () => {
      const queue = buildQueue();
      prisma.aiGenerationTask.updateMany.mockResolvedValueOnce({ count: 2 });
      prisma.aiGenerationTask.findMany.mockResolvedValueOnce([
        { id: 'aigt_a' },
        { id: 'aigt_b' },
      ] as never);
      const recovered = await svc.recoverExpiredBatchTasks(queue as never);
      expect(recovered).toBe(2);
      expect(queue.addBulk).toHaveBeenCalledTimes(1);
      const bulk = (
        queue.addBulk as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls[0][0] as Array<{ name: string; data: { taskId: string } }>;
      expect(bulk.map((b) => b.data.taskId)).toEqual(['aigt_a', 'aigt_b']);
      expect(bulk[0].name).toBe('process');
    });

    it('recoverExpiredBatchTasks is a no-op when nothing is expired', async () => {
      const queue = buildQueue();
      prisma.aiGenerationTask.updateMany.mockResolvedValueOnce({ count: 0 });
      const recovered = await svc.recoverExpiredBatchTasks(queue as never);
      expect(recovered).toBe(0);
      expect(queue.addBulk).not.toHaveBeenCalled();
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
