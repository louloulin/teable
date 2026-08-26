/**
 * Workspace Mirror / DR replica — Stage 61.
 *
 * The interfaces themselves now live in `@teable/openapi`
 * (`packages/openapi/src/workspace-mirror.ts`) because the workspace-switcher
 * UI needs the same shapes as the controller. This module stays as the
 * feature-local entry point so existing imports of
 * `./workspace-mirror.types` keep resolving unchanged.
 */

export type {
  IMirrorBatchResult,
  IMirrorConfig,
  IMirrorLag,
  IMirrorLogRecord,
  IMirrorQueryResult,
  IRegionEndpoint,
  MirrorStatus,
} from '@teable/openapi';
