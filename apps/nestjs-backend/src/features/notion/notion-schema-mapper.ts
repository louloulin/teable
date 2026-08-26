/**
 * Notion → Teable schema + value mappers.
 *
 * The accepted property types are kept in two parallel maps so the wizard's
 * preview (step 3) and the import service (step 3 → server) agree on which
 * Notion shapes round-trip cleanly. Anything outside the supported set is
 * "skipped" with a `note` so the import result can show the caller what was
 * dropped without forcing them to re-read the raw Notion payload.
 *
 * The mapping is intentionally narrow — Notion's `formula` / `relation` /
 * `rollup` / `files` / `people` / `status` are skipped today because they
 * need richer schema support than Teable currently has at the field layer.
 * Adding `status` would be a single-line change once `singleSelect` can be
 * extended with cross-table validation, which is out of scope here.
 */
import type { IFieldRo } from '@teable/core';
import { FieldType } from '@teable/core';

import type {
  INotionDatabaseSchema,
  INotionPageListItem,
  INotionPropertySchema,
  INotionPropertyValue,
  INotionRichText,
} from './notion.types';

export interface INotionFieldMapping {
  /** Source property name (Notion). */
  sourceName: string;
  /** Teable field name (same as source by default; sanitised). */
  targetName: string;
  fieldRo: IFieldRo;
  /** When non-null, the property was skipped on purpose. */
  skipReason?: string;
}

export interface INotionSchemaMappingResult {
  fields: INotionFieldMapping[];
  /** Skipped source property names — used by the wizard preview. */
  skipped: Array<{ sourceName: string; reason: string }>;
  /** Index of the primary field within `fields`, or -1 if none. */
  primaryIndex: number;
}

export type NotionPropertyType =
  | 'title'
  | 'rich_text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'checkbox'
  | 'date'
  | 'url'
  | 'email'
  | 'phone_number'
  | 'formula'
  | 'relation'
  | 'rollup'
  | 'files'
  | 'people'
  | 'status'
  | 'created_by'
  | 'created_time'
  | 'last_edited_by'
  | 'last_edited_time';

export const SUPPORTED_NOTION_TYPES: ReadonlySet<NotionPropertyType> = new Set([
  'title',
  'rich_text',
  'number',
  'select',
  'multi_select',
  'checkbox',
  'date',
  'url',
  'email',
  'phone_number',
]);

/** Normalise a Notion property name into a safe Teable field name. */
const sanitizeFieldName = (name: string): string => {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : 'untitled';
};

const buildOptions = (
  property: INotionPropertySchema,
  source: 'select' | 'multi_select' | 'status'
): Array<{ name: string; color?: string }> => {
  const sourceOptions = property[source]?.options ?? [];
  return sourceOptions
    .map((option) => ({ name: option.name, color: option.color }))
    .filter((option) => option.name);
};

const buildSelectFieldRo = (name: string, property: INotionPropertySchema): IFieldRo => {
  const options = buildOptions(property, 'select');
  return {
    name,
    type: FieldType.SingleSelect,
    options,
  } as unknown as IFieldRo;
};

const buildMultiSelectFieldRo = (
  name: string,
  property: INotionPropertySchema
): IFieldRo => {
  const options = buildOptions(property, 'multi_select');
  return {
    name,
    type: FieldType.MultipleSelect,
    options,
  } as unknown as IFieldRo;
};

const buildNumberFieldRo = (name: string, property: INotionPropertySchema): IFieldRo => {
  // Notion's `number.format` is a UI hint (e.g. "dollar"). Teable's `number`
  // field doesn't currently accept a format spec; we still record the
  // precision in the description so it survives the round-trip.
  const format = property.number?.format;
  return {
    name,
    type: FieldType.Number,
    description: format ? `Notion number format: ${format}` : undefined,
  } as unknown as IFieldRo;
};

/**
 * Map a single Notion property to a Teable field. `targetName` is the field
 * name we want to create in Teable (typically the same as the source, but
 * callers can rewrite duplicates).
 */
export const mapNotionPropertyToField = (
  sourceName: string,
  property: INotionPropertySchema,
  targetName?: string
): INotionFieldMapping => {
  const finalName = sanitizeFieldName(targetName ?? sourceName);
  const type = property.type as NotionPropertyType;
  switch (type) {
    case 'title':
      return {
        sourceName,
        targetName: finalName,
        fieldRo: { name: finalName, type: FieldType.SingleLineText } as unknown as IFieldRo,
      };
    case 'rich_text':
      return {
        sourceName,
        targetName: finalName,
        fieldRo: { name: finalName, type: FieldType.LongText } as unknown as IFieldRo,
      };
    case 'number':
      return {
        sourceName,
        targetName: finalName,
        fieldRo: buildNumberFieldRo(finalName, property),
      };
    case 'select':
      return {
        sourceName,
        targetName: finalName,
        fieldRo: buildSelectFieldRo(finalName, property),
      };
    case 'multi_select':
      return {
        sourceName,
        targetName: finalName,
        fieldRo: buildMultiSelectFieldRo(finalName, property),
      };
    case 'checkbox':
      return {
        sourceName,
        targetName: finalName,
        fieldRo: { name: finalName, type: FieldType.Checkbox } as unknown as IFieldRo,
      };
    case 'date':
      return {
        sourceName,
        targetName: finalName,
        fieldRo: { name: finalName, type: FieldType.Date } as unknown as IFieldRo,
      };
    case 'url':
      return {
        sourceName,
        targetName: finalName,
        fieldRo: { name: finalName, type: FieldType.URL } as unknown as IFieldRo,
      };
    case 'email':
      return {
        sourceName,
        targetName: finalName,
        fieldRo: { name: finalName, type: FieldType.Email } as unknown as IFieldRo,
      };
    case 'phone_number':
      return {
        sourceName,
        targetName: finalName,
        fieldRo: { name: finalName, type: FieldType.PhoneNumber } as unknown as IFieldRo,
      };
    default:
      return {
        sourceName,
        targetName: finalName,
        fieldRo: { name: finalName, type: FieldType.SingleLineText } as unknown as IFieldRo,
        skipReason: `Notion property type "${type}" is not yet supported; field will not be imported.`,
      };
  }
};

/**
 * Map an entire Notion database schema. Returns the ordered list of field
 * mappings plus the list of skipped properties for the preview. The first
 * `title` property is marked as the primary (Teable's only primary field per
 * table).
 */
export const mapNotionDatabaseSchema = (
  database: INotionDatabaseSchema
): INotionSchemaMappingResult => {
  const fields: INotionFieldMapping[] = [];
  const skipped: Array<{ sourceName: string; reason: string }> = [];
  let primaryIndex = -1;
  const usedNames = new Set<string>();
  // Preserve Notion's property order so the resulting Teable fields follow
  // the same left-to-right order the user sees in Notion.
  for (const [sourceName, property] of Object.entries(database.properties ?? {})) {
    const mapping = mapNotionPropertyToField(sourceName, property);
    // Resolve name collisions by appending ` (2)`, ` (3)`, etc. — a primary
    // Teable field is keyed by its db column name, so the wizard can then
    // import even when two Notion columns share a name.
    let targetName = mapping.targetName;
    if (usedNames.has(targetName)) {
      let suffix = 2;
      while (usedNames.has(`${targetName} (${suffix})`)) {
        suffix += 1;
      }
      targetName = `${targetName} (${suffix})`;
    }
    usedNames.add(targetName);
    const finalMapping: INotionFieldMapping = {
      ...mapping,
      targetName,
      fieldRo: { ...mapping.fieldRo, name: targetName } as IFieldRo,
    };
    if (mapping.skipReason) {
      skipped.push({ sourceName, reason: mapping.skipReason });
    }
    if (primaryIndex === -1 && property.type === 'title') {
      primaryIndex = fields.length;
    }
    fields.push(finalMapping);
  }
  return { fields, skipped, primaryIndex };
};

// ---------------------------------------------------------------------------
// Page → record value conversion
// ---------------------------------------------------------------------------

const richTextToPlain = (segments: INotionRichText[] | undefined | null): string => {
  if (!segments || segments.length === 0) return '';
  return segments.map((segment) => segment.plainText ?? '').join('');
};

const dateToIso = (
  date: { start: string; end: string | null } | null | undefined
): string | null => {
  if (!date || !date.start) return null;
  // Notion's `date.start` may be a date-only string ("2024-01-15") or a full
  // ISO timestamp. We pass through unchanged; Teable's `date` field accepts
  // both forms and the validator decides what shape it stores.
  return date.end ? `${date.start}/${date.end}` : date.start;
};

/**
 * Convert a single Notion property value to a Teable cell value. Returns
 * `undefined` when the source value is empty (caller decides whether that
 * means "skip the field" or "set to null").
 */
export const notionPropertyValueToCell = (
  property: INotionPropertyValue | undefined | null
): unknown => {
  if (!property) return undefined;
  switch (property.type) {
    case 'title':
      return richTextToPlain(property.title) || undefined;
    case 'rich_text':
      return richTextToPlain(property.rich_text) || undefined;
    case 'number':
      return typeof property.number === 'number' ? property.number : undefined;
    case 'select': {
      if (!property.select) return undefined;
      return property.select.name ?? undefined;
    }
    case 'multi_select': {
      if (!property.multi_select || property.multi_select.length === 0) return undefined;
      return property.multi_select.map((option) => option.name).filter(Boolean);
    }
    case 'checkbox':
      return typeof property.checkbox === 'boolean' ? property.checkbox : undefined;
    case 'date':
      return dateToIso(property.date);
    case 'url':
      return property.url ?? undefined;
    case 'email':
      return property.email ?? undefined;
    case 'phone_number':
      return property.phone_number ?? undefined;
    default:
      return undefined;
  }
};

export interface INotionRecordValue {
  /** Maps a Teable field name to the cell value. */
  fields: Record<string, unknown>;
  /** Skipped property names — recorded for the import summary. */
  skipped: string[];
}

/**
 * Convert one Notion page into a Teable record payload. The mapping is
 * driven by the schema mapping so we never reference a property that the
 * caller decided to skip.
 */
export const notionPageToRecord = (
  page: INotionPageListItem,
  mapping: INotionSchemaMappingResult
): INotionRecordValue => {
  const fields: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const fieldMapping of mapping.fields) {
    const source = (page.properties ?? {})[fieldMapping.sourceName] as
      | INotionPropertyValue
      | undefined;
    if (!source) {
      continue;
    }
    if (fieldMapping.skipReason) {
      skipped.push(fieldMapping.sourceName);
      continue;
    }
    const cell = notionPropertyValueToCell(source);
    if (cell === undefined) {
      continue;
    }
    fields[fieldMapping.targetName] = cell;
  }
  return { fields, skipped };
};
