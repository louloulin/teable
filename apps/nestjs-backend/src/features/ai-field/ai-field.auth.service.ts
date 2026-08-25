import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildAiFieldRow,
  buildDefaultPrompt,
  buildRunRow,
  buildTemplateRow,
  estimateTokens,
  foldRuns,
  guardOutput,
  hashConfig,
  isValidModel,
  isValidOperation,
  isValidStatusTransition,
  parseConfig,
  parseSourceFieldIds,
  renderPrompt,
  stringifyConfig,
  validateConfig,
} from './ai-field.service';
import type {
  AiFieldConfig,
  AiFieldOperation,
  AiFieldStatus,
  IAiField,
  IAiFieldRun,
  IAiFieldTemplate,
  ICreateAiFieldInput,
  ICreateTemplateInput,
  IRunAiFieldInput,
  IUpdateAiFieldInput,
  IUsageAggregate,
} from './ai-field.types';

@Injectable()
export class AiFieldAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createAiField(input: ICreateAiFieldInput): Promise<IAiField> {
    if (!isValidOperation(input.operation)) throw new BadRequestException('invalid operation');
    if (!isValidModel(input.model)) throw new BadRequestException('invalid model');
    if (input.sourceFieldIds.length === 0) throw new BadRequestException('sourceFieldIds required');
    try {
      validateConfig(input.operation, input.config);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const dup = await this.prisma.aiField.findUnique({
      where: {
        baseId_tableId_fieldId_operation: {
          baseId: input.baseId,
          tableId: input.tableId,
          fieldId: input.fieldId,
          operation: input.operation,
        },
      },
    });
    if (dup) throw new ConflictException('ai field exists');
    const id = `aif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildAiFieldRow({ id, ...input });
    const created = await this.prisma.aiField.create({
      data: {
        id: row.id,
        baseId: row.baseId,
        tableId: row.tableId,
        fieldId: row.fieldId,
        operation: row.operation,
        model: row.model,
        sourceFieldIds: row.sourceFieldIds,
        configJson: row.configJson,
        configHash: row.configHash,
        createdBy: row.createdBy,
      },
    });
    return toAiFieldRow(created);
  }

  async updateAiField(aiFieldId: string, update: IUpdateAiFieldInput): Promise<IAiField> {
    const existing = await this.prisma.aiField.findUnique({ where: { id: aiFieldId } });
    if (!existing) throw new NotFoundException(`ai field not found: ${aiFieldId}`);
    if (update.model && !isValidModel(update.model)) throw new BadRequestException('invalid model');
    if (
      update.status &&
      !isValidStatusTransition(existing.status as AiFieldStatus, update.status)
    ) {
      throw new BadRequestException(
        `invalid status transition: ${existing.status} → ${update.status}`
      );
    }
    let configJson = existing.configJson;
    let configHash = existing.configHash;
    if (update.config) {
      try {
        validateConfig(existing.operation as AiFieldOperation, update.config);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      configJson = stringifyConfig(update.config);
      configHash = hashConfig(update.config);
    }
    const updated = await this.prisma.aiField.update({
      where: { id: aiFieldId },
      data: {
        model: update.model ?? existing.model,
        sourceFieldIds: update.sourceFieldIds
          ? update.sourceFieldIds.join(',')
          : existing.sourceFieldIds,
        configJson,
        configHash,
        status: update.status ?? existing.status,
        updatedTime: new Date(),
      },
    });
    return toAiFieldRow(updated);
  }

  async deleteAiField(aiFieldId: string): Promise<void> {
    const existing = await this.prisma.aiField.findUnique({ where: { id: aiFieldId } });
    if (!existing) throw new NotFoundException(`ai field not found: ${aiFieldId}`);
    await this.prisma.aiFieldRun.deleteMany({ where: { aiFieldId } });
    await this.prisma.aiField.delete({ where: { id: aiFieldId } });
  }

  async listAiFields(baseId: string, tableId: string): Promise<IAiField[]> {
    const rows = await this.prisma.aiField.findMany({ where: { baseId, tableId } });
    return rows.map(toAiFieldRow);
  }

  async getAiField(aiFieldId: string): Promise<IAiField | null> {
    const row = await this.prisma.aiField.findUnique({ where: { id: aiFieldId } });
    return row ? toAiFieldRow(row) : null;
  }

  async recordRun(
    input: IRunAiFieldInput & {
      status: 'ok' | 'failed' | 'rate-limited' | 'skipped';
      errorMessage?: string | null;
    }
  ): Promise<IAiFieldRun> {
    const aiField = await this.prisma.aiField.findUnique({ where: { id: input.aiFieldId } });
    if (!aiField) throw new NotFoundException(`ai field not found: ${input.aiFieldId}`);
    const startedAt = new Date();
    const outputText = input.stubOutput ?? '';
    const finishedAt = new Date();
    const id = `aifr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildRunRow({
      id,
      model: aiField.model,
      outputText,
      ...input,
      startedAt,
      finishedAt,
    });
    const created = await this.prisma.aiFieldRun.create({
      data: {
        id: row.id,
        aiFieldId: row.aiFieldId,
        recordId: row.recordId,
        status: input.status,
        inputText: row.inputText,
        outputText: row.outputText,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        model: row.model,
        durationMs: row.durationMs,
        errorMessage: input.errorMessage ?? null,
      },
    });
    await this.prisma.aiField.update({
      where: { id: input.aiFieldId },
      data: {
        lastRunAt: finishedAt,
        lastErrorMessage: input.status === 'failed' ? input.errorMessage ?? null : null,
      },
    });
    return toRunRow(created);
  }

  async listRuns(aiFieldId: string, limit = 50): Promise<IAiFieldRun[]> {
    const rows = await this.prisma.aiFieldRun.findMany({
      where: { aiFieldId },
      orderBy: { startedAt: 'desc' },
      take: Math.min(limit, 5_000),
    });
    return rows.map(toRunRow);
  }

  async foldUsageFor(aiFieldId: string): Promise<IUsageAggregate> {
    const rows = await this.prisma.aiFieldRun.findMany({ where: { aiFieldId } });
    return foldRuns(
      rows.map((r) => ({
        status: r.status as 'ok' | 'failed' | 'rate-limited' | 'skipped',
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        durationMs: r.durationMs,
      }))
    );
  }

  async createTemplate(input: ICreateTemplateInput): Promise<IAiFieldTemplate> {
    if (!isValidOperation(input.operation)) throw new BadRequestException('invalid operation');
    if (input.name.trim().length === 0) throw new BadRequestException('name required');
    const dup = await this.prisma.aiFieldTemplate.findUnique({
      where: {
        operation_language_name: {
          operation: input.operation,
          language: input.language ?? 'english',
          name: input.name,
        },
      },
    });
    if (dup) throw new ConflictException('template exists');
    const id = `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildTemplateRow({ id, ...input });
    const created = await this.prisma.aiFieldTemplate.create({
      data: {
        id: row.id,
        operation: row.operation,
        language: row.language,
        name: row.name,
        promptTemplate: row.promptTemplate,
        description: row.description,
        createdBy: row.createdBy,
      },
    });
    return toTemplateRow(created);
  }

  async listTemplates(input: {
    operation: AiFieldOperation;
    language?: string;
  }): Promise<IAiFieldTemplate[]> {
    const rows = await this.prisma.aiFieldTemplate.findMany({
      where: { operation: input.operation, language: input.language ?? 'english' },
    });
    return rows.map(toTemplateRow);
  }

  async deleteTemplate(templateId: string): Promise<void> {
    await this.prisma.aiFieldTemplate.delete({ where: { id: templateId } });
  }

  renderPrompt(input: { template: string; variables: Record<string, string | number> }): string {
    return renderPrompt(input);
  }

  buildDefaultPrompt(input: {
    operation: AiFieldOperation;
    language: string;
    config: AiFieldConfig;
    input: string;
  }): string {
    return buildDefaultPrompt(input.operation, input.language, input.config, input.input);
  }

  guardOutput(input: {
    operation: AiFieldOperation;
    config: AiFieldConfig;
    rawOutput: string;
  }): string {
    return guardOutput(input);
  }

  estimateTokens(text: string): number {
    return estimateTokens(text);
  }

  hashConfig(config: AiFieldConfig): string {
    return hashConfig(config);
  }

  stringifyConfig(config: AiFieldConfig): string {
    return stringifyConfig(config);
  }

  parseConfig<TConfig = AiFieldConfig>(configJson: string): TConfig {
    return parseConfig<TConfig>(configJson);
  }

  parseSourceFieldIds(csv: string): string[] {
    return parseSourceFieldIds(csv);
  }

  foldRuns(
    records: ReadonlyArray<{
      status: 'ok' | 'failed' | 'rate-limited' | 'skipped';
      promptTokens: number;
      completionTokens: number;
      durationMs: number;
    }>
  ): IUsageAggregate {
    return foldRuns(records);
  }
}

function toAiFieldRow(r: {
  id: string;
  baseId: string;
  tableId: string;
  fieldId: string;
  operation: string;
  model: string;
  sourceFieldIds: string;
  configJson: string;
  configHash: string;
  status: string;
  lastRunAt: Date | null;
  lastErrorMessage: string | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}): IAiField {
  return {
    id: r.id,
    baseId: r.baseId,
    tableId: r.tableId,
    fieldId: r.fieldId,
    operation: r.operation as AiFieldOperation,
    model: r.model,
    sourceFieldIds: r.sourceFieldIds,
    configJson: r.configJson,
    configHash: r.configHash,
    status: r.status as AiFieldStatus,
    lastRunAt: r.lastRunAt,
    lastErrorMessage: r.lastErrorMessage,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toRunRow(r: {
  id: string;
  aiFieldId: string;
  recordId: string;
  status: string;
  inputText: string;
  outputText: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  durationMs: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): IAiFieldRun {
  return {
    id: r.id,
    aiFieldId: r.aiFieldId,
    recordId: r.recordId,
    status: r.status as IAiFieldRun['status'],
    inputText: r.inputText,
    outputText: r.outputText,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    model: r.model,
    durationMs: r.durationMs,
    errorMessage: r.errorMessage,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
}

function toTemplateRow(r: {
  id: string;
  operation: string;
  language: string;
  name: string;
  promptTemplate: string;
  description: string | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}): IAiFieldTemplate {
  return {
    id: r.id,
    operation: r.operation as AiFieldOperation,
    language: r.language,
    name: r.name,
    promptTemplate: r.promptTemplate,
    description: r.description,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}
