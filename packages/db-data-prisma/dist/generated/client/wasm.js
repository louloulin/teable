
Object.defineProperty(exports, "__esModule", { value: true });

const {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  getPrismaClient,
  sqltag,
  empty,
  join,
  raw,
  skip,
  Decimal,
  Debug,
  objectEnumValues,
  makeStrictEnum,
  Extensions,
  warnOnce,
  defineDmmfProperty,
  Public,
  getRuntime
} = require('./runtime/wasm.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 6.2.1
 * Query Engine version: 4123509d24aa4dede1e864b46351bf2790323b69
 */
Prisma.prismaVersion = {
  client: "6.2.1",
  engine: "4123509d24aa4dede1e864b46351bf2790323b69"
}

Prisma.PrismaClientKnownRequestError = PrismaClientKnownRequestError;
Prisma.PrismaClientUnknownRequestError = PrismaClientUnknownRequestError
Prisma.PrismaClientRustPanicError = PrismaClientRustPanicError
Prisma.PrismaClientInitializationError = PrismaClientInitializationError
Prisma.PrismaClientValidationError = PrismaClientValidationError
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = sqltag
Prisma.empty = empty
Prisma.join = join
Prisma.raw = raw
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = Extensions.getExtensionContext
Prisma.defineExtension = Extensions.defineExtension

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}





/**
 * Enums
 */
exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.ComputedUpdateOutboxScalarFieldEnum = {
  id: 'id',
  baseId: 'baseId',
  seedTableId: 'seedTableId',
  seedRecordIds: 'seedRecordIds',
  changeType: 'changeType',
  steps: 'steps',
  edges: 'edges',
  status: 'status',
  attempts: 'attempts',
  maxAttempts: 'maxAttempts',
  nextRunAt: 'nextRunAt',
  lockedAt: 'lockedAt',
  lockedBy: 'lockedBy',
  lastError: 'lastError',
  estimatedComplexity: 'estimatedComplexity',
  planHash: 'planHash',
  dirtyStats: 'dirtyStats',
  runId: 'runId',
  originRunIds: 'originRunIds',
  runTotalSteps: 'runTotalSteps',
  runCompletedStepsBefore: 'runCompletedStepsBefore',
  affectedTableIds: 'affectedTableIds',
  affectedFieldIds: 'affectedFieldIds',
  syncMaxLevel: 'syncMaxLevel',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ComputedUpdateOutboxSeedScalarFieldEnum = {
  id: 'id',
  taskId: 'taskId',
  tableId: 'tableId',
  recordId: 'recordId'
};

exports.Prisma.ComputedUpdateDeadLetterScalarFieldEnum = {
  id: 'id',
  baseId: 'baseId',
  seedTableId: 'seedTableId',
  seedRecordIds: 'seedRecordIds',
  changeType: 'changeType',
  steps: 'steps',
  edges: 'edges',
  status: 'status',
  attempts: 'attempts',
  maxAttempts: 'maxAttempts',
  nextRunAt: 'nextRunAt',
  lockedAt: 'lockedAt',
  lockedBy: 'lockedBy',
  lastError: 'lastError',
  estimatedComplexity: 'estimatedComplexity',
  planHash: 'planHash',
  dirtyStats: 'dirtyStats',
  runId: 'runId',
  originRunIds: 'originRunIds',
  runTotalSteps: 'runTotalSteps',
  runCompletedStepsBefore: 'runCompletedStepsBefore',
  affectedTableIds: 'affectedTableIds',
  affectedFieldIds: 'affectedFieldIds',
  syncMaxLevel: 'syncMaxLevel',
  traceData: 'traceData',
  failedAt: 'failedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ComputedUpdatePauseScopeScalarFieldEnum = {
  id: 'id',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  pausedAt: 'pausedAt',
  pausedBy: 'pausedBy',
  resumeAt: 'resumeAt',
  reason: 'reason',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.ComputedFieldActivityScalarFieldEnum = {
  fieldId: 'fieldId',
  tableId: 'tableId',
  baseId: 'baseId',
  status: 'status',
  activeTaskCount: 'activeTaskCount',
  processingTaskCount: 'processingTaskCount',
  generation: 'generation',
  estimatedComplexity: 'estimatedComplexity',
  estimatedDirtyRecords: 'estimatedDirtyRecords',
  hasAllTargetRecords: 'hasAllTargetRecords',
  queuedAt: 'queuedAt',
  startedAt: 'startedAt',
  lastCompletedAt: 'lastCompletedAt',
  lastDurationMs: 'lastDurationMs',
  lastError: 'lastError',
  extensions: 'extensions',
  updatedAt: 'updatedAt'
};

exports.Prisma.ComputedTableActivityScalarFieldEnum = {
  tableId: 'tableId',
  baseId: 'baseId',
  status: 'status',
  calculatingFieldCount: 'calculatingFieldCount',
  queuedFieldCount: 'queuedFieldCount',
  estimatedComplexity: 'estimatedComplexity',
  recentCompletions: 'recentCompletions',
  generation: 'generation',
  updatedAt: 'updatedAt'
};

exports.Prisma.ComputedTaskFieldRefScalarFieldEnum = {
  taskId: 'taskId',
  fieldId: 'fieldId',
  tableId: 'tableId',
  baseId: 'baseId',
  wasProcessing: 'wasProcessing',
  createdAt: 'createdAt'
};

exports.Prisma.RecordHistoryScalarFieldEnum = {
  id: 'id',
  tableId: 'tableId',
  recordId: 'recordId',
  fieldId: 'fieldId',
  before: 'before',
  after: 'after',
  createdTime: 'createdTime',
  createdBy: 'createdBy'
};

exports.Prisma.TableTrashScalarFieldEnum = {
  id: 'id',
  tableId: 'tableId',
  resourceType: 'resourceType',
  snapshot: 'snapshot',
  createdTime: 'createdTime',
  createdBy: 'createdBy'
};

exports.Prisma.RecordTrashScalarFieldEnum = {
  id: 'id',
  tableId: 'tableId',
  recordId: 'recordId',
  snapshot: 'snapshot',
  createdTime: 'createdTime',
  createdBy: 'createdBy'
};

exports.Prisma.AttachmentsScalarFieldEnum = {
  id: 'id',
  token: 'token',
  hash: 'hash',
  size: 'size',
  mimetype: 'mimetype',
  path: 'path',
  width: 'width',
  height: 'height',
  deletedTime: 'deletedTime',
  createdTime: 'createdTime',
  createdBy: 'createdBy',
  lastModifiedBy: 'lastModifiedBy',
  thumbnailPath: 'thumbnailPath'
};

exports.Prisma.AttachmentsTableScalarFieldEnum = {
  id: 'id',
  attachmentId: 'attachmentId',
  name: 'name',
  token: 'token',
  tableId: 'tableId',
  recordId: 'recordId',
  fieldId: 'fieldId',
  createdTime: 'createdTime',
  createdBy: 'createdBy',
  lastModifiedBy: 'lastModifiedBy',
  lastModifiedTime: 'lastModifiedTime'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  ComputedUpdateOutbox: 'ComputedUpdateOutbox',
  ComputedUpdateOutboxSeed: 'ComputedUpdateOutboxSeed',
  ComputedUpdateDeadLetter: 'ComputedUpdateDeadLetter',
  ComputedUpdatePauseScope: 'ComputedUpdatePauseScope',
  ComputedFieldActivity: 'ComputedFieldActivity',
  ComputedTableActivity: 'ComputedTableActivity',
  ComputedTaskFieldRef: 'ComputedTaskFieldRef',
  RecordHistory: 'RecordHistory',
  TableTrash: 'TableTrash',
  RecordTrash: 'RecordTrash',
  Attachments: 'Attachments',
  AttachmentsTable: 'AttachmentsTable'
};
/**
 * Create the Client
 */
const config = {
  "generator": {
    "name": "client",
    "provider": {
      "fromEnvVar": null,
      "value": "prisma-client-js"
    },
    "output": {
      "value": "/Users/louloulin/appx/teable/packages/db-data-prisma/src/generated/client",
      "fromEnvVar": null
    },
    "config": {
      "engineType": "library"
    },
    "binaryTargets": [
      {
        "fromEnvVar": null,
        "value": "darwin-arm64",
        "native": true
      }
    ],
    "previewFeatures": [
      "driverAdapters"
    ],
    "sourceFilePath": "/Users/louloulin/appx/teable/packages/db-data-prisma/prisma/schema.prisma",
    "isCustomOutput": true
  },
  "relativeEnvPaths": {
    "rootEnvPath": null
  },
  "relativePath": "../../../prisma",
  "clientVersion": "6.2.1",
  "engineVersion": "4123509d24aa4dede1e864b46351bf2790323b69",
  "datasourceNames": [
    "db"
  ],
  "activeProvider": "postgresql",
  "postinstall": false,
  "inlineDatasources": {
    "db": {
      "url": {
        "fromEnvVar": "PRISMA_DATABASE_URL",
        "value": null
      }
    }
  },
  "inlineSchema": "generator client {\n  provider        = \"prisma-client-js\"\n  output          = \"../src/generated/client\"\n  previewFeatures = [\"driverAdapters\"]\n}\n\ndatasource db {\n  provider = \"postgresql\"\n  url      = env(\"PRISMA_DATABASE_URL\")\n}\n\nmodel ComputedUpdateOutbox {\n  id                      String    @id @default(cuid())\n  baseId                  String    @map(\"base_id\")\n  seedTableId             String    @map(\"seed_table_id\")\n  seedRecordIds           Json?     @map(\"seed_record_ids\")\n  changeType              String    @map(\"change_type\")\n  steps                   Json?\n  edges                   Json?\n  status                  String\n  attempts                Int       @default(0)\n  maxAttempts             Int       @default(8) @map(\"max_attempts\")\n  nextRunAt               DateTime  @default(now()) @map(\"next_run_at\")\n  lockedAt                DateTime? @map(\"locked_at\")\n  lockedBy                String?   @map(\"locked_by\")\n  lastError               String?   @map(\"last_error\")\n  estimatedComplexity     Int       @default(0) @map(\"estimated_complexity\")\n  planHash                String    @map(\"plan_hash\")\n  dirtyStats              Json?     @map(\"dirty_stats\")\n  runId                   String    @map(\"run_id\")\n  originRunIds            String[]  @default([]) @map(\"origin_run_ids\")\n  runTotalSteps           Int       @default(0) @map(\"run_total_steps\")\n  runCompletedStepsBefore Int       @default(0) @map(\"run_completed_steps_before\")\n  affectedTableIds        String[]  @default([]) @map(\"affected_table_ids\")\n  affectedFieldIds        String[]  @default([]) @map(\"affected_field_ids\")\n  syncMaxLevel            Int?      @map(\"sync_max_level\")\n  createdAt               DateTime  @default(now()) @map(\"created_at\")\n  updatedAt               DateTime  @updatedAt @map(\"updated_at\")\n\n  seeds ComputedUpdateOutboxSeed[]\n\n  @@index([status, nextRunAt])\n  @@index([baseId, seedTableId])\n  @@index([planHash])\n  @@index([runId])\n  @@map(\"computed_update_outbox\")\n}\n\nmodel ComputedUpdateOutboxSeed {\n  id       String               @id @default(cuid())\n  taskId   String               @map(\"task_id\")\n  tableId  String               @map(\"table_id\")\n  recordId String               @map(\"record_id\")\n  task     ComputedUpdateOutbox @relation(fields: [taskId], references: [id], onDelete: Cascade)\n\n  @@unique([taskId, tableId, recordId])\n  @@index([taskId])\n  @@map(\"computed_update_outbox_seed\")\n}\n\nmodel ComputedUpdateDeadLetter {\n  id                      String    @id\n  baseId                  String    @map(\"base_id\")\n  seedTableId             String    @map(\"seed_table_id\")\n  seedRecordIds           Json?     @map(\"seed_record_ids\")\n  changeType              String    @map(\"change_type\")\n  steps                   Json?\n  edges                   Json?\n  status                  String\n  attempts                Int       @default(0)\n  maxAttempts             Int       @default(8) @map(\"max_attempts\")\n  nextRunAt               DateTime  @map(\"next_run_at\")\n  lockedAt                DateTime? @map(\"locked_at\")\n  lockedBy                String?   @map(\"locked_by\")\n  lastError               String?   @map(\"last_error\")\n  estimatedComplexity     Int       @default(0) @map(\"estimated_complexity\")\n  planHash                String    @map(\"plan_hash\")\n  dirtyStats              Json?     @map(\"dirty_stats\")\n  runId                   String    @map(\"run_id\")\n  originRunIds            String[]  @default([]) @map(\"origin_run_ids\")\n  runTotalSteps           Int       @default(0) @map(\"run_total_steps\")\n  runCompletedStepsBefore Int       @default(0) @map(\"run_completed_steps_before\")\n  affectedTableIds        String[]  @default([]) @map(\"affected_table_ids\")\n  affectedFieldIds        String[]  @default([]) @map(\"affected_field_ids\")\n  syncMaxLevel            Int?      @map(\"sync_max_level\")\n  traceData               Json?     @map(\"trace_data\")\n  failedAt                DateTime  @map(\"failed_at\")\n  createdAt               DateTime  @map(\"created_at\")\n  updatedAt               DateTime  @map(\"updated_at\")\n\n  @@index([baseId, seedTableId])\n  @@index([planHash])\n  @@index([runId])\n  @@map(\"computed_update_dead_letter\")\n}\n\nmodel ComputedUpdatePauseScope {\n  id        String    @id\n  scopeType String    @map(\"scope_type\")\n  scopeId   String    @map(\"scope_id\")\n  pausedAt  DateTime  @default(now()) @map(\"paused_at\")\n  pausedBy  String?   @map(\"paused_by\")\n  resumeAt  DateTime? @map(\"resume_at\")\n  reason    String?\n  updatedAt DateTime  @updatedAt @map(\"updated_at\")\n  updatedBy String?   @map(\"updated_by\")\n\n  @@unique([scopeType, scopeId])\n  @@index([resumeAt])\n  @@map(\"computed_update_pause_scope\")\n}\n\n/// Projection of async computed activity per field (co-located with outbox on data plane).\nmodel ComputedFieldActivity {\n  fieldId               String    @id @map(\"field_id\")\n  tableId               String    @map(\"table_id\")\n  baseId                String    @map(\"base_id\")\n  status                String\n  activeTaskCount       Int       @default(0) @map(\"active_task_count\")\n  processingTaskCount   Int       @default(0) @map(\"processing_task_count\")\n  generation            BigInt    @default(0)\n  estimatedComplexity   BigInt    @default(0) @map(\"estimated_complexity\")\n  estimatedDirtyRecords BigInt    @default(0) @map(\"estimated_dirty_records\")\n  hasAllTargetRecords   Boolean   @default(false) @map(\"has_all_target_records\")\n  queuedAt              DateTime? @map(\"queued_at\")\n  startedAt             DateTime? @map(\"started_at\")\n  lastCompletedAt       DateTime? @map(\"last_completed_at\")\n  lastDurationMs        Int?      @map(\"last_duration_ms\")\n  lastError             Json?     @map(\"last_error\")\n  extensions            Json?\n  updatedAt             DateTime  @default(now()) @map(\"updated_at\")\n\n  @@index([tableId, status])\n  @@index([baseId, status])\n  @@map(\"computed_field_activity\")\n}\n\n/// Projection of async computed activity per table.\nmodel ComputedTableActivity {\n  tableId               String   @id @map(\"table_id\")\n  baseId                String   @map(\"base_id\")\n  status                String\n  calculatingFieldCount Int      @default(0) @map(\"calculating_field_count\")\n  queuedFieldCount      Int      @default(0) @map(\"queued_field_count\")\n  estimatedComplexity   BigInt   @default(0) @map(\"estimated_complexity\")\n  recentCompletions     Json     @default(\"[]\") @map(\"recent_completions\")\n  generation            BigInt   @default(0)\n  updatedAt             DateTime @default(now()) @map(\"updated_at\")\n\n  @@index([baseId, status])\n  @@map(\"computed_table_activity\")\n}\n\n/// Task→field refset for activity refcounting (prevents merge double-count).\nmodel ComputedTaskFieldRef {\n  taskId        String   @map(\"task_id\")\n  fieldId       String   @map(\"field_id\")\n  tableId       String   @map(\"table_id\")\n  baseId        String   @map(\"base_id\")\n  wasProcessing Boolean  @default(false) @map(\"was_processing\")\n  createdAt     DateTime @default(now()) @map(\"created_at\")\n\n  @@id([taskId, fieldId])\n  @@index([fieldId])\n  @@map(\"computed_task_field_ref\")\n}\n\nmodel RecordHistory {\n  id          String   @id @default(cuid())\n  tableId     String   @map(\"table_id\")\n  recordId    String   @map(\"record_id\")\n  fieldId     String   @map(\"field_id\")\n  before      String   @map(\"before\")\n  after       String   @map(\"after\")\n  createdTime DateTime @default(now()) @map(\"created_time\")\n  createdBy   String   @map(\"created_by\")\n\n  @@index([tableId, recordId, createdTime])\n  @@index([tableId, createdTime])\n  @@map(\"record_history\")\n}\n\nmodel TableTrash {\n  id           String   @id @default(cuid())\n  tableId      String   @map(\"table_id\")\n  resourceType String   @map(\"resource_type\")\n  snapshot     String   @map(\"snapshot\")\n  createdTime  DateTime @default(now()) @map(\"created_time\")\n  createdBy    String   @map(\"created_by\")\n\n  @@index([tableId])\n  @@map(\"table_trash\")\n}\n\nmodel RecordTrash {\n  id          String   @id @default(cuid())\n  tableId     String   @map(\"table_id\")\n  recordId    String   @map(\"record_id\")\n  snapshot    String   @map(\"snapshot\")\n  createdTime DateTime @default(now()) @map(\"created_time\")\n  createdBy   String   @map(\"created_by\")\n\n  @@index([tableId, recordId])\n  @@map(\"record_trash\")\n}\n\nmodel Attachments {\n  id             String    @id @default(cuid())\n  token          String    @unique\n  hash           String\n  size           BigInt\n  mimetype       String\n  path           String\n  width          Int?\n  height         Int?\n  deletedTime    DateTime? @map(\"deleted_time\")\n  createdTime    DateTime  @default(now()) @map(\"created_time\")\n  createdBy      String    @map(\"created_by\")\n  lastModifiedBy String?   @map(\"last_modified_by\")\n  thumbnailPath  String?   @map(\"thumbnail_path\")\n\n  @@map(\"attachments\")\n}\n\nmodel AttachmentsTable {\n  id               String    @id @default(cuid())\n  attachmentId     String    @map(\"attachment_id\")\n  name             String\n  token            String\n  tableId          String    @map(\"table_id\")\n  recordId         String    @map(\"record_id\")\n  fieldId          String    @map(\"field_id\")\n  createdTime      DateTime  @default(now()) @map(\"created_time\")\n  createdBy        String    @map(\"created_by\")\n  lastModifiedBy   String?   @map(\"last_modified_by\")\n  lastModifiedTime DateTime? @updatedAt @map(\"last_modified_time\")\n\n  @@index([tableId, recordId])\n  @@index([tableId, fieldId])\n  @@index([attachmentId])\n  @@index([token])\n  @@map(\"attachments_table\")\n}\n",
  "inlineSchemaHash": "af4f4f95e0017c86d07c34e94af6ca0db659f0e7196d03b79402998f7aeb5d0e",
  "copyEngine": true
}
config.dirname = '/'

config.runtimeDataModel = JSON.parse("{\"models\":{\"ComputedUpdateOutbox\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"baseId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"base_id\"},{\"name\":\"seedTableId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"seed_table_id\"},{\"name\":\"seedRecordIds\",\"kind\":\"scalar\",\"type\":\"Json\",\"dbName\":\"seed_record_ids\"},{\"name\":\"changeType\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"change_type\"},{\"name\":\"steps\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"edges\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"status\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"attempts\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"maxAttempts\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"max_attempts\"},{\"name\":\"nextRunAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"next_run_at\"},{\"name\":\"lockedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"locked_at\"},{\"name\":\"lockedBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"locked_by\"},{\"name\":\"lastError\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"last_error\"},{\"name\":\"estimatedComplexity\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"estimated_complexity\"},{\"name\":\"planHash\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"plan_hash\"},{\"name\":\"dirtyStats\",\"kind\":\"scalar\",\"type\":\"Json\",\"dbName\":\"dirty_stats\"},{\"name\":\"runId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"run_id\"},{\"name\":\"originRunIds\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"origin_run_ids\"},{\"name\":\"runTotalSteps\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"run_total_steps\"},{\"name\":\"runCompletedStepsBefore\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"run_completed_steps_before\"},{\"name\":\"affectedTableIds\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"affected_table_ids\"},{\"name\":\"affectedFieldIds\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"affected_field_ids\"},{\"name\":\"syncMaxLevel\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"sync_max_level\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"created_at\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"updated_at\"},{\"name\":\"seeds\",\"kind\":\"object\",\"type\":\"ComputedUpdateOutboxSeed\",\"relationName\":\"ComputedUpdateOutboxToComputedUpdateOutboxSeed\"}],\"dbName\":\"computed_update_outbox\"},\"ComputedUpdateOutboxSeed\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"taskId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"task_id\"},{\"name\":\"tableId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"table_id\"},{\"name\":\"recordId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"record_id\"},{\"name\":\"task\",\"kind\":\"object\",\"type\":\"ComputedUpdateOutbox\",\"relationName\":\"ComputedUpdateOutboxToComputedUpdateOutboxSeed\"}],\"dbName\":\"computed_update_outbox_seed\"},\"ComputedUpdateDeadLetter\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"baseId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"base_id\"},{\"name\":\"seedTableId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"seed_table_id\"},{\"name\":\"seedRecordIds\",\"kind\":\"scalar\",\"type\":\"Json\",\"dbName\":\"seed_record_ids\"},{\"name\":\"changeType\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"change_type\"},{\"name\":\"steps\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"edges\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"status\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"attempts\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"maxAttempts\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"max_attempts\"},{\"name\":\"nextRunAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"next_run_at\"},{\"name\":\"lockedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"locked_at\"},{\"name\":\"lockedBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"locked_by\"},{\"name\":\"lastError\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"last_error\"},{\"name\":\"estimatedComplexity\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"estimated_complexity\"},{\"name\":\"planHash\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"plan_hash\"},{\"name\":\"dirtyStats\",\"kind\":\"scalar\",\"type\":\"Json\",\"dbName\":\"dirty_stats\"},{\"name\":\"runId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"run_id\"},{\"name\":\"originRunIds\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"origin_run_ids\"},{\"name\":\"runTotalSteps\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"run_total_steps\"},{\"name\":\"runCompletedStepsBefore\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"run_completed_steps_before\"},{\"name\":\"affectedTableIds\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"affected_table_ids\"},{\"name\":\"affectedFieldIds\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"affected_field_ids\"},{\"name\":\"syncMaxLevel\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"sync_max_level\"},{\"name\":\"traceData\",\"kind\":\"scalar\",\"type\":\"Json\",\"dbName\":\"trace_data\"},{\"name\":\"failedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"failed_at\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"created_at\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"updated_at\"}],\"dbName\":\"computed_update_dead_letter\"},\"ComputedUpdatePauseScope\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"scopeType\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"scope_type\"},{\"name\":\"scopeId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"scope_id\"},{\"name\":\"pausedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"paused_at\"},{\"name\":\"pausedBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"paused_by\"},{\"name\":\"resumeAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"resume_at\"},{\"name\":\"reason\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"updated_at\"},{\"name\":\"updatedBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"updated_by\"}],\"dbName\":\"computed_update_pause_scope\"},\"ComputedFieldActivity\":{\"fields\":[{\"name\":\"fieldId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"field_id\"},{\"name\":\"tableId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"table_id\"},{\"name\":\"baseId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"base_id\"},{\"name\":\"status\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"activeTaskCount\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"active_task_count\"},{\"name\":\"processingTaskCount\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"processing_task_count\"},{\"name\":\"generation\",\"kind\":\"scalar\",\"type\":\"BigInt\"},{\"name\":\"estimatedComplexity\",\"kind\":\"scalar\",\"type\":\"BigInt\",\"dbName\":\"estimated_complexity\"},{\"name\":\"estimatedDirtyRecords\",\"kind\":\"scalar\",\"type\":\"BigInt\",\"dbName\":\"estimated_dirty_records\"},{\"name\":\"hasAllTargetRecords\",\"kind\":\"scalar\",\"type\":\"Boolean\",\"dbName\":\"has_all_target_records\"},{\"name\":\"queuedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"queued_at\"},{\"name\":\"startedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"started_at\"},{\"name\":\"lastCompletedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"last_completed_at\"},{\"name\":\"lastDurationMs\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"last_duration_ms\"},{\"name\":\"lastError\",\"kind\":\"scalar\",\"type\":\"Json\",\"dbName\":\"last_error\"},{\"name\":\"extensions\",\"kind\":\"scalar\",\"type\":\"Json\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"updated_at\"}],\"dbName\":\"computed_field_activity\"},\"ComputedTableActivity\":{\"fields\":[{\"name\":\"tableId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"table_id\"},{\"name\":\"baseId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"base_id\"},{\"name\":\"status\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"calculatingFieldCount\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"calculating_field_count\"},{\"name\":\"queuedFieldCount\",\"kind\":\"scalar\",\"type\":\"Int\",\"dbName\":\"queued_field_count\"},{\"name\":\"estimatedComplexity\",\"kind\":\"scalar\",\"type\":\"BigInt\",\"dbName\":\"estimated_complexity\"},{\"name\":\"recentCompletions\",\"kind\":\"scalar\",\"type\":\"Json\",\"dbName\":\"recent_completions\"},{\"name\":\"generation\",\"kind\":\"scalar\",\"type\":\"BigInt\"},{\"name\":\"updatedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"updated_at\"}],\"dbName\":\"computed_table_activity\"},\"ComputedTaskFieldRef\":{\"fields\":[{\"name\":\"taskId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"task_id\"},{\"name\":\"fieldId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"field_id\"},{\"name\":\"tableId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"table_id\"},{\"name\":\"baseId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"base_id\"},{\"name\":\"wasProcessing\",\"kind\":\"scalar\",\"type\":\"Boolean\",\"dbName\":\"was_processing\"},{\"name\":\"createdAt\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"created_at\"}],\"dbName\":\"computed_task_field_ref\"},\"RecordHistory\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"tableId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"table_id\"},{\"name\":\"recordId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"record_id\"},{\"name\":\"fieldId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"field_id\"},{\"name\":\"before\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"before\"},{\"name\":\"after\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"after\"},{\"name\":\"createdTime\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"created_time\"},{\"name\":\"createdBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"created_by\"}],\"dbName\":\"record_history\"},\"TableTrash\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"tableId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"table_id\"},{\"name\":\"resourceType\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"resource_type\"},{\"name\":\"snapshot\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"snapshot\"},{\"name\":\"createdTime\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"created_time\"},{\"name\":\"createdBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"created_by\"}],\"dbName\":\"table_trash\"},\"RecordTrash\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"tableId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"table_id\"},{\"name\":\"recordId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"record_id\"},{\"name\":\"snapshot\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"snapshot\"},{\"name\":\"createdTime\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"created_time\"},{\"name\":\"createdBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"created_by\"}],\"dbName\":\"record_trash\"},\"Attachments\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"token\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"hash\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"size\",\"kind\":\"scalar\",\"type\":\"BigInt\"},{\"name\":\"mimetype\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"path\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"width\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"height\",\"kind\":\"scalar\",\"type\":\"Int\"},{\"name\":\"deletedTime\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"deleted_time\"},{\"name\":\"createdTime\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"created_time\"},{\"name\":\"createdBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"created_by\"},{\"name\":\"lastModifiedBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"last_modified_by\"},{\"name\":\"thumbnailPath\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"thumbnail_path\"}],\"dbName\":\"attachments\"},\"AttachmentsTable\":{\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"attachmentId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"attachment_id\"},{\"name\":\"name\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"token\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"tableId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"table_id\"},{\"name\":\"recordId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"record_id\"},{\"name\":\"fieldId\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"field_id\"},{\"name\":\"createdTime\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"created_time\"},{\"name\":\"createdBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"created_by\"},{\"name\":\"lastModifiedBy\",\"kind\":\"scalar\",\"type\":\"String\",\"dbName\":\"last_modified_by\"},{\"name\":\"lastModifiedTime\",\"kind\":\"scalar\",\"type\":\"DateTime\",\"dbName\":\"last_modified_time\"}],\"dbName\":\"attachments_table\"}},\"enums\":{},\"types\":{}}")
defineDmmfProperty(exports.Prisma, config.runtimeDataModel)
config.engineWasm = {
  getRuntime: () => require('./query_engine_bg.js'),
  getQueryEngineWasmModule: async () => {
    const loader = (await import('#wasm-engine-loader')).default
    const engine = (await loader).default
    return engine 
  }
}

config.injectableEdgeEnv = () => ({
  parsed: {
    PRISMA_DATABASE_URL: typeof globalThis !== 'undefined' && globalThis['PRISMA_DATABASE_URL'] || typeof process !== 'undefined' && process.env && process.env.PRISMA_DATABASE_URL || undefined
  }
})

if (typeof globalThis !== 'undefined' && globalThis['DEBUG'] || typeof process !== 'undefined' && process.env && process.env.DEBUG || undefined) {
  Debug.enable(typeof globalThis !== 'undefined' && globalThis['DEBUG'] || typeof process !== 'undefined' && process.env && process.env.DEBUG || undefined)
}

const PrismaClient = getPrismaClient(config)
exports.PrismaClient = PrismaClient
Object.assign(exports, Prisma)

