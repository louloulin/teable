# Outcome

在 `apps/nestjs-backend/src/features/admin/` 下新增一组面向管理面板的只读 HTTP 路由(`/api/admin/users`、`/api/admin/spaces`、`/api/admin/templates`、`/api/admin/ai-settings`、`/api/admin/quota-dashboard`),全部挂在已有的 `LicenseCapabilityGuard.for('<cap>')` 闸后,让商业版 Business 档位的管理面板前端能够直接消费本仓库(AGPL-3.0 自托管 OSS)的真实数据,不再依赖 `teableio/teable-ee`。这是 Supervisor `teable-oss-vs-cloud-gap-fill` 的 Stage 7 child change,覆盖 A8 / A10 / A11。

# Scope

## Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Supervisor brief | `docs/comet/changes/teable-oss-vs-cloud-gap-fill/brief.md` | `complete` | 范围、A8/A10/A11 验收项、约束 |
| Supervisor spec | `docs/comet/changes/teable-oss-vs-cloud-gap-fill/specs/teable-oss-vs-cloud-gap-fill/spec.md` §3.1 + §3.4(行) | `complete` | 能力闸接入规范 + admin 路由列表 |
| 已有 License 闸 | `apps/nestjs-backend/src/features/license/license-capability.service.ts` + `license-capability.guard.ts` | `complete` | 直接复用 `LicenseCapabilityGuard.for(...)` |
| 已有 QuotaService | `apps/nestjs-backend/src/features/quota/quota.service.ts` | `complete` | `QuotaHit` 模型 + `getUsage(spaceId)` 复用 |
| 已有 SpaceService | `apps/nestjs-backend/src/features/space/space.service.ts` | `complete` | 仅作参考;新路由直接走 Prisma,避免对 `getSpaceList()` 协变 |
| 已有 TemplateOpenApiService | `apps/nestjs-backend/src/features/template/template-open-api.service.ts` | `complete` | `isPublished=true` 公开模板查询参考 |
| 已有 AdminOpenApiController | `apps/nestjs-backend/src/features/setting/open-api/admin-open-api.controller.ts` | `complete` | 路径前缀 `/api/admin` 与命名风格参考 |

## 本 change 交付

1. `apps/nestjs-backend/src/features/admin/admin-open-api.controller.ts`(新)
2. `apps/nestjs-backend/src/features/admin/admin-open-api.service.ts`(新)
3. `apps/nestjs-backend/src/features/admin/admin-open-api.module.ts`(新)
4. `apps/nestjs-backend/src/features/admin/admin-open-api.controller.spec.ts`(新,≥3 用例)
5. `apps/nestjs-backend/src/features/admin/admin-open-api.service.spec.ts`(新,≥3 用例)
6. `apps/nestjs-backend/src/app.module.ts`(修改,接入 `AdminOpenApiModule`)
7. `docs/comet/changes/stage-7-admin-panel-api/specs/stage-7-admin-panel-api/spec.md`(新)
8. `docs/comet/changes/stage-7-admin-panel-api/brief.md`(本文件)

## 路由清单(全部 `GET`,统一前缀 `/api/admin`)

| Path | Capability | 用途 |
|------|-----------|------|
| `/api/admin/users?skip=&take=&search=` | `users_read` | 分页 + 模糊搜索(name / email contains,大小写不敏感) |
| `/api/admin/spaces?skip=&take=` | `spaces_read` | 全量空间分页(不过滤协作者) |
| `/api/admin/templates?skip=&take=` | `templates_read` | 公开模板(`isPublished=true`)分页 |
| `/api/admin/ai-settings` | `ai` | 读取 `SettingKey.AI_CONFIG` 当前值 |
| `/api/admin/quota-dashboard?skip=&take=` | `quota_view` | 聚合 `QuotaHit` 按 metric + spaceId 倒序 |

# Non-goals

- **不**实现写操作(创建/删除/更新)路由,只做只读面板数据。
- **不**修改 `UserService` / `SpaceService` / `QuotaService` / `SettingService` 主体,只调用它们或在 `AdminOpenApiService` 内直接读 Prisma。
- **不**实现 Cloud 独占功能:Stripe 增购、发票、私有 License 签发、admin token 流程。
- **不**新增 npm 依赖;仅用 NestJS / Prisma / zod(`ZodValidationPipe`)现有包。
- **不**复制 `teableio/teable-ee` 任何源代码。
- **不**在前端做任何改动。
- **不**实现 `/api/admin/audit-log`(Stage 6 已规划,本 change 不重复)。

# Acceptance examples

本 child 仅覆盖 A8 / A10 / A11:

- **A8** License 激活联动:本 child 通过 `LicenseCapabilityGuard.for('users_read' | 'spaces_read' | 'templates_read' | 'ai' | 'quota_view')` 接入 `LicenseCapabilityService`;在 `TEABLE_LICENSE_KEY=plan:business` 下,5 条 admin 路由全部可访问;在 self_hosted 默认下,任意一条 admin 路由返回 `402 LICENSE_REQUIRED`。对应 spec `AC-001`。
- **A10** Prisma migration 全部成功:本 child **不**新增 Prisma migration,所有路由只读现有表(`users` / `space` / `template` / `setting` / `quota_hit`);`pnpm prisma migrate deploy` 与 `pnpm --filter @teable/db-main-prisma prisma generate` 均 0 失败。对应 spec `AC-002`。
- **A11** 单测全绿:本 child 在 `apps/nestjs-backend` 下新增 2 份 spec 文件,覆盖(1)空列表返回、(2)能力闸缺位拒绝、(3)`skip`/`take` 落到 Prisma;`pnpm --filter @teable/backend test-unit` 0 失败。对应 spec `AC-003`。

# Constraints and invariants

- **AGPL-3.0 合规**:所有新源代码在本仓库内,不引入冲突依赖。
- **零现有热路径改动**:`UserService` / `SpaceService` / `QuotaService` / `SettingService` 主体一行不改。
- **零新增 npm 依赖**:Node 内置 + NestJS / Prisma / zod 现有依赖足够。
- **能力闸统一**:每条 admin 路由顶层挂 `UseGuards(LicenseCapabilityGuard.for('<cap>'))`,缺位 → `402 LICENSE_REQUIRED`。
- **路由不可越权**:admin 路由**只**读实例级数据(全表 / 公开模板),不绕过现有 `space|read` 之类的 per-resource ACL;self_hosted 默认不可访问(闸已拦)。
- **Prisma 安全 WHERE**:搜索条件用 `{ contains, mode: 'insensitive' }`,分页参数经 zod schema 校验后落到 `skip` / `take`。
- **能力映射完整**:`'users_read'` / `'spaces_read'` / `'templates_read'` / `'ai'` / `'quota_view'` 五个 capability 中,除 `'ai'` 已存在于 `LicenseCapability` 联合,其余四个为 admin 面板专用新增,均挂在 `business` + `enterprise` 计划上,`pro` 与 `free` 不可。

# Decisions

1. **不复用 `getSpaceList()`**:该方法强制走 `cls.user.id` + collaborator 关系,admin 面板需要全量空间;新路由直接 `prisma.space.findMany`,不动 SpaceService 主体。
2. **`AdminOpenApiService` 自接 Prisma**:User / Space / Template / QuotaHit / Setting 全部走 `prismaService.txClient()`,避免在 UserModule / SpaceModule 上引入新的依赖环(后者还要 `clerk + 设置` 才能实例化)。
3. **能力映射放置**:在 `license-capability.service.ts` 的 `LicenseCapability` 联合中追加 4 个 admin 用 cap;`self_hosted` 与 `pro` 都不带,`business` / `enterprise` 都带。
4. **模块命名**:沿用 `apps/nestjs-backend/src/features/<feature>/<feature>-open-api.{module,service,controller}.ts` 既有命名风格。
5. **Module 导入**:仅 `PrismaModule`(来自 `@teable/db-main-prisma`),不导入 UserModule / SpaceModule / QuotaModule(避免它们的大依赖图被本模块拉进来)。
6. **`Users` / `Spaces` 分页默认**:与 TemplateOpenApiService 对齐 `skip=0, take=100, take<=1000`。
7. **ai-settings 复用 SettingService**:只读,不修改。复用量小,通过 SettingModule 注入。

# Open questions

- **Q1 解决**:`quota_view` cap 是否与 `admin_panel` 重叠?答:`admin_panel` 已存在于 cap 联合中,本 child 不重用它,因为 spec §3.1 要求 per-route 粒度;保留 5 个独立 cap,让 capability 报告更精细。
- **Q2 解决**:admin 路由要不要支持"按 isAdmin=true 过滤 user"?答:不做,管理面板需要看到 deactivated / deleted 用户;只过滤 `permanentDeletedTime IS NULL` 以排除永久删除。
- **Q3 解决**:要不要给 `/api/admin/templates` 加 `featured` 过滤?答:不加,只 `isPublished=true`,前端自行筛选。

# Verification expectations

- 单元测试 (`apps/nestjs-backend/src/features/admin/admin-open-api.{controller,service}.spec.ts`) 至少 3 用例:空列表 / 闸拒绝 / skip+take 应用。
- `pnpm --filter @teable/backend test-unit` 通过。
- TypeScript 编译通过:`pnpm --filter @teable/backend build`。
- 不需要 e2e,因为新模块的写入面为零(纯 GET),纯 Prisma 单测已覆盖决定点。
- 端到端路径(由 Supervisor Verifier 验证):license=`plan:business` 启动后,五条路由返回 200;license=`none` 启动后,五条路由返回 402。