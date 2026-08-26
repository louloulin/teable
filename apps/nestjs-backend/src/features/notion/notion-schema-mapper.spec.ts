import { FieldType } from '@teable/core';
import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_NOTION_TYPES,
  mapNotionDatabaseSchema,
  mapNotionPropertyToField,
  notionPageToRecord,
  notionPropertyValueToCell,
} from './notion-schema-mapper';
import type {
  INotionDatabaseSchema,
  INotionPropertySchema,
  INotionPropertyValue,
} from './notion.types';

/**
 * Schema mapper tests cover all 10 supported Notion property types + the
 * rich_text plain-text extractor + the page → record pipeline. The mapping
 * is the contract that the wizard's preview and the import service share;
 * a regression here would silently drop columns on import.
 */
describe('mapNotionPropertyToField', () => {
  const prop = (type: string, extras: Partial<INotionPropertySchema> = {}): INotionPropertySchema => ({
    id: `prop_${type}`,
    type,
    ...extras,
  });

  it('maps title to SingleLineText', () => {
    const mapping = mapNotionPropertyToField('Name', prop('title'));
    expect(mapping.skipReason).toBeUndefined();
    expect(mapping.fieldRo).toMatchObject({ name: 'Name', type: FieldType.SingleLineText });
  });

  it('maps rich_text to LongText', () => {
    const mapping = mapNotionPropertyToField('Notes', prop('rich_text'));
    expect(mapping.skipReason).toBeUndefined();
    expect(mapping.fieldRo).toMatchObject({ name: 'Notes', type: FieldType.LongText });
  });

  it('maps number to Number with format hint preserved in description', () => {
    const mapping = mapNotionPropertyToField(
      'Price',
      prop('number', { number: { format: 'dollar' } })
    );
    expect(mapping.skipReason).toBeUndefined();
    expect(mapping.fieldRo).toMatchObject({
      name: 'Price',
      type: FieldType.Number,
      description: 'Notion number format: dollar',
    });
  });

  it('maps select to SingleSelect with options', () => {
    const mapping = mapNotionPropertyToField(
      'Status',
      prop('select', {
        select: { options: [{ id: 's1', name: 'Open', color: 'red' }] },
      })
    );
    expect(mapping.skipReason).toBeUndefined();
    const fieldRo = mapping.fieldRo as unknown as {
      type: FieldType;
      options: Array<{ name: string; color?: string }>;
    };
    expect(fieldRo.type).toBe(FieldType.SingleSelect);
    expect(fieldRo.options).toEqual([{ name: 'Open', color: 'red' }]);
  });

  it('maps multi_select to MultipleSelect with options', () => {
    const mapping = mapNotionPropertyToField(
      'Tags',
      prop('multi_select', {
        multi_select: {
          options: [
            { id: 't1', name: 'alpha', color: 'blue' },
            { id: 't2', name: 'beta', color: 'green' },
          ],
        },
      })
    );
    expect(mapping.skipReason).toBeUndefined();
    const fieldRo = mapping.fieldRo as unknown as {
      type: FieldType;
      options: Array<{ name: string; color?: string }>;
    };
    expect(fieldRo.type).toBe(FieldType.MultipleSelect);
    expect(fieldRo.options).toEqual([
      { name: 'alpha', color: 'blue' },
      { name: 'beta', color: 'green' },
    ]);
  });

  it('maps checkbox to Checkbox', () => {
    const mapping = mapNotionPropertyToField('Done', prop('checkbox'));
    expect(mapping.skipReason).toBeUndefined();
    expect(mapping.fieldRo).toMatchObject({ name: 'Done', type: FieldType.Checkbox });
  });

  it('maps date to Date', () => {
    const mapping = mapNotionPropertyToField('When', prop('date'));
    expect(mapping.skipReason).toBeUndefined();
    expect(mapping.fieldRo).toMatchObject({ name: 'When', type: FieldType.Date });
  });

  it('maps url to URL', () => {
    const mapping = mapNotionPropertyToField('Homepage', prop('url'));
    expect(mapping.skipReason).toBeUndefined();
    expect(mapping.fieldRo).toMatchObject({ name: 'Homepage', type: FieldType.URL });
  });

  it('maps email to Email', () => {
    const mapping = mapNotionPropertyToField('Contact', prop('email'));
    expect(mapping.skipReason).toBeUndefined();
    expect(mapping.fieldRo).toMatchObject({ name: 'Contact', type: FieldType.Email });
  });

  it('maps phone_number to PhoneNumber', () => {
    const mapping = mapNotionPropertyToField('Phone', prop('phone_number'));
    expect(mapping.skipReason).toBeUndefined();
    expect(mapping.fieldRo).toMatchObject({ name: 'Phone', type: FieldType.PhoneNumber });
  });

  it('marks unsupported types with a skip reason', () => {
    const mapping = mapNotionPropertyToField('Formula', prop('formula'));
    expect(mapping.skipReason).toMatch(/notion property type "formula" is not yet supported/i);
  });

  it('honours the requested target name', () => {
    const mapping = mapNotionPropertyToField('Source Name', prop('title'), 'Target Name');
    expect(mapping.targetName).toBe('Target Name');
    expect(mapping.fieldRo).toMatchObject({ name: 'Target Name' });
  });
});

describe('SUPPORTED_NOTION_TYPES', () => {
  it('includes exactly the 10 supported property types', () => {
    expect(SUPPORTED_NOTION_TYPES.size).toBe(10);
    expect(Array.from(SUPPORTED_NOTION_TYPES).sort()).toEqual(
      [
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
      ].sort()
    );
  });
});

describe('mapNotionDatabaseSchema', () => {
  it('preserves Notion property order and assigns the primary field to the first title', () => {
    const database: INotionDatabaseSchema = {
      id: 'db_1',
      title: [],
      properties: {
        Status: { id: 'p1', type: 'select' },
        Name: { id: 'p2', type: 'title' },
        Notes: { id: 'p3', type: 'rich_text' },
      },
    };
    const result = mapNotionDatabaseSchema(database);
    expect(result.fields.map((field) => field.sourceName)).toEqual(['Status', 'Name', 'Notes']);
    expect(result.primaryIndex).toBe(1);
  });

  it('returns primaryIndex -1 when no title property is present', () => {
    const database: INotionDatabaseSchema = {
      id: 'db_1',
      title: [],
      properties: {
        Notes: { id: 'p1', type: 'rich_text' },
      },
    };
    const result = mapNotionDatabaseSchema(database);
    expect(result.primaryIndex).toBe(-1);
  });

  it('deduplicates target names by appending (2), (3), …', () => {
    const database: INotionDatabaseSchema = {
      id: 'db_1',
      title: [],
      properties: {
        First: { id: 'p1', type: 'title' },
        'First ': { id: 'p2', type: 'rich_text' },
        First: { id: 'p3', type: 'url' } as INotionPropertySchema,
      } as unknown as INotionDatabaseSchema['properties'];
    };
    const result = mapNotionDatabaseSchema(database);
    // Two properties both normalize to "First" → the second one becomes "First (2)"
    const names = result.fields.map((field) => field.targetName);
    expect(names[0]).toBe('First');
    expect(names.filter((n) => n.startsWith('First')).length).toBeGreaterThanOrEqual(2);
  });

  it('records skipped properties with their reasons', () => {
    const database: INotionDatabaseSchema = {
      id: 'db_1',
      title: [],
      properties: {
        Name: { id: 'p1', type: 'title' },
        FormulaCol: { id: 'p2', type: 'formula' },
      },
    };
    const result = mapNotionDatabaseSchema(database);
    expect(result.skipped).toEqual([
      { sourceName: 'FormulaCol', reason: expect.stringMatching(/not yet supported/i) },
    ]);
  });
});

describe('notionPropertyValueToCell', () => {
  it('extracts plain text from rich_text fragments', () => {
    const value: INotionPropertyValue = {
      id: 'p',
      type: 'rich_text',
      rich_text: [
        { plainText: 'Hello ', href: null },
        { plainText: 'world', href: null },
      ],
    };
    expect(notionPropertyValueToCell(value)).toBe('Hello world');
  });

  it('returns undefined for empty rich_text arrays', () => {
    const value: INotionPropertyValue = {
      id: 'p',
      type: 'rich_text',
      rich_text: [],
    };
    expect(notionPropertyValueToCell(value)).toBeUndefined();
  });

  it('returns undefined when the property value itself is undefined', () => {
    expect(notionPropertyValueToCell(undefined)).toBeUndefined();
    expect(notionPropertyValueToCell(null)).toBeUndefined();
  });

  it('returns the select name when present', () => {
    const value: INotionPropertyValue = {
      id: 'p',
      type: 'select',
      select: { name: 'Open', color: 'red' },
    };
    expect(notionPropertyValueToCell(value)).toBe('Open');
  });

  it('returns undefined for an empty select', () => {
    const value: INotionPropertyValue = {
      id: 'p',
      type: 'select',
      select: null,
    };
    expect(notionPropertyValueToCell(value)).toBeUndefined();
  });

  it('returns multi_select names as an array', () => {
    const value: INotionPropertyValue = {
      id: 'p',
      type: 'multi_select',
      multi_select: [
        { name: 'a', color: 'red' },
        { name: 'b', color: 'blue' },
      ],
    };
    expect(notionPropertyValueToCell(value)).toEqual(['a', 'b']);
  });

  it('returns undefined for an empty multi_select', () => {
    const value: INotionPropertyValue = {
      id: 'p',
      type: 'multi_select',
      multi_select: [],
    };
    expect(notionPropertyValueToCell(value)).toBeUndefined();
  });

  it('passes through checkbox, number, date, url, email, phone_number', () => {
    expect(
      notionPropertyValueToCell({ id: 'p', type: 'checkbox', checkbox: true })
    ).toBe(true);
    expect(notionPropertyValueToCell({ id: 'p', type: 'number', number: 42 })).toBe(42);
    expect(
      notionPropertyValueToCell({
        id: 'p',
        type: 'date',
        date: { start: '2024-01-15', end: null },
      })
    ).toBe('2024-01-15');
    expect(notionPropertyValueToCell({ id: 'p', type: 'url', url: 'https://teable.ai' })).toBe(
      'https://teable.ai'
    );
    expect(notionPropertyValueToCell({ id: 'p', type: 'email', email: 'a@b.com' })).toBe('a@b.com');
    expect(notionPropertyValueToCell({ id: 'p', type: 'phone_number', phone_number: '+1' })).toBe(
      '+1'
    );
  });

  it('returns a slash-joined range when date.end is present', () => {
    expect(
      notionPropertyValueToCell({
        id: 'p',
        type: 'date',
        date: { start: '2024-01-15', end: '2024-01-20' },
      })
    ).toBe('2024-01-15/2024-01-20');
  });
});

describe('notionPageToRecord', () => {
  const database: INotionDatabaseSchema = {
    id: 'db_1',
    title: [],
    properties: {
      Name: { id: 'p1', type: 'title' },
      Notes: { id: 'p2', type: 'rich_text' },
      Skipped: { id: 'p3', type: 'formula' },
    },
  };

  it('converts a page into a Teable record payload keyed by target name', () => {
    const mapping = mapNotionDatabaseSchema(database);
    const page = {
      id: 'page_1',
      lastEditedTime: '2024-01-15T00:00:00.000Z',
      properties: {
        Name: { id: 'p1', type: 'title', title: [{ plainText: 'Hello', href: null }] },
        Notes: { id: 'p2', type: 'rich_text', rich_text: [{ plainText: 'note body', href: null }] },
        Skipped: { id: 'p3', type: 'formula' },
      },
    };
    const record = notionPageToRecord(page, mapping);
    expect(record.fields).toEqual({ Name: 'Hello', Notes: 'note body' });
    expect(record.skipped).toContain('Skipped');
  });

  it('drops empty property values without adding them to skipped', () => {
    const mapping = mapNotionDatabaseSchema(database);
    const page = {
      id: 'page_1',
      lastEditedTime: '2024-01-15T00:00:00.000Z',
      properties: {
        Name: { id: 'p1', type: 'title', title: [{ plainText: 'Only name', href: null }] },
        Notes: { id: 'p2', type: 'rich_text', rich_text: [] },
      },
    };
    const record = notionPageToRecord(page, mapping);
    expect(record.fields).toEqual({ Name: 'Only name' });
    expect(record.skipped).toEqual([]);
  });
});
