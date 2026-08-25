/**
 * OpenAPI static generation — pure helpers (Stage 105).
 */

import { createHash } from 'node:crypto';

import type {
  IStaticBuildArtifact,
  IStaticBuildInput,
  IStaticBuildPlan,
} from './openapi-static-gen.types';
import { MAX_BUILD_ARTIFACTS, MAX_BUILD_BYTES } from './openapi-static-gen.types';

/** Validate a build input. */
export function validateBuildInput(input: IStaticBuildInput): string | null {
  if (!input.root) return 'root required';
  if (!input.prettyJson) return 'prettyJson required';
  return null;
}

/** Compute the relative path for the JSON file. */
export function jsonArtifactPath(input: { root: string; subdir?: string; name?: string }): string {
  const sub = input.subdir ?? 'openapi';
  const name = (input.name ?? 'teable').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `${sub}/${name}.openapi.json`;
}

/** Compute the relative path for the HTML explorer. */
export function htmlArtifactPath(input: { root: string; subdir?: string }): string {
  const sub = input.subdir ?? 'openapi';
  return `${sub}/index.html`;
}

/** SHA-256 of a string. */
export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf-8').digest('hex');
}

/** Build an artifact descriptor. */
export function buildArtifact(input: {
  path: string;
  body: string;
  kind: IStaticBuildArtifact['kind'];
}): IStaticBuildArtifact {
  return {
    path: input.path,
    kind: input.kind,
    bytes: Buffer.byteLength(input.body, 'utf-8'),
    hash: sha256(input.body),
  };
}

/** Plan a build — describes what would be written. */
export function planBuild(input: IStaticBuildInput): IStaticBuildPlan {
  const err = validateBuildInput(input);
  if (err) throw new Error(`invalid build input: ${err}`);
  const artifacts: IStaticBuildArtifact[] = [];
  const jsonPath = jsonArtifactPath({ root: input.root, subdir: input.jsonSubdir });
  artifacts.push(buildArtifact({ path: jsonPath, body: input.prettyJson, kind: 'json' }));
  if (input.htmlBody) {
    const htmlPath = htmlArtifactPath({ root: input.root, subdir: input.htmlSubdir });
    artifacts.push(buildArtifact({ path: htmlPath, body: input.htmlBody, kind: 'html' }));
  }
  if (artifacts.length > MAX_BUILD_ARTIFACTS) {
    throw new Error(`artifacts cap ${MAX_BUILD_ARTIFACTS}`);
  }
  const totalBytes = artifacts.reduce((acc, a) => acc + a.bytes, 0);
  if (totalBytes > MAX_BUILD_BYTES) {
    throw new Error(`build too large: ${totalBytes} bytes`);
  }
  return {
    artifacts,
    totalBytes,
    generatedAt: new Date().toISOString(),
  };
}

/** Find an artifact by path. */
export function findArtifact(input: {
  plan: IStaticBuildPlan;
  path: string;
}): IStaticBuildArtifact | null {
  return input.plan.artifacts.find((a) => a.path === input.path) ?? null;
}

/** Whether the plan has a JSON artifact. */
export function hasJsonArtifact(plan: IStaticBuildPlan): boolean {
  return plan.artifacts.some((a) => a.kind === 'json');
}

/** Whether the plan has an HTML artifact. */
export function hasHtmlArtifact(plan: IStaticBuildPlan): boolean {
  return plan.artifacts.some((a) => a.kind === 'html');
}

/** Total artifact count. */
export function artifactCount(plan: IStaticBuildPlan): number {
  return plan.artifacts.length;
}

/** Cap the plan to N artifacts. */
export function capArtifacts(plan: IStaticBuildPlan, n: number): IStaticBuildPlan {
  if (plan.artifacts.length <= n) return plan;
  const artifacts = plan.artifacts.slice(0, n);
  const totalBytes = artifacts.reduce((acc, a) => acc + a.bytes, 0);
  return { ...plan, artifacts, totalBytes };
}

/** Whether all artifact hashes are present. */
export function allHashed(plan: IStaticBuildPlan): boolean {
  return plan.artifacts.every((a) => /^[0-9a-f]{64}$/.test(a.hash));
}

/** Whether the plan changed relative to a previous build (by hash). */
export function changedFrom(input: {
  plan: IStaticBuildPlan;
  previous: IStaticBuildPlan;
}): boolean {
  if (input.plan.artifacts.length !== input.previous.artifacts.length) return true;
  const prev = new Map(input.previous.artifacts.map((a) => [a.path, a.hash]));
  for (const a of input.plan.artifacts) {
    if (prev.get(a.path) !== a.hash) return true;
  }
  return false;
}
