/**
 * SDK Publish Orchestrator — types (Stage 120).
 *
 * Coordinates npm + PyPI publishing for the SDK monorepo, including version
 * bumping, changelog generation, and signed-artifact handling.
 */

export type Registry = 'npm' | 'pypi';

export interface PackageDescriptor {
  name: string;
  registry: Registry;
  /** Path to the build artifact (tgz / wheel / sdist). */
  artifactPath: string;
  /** Current version. */
  version: string;
  /** Optional signature blob. */
  signature?: string;
}

export interface BumpType {
  kind: 'major' | 'minor' | 'patch';
}

export interface PublishStep {
  registry: Registry;
  packageName: string;
  version: string;
  artifact: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: readonly string[];
}

export interface PublishPlan {
  steps: readonly PublishStep[];
  changelog: readonly ChangelogEntry[];
  /** New versions keyed by package name. */
  versions: Record<string, string>;
}

export interface PublishReport {
  publishedAt: string;
  results: ReadonlyArray<{ registry: Registry; packageName: string; version: string; ok: boolean; reason?: string }>;
}

export interface PublishOptions {
  bump: BumpType;
  dryRun?: boolean;
  tag?: 'latest' | 'beta' | 'next';
  skipSignatures?: boolean;
}

export const DEFAULT_TAG = 'latest';