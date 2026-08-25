import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildProposalRow,
  buildPromptForLlm,
  hashProposal,
  ILlmProvider,
  isValidStatusTransition,
  OfflineBuilderProvider,
  parseAndValidateProposal,
  sanitizePrompt,
  stringifyProposal,
  validateProposal,
} from './ai-builder.service';
import type {
  BuilderEntityType,
  BuilderProposalStatus,
  IApproveBuilderProposalInput,
  IBuilderProposal,
  IBuilderProposalRow,
  ICreateBuilderProposalInput,
} from './ai-builder.types';

export const LLM_PROVIDER = Symbol('AI_BUILDER_LLM_PROVIDER');

@Injectable()
export class AiBuilderAuthService {
  private readonly provider: ILlmProvider;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(LLM_PROVIDER) provider?: ILlmProvider
  ) {
    this.provider = provider ?? new OfflineBuilderProvider();
  }

  async createProposal(input: ICreateBuilderProposalInput): Promise<IBuilderProposalRow> {
    const prompt = sanitizePrompt(input.sourcePrompt);
    const llmRaw = await this.provider.complete({
      model: 'stub/builder-v1',
      prompt: buildPromptForLlm({ userPrompt: prompt, entityType: 'table' }),
    });
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
      model: 'stub/builder-v1',
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

  async getProposal(proposalId: string): Promise<IBuilderProposalRow | null> {
    const row = await this.prisma.aiBuilderProposal.findUnique({ where: { id: proposalId } });
    return row ? toRow(row) : null;
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

  async reject(proposalId: string, reason: string): Promise<IBuilderProposalRow> {
    const existing = await this.prisma.aiBuilderProposal.findUnique({
      where: { id: proposalId },
    });
    if (!existing) throw new NotFoundException(`proposal not found: ${proposalId}`);
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

  async markApplied(proposalId: string, resourceId: string): Promise<IBuilderProposalRow> {
    const existing = await this.prisma.aiBuilderProposal.findUnique({
      where: { id: proposalId },
    });
    if (!existing) throw new NotFoundException(`proposal not found: ${proposalId}`);
    if (!isValidStatusTransition(existing.status as BuilderProposalStatus, 'applied')) {
      throw new BadRequestException(`invalid transition: ${existing.status} → applied`);
    }
    const updated = await this.prisma.aiBuilderProposal.update({
      where: { id: proposalId },
      data: { status: 'applied', appliedResourceId: resourceId },
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

export const __testOnly = { toRow };
