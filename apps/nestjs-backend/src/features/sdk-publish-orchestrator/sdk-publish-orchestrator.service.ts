/**
 * SDK Publish Orchestrator — pure helpers (Stage 120).
 */

import {
  BumpType,
  ChangelogEntry,
  PackageDescriptor,
  PublishOptions,
  PublishPlan,
  PublishReport,
  PublishStep,
  Registry,
} from './sdk-publish-orchestrator.types';

/** Bump a semver string. */
export function bumpVersion(version: string, kind: BumpType['kind']): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`invalid semver: ${version}`);
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/** Bump every package's version. */
export function bumpPackages(packages: readonly PackageDescriptor[], kind: BumpType['kind']): PackageDescriptor[] {
  return packages.map((p) => ({ ...p, version: bumpVersion(p.version, kind) }));
}

/** Build a publish plan from the new package versions + changelog commits. */
export function buildPlan(packages: readonly PackageDescriptor[], commits: readonly string[]): PublishPlan {
  const versions: Record<string, string> = {};
  const steps: PublishStep[] = [];
  for (const p of packages) {
    versions[p.name] = p.version;
    steps.push({ registry: p.registry, packageName: p.name, version: p.version, artifact: p.artifactPath });
  }
  const changelog: ChangelogEntry[] = [
    {
      version: packages[0]?.version ?? '0.0.0',
      date: new Date().toISOString().slice(0, 10),
      changes: [...commits],
    },
  ];
  return { steps, changelog, versions };
}

/** Generate the publish command for a step. */
export function publishCommand(step: PublishStep, tag: string): string {
  if (step.registry === 'npm') return `npm publish ${step.artifact} --tag ${tag}`;
  return `twine upload ${step.artifact}`;
}

/** Render a changelog as markdown. */
export function renderChangelog(entries: readonly ChangelogEntry[]): string {
  return entries.map((e) => `## ${e.version} (${e.date})\n\n${e.changes.map((c) => `- ${c}`).join('\n')}\n`).join('\n');
}

/** Detect which packages have changed vs the previous registry. */
export function detectChanges(prev: readonly PackageDescriptor[], next: readonly PackageDescriptor[]): string[] {
  const prevMap = new Map(prev.map((p) => [p.name, p]));
  const changed: string[] = [];
  for (const p of next) {
    const before = prevMap.get(p.name);
    if (!before || before.version !== p.version) changed.push(p.name);
  }
  return changed;
}

/** Determine if all packages have signatures. */
export function allSigned(packages: readonly PackageDescriptor[]): boolean {
  return packages.every((p) => !!p.signature);
}

/** Determine publish order (npm first, pypi second). */
export function publishOrder(steps: readonly PublishStep[]): PublishStep[] {
  return [...steps].sort((a, b) => (a.registry === b.registry ? 0 : a.registry === 'npm' ? -1 : 1));
}

/** Run the publish plan. */
export function runPublish(plan: PublishPlan, options: PublishOptions): PublishReport {
  const tag = options.tag ?? 'latest';
  const ordered = publishOrder(plan.steps);
  const results: Array<{ registry: Registry; packageName: string; version: string; ok: boolean; reason?: string }> = [];
  for (const s of ordered) {
    if (options.dryRun) {
      results.push({ registry: s.registry, packageName: s.packageName, version: s.version, ok: true });
      continue;
    }
    if (!options.skipSignatures && plan.steps.find((p) => p.packageName === s.packageName && !p.artifact)) {
      results.push({ registry: s.registry, packageName: s.packageName, version: s.version, ok: false, reason: 'missing artifact' });
      continue;
    }
    results.push({ registry: s.registry, packageName: s.packageName, version: s.version, ok: true });
  }
  return { publishedAt: new Date().toISOString(), results };
}

/** Aggregate publish statistics. */
export function summarizePublish(report: PublishReport): { ok: number; failed: number; total: number } {
  const ok = report.results.filter((r) => r.ok).length;
  return { ok, failed: report.results.length - ok, total: report.results.length };
}