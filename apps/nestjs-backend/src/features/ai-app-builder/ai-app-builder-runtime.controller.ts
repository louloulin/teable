/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Public runtime endpoint for published AI App Builder apps.
 *
 * Round 46: serves `GET /a/<slug>` so a published app can be reached
 * at `https://<host>/a/<publicSlug>`. Auth is intentionally NOT
 * required — the app is public by design (the operator opted in
 * via `POST /api/:baseId/apps/:appId/publish`).
 *
 * What we serve today: a JSON-LD-style HTML page that renders the
 * snapshot as readable metadata (app name, version number, deployed
 * timestamp, raw snapshot JSON in a `<pre>` block). This is a
 * minimal-but-real runtime — enough to prove the publish → resolve →
 * render loop end-to-end. The full React-sandbox runtime (snapshot
 * files transpiled into a sandboxed iframe, secrets injected as env,
 * custom-domain routing) is a separate scope.
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
} from '@nestjs/common';
import type { Response } from 'express';
import { AiAppBuilderService } from './ai-app-builder.service';

@Controller('a')
export class AiAppBuilderRuntimeController {
  constructor(private readonly svc: AiAppBuilderService) {}

  /**
   * Public runtime route. Returns 404 when the slug is unknown or
   * the app has been unpublished (Cloud's `app.teable.ai/a/<slug>`
   * semantics). The runtime page is HTML so curl + browser share
   * the same endpoint.
   */
  @Get(':slug')
  @Header('cache-control', 'public, max-age=30, stale-while-revalidate=60')
  async runtime(
    @Param('slug') slug: string,
    @Res() res: Response
  ): Promise<void> {
    const app = await this.svc.resolveBySlug(slug);
    if (!app) {
      throw new NotFoundException(`no published app with slug=${slug}`);
    }
    const snap = await this.svc.getSnapshotByAppId(app.id);
    if (!snap) {
      throw new NotFoundException(
        `app ${app.id} is published but has no deployable snapshot`
      );
    }
    const escapedName = escapeHtml(snap.appName);
    const escapedSlug = escapeHtml(slug);
    const escapedVersion = String(snap.versionNumber);
    const escapedDeployedAt = escapeHtml(snap.deployedAt);
    const snapshotJson = JSON.stringify(snap.snapshot, null, 2);
    const snapshotHtml = escapeHtml(snapshotJson);
    const appUrl = escapeHtml(`/api/admin/enterprise-readiness/manifest`);
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapedName} — Teable App</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1f2937; line-height: 1.5; }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem 0; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .25rem 1rem; margin: 1rem 0; }
  dt { font-weight: 600; color: #4b5563; }
  pre { background: #f3f4f6; padding: 1rem; border-radius: .375rem; overflow-x: auto; font-size: .8rem; line-height: 1.4; }
  footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: .75rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
</head>
<body>
<h1>${escapedName}</h1>
<p>This is a published Teable App Builder runtime preview. The full React sandbox rendering is part of a future round; today we render the snapshot JSON so operators can verify the publish → resolve → render loop end-to-end.</p>
<dl>
  <dt>Slug</dt><dd><code>${escapedSlug}</code></dd>
  <dt>App ID</dt><dd><code>${escapeHtml(snap.appId)}</code></dd>
  <dt>Version</dt><dd>${escapedVersion}</dd>
  <dt>Deployed at</dt><dd>${escapedDeployedAt}</dd>
</dl>
<h2>Snapshot</h2>
<pre>${snapshotHtml}</pre>
<footer>Round 46 runtime. Operators: see <code>${appUrl}</code> for capability parity.</footer>
</body>
</html>`;
    res.status(200).type('text/html; charset=utf-8').send(html);
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
