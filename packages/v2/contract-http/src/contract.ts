import { oc } from '@orpc/contract';
import type { AnySchema, ContractProcedure, ErrorMap, Meta } from '@orpc/contract';
import {
  createBaseInputSchema,
  createFieldInputSchema,
  createRecordInputSchema,
  createRecordsInputSchema,
  submitRecordInputSchema,
  createTableInputSchema,
  createTablesInputSchema,
  deleteByRangeCommandInputSchema,
  deleteFieldInputSchema,
  deleteRecordsInputSchema,
  deleteTableInputSchema,
  duplicateFieldInputSchema,
  duplicateRecordInputSchema,
  duplicateTableInputSchema,
  getRecordByIdInputSchema,
  getTableByIdInputSchema,
  getComputeActivityInputSchema,
  importCsvInputSchema,
  importRecordsInputSchema,
  listBasesInputSchema,
  listTableRecordsInputSchema,
  listTablesInputSchema,
  pasteCommandInputSchema,
  clearCommandInputSchema,
  renameTableInputSchema,
  restoreTableInputSchema,
  updateFieldInputSchema,
  updateRecordInputSchema,
  updateRecordsInputSchema,
  reorderRecordsInputSchema,
} from '@teable/v2-core';

import { createBaseOkResponseSchema } from './base/createBase';
import { listBasesOkResponseSchema } from './base/listBases';
import { clearOkResponseSchema } from './table/clear';
import { createFieldOkResponseSchema } from './table/createField';
import { createRecordOkResponseSchema } from './table/createRecord';
import { createRecordsOkResponseSchema } from './table/createRecords';
import { createTableErrorResponseSchema, createTableOkResponseSchema } from './table/createTable';
import { createTablesOkResponseSchema } from './table/createTables';
import { deleteByRangeOkResponseSchema } from './table/deleteByRange';
import { deleteFieldOkResponseSchema } from './table/deleteField';
import { deleteRecordsOkResponseSchema } from './table/deleteRecords';
import { deleteTableErrorResponseSchema, deleteTableOkResponseSchema } from './table/deleteTable';
import { duplicateFieldOkResponseSchema } from './table/duplicateField';
import { duplicateRecordOkResponseSchema } from './table/duplicateRecord';
import { duplicateTableOkResponseSchema } from './table/duplicateTable';
import {
  explainCreateFieldInputSchema,
  explainCreateRecordInputSchema,
  explainDeleteFieldInputSchema,
  explainDeleteTableInputSchema,
  explainDeleteRecordsInputSchema,
  explainOkResponseSchema,
  explainUpdateFieldInputSchema,
  explainUpdateRecordInputSchema,
} from './table/explainCommand';
import { getComputeActivityOkResponseSchema } from './table/getComputeActivity';
import { getRecordByIdOkResponseSchema } from './table/getRecordById';
import { getTableByIdOkResponseSchema } from './table/getTableById';
import { importCsvOkResponseSchema } from './table/importCsv';
import { importRecordsOkResponseSchema } from './table/importRecords';
import { listTableRecordsOkResponseSchema } from './table/listTableRecords';
import { listTablesOkResponseSchema } from './table/listTables';
import { pasteOkResponseSchema } from './table/paste';
import { renameTableOkResponseSchema } from './table/renameTable';
import { reorderRecordsOkResponseSchema } from './table/reorderRecords';
import { restoreTableOkResponseSchema } from './table/restoreTable';
import { submitRecordOkResponseSchema } from './table/submitRecord';
import { updateFieldOkResponseSchema } from './table/updateField';
import { updateRecordOkResponseSchema } from './table/updateRecord';
import { updateRecordsOkResponseSchema } from './table/updateRecords';

const BASES_CREATE_PATH = '/bases/create';
const BASES_LIST_PATH = '/bases/list';
const TABLES_CREATE_FIELD_PATH = '/tables/createField';
const TABLES_CREATE_PATH = '/tables/create';
const TABLES_CREATE_TABLES_PATH = '/tables/createTables';
const TABLES_CREATE_RECORD_PATH = '/tables/createRecord';
const TABLES_SUBMIT_RECORD_PATH = '/tables/submitRecord';
const TABLES_CREATE_RECORDS_PATH = '/tables/createRecords';
const TABLES_DELETE_RECORDS_PATH = '/tables/deleteRecords';
const TABLES_DELETE_FIELD_PATH = '/tables/deleteField';
const TABLES_DELETE_PATH = '/tables/delete';
const TABLES_EXPLAIN_CREATE_FIELD_PATH = '/tables/explainCreateField';
const TABLES_EXPLAIN_CREATE_RECORD_PATH = '/tables/explainCreateRecord';
const TABLES_EXPLAIN_UPDATE_FIELD_PATH = '/tables/explainUpdateField';
const TABLES_EXPLAIN_UPDATE_RECORD_PATH = '/tables/explainUpdateRecord';
const TABLES_EXPLAIN_DELETE_FIELD_PATH = '/tables/explainDeleteField';
const TABLES_EXPLAIN_DELETE_TABLE_PATH = '/tables/explainDeleteTable';
const TABLES_EXPLAIN_DELETE_RECORDS_PATH = '/tables/explainDeleteRecords';
const TABLES_GET_PATH = '/tables/get';
const TABLES_GET_COMPUTE_ACTIVITY_PATH = '/tables/getComputeActivity';
const TABLES_GET_RECORD_PATH = '/tables/getRecord';
const TABLES_IMPORT_CSV_PATH = '/tables/importCsv';
const TABLES_IMPORT_RECORDS_PATH = '/tables/importRecords';
const TABLES_LIST_RECORDS_PATH = '/tables/listRecords';
const TABLES_LIST_PATH = '/tables/list';
const TABLES_PASTE_PATH = '/tables/paste';
const TABLES_CLEAR_PATH = '/tables/clear';
const TABLES_DELETE_BY_RANGE_PATH = '/tables/deleteByRange';
const TABLES_RENAME_PATH = '/tables/rename';
const TABLES_RESTORE_PATH = '/tables/restore';
const TABLES_UPDATE_FIELD_PATH = '/tables/updateField';
const TABLES_UPDATE_RECORD_PATH = '/tables/updateRecord';
const TABLES_UPDATE_RECORDS_PATH = '/tables/updateRecords';
const TABLES_REORDER_RECORDS_PATH = '/tables/reorderRecords';
const TABLES_DUPLICATE_FIELD_PATH = '/tables/duplicateField';
const TABLES_DUPLICATE_RECORD_PATH = '/tables/duplicateRecord';
const TABLES_DUPLICATE_TABLE_PATH = '/tables/duplicateTable';

type V2ContractProcedure<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
> = ContractProcedure<TInputSchema, TOutputSchema, ErrorMap, Meta>;

type V2BasesContract = {
  create: V2ContractProcedure<typeof createBaseInputSchema, typeof createBaseOkResponseSchema>;
  list: V2ContractProcedure<typeof listBasesInputSchema, typeof listBasesOkResponseSchema>;
};

type V2TablesContract = {
  create: V2ContractProcedure<typeof createTableInputSchema, typeof createTableOkResponseSchema>;
  createTables: V2ContractProcedure<
    typeof createTablesInputSchema,
    typeof createTablesOkResponseSchema
  >;
  createField: V2ContractProcedure<
    typeof createFieldInputSchema,
    typeof createFieldOkResponseSchema
  >;
  explainCreateField: V2ContractProcedure<
    typeof explainCreateFieldInputSchema,
    typeof explainOkResponseSchema
  >;
  updateField: V2ContractProcedure<
    typeof updateFieldInputSchema,
    typeof updateFieldOkResponseSchema
  >;
  explainUpdateField: V2ContractProcedure<
    typeof explainUpdateFieldInputSchema,
    typeof explainOkResponseSchema
  >;
  updateRecords: V2ContractProcedure<
    typeof updateRecordsInputSchema,
    typeof updateRecordsOkResponseSchema
  >;
  createRecord: V2ContractProcedure<
    typeof createRecordInputSchema,
    typeof createRecordOkResponseSchema
  >;
  submitRecord: V2ContractProcedure<
    typeof submitRecordInputSchema,
    typeof submitRecordOkResponseSchema
  >;
  createRecords: V2ContractProcedure<
    typeof createRecordsInputSchema,
    typeof createRecordsOkResponseSchema
  >;
  deleteRecords: V2ContractProcedure<
    typeof deleteRecordsInputSchema,
    typeof deleteRecordsOkResponseSchema
  >;
  deleteField: V2ContractProcedure<
    typeof deleteFieldInputSchema,
    typeof deleteFieldOkResponseSchema
  >;
  explainDeleteField: V2ContractProcedure<
    typeof explainDeleteFieldInputSchema,
    typeof explainOkResponseSchema
  >;
  explainDeleteTable: V2ContractProcedure<
    typeof explainDeleteTableInputSchema,
    typeof explainOkResponseSchema
  >;
  delete: V2ContractProcedure<typeof deleteTableInputSchema, typeof deleteTableOkResponseSchema>;
  restore: V2ContractProcedure<typeof restoreTableInputSchema, typeof restoreTableOkResponseSchema>;
  getById: V2ContractProcedure<typeof getTableByIdInputSchema, typeof getTableByIdOkResponseSchema>;
  getComputeActivity: V2ContractProcedure<
    typeof getComputeActivityInputSchema,
    typeof getComputeActivityOkResponseSchema
  >;
  getRecord: V2ContractProcedure<
    typeof getRecordByIdInputSchema,
    typeof getRecordByIdOkResponseSchema
  >;
  importCsv: V2ContractProcedure<typeof importCsvInputSchema, typeof importCsvOkResponseSchema>;
  importRecords: V2ContractProcedure<
    typeof importRecordsInputSchema,
    typeof importRecordsOkResponseSchema
  >;
  listRecords: V2ContractProcedure<
    typeof listTableRecordsInputSchema,
    typeof listTableRecordsOkResponseSchema
  >;
  list: V2ContractProcedure<typeof listTablesInputSchema, typeof listTablesOkResponseSchema>;
  rename: V2ContractProcedure<typeof renameTableInputSchema, typeof renameTableOkResponseSchema>;
  updateRecord: V2ContractProcedure<
    typeof updateRecordInputSchema,
    typeof updateRecordOkResponseSchema
  >;
  reorderRecords: V2ContractProcedure<
    typeof reorderRecordsInputSchema,
    typeof reorderRecordsOkResponseSchema
  >;
  duplicateField: V2ContractProcedure<
    typeof duplicateFieldInputSchema,
    typeof duplicateFieldOkResponseSchema
  >;
  duplicateRecord: V2ContractProcedure<
    typeof duplicateRecordInputSchema,
    typeof duplicateRecordOkResponseSchema
  >;
  duplicateTable: V2ContractProcedure<
    typeof duplicateTableInputSchema,
    typeof duplicateTableOkResponseSchema
  >;
  paste: V2ContractProcedure<typeof pasteCommandInputSchema, typeof pasteOkResponseSchema>;
  clear: V2ContractProcedure<typeof clearCommandInputSchema, typeof clearOkResponseSchema>;
  deleteByRange: V2ContractProcedure<
    typeof deleteByRangeCommandInputSchema,
    typeof deleteByRangeOkResponseSchema
  >;
  explainCreateRecord: V2ContractProcedure<
    typeof explainCreateRecordInputSchema,
    typeof explainOkResponseSchema
  >;
  explainUpdateRecord: V2ContractProcedure<
    typeof explainUpdateRecordInputSchema,
    typeof explainOkResponseSchema
  >;
  explainDeleteRecords: V2ContractProcedure<
    typeof explainDeleteRecordsInputSchema,
    typeof explainOkResponseSchema
  >;
};

const basesContract: V2BasesContract = {
  create: oc
    .route({
      method: 'POST',
      path: BASES_CREATE_PATH,
      successStatus: 201,
      summary: 'Create base',
      tags: ['bases'],
    })
    .input(createBaseInputSchema)
    .output(createBaseOkResponseSchema),
  list: oc
    .route({
      method: 'GET',
      path: BASES_LIST_PATH,
      successStatus: 200,
      summary: 'List bases',
      tags: ['bases'],
    })
    .input(listBasesInputSchema)
    .output(listBasesOkResponseSchema),
};

const tablesContract: V2TablesContract = {
  create: oc
    .route({
      method: 'POST',
      path: TABLES_CREATE_PATH,
      successStatus: 201,
      summary: 'Create table',
      tags: ['tables'],
    })
    .input(createTableInputSchema)
    .output(createTableOkResponseSchema),
  createTables: oc
    .route({
      method: 'POST',
      path: TABLES_CREATE_TABLES_PATH,
      successStatus: 201,
      summary: 'Create tables',
      tags: ['tables'],
    })
    .input(createTablesInputSchema)
    .output(createTablesOkResponseSchema),
  createField: oc
    .route({
      method: 'POST',
      path: TABLES_CREATE_FIELD_PATH,
      successStatus: 200,
      summary: 'Create field',
      tags: ['tables'],
    })
    .input(createFieldInputSchema)
    .output(createFieldOkResponseSchema),
  explainCreateField: oc
    .route({
      method: 'POST',
      path: TABLES_EXPLAIN_CREATE_FIELD_PATH,
      successStatus: 200,
      summary: 'Explain create field',
      tags: ['tables'],
    })
    .input(explainCreateFieldInputSchema)
    .output(explainOkResponseSchema),
  updateField: oc
    .route({
      method: 'POST',
      path: TABLES_UPDATE_FIELD_PATH,
      successStatus: 200,
      summary: 'Update field',
      tags: ['tables'],
    })
    .input(updateFieldInputSchema)
    .output(updateFieldOkResponseSchema),
  explainUpdateField: oc
    .route({
      method: 'POST',
      path: TABLES_EXPLAIN_UPDATE_FIELD_PATH,
      successStatus: 200,
      summary: 'Explain update field',
      tags: ['tables'],
    })
    .input(explainUpdateFieldInputSchema)
    .output(explainOkResponseSchema),
  updateRecords: oc
    .route({
      method: 'POST',
      path: TABLES_UPDATE_RECORDS_PATH,
      successStatus: 200,
      summary: 'Update multiple records by filter or recordIds',
      tags: ['tables'],
    })
    .input(updateRecordsInputSchema)
    .output(updateRecordsOkResponseSchema),
  createRecord: oc
    .route({
      method: 'POST',
      path: TABLES_CREATE_RECORD_PATH,
      successStatus: 201,
      summary: 'Create record',
      tags: ['tables'],
    })
    .input(createRecordInputSchema)
    .output(createRecordOkResponseSchema),
  submitRecord: oc
    .route({
      method: 'POST',
      path: TABLES_SUBMIT_RECORD_PATH,
      successStatus: 201,
      summary: 'Submit record from form',
      tags: ['tables'],
    })
    .input(submitRecordInputSchema)
    .output(submitRecordOkResponseSchema),
  createRecords: oc
    .route({
      method: 'POST',
      path: TABLES_CREATE_RECORDS_PATH,
      successStatus: 201,
      summary: 'Create multiple records',
      tags: ['tables'],
    })
    .input(createRecordsInputSchema)
    .output(createRecordsOkResponseSchema),
  deleteRecords: oc
    .route({
      method: 'DELETE',
      path: TABLES_DELETE_RECORDS_PATH,
      successStatus: 200,
      summary: 'Delete records',
      tags: ['tables'],
    })
    .input(deleteRecordsInputSchema)
    .output(deleteRecordsOkResponseSchema),
  deleteField: oc
    .route({
      method: 'DELETE',
      path: TABLES_DELETE_FIELD_PATH,
      successStatus: 200,
      summary: 'Delete field',
      tags: ['tables'],
    })
    .input(deleteFieldInputSchema)
    .output(deleteFieldOkResponseSchema),
  explainDeleteField: oc
    .route({
      method: 'POST',
      path: TABLES_EXPLAIN_DELETE_FIELD_PATH,
      successStatus: 200,
      summary: 'Explain delete field',
      tags: ['tables'],
    })
    .input(explainDeleteFieldInputSchema)
    .output(explainOkResponseSchema),
  explainDeleteTable: oc
    .route({
      method: 'POST',
      path: TABLES_EXPLAIN_DELETE_TABLE_PATH,
      successStatus: 200,
      summary: 'Explain delete table',
      tags: ['tables'],
    })
    .input(explainDeleteTableInputSchema)
    .output(explainOkResponseSchema),
  delete: oc
    .route({
      method: 'DELETE',
      path: TABLES_DELETE_PATH,
      successStatus: 200,
      summary: 'Delete table',
      tags: ['tables'],
    })
    .input(deleteTableInputSchema)
    .output(deleteTableOkResponseSchema),
  restore: oc
    .route({
      method: 'POST',
      path: TABLES_RESTORE_PATH,
      successStatus: 200,
      summary: 'Restore table',
      tags: ['tables'],
    })
    .input(restoreTableInputSchema)
    .output(restoreTableOkResponseSchema),
  getById: oc
    .route({
      method: 'GET',
      path: TABLES_GET_PATH,
      successStatus: 200,
      summary: 'Get table by id',
      tags: ['tables'],
    })
    .input(getTableByIdInputSchema)
    .output(getTableByIdOkResponseSchema),
  getComputeActivity: oc
    .route({
      method: 'GET',
      path: TABLES_GET_COMPUTE_ACTIVITY_PATH,
      successStatus: 200,
      summary: 'Get table compute activity and performance diagnostics',
      tags: ['tables'],
    })
    .input(getComputeActivityInputSchema)
    .output(getComputeActivityOkResponseSchema),
  getRecord: oc
    .route({
      method: 'GET',
      path: TABLES_GET_RECORD_PATH,
      successStatus: 200,
      summary: 'Get record by id',
      tags: ['tables'],
    })
    .input(getRecordByIdInputSchema)
    .output(getRecordByIdOkResponseSchema),
  importCsv: oc
    .route({
      method: 'POST',
      path: TABLES_IMPORT_CSV_PATH,
      successStatus: 201,
      summary: 'Import CSV to create table with records',
      tags: ['tables'],
    })
    .input(importCsvInputSchema)
    .output(importCsvOkResponseSchema),
  importRecords: oc
    .route({
      method: 'POST',
      path: TABLES_IMPORT_RECORDS_PATH,
      successStatus: 200,
      summary: 'Import records into existing table',
      tags: ['tables'],
    })
    .input(importRecordsInputSchema)
    .output(importRecordsOkResponseSchema),
  listRecords: oc
    .route({
      method: 'GET',
      path: TABLES_LIST_RECORDS_PATH,
      successStatus: 200,
      summary: 'List table records',
      tags: ['tables'],
    })
    .input(listTableRecordsInputSchema)
    .output(listTableRecordsOkResponseSchema),
  list: oc
    .route({
      method: 'GET',
      path: TABLES_LIST_PATH,
      successStatus: 200,
      summary: 'List tables',
      tags: ['tables'],
    })
    .input(listTablesInputSchema)
    .output(listTablesOkResponseSchema),
  rename: oc
    .route({
      method: 'POST',
      path: TABLES_RENAME_PATH,
      successStatus: 200,
      summary: 'Rename table',
      tags: ['tables'],
    })
    .input(renameTableInputSchema)
    .output(renameTableOkResponseSchema),
  updateRecord: oc
    .route({
      method: 'POST',
      path: TABLES_UPDATE_RECORD_PATH,
      successStatus: 200,
      summary: 'Update record',
      tags: ['tables'],
    })
    .input(updateRecordInputSchema)
    .output(updateRecordOkResponseSchema),
  reorderRecords: oc
    .route({
      method: 'POST',
      path: TABLES_REORDER_RECORDS_PATH,
      successStatus: 200,
      summary: 'Reorder records',
      tags: ['tables'],
    })
    .input(reorderRecordsInputSchema)
    .output(reorderRecordsOkResponseSchema),
  duplicateField: oc
    .route({
      method: 'POST',
      path: TABLES_DUPLICATE_FIELD_PATH,
      successStatus: 200,
      summary: 'Duplicate field',
      tags: ['tables'],
    })
    .input(duplicateFieldInputSchema)
    .output(duplicateFieldOkResponseSchema),
  duplicateRecord: oc
    .route({
      method: 'POST',
      path: TABLES_DUPLICATE_RECORD_PATH,
      successStatus: 201,
      summary: 'Duplicate record',
      tags: ['tables'],
    })
    .input(duplicateRecordInputSchema)
    .output(duplicateRecordOkResponseSchema),
  duplicateTable: oc
    .route({
      method: 'POST',
      path: TABLES_DUPLICATE_TABLE_PATH,
      successStatus: 201,
      summary: 'Duplicate table',
      tags: ['tables'],
    })
    .input(duplicateTableInputSchema)
    .output(duplicateTableOkResponseSchema),
  paste: oc
    .route({
      method: 'POST',
      path: TABLES_PASTE_PATH,
      successStatus: 200,
      summary: 'Paste content to table cells',
      tags: ['tables'],
    })
    .input(pasteCommandInputSchema)
    .output(pasteOkResponseSchema),
  clear: oc
    .route({
      method: 'POST',
      path: TABLES_CLEAR_PATH,
      successStatus: 200,
      summary: 'Clear cell values in selected range',
      tags: ['tables'],
    })
    .input(clearCommandInputSchema)
    .output(clearOkResponseSchema),
  deleteByRange: oc
    .route({
      method: 'DELETE',
      path: TABLES_DELETE_BY_RANGE_PATH,
      successStatus: 200,
      summary: 'Delete records by range selection',
      tags: ['tables'],
    })
    .input(deleteByRangeCommandInputSchema)
    .output(deleteByRangeOkResponseSchema),
  explainCreateRecord: oc
    .route({
      method: 'POST',
      path: TABLES_EXPLAIN_CREATE_RECORD_PATH,
      successStatus: 200,
      summary: 'Explain create record command',
      tags: ['tables', 'explain'],
    })
    .input(explainCreateRecordInputSchema)
    .output(explainOkResponseSchema),
  explainUpdateRecord: oc
    .route({
      method: 'POST',
      path: TABLES_EXPLAIN_UPDATE_RECORD_PATH,
      successStatus: 200,
      summary: 'Explain update record command',
      tags: ['tables', 'explain'],
    })
    .input(explainUpdateRecordInputSchema)
    .output(explainOkResponseSchema),
  explainDeleteRecords: oc
    .route({
      method: 'POST',
      path: TABLES_EXPLAIN_DELETE_RECORDS_PATH,
      successStatus: 200,
      summary: 'Explain delete records command',
      tags: ['tables', 'explain'],
    })
    .input(explainDeleteRecordsInputSchema)
    .output(explainOkResponseSchema),
};

export type V2Contract = {
  bases: V2BasesContract;
  tables: V2TablesContract;
};

export const v2Contract: V2Contract = {
  bases: basesContract,
  tables: tablesContract,
};

export const v2ContractErrors = {
  400: createTableErrorResponseSchema,
  404: deleteTableErrorResponseSchema,
  500: createTableErrorResponseSchema,
} as const;
