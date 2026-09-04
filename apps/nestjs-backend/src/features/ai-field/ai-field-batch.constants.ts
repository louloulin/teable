/**
 * R-AIFIELD-CIRCULAR: Constants shared between AiFieldBatchProcessor and
 * AiFieldAuthService live here to break the runtime TDZ caused by mutual
 * ES-module imports. Without this file, Webpack evaluates both top-level
 * `class` bindings eagerly and the second import hits a TDZ before NestJS
 * can apply its `forwardRef` runtime override.
 */

export const AI_FIELD_BATCH_QUEUE = 'ai-field-batch-queue';
export const AI_FIELD_BATCH_JOB = 'process';
export const AI_FIELD_BATCH_LEASE_MS = 10 * 60 * 1000;
export const AI_FIELD_BATCH_HEARTBEAT_MS = 60 * 1000;

export interface IBatchJob {
  taskId: string;
}
