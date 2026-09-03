/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Runtime endpoints for AI App Builder apps (R57).
 *
 * Round 57 replaces the Round 46 snapshot-JSON placeholder with a real
 * SSR sandbox renderer. Two routes live in two controllers:
 *
 *   GET /a/:slug
 *     — Public runtime for *published* apps. No auth.
 *       Renders the deployed snapshot via the JSX sandbox; injects
 *       Tailwind CDN when the snapshot opts in.
 *
 *   GET /api/:baseId/apps/:appId/preview
 *     — Protected runtime for *draft* apps. Auth + permission
 *       required. Renders the latest version's snapshot and stamps
 *       the page with a "Preview" banner so the operator cannot
 *       confuse it with a Live published app.
 *
 * Both routes share the SSR renderer (`renderAppHtml`). The renderer
 * is pure — same inputs always produce the same HTML (modulo
 * `renderedAt`). Each controller sets a strict
 * Content-Security-Policy header tailored to the actual emissions.
 *
 * License: AGPL-3.0
 */
import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AiAppBuilderAuthService } from './ai-app-builder.auth.service';
import { AiAppBuilderService } from './ai-app-builder.service';
import {
  buildRuntimeCsp,
  renderAppHtml,
  type RenderAppOptions,
} from './ai-app-builder-runtime-ssr';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';

const AiAppBuilderGuard = LicenseCapabilityGuard.for('ai_app_builder');

/**
 * Public runtime for published apps. No auth — anyone with the slug
 * can fetch. The operator opted in via `POST /api/:baseId/apps/:appId/publish`.
 */
@Controller('a')
export class AiAppBuilderRuntimeController {
  constructor(private readonly svc: AiAppBuilderService) {}

  @Get(':slug')
  @Header('cache-control', 'public, max-age=15, stale-while-revalidate=30')
  async publicRuntime(
    @Param('slug') slug: string,
    @Res() res: Response
  ): Promise<void> {
    const app = await this.svc.resolveBySlug(slug);
    if (!app) {
      throw new NotFoundException(`no published app with slug=${slug}`);
    }
    const ctx = await this.svc.getLiveRuntimeContext(app.id);
    if (!ctx) {
      throw new NotFoundException(`app ${app.id} is published but has no runtime context`);
    }
    const opts: RenderAppOptions = {
      mode: 'live',
      appName: ctx.appName,
      versionNumber: ctx.versionNumber,
      deployedAt: ctx.deployedAt.toISOString(),
      publicSlug: ctx.publicSlug,
      secrets: ctx.secrets,
    };
    const out = renderAppHtml(ctx.snapshot, opts);
    const csp = buildRuntimeCsp({ tailwind: out.meta.tailwind, entry: out.meta.entry });
    res.setHeader('content-security-policy', csp);
    res.setHeader('x-app-renderer', 'teable-app-builder-ssr-r57');
    let body = '';
    if (out.ok) {
      body = out.html;
    } else {
      body = errorShell(out as { message: string; meta: { entry: string; renderedAt: string } }, opts);
    }
    res.status(out.ok ? 200 : 422).type('text/html; charset=utf-8').send(body);
  }
}

/**
 * Protected preview runtime for draft apps. License + base permission
 * required. Same renderer, but the banner marks the page as "Preview"
 * and the entry files are loaded from the latest draft (not the
 * published snapshot).
 */
@Controller('api/:baseId/apps')
@UseGuards(AiAppBuilderGuard)
export class AiAppBuilderPreviewController {
  constructor(
    private readonly svc: AiAppBuilderService,
    private readonly auth: AiAppBuilderAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  private currentUserId(): string {
    const userId = this.cls.get('user.id');
    if (!userId) {
      throw new UnauthorizedException('AI App Builder preview requires an authenticated user');
    }
    return userId;
  }

  @Get(':appId/preview')
  @Permissions('base|read')
  @Header('cache-control', 'private, no-cache')
  async preview(
    @Param('baseId') baseId: string,
    @Param('appId') appId: string,
    @Res() res: Response
  ): Promise<void> {
    this.currentUserId();
    await this.auth.assertAppInBase(appId, baseId);
    const ctx = await this.svc.getPreviewRuntimeContext(appId);
    if (!ctx) {
      throw new NotFoundException(`app not found: ${appId}`);
    }
    const opts: RenderAppOptions = {
      mode: 'preview',
      appName: ctx.appName,
      versionNumber: ctx.versionNumber,
      deployedAt: (ctx.deployedAt ?? new Date()).toISOString(),
      secrets: ctx.secrets,
    };
    const out = renderAppHtml(ctx.snapshot, opts);
    const csp = buildRuntimeCsp({ tailwind: out.meta.tailwind, entry: out.meta.entry });
    res.setHeader('content-security-policy', csp);
    res.setHeader('x-app-renderer', 'teable-app-builder-ssr-r57');
    let body = '';
    if (out.ok) {
      body = out.html;
    } else {
      body = errorShell(out as { message: string; meta: { entry: string; renderedAt: string } }, opts);
    }
    res.status(out.ok ? 200 : 422).type('text/html; charset=utf-8').send(body);
  }
}

function errorShell(out: { message: string; meta: { entry: string; renderedAt: string } }, opts: RenderAppOptions): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Render error</title></head>
<body>
<h1>SSR sandbox rejected this snapshot</h1>
<pre>${escapeHtml(out.message)}</pre>
<dl>
  <dt>Mode</dt><dd>${escapeHtml(opts.mode)}</dd>
  <dt>App</dt><dd>${escapeHtml(opts.appName)}</dd>
  <dt>Entry</dt><dd>${escapeHtml(out.meta.entry)}</dd>
  <dt>Rendered</dt><dd>${escapeHtml(out.meta.renderedAt)}</dd>
</dl>
</body></html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
