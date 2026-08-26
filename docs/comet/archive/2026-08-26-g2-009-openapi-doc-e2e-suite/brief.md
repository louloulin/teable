# Outcome

OSS 后端在 Wave 1–3 把 `PermissionGuard`、`QuotaInterceptor`、Wave N2 enterprise modules 与 Webhook/BYOK/KMS/DR modules 全部接入 `app.module.ts` 后,还差两块闭环:

1. **运行时 OpenAPI 文档端点缺失**:`swagger.ts` 在启动时把 `getOpenApiDocumentation()` 写盘到 `openapi.json` 然后通过 `SwaggerModule.setup('/docs')` 和 `RedocModule.setup('/redocs')` 暴露 UI,但 `/openapi.json` 不是真实 HTTP 端点,UI 也需要额外 npm 依赖(`nestjs-redoc`)。Cloud 风格应该走 `/openapi/openapi.json` + Scalar HTML(已经在 v2 controller 用过的方案),不引入新依赖。
2. **HTTP-level E2E 冒烟套件缺失**:目前 `e2e-business-enterprise-smoke.spec.ts` 只测 license/quota 子系统,没有覆盖 controller 路由。`app.module.ts` 装配正确与否、controller 路由注册与否、Public 装饰器生效与否,全部要靠手测。

最终交付是**单 PR commit**:一个 `openapi-doc` feature 模块 + 一个 vitest e2e spec + `app.module.ts` 两行注册。

# Scope

## Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Wave 1 (G2-001/002) | `app.module.ts` 全局 PermissionGuard / QuotaInterceptor | `complete` | 模块注册基线 |
| Wave 2 (G2-005) | `src/features/license/__tests__/e2e-business-enterprise-smoke.spec.ts` | `complete` | E2E spec 模板(in-memory Prisma + Test.createTestingModule) |
| Wave 3 (G2-007/008) | `app.module.ts` Wave N2 + Webhook/BYOK/KMS/DR 注册 | `complete` | 模块注册基线 |
| v2 OpenAPI 模式 | `src/features/v2/v2-openapi.controller.ts` | `complete` | Scalar HTML + CSP nonce 模板;`SCALAR_CDN_ORIGIN` 字符串 |
| v1 OpenAPI 入口 | `packages/openapi/src/generate.schema.ts::getOpenApiDocumentation()` | `complete` | v1 OpenAPI 生成入口 |
| Public 装饰器 | `src/features/auth/decorators/public.decorator.ts` | `complete` | 公开路由标记 |
| vitest 配置 | `apps/nestjs-backend/vitest.config.ts` | `complete` | test include 范围(待验证是否含 test/) |

## 本 change 落地范围

1. **新增 OpenAPI doc 模块**:
   - `apps/nestjs-backend/src/features/openapi-doc/openapi-doc.controller.ts` —— `@Controller('openapi')`,三个 `@Get`:`/openapi.json`、`/docs`、`/explorer`,全部 `@Public()`。
   - `apps/nestjs-backend/src/features/openapi-doc/openapi-doc.module.ts` —— `@Module({ controllers: [OpenApiDocController] })`,不引入额外 service / provider。
   - `apps/nestjs-backend/src/app.module.ts` —— 加一行 `import` + 一行 `imports[]` 条目。**其他文件不改动**。

2. **新增 E2E spec**:
   - `apps/nestjs-backend/test/openapi-e2e.spec.ts` —— 5 个 `it()`:`/openapi/openapi.json`、`/openapi/docs`、`/openapi/docs` 的 CSP nonce、`/openapi/explorer`、`/api/v2/openapi.json`。
   - 用 `Test.createTestingModule({ imports: [AppModule] })` 装配全模块 + supertest 驱动;override `PrismaService` 用一个返回 stub 的 fake,避免连真实 DB。
   - 不动任何 controller 主体、不动 `swagger.ts`。

3. **vitest 配置微调**(若必要):`apps/nestjs-backend/vitest.config.ts` 若 `test.include` 不含 `test/**/*.spec.ts`,追加一行。**绝大多数情况下不需要**。

# Non-goals

- **不改任何现有 controller**:不增加 `@ApiTags()` / `@ApiOperation()` 装饰器,沿用 zod-to-openapi registry。
- **不改 `swagger.ts`**:保留 `/docs` 和 `/redocs` 历史路径,新加 `/openapi/*` 并存。
- **不引入新 npm 依赖**:Scalar 通过 CDN,supertest 已在 `@nestjs/testing`。
- **不做生产级 E2E**:不启 NestApplication、不连 Postgres / Redis,完全 in-memory。
- **不重写 OpenAPI registry**:仍由 `@teable/openapi` 的 `getRoutes()` + `getOpenApiDocumentation()` 生成。
- **不做国际化**:Scalar 文案沿用 v2(英文)。

# Acceptance examples

- **GA1 文件存在**:`apps/nestjs-backend/src/features/openapi-doc/openapi-doc.controller.ts`、`apps/nestjs-backend/src/features/openapi-doc/openapi-doc.module.ts`、`apps/nestjs-backend/test/openapi-e2e.spec.ts` 三个文件全部存在。
- **GA2 模块注册**:`app.module.ts` 的 `imports` 数组中包含 `OpenApiDocModule`,且 imports 段有对应 `import { OpenApiDocModule } from './features/openapi-doc/openapi-doc.module'`
- **GA3 openapi.json 端点行为**:`GET /openapi/openapi.json` 返回 200,`Content-Type: application/json`;`body.paths` 至少包含一条 `auth` 路径(含 `signin`)与一条 `base` 路径。
- **GA4 docs HTML 端点行为**:`GET /openapi/docs` 返回 200,`Content-Type: text/html; charset=utf-8`;响应体包含 `<div id="app"></div>` 与 `Scalar.createApiReference`。
- **GA5 CSP nonce 头存在**:`GET /openapi/docs` 响应头 `Content-Security-Policy` 含 `'nonce-` 标识。
- **GA6 E2E 套件 vitest 全绿**:`pnpm -F nestjs-backend exec vitest run test/openapi-e2e.spec.ts` 全部测试通过(至少 5 个 `it()`)。
- **GA7 tsc 不破坏**:`pnpm -F nestjs-backend exec tsc --noEmit` 整体运行,**没有因为 g2-009 模块新增的任何 tsc 错误**(允许保留 baseline `test/*` 与 `src/features/*/__tests__/*` 已存在的错误)。
- **GA8 既有 e2e-business-enterprise-smoke 仍通过**:`pnpm -F nestjs-backend exec vitest run src/features/license/__tests__/e2e-business-enterprise-smoke.spec.ts` 仍然全绿(回归)。

# Constraints and invariants

- **AGPL-3.0 合规**:新增源代码都在本仓库内。
- **零现有热路径改动**:`PermissionGuard` / `QuotaInterceptor` / `LicenseCapabilityGuard` / `LicenseService` / 任何 controller 主体不变。
- **零新增 npm 依赖**:`package.json` 不动。
- **命名空间不冲突**:`/openapi/*` 与 `/api/v2/*`、`/docs`、`/redocs` 路径无重叠。
- **in-memory only**:`FakePrismaService` 只覆盖 AppModule 装配时实际调用的方法。

# Decisions

1. **命名空间 `/openapi` 而非 `/docs`**:避免与 `swagger.ts` 的 `/docs` 冲突,也避免与 `/api/v2/*` 命名混淆。
2. **`@Public()` 而非 session auth**:与 `v2-openapi.controller.ts` 对齐,文档对未登录用户开放。
3. **Scalar 而非 Redoc**:沿用 v2 controller 的 CDN 模式,不引入 `nestjs-redoc`,减少包体。
4. **CSP nonce 而非 `'unsafe-inline'`**:符合 v2 controller 安全模型,nonce 16 字节 base64。
5. **E2E 仅 HTTP smoke**:不走 happy-path CRUD,只验路由 + header + CSP,保证 build 时长可控。
6. **不重写 OpenAPI registry**:保持 zod-to-openapi 单一生成入口。

# Open questions

- 无。用户原文"继续 Wave 4 → Wave 5 → 真实集成验证 → 发版"已授权本 change 在 Wave 4 落地。

# Verification expectations

- `pnpm -F nestjs-backend exec tsc --noEmit` 整体跑通,g2-009 模块 0 新增错误。
- `pnpm -F nestjs-backend exec vitest run test/openapi-e2e.spec.ts` 5 个 `it()` 全绿。
- `pnpm -F nestjs-backend exec vitest run src/features/license/__tests__/e2e-business-enterprise-smoke.spec.ts` 回归 39 个测试仍全绿。
- `pnpm -F nestjs-backend exec vitest run` 整体跑过(允许 baseline 错误,g2-009 不引入新失败)。