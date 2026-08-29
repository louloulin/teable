/* eslint-disable @typescript-eslint/naming-convention */
import { importPlanToRecordFields, recordsToExportInput } from './google-sheets-sync.service';

describe('Google Sheets record conversion', () => {
  it('maps imported column ids back to sheet headers', () => {
    expect(
      importPlanToRecordFields({
        tableName: 'Sheet1',
        sheetId: 1,
        fields: [
          { id: 'fld-name', name: 'Name', type: 'singleLineText', inference: '1 strings' },
          { id: 'fld-count', name: 'Count', type: 'number', inference: '1 numbers' },
        ],
        rows: [{ 'fld-name': 'Alice', 'fld-count': 3 }],
      })
    ).toEqual([{ Name: 'Alice', Count: 3 }]);
  });

  it('builds stable export headers and serializes complex values', () => {
    expect(
      recordsToExportInput([
        { fields: { Name: 'Alice', Tags: ['one', 'two'] } },
        { fields: { Name: 'Bob', Count: 2 } },
      ])
    ).toEqual({
      headers: ['Name', 'Tags', 'Count'],
      rows: [
        { Name: 'Alice', Tags: '["one","two"]', Count: null },
        { Name: 'Bob', Tags: null, Count: 2 },
      ],
    });
  });
});
