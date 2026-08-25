/**
 * AI Builder (NL → schema) — Stage 30 types.
 *
 * Translate a natural-language description into a field/view/table
 * proposal. The proposal is reviewed by a human before it is
 * committed to the schema, so we keep the boundary clean:
 *   - Parsing & sanitizing: pure helpers.
 *   - Provider abstraction: an injected LLM client (mockable).
 *   - Persistence: the NestJS auth service holds Prisma.
 */

export type BuilderEntityType = 'table' | 'field' | 'view' | 'record';

export type BuilderProposalStatus = 'draft' | 'approved' | 'rejected' | 'applied';

export type BuilderFieldType =
  | 'singleLineText'
  | 'longText'
  | 'number'
  | 'checkbox'
  | 'singleSelect'
  | 'multipleSelects'
  | 'date'
  | 'attachment'
  | 'url'
  | 'email'
  | 'phone'
  | 'rating'
  | 'formula';

export interface IBuilderFieldProposal {
  name: string;
  type: BuilderFieldType;
  description?: string;
  options?: ReadonlyArray<string>;
  required?: boolean;
  formula?: string;
}

export interface IBuilderTableProposal {
  name: string;
  description?: string;
  fields: ReadonlyArray<IBuilderFieldProposal>;
  primaryFieldName: string;
}

export interface IBuilderViewProposal {
  name: string;
  type: 'grid' | 'kanban' | 'gallery' | 'calendar' | 'form' | 'timeline';
  groupBy?: string;
  visibleFieldNames?: ReadonlyArray<string>;
}

export interface IBuilderProposal {
  entityType: BuilderEntityType;
  title: string;
  rationale: string;
  confidence: number;
  payload: IBuilderTableProposal | IBuilderFieldProposal | IBuilderViewProposal;
}

export interface IBuilderProposalRow {
  id: string;
  baseId: string;
  status: BuilderProposalStatus;
  sourcePrompt: string;
  proposalJson: string;
  proposalHash: string;
  model: string;
  createdBy: string;
  createdTime: Date;
  approvedBy: string | null;
  approvedTime: Date | null;
  appliedResourceId: string | null;
}

export interface ICreateBuilderProposalInput {
  baseId: string;
  sourcePrompt: string;
  createdBy: string;
}

export interface IApproveBuilderProposalInput {
  proposalId: string;
  approvedBy: string;
}

export const SUPPORTED_FIELD_TYPES: ReadonlyArray<BuilderFieldType> = [
  'singleLineText',
  'longText',
  'number',
  'checkbox',
  'singleSelect',
  'multipleSelects',
  'date',
  'attachment',
  'url',
  'email',
  'phone',
  'rating',
  'formula',
];

export const SUPPORTED_VIEW_TYPES: ReadonlyArray<IBuilderViewProposal['type']> = [
  'grid',
  'kanban',
  'gallery',
  'calendar',
  'form',
  'timeline',
];
