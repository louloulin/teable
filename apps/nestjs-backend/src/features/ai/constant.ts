/* eslint-disable @typescript-eslint/naming-convention */
import { Task } from '@teable/openapi';

export const TASK_MODEL_MAP = {
  [Task.Coding]: 'chatModel.lg',
  [Task.Embedding]: 'embeddingModel',
  [Task.Translation]: 'translationModel',
  // R-AI-JSON — JSON-output tasks fall back to the same large chat model
  // by default; admins can override via chatModel.json or similar later.
  [Task.JsonOutput]: 'chatModel.lg',
};
