/**
 * Field type mapping matrix — types (Stage 85).
 */

export const FIELD_DATA_KINDS = [
  'string',
  'number',
  'integer',
  'boolean',
  'date',
  'datetime',
  'json',
  'array',
  'attachment',
  'enum',
] as const;
export type FieldDataKind = (typeof FIELD_DATA_KINDS)[number];

export type FieldConversion = 'direct' | 'cast' | 'parse' | 'serialize' | 'reject';

export interface IFieldTypeMap {
  source: FieldDataKind;
  target: FieldDataKind;
  conversion: FieldConversion;
  lossless: boolean;
  notes?: string;
}

/** Cap on stored mappings per org. */
export const MAX_FIELD_MAPS = 256;
