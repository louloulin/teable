import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { HttpErrorCode } from '@teable/core';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { CustomHttpException } from '../../custom.exception';

/**
 * AI App Builder service (R-AI-4).
 *
 * Cloud §AI §App Builder (help.teable.ai/en/basic/ai/app-builder) lets a user
 * turn a base into a deployable web app. The full UI is a Monaco editor +
 * chat panel + preview. We backend the API surface only:
 *
 *   - create / list / get / patch / delete app
 *   - deploy (publishes a snapshot, marks current)
 *   - rollback (revert to the previous deployed version)
 *   - versions list
 *   - secrets (PUT writes; GET lists keys + meta only, never plaintext)
 *   - files list (sandbox metadata only — content uploaded via multipart
 *     in a follow-up round)
 *
 * Snapshots are JSON blobs so version diffs can be computed later; the
 * `sourcePrompt` is preserved so we know which AI run produced each version.
 */

export interface IAppVo {
  id: string;
  baseId: string;
  name: string;
  description: string | null;
  status: 'draft' | 'deployed' | 'archived';
  currentVersionId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IAppVersionVo {
  id: string;
  appId: string;
  versionNumber: number;
  sourcePrompt: string | null;
  status: 'draft' | 'deployed' | 'rolled_back';
  deployedAt: string | null;
  deployedBy: string | null;
  createdAt: string;
}

export interface IAppSecretVo {
  id: string;
  appId: string;
  key: string;
  description: string | null;
  updatedAt: string;
  // value NEVER returned (Cloud: "Secret values are write-only after saving")
}

export interface IAppFileVo {
  id: string;
  appId: string;
  path: string;
  sizeBytes: number;
  updatedAt: string;
}

@Injectable()
export class AiAppBuilderService {
  private readonly logger = new Logger(AiAppBuilderService.name);

  constructor(private readonly prisma: PrismaService) {}

  private newId(prefix: string) {
    return `${prefix}_${randomBytes(10).toString('hex')}`;
  }

  // ─── app instance CRUD ──────────────────────────────────────────────────

  async createApp(baseId: string, name: string, description: string | undefined, createdBy: string) {
    const id = this.newId('app');
    return this.prisma.appInstance.create({
      data: { id, baseId, name, description: description ?? null, createdBy },
    });
  }

  async listApps(baseId: string) {
    return this.prisma.appInstance.findMany({
      where: { baseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getApp(appId: string) {
    const app = await this.prisma.appInstance.findUnique({ where: { id: appId } });
    if (!app) {
      throw new CustomHttpException('app not found', HttpErrorCode.NOT_FOUND);
    }
    return app;
  }

  async patchApp(appId: string, name: string | undefined, description: string | undefined) {
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (Object.keys(data).length === 0) return this.getApp(appId);
    return this.prisma.appInstance.update({ where: { id: appId }, data });
  }

  async deleteApp(appId: string) {
    return this.prisma.appInstance.delete({ where: { id: appId } });
  }

  // ─── versions / deploy / rollback ────────────────────────────────────────

  async listVersions(appId: string) {
    return this.prisma.appVersion.findMany({
      where: { appId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  /**
   * Deploy a new version. We snapshot the *current* version's snapshot (or a
   * fresh empty one) and bump the version_number. Caller can optionally pass
   * a snapshot object + sourcePrompt to capture an AI-generated design.
   */
  async deploy(appId: string, deployedBy: string, sourcePrompt?: string, snapshot?: unknown) {
    const app = await this.getApp(appId);
    const prev = await this.prisma.appVersion.findUnique({
      where: { appId_versionNumber: { appId, versionNumber: 0 } },
    }).catch(() => null);
    // Find the highest existing versionNumber for this app.
    const latest = await this.prisma.appVersion.findFirst({
      where: { appId },
      orderBy: { versionNumber: 'desc' },
    });
    const nextNumber = (latest?.versionNumber ?? 0) + 1;
    const snapshotJson = (snapshot ?? prev?.snapshot ?? { files: [], components: [] }) as object;
    const versionId = this.newId('apv');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.appVersion.create({
        data: {
          id: versionId,
          appId,
          versionNumber: nextNumber,
          snapshot: snapshotJson,
          sourcePrompt: sourcePrompt ?? null,
          status: 'deployed',
          deployedAt: now,
          deployedBy,
        },
      });
      await tx.appInstance.update({
        where: { id: appId },
        data: { currentVersionId: version.id },
      });
      await tx.appInstance.update({
        where: { id: appId },
        data: { status: 'deployed' },
      });
      // Refetch app so caller sees the new currentVersionId.
      const updatedApp = await tx.appInstance.findUnique({ where: { id: appId } });
      return { app: updatedApp, version };
    });
  }

  /**
   * Rollback to the previous deployed version. We pick the version with the
   * next-highest versionNumber below the current one. If there is none, we
   * throw 400.
   */
  async rollback(appId: string, deployedBy: string) {
    const app = await this.getApp(appId);
    if (!app.currentVersionId) {
      throw new CustomHttpException('no current version to roll back from', HttpErrorCode.VALIDATION_ERROR);
    }
    const current = await this.prisma.appVersion.findUnique({ where: { id: app.currentVersionId } });
    if (!current) {
      throw new CustomHttpException('current version not found', HttpErrorCode.NOT_FOUND);
    }
    const previous = await this.prisma.appVersion.findFirst({
      where: { appId, versionNumber: { lt: current.versionNumber }, status: 'deployed' },
      orderBy: { versionNumber: 'desc' },
    });
    if (!previous) {
      throw new CustomHttpException('no previous version to roll back to', HttpErrorCode.VALIDATION_ERROR);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.appVersion.update({
        where: { id: current.id },
        data: { status: 'rolled_back' },
      });
      await tx.appVersion.update({
        where: { id: previous.id },
        data: { status: 'deployed', deployedAt: new Date(), deployedBy },
      });
      await tx.appInstance.update({
        where: { id: appId },
        data: { currentVersionId: previous.id },
      });
      // Refetch app so caller sees the new currentVersionId.
      const updatedApp = await tx.appInstance.findUnique({ where: { id: appId } });
      return { app: updatedApp, current, previous };
    });
  }

  // ─── secrets (write-only) ────────────────────────────────────────────────

  /**
   * Write a secret value. Cloud's docs say values are write-only after
   * saving — we mirror that by NEVER returning the value on GET. Values are
   * encrypted with AES-256-GCM using the instance integration secret.
   */
  async putSecret(appId: string, key: string, value: string, description?: string) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      throw new CustomHttpException(
        'secret key must start with uppercase and contain only uppercase, digits, underscores',
        HttpErrorCode.VALIDATION_ERROR
      );
    }
    const id = this.newId('sec');
    const ciphertext = this.encryptSecret(value);
    return this.prisma.appSecret.upsert({
      where: { appId_key: { appId, key } },
      create: { id, appId, key, valueCiphertext: ciphertext, description: description ?? null },
      update: { valueCiphertext: ciphertext, description: description ?? null },
    });
  }

  private encryptSecret(value: string): string {
    const integrationSecret = process.env.TEABLE_INTEGRATION_SECRET;
    if (!integrationSecret && process.env.NODE_ENV === 'production') {
      throw new Error('TEABLE_INTEGRATION_SECRET is required to store app secrets');
    }
    const key = scryptSync(integrationSecret ?? 'teable-local-development-secret', 'teable.app-secret.v1', 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1:${Buffer.from(JSON.stringify({
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: encrypted.toString('base64'),
    })).toString('base64')}`;
  }

  async listSecrets(appId: string) {
    return this.prisma.appSecret.findMany({
      where: { appId },
      select: { id: true, appId: true, key: true, description: true, updatedAt: true, createdAt: true },
      orderBy: { key: 'asc' },
    });
  }

  // ─── files (sandbox metadata) ────────────────────────────────────────────

  async listFiles(appId: string) {
    return this.prisma.appFile.findMany({
      where: { appId },
      select: { id: true, appId: true, path: true, sizeBytes: true, updatedAt: true },
      orderBy: { path: 'asc' },
    });
  }

  async putFile(appId: string, path: string, content: string) {
    const id = this.newId('fil');
    const sizeBytes = Buffer.byteLength(content, 'utf-8');
    return this.prisma.appFile.upsert({
      where: { appId_path: { appId, path } },
      create: { id, appId, path, content, sizeBytes },
      update: { content, sizeBytes },
    });
  }

  // ─── publish + public URL (Round 45) ──────────────────────────────────────

  /**
   * Round 45: publish an app so it can be reached at the public URL.
   *
   * Steps:
   *   1. Require a deployed current version (cannot publish a draft).
   *   2. Generate a 12-char base36 slug; loop until unique.
   *   3. Persist `public_slug` + `published_at` atomically with the
   *      status flip to `deployed` (idempotent — re-publishing is a
   *      no-op that just bumps `published_at`).
   *
   * Returns the app row with the new slug + publishedAt. The public
   * URL itself is composed by `getPublicUrl()` from env (`APP_PUBLIC_HOST`).
   */
  async publish(appId: string): Promise<{
    id: string;
    publicSlug: string;
    publishedAt: string;
  }> {
    const app = await this.getApp(appId);
    if (!app.currentVersionId) {
      throw new CustomHttpException(
        'cannot publish: app has no deployed version',
        HttpErrorCode.VALIDATION_ERROR
      );
    }
    // Idempotent — if already published, keep the slug, just bump the
    // publishedAt so callers can confirm the operation succeeded.
    if (app.publicSlug && app.publishedAt) {
      return {
        id: app.id,
        publicSlug: app.publicSlug,
        publishedAt: app.publishedAt.toISOString(),
      };
    }
    const publicSlug = await this.generateUniquePublicSlug();
    const publishedAt = new Date();
    const updated = await this.prisma.appInstance.update({
      where: { id: appId },
      data: { publicSlug, publishedAt, status: 'deployed' },
      select: { id: true, publicSlug: true, publishedAt: true },
    });
    this.logger.log(`app ${appId} published as /a/${updated.publicSlug}`);
    return {
      id: updated.id,
      publicSlug: updated.publicSlug!,
      publishedAt: updated.publishedAt!.toISOString(),
    };
  }

  /**
   * Round 45: unpublish an app. Clears `public_slug` + `published_at`
   * and flips status back to `draft`. The deployed version is kept so
   * the operator can re-publish without losing work.
   */
  async unpublish(appId: string): Promise<{ id: string; unpublished: true }> {
    const app = await this.getApp(appId);
    if (!app.publicSlug) {
      // Idempotent — already unpublished.
      return { id: app.id, unpublished: true };
    }
    await this.prisma.appInstance.update({
      where: { id: appId },
      data: { publicSlug: null, publishedAt: null, status: 'draft' },
    });
    this.logger.log(`app ${appId} unpublished (was /a/${app.publicSlug})`);
    return { id: app.id, unpublished: true };
  }

  /**
   * Round 45: return the public URL config for an app. The host is
   * read from `APP_PUBLIC_HOST` env (default `http://localhost:3000`).
   * Returns `{ published: false }` when the app is not published so
   * the UI can render the "Publish" CTA without a second round-trip.
   */
  async getPublicUrl(appId: string): Promise<
    | { published: false }
    | {
        published: true;
        publicSlug: string;
        publishedAt: string;
        url: string;
      }
  > {
    const app = await this.prisma.appInstance.findUnique({
      where: { id: appId },
      select: { publicSlug: true, publishedAt: true },
    });
    if (!app) {
      throw new CustomHttpException('app not found', HttpErrorCode.NOT_FOUND);
    }
    if (!app.publicSlug || !app.publishedAt) {
      return { published: false };
    }
    const host = (process.env.APP_PUBLIC_HOST ?? 'http://localhost:3000').replace(
      /\/$/,
      ''
    );
    return {
      published: true,
      publicSlug: app.publicSlug,
      publishedAt: app.publishedAt.toISOString(),
      url: `${host}/a/${app.publicSlug}`,
    };
  }

  /**
   * Round 45: resolve an app by its public slug. Used by the future
   * runtime endpoint `GET /a/<slug>` to serve the deployed snapshot.
   * Returns `null` when the slug is unknown — the runtime endpoint
   * then 404s (vs throwing, so we can keep the cache layer clean).
   */
  async resolveBySlug(slug: string): Promise<{
    id: string;
    baseId: string;
    currentVersionId: string | null;
    publicSlug: string;
    publishedAt: Date;
  } | null> {
    const app = await this.prisma.appInstance.findUnique({
      where: { publicSlug: slug },
      select: {
        id: true,
        baseId: true,
        currentVersionId: true,
        publicSlug: true,
        publishedAt: true,
      },
    });
    if (!app || !app.publicSlug || !app.publishedAt) return null;
    // Hand-roll the typed shape — `app.publicSlug` is `string | null` in
    // the Prisma return type even though we just narrowed it.
    return {
      id: app.id,
      baseId: app.baseId,
      currentVersionId: app.currentVersionId,
      publicSlug: app.publicSlug,
      publishedAt: app.publishedAt,
    };
  }

  /**
   * Round 46: fetch the deployed snapshot for the runtime endpoint.
   *
   * The caller already validated the app is published (via
   * `resolveBySlug`); we just need to load the current version and
   * pull out the snapshot JSON plus metadata the runtime can use to
   * render the page (version number, deployedAt, app name).
   *
   * Returns `null` if the app is somehow published but the version
   * was deleted out from under it (data-integrity guard). The runtime
   * endpoint then 404s.
   */
  async getSnapshotByAppId(appId: string): Promise<{
    appId: string;
    appName: string;
    versionNumber: number;
    deployedAt: string;
    snapshot: Record<string, unknown>;
  } | null> {
    const app = await this.prisma.appInstance.findUnique({
      where: { id: appId },
      select: { id: true, name: true, currentVersionId: true },
    });
    if (!app || !app.currentVersionId) return null;
    const version = await this.prisma.appVersion.findUnique({
      where: { id: app.currentVersionId },
      select: { versionNumber: true, snapshot: true, deployedAt: true },
    });
    if (!version) return null;
    const snapshot = (version.snapshot ?? { files: [], components: [] }) as Record<
      string,
      unknown
    >;
    return {
      appId: app.id,
      appName: app.name,
      versionNumber: version.versionNumber,
      deployedAt: (version.deployedAt ?? new Date(0)).toISOString(),
      snapshot,
    };
  }

  /**
   * Round 45: 12-char base36 slug generator with collision retry. We
   * don't use crypto.randomUUID because UUIDs are too long for URLs.
   * `slug-nanoid` would be ideal but isn't installed — `randomBytes`
   * + base36 keeps the implementation dependency-free.
   */
  private async generateUniquePublicSlug(): Promise<string> {
    const MAX_TRIES = 6;
    for (let i = 0; i < MAX_TRIES; i += 1) {
      const slug = this.randomBase36Slug(12);
      const existing = await this.prisma.appInstance.findUnique({
        where: { publicSlug: slug },
        select: { id: true },
      });
      if (!existing) return slug;
    }
    throw new Error('failed to generate unique public slug after retries');
  }

  private randomBase36Slug(length: number): string {
    // base36 = [0-9a-z]; pick length chars from 36-symbol alphabet
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }
}
