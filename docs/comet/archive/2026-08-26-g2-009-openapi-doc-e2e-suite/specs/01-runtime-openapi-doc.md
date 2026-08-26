# Spec — Runtime OpenAPI doc endpoints (v1)

Mirror the existing `v2-openapi.controller.ts` pattern for the v1 `@teable/openapi` registry. Three routes, all under `/openapi`, all `@Public()`, all using the same Scalar HTML shell + CSP nonce pattern as v2.

## Files

### `apps/nestjs-backend/src/features/openapi-doc/openapi-doc.controller.ts`

```ts
/* eslint-disable @typescript-eslint/naming-convention */
import { randomBytes } from 'crypto';
import { Controller, Get, Header, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { getOpenApiDocumentation } from '@teable/openapi';
import type { IBaseConfig } from '../../configs/base.config';
import { Public } from '../auth/decorators/public.decorator';

const OPENAPI_BASE_PATH = 'openapi';
const OPENAPI_SPEC_PATH = `/${OPENAPI_BASE_PATH}/openapi.json`;
const SCALAR_CDN_ORIGIN = 'https://cdn.jsdelivr.net';

const buildServerUrl = (baseConfig: IBaseConfig | undefined, req: Request): string | undefined => {
  const publicOrigin = baseConfig?.publicOrigin;
  if (publicOrigin) return publicOrigin;
  const host = req.get('host');
  if (!host) return undefined;
  return `${req.protocol}://${host}`;
};

const buildDocsCsp = (nonce: string): string =>
  [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "img-src 'self' data: https:",
    "font-src 'self' data: https:",
    "style-src 'self' https: 'unsafe-inline'",
    "connect-src 'self'",
    `script-src 'self' ${SCALAR_CDN_ORIGIN} 'nonce-${nonce}'`,
    `script-src-elem 'self' ${SCALAR_CDN_ORIGIN} 'nonce-${nonce}'`,
    "script-src-attr 'none'",
  ].join('; ');

const buildScalarHtml = (specUrl: string, nonce: string): string => `<!doctype html>
<html>
  <head>
    <title>Teable API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script nonce="${nonce}">
      Scalar.createApiReference('#app', {
        url: '${specUrl}',
      });
    </script>
  </body>
</html>
`;

@Public()
@Controller(OPENAPI_BASE_PATH)
export class OpenApiDocController {
  constructor(private readonly configService: ConfigService) {}

  @Get('openapi.json')
  @Header('Content-Type', 'application/json')
  async openapi(@Req() req: Request) {
    const baseConfig = this.configService.get<IBaseConfig>('base');
    const serverUrl = buildServerUrl(baseConfig, req);
    return getOpenApiDocumentation({
      origin: serverUrl,
      snippet: false,
    });
  }

  @Get('docs')
  @Header('Content-Type', 'text/html; charset=utf-8')
  docs(@Res({ passthrough: true }) res: Response) {
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', buildDocsCsp(nonce));
    return buildScalarHtml(OPENAPI_SPEC_PATH, nonce);
  }

  @Get('explorer')
  @Header('Content-Type', 'text/html; charset=utf-8')
  explorer(@Res({ passthrough: true }) res: Response) {
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', buildDocsCsp(nonce));
    return buildScalarHtml(OPENAPI_SPEC_PATH, nonce);
  }
}
```

### `apps/nestjs-backend/src/features/openapi-doc/openapi-doc.module.ts`

```ts
/* eslint-disable @typescript-eslint/naming-convention */
import { Module } from '@nestjs/common';
import { OpenApiDocController } from './openapi-doc.controller';

@Module({
  controllers: [OpenApiDocController],
})
export class OpenApiDocModule {}
```

### `apps/nestjs-backend/src/app.module.ts`

Add one import + one entry in `imports`. Two-line change:

```ts
import { OpenApiDocModule } from './features/openapi-doc/openapi-doc.module';
```

```ts
// inside imports[]
OpenApiDocModule,
```

No other touch.

## Endpoints

| Method | Path                    | Response                                  | Headers |
| ------ | ----------------------- | ----------------------------------------- | ------- |
| GET    | `/openapi/openapi.json` | JSON OpenAPI 3.0 document                 | `Content-Type: application/json` |
| GET    | `/openapi/docs`         | Scalar HTML shell                         | `Content-Type: text/html; charset=utf-8`, `Content-Security-Policy: ...; script-src ... 'nonce-<random>'; ...` |
| GET    | `/openapi/explorer`     | Scalar HTML shell (same as /docs)         | same as /docs |

All routes are `@Public()`. No CORS changes, no auth wiring, no cookies.

## Acceptance mapping

- A1 → controller + module + test file exist
- A2 → `app.module.ts` imports + `imports[]` entries
- A3 → `/openapi/openapi.json` 200 + JSON + auth/base path tags present
- A4 → `/openapi/docs` 200 + `text/html` + `<div id="app"></div>` + `Scalar.createApiReference`
- A5 → response header `Content-Security-Policy` contains `'nonce-`
- A7 → tsc 0 g2-009 errors
- A8 → `e2e-business-enterprise-smoke.spec.ts` still passes