import {
  domainError,
  SearchDocumentFieldContributionVisitor,
  type DomainError,
  type SearchDocumentFieldContribution,
  type Table,
} from '@teable/v2-core';
import { err, ok } from 'neverthrow';
import type { Result } from 'neverthrow';

export type TableSearchDocumentFieldDefinition = SearchDocumentFieldContribution & {
  readonly included: true;
  readonly fieldDbName: string;
  readonly textProjection: 'text_cast';
};

export type TableSearchAccessPathDefinition = {
  readonly tableId: string;
  readonly baseId: string;
  readonly semantics: 'substring' | 'lexical';
  readonly provider: 'pg_trgm' | 'pg_bigm' | 'tsvector';
  readonly languageConfig?: string;
  readonly scope: 'all_fields' | 'selected_fields';
  readonly accessPath: 'generated_text' | 'generated_tsvector' | 'none';
  readonly indexKind: 'gin_trgm' | 'gin_bigm' | 'gin_tsvector' | 'none';
  readonly definitionKey: string;
  readonly fields: readonly TableSearchDocumentFieldDefinition[];
  readonly skippedFields: readonly SearchDocumentFieldContribution[];
};

export type BuildTableSearchAccessPathDefinitionOptions = {
  readonly semantics?: 'substring' | 'lexical';
  readonly provider?: 'pg_trgm' | 'pg_bigm' | 'tsvector';
  readonly languageConfig?: string;
  readonly fieldIds?: readonly string[];
};

const languageConfigPattern = /^[\w.]+$/;

const validateSearchOptions = (
  semantics: 'substring' | 'lexical',
  provider: 'pg_trgm' | 'pg_bigm' | 'tsvector',
  languageConfig: string
): Result<void, DomainError> => {
  if (semantics === 'substring' && provider === 'tsvector') {
    return err(domainError.validation({ message: 'Substring search requires an n-gram provider' }));
  }
  if (semantics === 'lexical' && provider !== 'tsvector') {
    return err(
      domainError.validation({ message: 'Lexical search requires the tsvector provider' })
    );
  }
  return languageConfigPattern.test(languageConfig)
    ? ok(undefined)
    : err(domainError.validation({ message: 'Invalid search vector language config' }));
};

const collectSearchFields = (
  table: Table,
  selectedIds: ReadonlySet<string> | undefined
): Result<
  {
    fields: TableSearchDocumentFieldDefinition[];
    skippedFields: SearchDocumentFieldContribution[];
  },
  DomainError
> => {
  const visitor = new SearchDocumentFieldContributionVisitor();
  const fields: TableSearchDocumentFieldDefinition[] = [];
  const skippedFields: SearchDocumentFieldContribution[] = [];
  for (const field of table.getFields()) {
    if (selectedIds && !selectedIds.has(field.id().toString())) continue;
    const contribution = field.accept(visitor);
    if (contribution.isErr()) return err(contribution.error);
    if (!contribution.value.included) {
      skippedFields.push(contribution.value);
      continue;
    }
    const dbFieldName = field.dbFieldName().andThen((name) => name.value());
    if (dbFieldName.isErr()) {
      skippedFields.push({
        ...contribution.value,
        included: false,
        skippedReason: 'unsupported_search_field_type',
      });
      continue;
    }
    fields.push({
      ...contribution.value,
      included: true,
      fieldDbName: dbFieldName.value,
      textProjection: 'text_cast',
    });
  }
  return ok({ fields, skippedFields });
};

export const buildTableSearchAccessPathDefinition = (
  table: Table,
  options: BuildTableSearchAccessPathDefinitionOptions = {}
): Result<TableSearchAccessPathDefinition, DomainError> => {
  const { semantics, provider, languageConfig } = resolveSearchOptions(options);
  const validation = validateSearchOptions(semantics, provider, languageConfig);
  if (validation.isErr()) return err(validation.error);

  const selectedIds = options.fieldIds?.length ? new Set(options.fieldIds) : undefined;
  const collected = collectSearchFields(table, selectedIds);
  if (collected.isErr()) return err(collected.error);
  const { fields, skippedFields } = collected.value;

  const tableId = table.id().toString();
  const definitionKey = `${tableId}:${semantics}:${provider}:${
    semantics === 'lexical' ? languageConfig : 'none'
  }:${fields.map((field) => `${field.fieldId}=${field.fieldDbName}`).join(',')}`;

  return ok({
    tableId,
    baseId: table.baseId().toString(),
    semantics,
    provider,
    ...(semantics === 'lexical' ? { languageConfig } : {}),
    scope: selectedIds ? 'selected_fields' : 'all_fields',
    accessPath:
      fields.length > 0
        ? semantics === 'substring'
          ? 'generated_text'
          : 'generated_tsvector'
        : 'none',
    indexKind:
      fields.length > 0
        ? provider === 'pg_bigm'
          ? 'gin_bigm'
          : provider === 'pg_trgm'
            ? 'gin_trgm'
            : 'gin_tsvector'
        : 'none',
    definitionKey,
    fields,
    skippedFields,
  });
};

const resolveSearchOptions = (options: BuildTableSearchAccessPathDefinitionOptions) => {
  const semantics = options.semantics ?? 'substring';
  const provider = options.provider ?? (semantics === 'lexical' ? 'tsvector' : 'pg_trgm');
  return {
    semantics,
    provider,
    languageConfig: options.languageConfig?.trim() || 'simple',
  };
};

export type TableSearchVectorFieldDefinition = TableSearchDocumentFieldDefinition;
export type TableSearchVectorDefinition = TableSearchAccessPathDefinition;
export type BuildTableSearchVectorDefinitionOptions = BuildTableSearchAccessPathDefinitionOptions;
export const buildTableSearchVectorDefinition = buildTableSearchAccessPathDefinition;
