/**
 * OpenAPI static generation — types (Stage 105).
 */

export type BuildArtifactKind = 'json' | 'html' | 'redirect' | 'asset';

export interface IStaticBuildArtifact {
  /** Path relative to build root, e.g. 'openapi/teable.openapi.json'. */
  path: string;
  /** What kind of artifact. */
  kind: BuildArtifactKind;
  /** UTF-8 byte size. */
  bytes: number;
  /** SHA-256 hash (lowercase hex). */
  hash: string;
}

export interface IStaticBuildPlan {
  artifacts: IStaticBuildArtifact[];
  totalBytes: number;
  generatedAt: string;
}

export interface IStaticBuildInput {
  /** Build root (e.g. 'apps/nestjs-backend/static'). */
  root: string;
  /** Document body (raw JSON string). */
  prettyJson: string;
  /** Optional HTML body (UI index). */
  htmlBody?: string;
  /** Subdirectory for the JSON file (defaults to 'openapi'). */
  jsonSubdir?: string;
  /** Subdirectory for the HTML file (defaults to 'openapi'). */
  htmlSubdir?: string;
}

export const MAX_BUILD_ARTIFACTS = 16;
export const MAX_BUILD_BYTES = 32 * 1024 * 1024;
