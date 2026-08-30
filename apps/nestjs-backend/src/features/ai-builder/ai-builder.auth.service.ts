import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FieldType } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import type { ICreateTableWithDefault } from '@teable/openapi';

import { TableOpenApiV2Service } from '../table/open-api/table-open-api-v2.service';
import {
  buildProposalRow,
  buildPromptForLlm,
  hashProposal,
  ILlmProvider,
  isValidStatusTransition,
  parseAndValidateProposal,
  sanitizePrompt,
  stringifyProposal,
  validateProposal,
} from './ai-builder.service';
import type {
  BuilderProposalStatus,
  IApproveBuilderProposalInput,
  IBuilderProposal,
  IBuilderFieldProposal,
  IBuilderProposalRow,
  ICreateBuilderProposalInput,
} from './ai-builder.types';

export const LLM_PROVIDER = Symbol('AI_BUILDER_LLM_PROVIDER');

@Injectable()
export class AiBuilderAuthService {
  private readonly provider: ILlmProvider;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(LLM_PROVIDER) provider?: ILlmProvider,
    @Optional() private readonly tableService?: TableOpenApiV2Service
  ) {
    if (!provider) {
      throw new ServiceUnavailableException('AI Builder provider is not configured');
    }
    this.provider = provider;
  }

  async createProposal(input: ICreateBuilderProposalInput): Promise<IBuilderProposalRow> {
    const prompt = sanitizePrompt(input.sourcePrompt);
    let llmRaw: string;
    try {
      llmRaw = await this.provider.complete({
        model: 'configured/builder',
        prompt: buildPromptForLlm({ userPrompt: prompt, entityType: 'table' }),
        baseId: input.baseId,
      });
    } catch {
      throw new ServiceUnavailableException('AI Builder provider is unavailable');
    }
    let proposal: IBuilderProposal;
    try {
      proposal = parseAndValidateProposal(llmRaw);
    } catch (e) {
      throw new BadRequestException(`proposal invalid: ${(e as Error).message}`);
    }
    const id = `abp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildProposalRow({
      id,
      baseId: input.baseId,
      status: 'draft',
      sourcePrompt: prompt,
      proposal,
      model: 'configured/builder',
      createdBy: input.createdBy,
    });
    const created = await this.prisma.aiBuilderProposal.create({
      data: {
        id: row.id,
        baseId: row.baseId,
        status: row.status,
        sourcePrompt: row.sourcePrompt,
        proposalJson: row.proposalJson,
        proposalHash: row.proposalHash,
        model: row.model,
        createdBy: row.createdBy,
      },
    });
    return toRow(created);
  }

  async getProposal(proposalId: string, baseId?: string): Promise<IBuilderProposalRow | null> {
    const row = await this.prisma.aiBuilderProposal.findUnique({ where: { id: proposalId } });
    return row && (!baseId || row.baseId === baseId) ? toRow(row) : null;
  }

  async listProposals(baseId: string): Promise<IBuilderProposalRow[]> {
    const rows = await this.prisma.aiBuilderProposal.findMany({
      where: { baseId },
      orderBy: { createdTime: 'desc' },
    });
    return rows.map(toRow);
  }

  async approve(input: IApproveBuilderProposalInput): Promise<IBuilderProposalRow> {
    const existing = await this.prisma.aiBuilderProposal.findUnique({
      where: { id: input.proposalId },
    });
    if (!existing) throw new NotFoundException(`proposal not found: ${input.proposalId}`);
    if (input.baseId && existing.baseId !== input.baseId) {
      throw new NotFoundException(`proposal not found: ${input.proposalId}`);
    }
    if (existing.createdBy !== input.approvedBy) {
      throw new ForbiddenException('only the author can approve');
    }
    if (!isValidStatusTransition(existing.status as BuilderProposalStatus, 'approved')) {
      throw new BadRequestException(`invalid transition: ${existing.status} → approved`);
    }
    const updated = await this.prisma.aiBuilderProposal.update({
      where: { id: input.proposalId },
      data: {
        status: 'approved',
        approvedBy: input.approvedBy,
        approvedTime: new Date(),
      },
    });
    return toRow(updated);
  }

  async reject(proposalId: string, reason: string, baseId?: string): Promise<IBuilderProposalRow> {
    const existing = await this.prisma.aiBuilderProposal.findUnique({
      where: { id: proposalId },
    });
    if (!existing) throw new NotFoundException(`proposal not found: ${proposalId}`);
    if (baseId && existing.baseId !== baseId) {
      throw new NotFoundException(`proposal not found: ${proposalId}`);
    }
    if (!isValidStatusTransition(existing.status as BuilderProposalStatus, 'rejected')) {
      throw new BadRequestException(`invalid transition: ${existing.status} → rejected`);
    }
    const updated = await this.prisma.aiBuilderProposal.update({
      where: { id: proposalId },
      data: { status: 'rejected' },
    });
    void reason; // reserved for audit log entry
    return toRow(updated);
  }

  async markApplied(
    proposalId: string,
    resourceId: string | undefined,
    baseId?: string
  ): Promise<IBuilderProposalRow> {
    const existing = await this.prisma.aiBuilderProposal.findUnique({
      where: { id: proposalId },
    });
    if (!existing) throw new NotFoundException(`proposal not found: ${proposalId}`);
    if (baseId && existing.baseId !== baseId) {
      throw new NotFoundException(`proposal not found: ${proposalId}`);
    }
    if (!isValidStatusTransition(existing.status as BuilderProposalStatus, 'applied')) {
      throw new BadRequestException(`invalid transition: ${existing.status} → applied`);
    }
    let appliedResourceId = resourceId;
    if (!appliedResourceId) {
      if (!this.tableService) {
        throw new BadRequestException('table service is unavailable for automatic apply');
      }
      if (existing.status !== 'approved') {
        throw new BadRequestException('proposal must be approved before applying');
      }
      const proposal = this.revalidate(existing.proposalJson);
      if (proposal.entityType !== 'table') {
        throw new BadRequestException('only table proposals can be applied automatically');
      }
      const table = await this.tableService.createTable(
        existing.baseId,
        toCreateTableInput(proposal.payload)
      );
      appliedResourceId = table.id;
    }
    const updated = await this.prisma.aiBuilderProposal.update({
      where: { id: proposalId },
      data: { status: 'applied', appliedResourceId },
    });
    return toRow(updated);
  }

  /** Re-parse and re-validate a stored proposal; useful after upgrades. */
  revalidate(proposalJson: string): IBuilderProposal {
    const proposal = JSON.parse(proposalJson) as IBuilderProposal;
    validateProposal(proposal);
    return proposal;
  }

  hashProposal = hashProposal;
  stringifyProposal = stringifyProposal;
  sanitizePrompt = sanitizePrompt;
  buildPromptForLlm = buildPromptForLlm;
}

function toCreateTableInput(payload: IBuilderProposal['payload']): ICreateTableWithDefault {
  if (!('fields' in payload)) {
    throw new BadRequestException('table proposal fields are missing');
  }
  const fields = payload.fields.map((field, index) => ({
    name: field.name,
    type: toFieldType(field.type),
    options: toFieldOptions(field),
    ...(field.name === payload.primaryFieldName || index === 0 ? { isPrimary: true } : {}),
  }));
  return {
    name: payload.name,
    fields,
    views: [{ type: 'grid', name: 'Grid view' }],
    records: [],
  } as ICreateTableWithDefault;
}

function toFieldType(type: IBuilderFieldProposal['type']): FieldType {
  switch (type) {
    case 'longText':
      return FieldType.LongText;
    case 'number':
      return FieldType.Number;
    case 'checkbox':
      return FieldType.Checkbox;
    case 'singleSelect':
      return FieldType.SingleSelect;
    case 'multipleSelects':
      return FieldType.MultipleSelect;
    case 'date':
      return FieldType.Date;
    case 'rating':
      return FieldType.Rating;
    case 'formula':
      return FieldType.Formula;
    default:
      return FieldType.SingleLineText;
  }
}

function toFieldOptions(field: IBuilderFieldProposal): Record<string, unknown> {
  switch (field.type) {
    case 'singleSelect':
    case 'multipleSelects':
      return {
        choices: (field.options ?? ['todo', 'done']).map((name, index) => ({
          name,
          color: ['blue', 'green', 'orange', 'red', 'purple'][index % 5],
        })),
      };
    case 'date':
      return { formatting: { date: 'YYYY-MM-DD', time: 'None', timeZone: 'utc' } };
    case 'number':
      return { formatting: { type: 'decimal', precision: 2 } };
    case 'rating':
      return { icon: 'star', color: 'yellowBright', max: 5 };
    case 'formula':
      return { expression: field.formula ?? '""' };
    default:
      return {};
  }
}

function toRow(r: {
  id: string;
  baseId: string;
  status: string;
  sourcePrompt: string;
  proposalJson: string;
  proposalHash: string;
  model: string;
  createdBy: string;
  createdTime: Date;
  approvedBy: string | null;
  approvedTime: Date | null;
  appliedResourceId: string | null;
}): IBuilderProposalRow {
  return {
    id: r.id,
    baseId: r.baseId,
    status: r.status as BuilderProposalStatus,
    sourcePrompt: r.sourcePrompt,
    proposalJson: r.proposalJson,
    proposalHash: r.proposalHash,
    model: r.model,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    approvedBy: r.approvedBy,
    approvedTime: r.approvedTime,
    appliedResourceId: r.appliedResourceId,
  };
}

export const testOnly = { toRow };
