# Stage 7 — Admin Panel API (spec)

> Child change for `teable-oss-vs-cloud-gap-fill` / Stage 7 — 管理面板后端 API。
> 覆盖 Supervisor acceptance A8 / A10 / A11。

## 1. 能力目标(Capabilities)

本 child 在 OSS 仓库中真实实现五条 admin 只读路由:

| 路由 | Capability | 用途 |
|------|-----------|------|
| `GET /api/admin/users` | `users_read` | 用户列表分页 + 模糊搜索 |
| `GET /api/admin/spaces` | `spaces_read` | 空间列表分页(实例级,不过滤协作者) |
| `GET /api/admin/templates` | `templates_read` | 公开模板分页(`isPublished=true`) |
| `GET /api/admin/ai-settings` | `ai` | 读取 `SettingKey.AI_CONFIG` 当前值 |
| `GET /api/admin/quota-dashboard` | `quota_view` | `QuotaHit` 按 createdTime 倒序分页 |

每条路由顶层 `@UseGuards(LicenseCapabilityGuard.for('<cap>'))`,capability 缺位 → 统一抛 `402 LICENSE_REQUIRED`。

## 2. 运行时(Runtime)

### 2.1 能力映射(`LicenseCapabilityService`)

在 `apps/nestjs-backend/src/features/license/license-capability.service.ts` 中扩展 `LicenseCapability` 联合:

```ts
export type LicenseCapability =
  | 'ai_field'
  | 'ai_chat'
  | 'ai_app_builder'
  | 'cuppy_claw'
  | 'sso'
  | 'permission_matrix'
  | 'custom_app_domain'
  | 'audit_log'
  | 'admin_panel'
  // Stage 7 admin-panel per-route gates:
  | 'users_read'
  | 'spaces_read'
  | 'templates_read'
  | 'ai'
  | 'quota_view';
```

`PLAN_CAPABILITIES` 增量:

- `self_hosted`:不变(空集)。
- `free`:不变。
- `pro`:不变。
- `business`:在现有集合上追加 `users_read` / `spaces_read` / `templates_read` / `ai` / `quota_view`。
- `enterprise`:同上,全部追加。

### 2.2 模块结构

新增 `apps/nestjs-backend/src/features/admin/admin-open-api.module.ts`:

```ts
@Module({
  imports: [PrismaModule],
  controllers: [AdminOpenApiController],
  providers: [AdminOpenApiService],
  exports: [AdminOpenApiService],
})
export class AdminOpenApiModule {}
```

`AdminOpenApiService` 注入 `PrismaService`,所有路由读 Prisma;不依赖 `UserModule` / `SpaceModule` / `QuotaModule`(避免它们的大依赖图)。

在 `apps/nestjs-backend/src/app.module.ts` 的 `appModules.imports` 中插入 `AdminOpenApiModule`(放在 `QuotaModule` 之前,保持字母序)。

### 2.3 路由细节

#### GET /api/admin/users

Query(zod schema):
- `skip?: number`(默认 0,≥0,整数)
- `take?: number`(默认 100,1≤take≤1000,整数)
- `search?: string`(可选;提供时按 `name` 与 `email` 大小写不敏感 contains)

Prisma(`users`):

```ts
const where = search
  ? {
      permanentDeletedTime: null,
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }
  : { permanentDeletedTime: null };

const [list, total] = await prisma.$transaction([
  prisma.user.findMany({
    where,
    orderBy: { createdTime: 'desc' },
    skip,
    take,
    select: {
      id: true, name: true, email: true, isAdmin: true,
      deactivatedTime: true, createdTime: true, lastSignTime: true,
    },
  }),
  prisma.user.count({ where }),
]);
```

响应:`{ list, total, skip, take }`。

#### GET /api/admin/spaces

Query:`skip?: number`(默认 0)、`take?: number`(默认 100,1≤take≤1000)。

Prisma(`spaces`):

```ts
const [list, total] = await prisma.$transaction([
  prisma.space.findMany({
    where: { deletedTime: null },
    orderBy: { createdTime: 'desc' },
    skip, take,
    select: { id: true, name: true, createdBy: true, createdTime: true },
  }),
  prisma.space.count({ where: { deletedTime: null } }),
]);
```

#### GET /api/admin/templates

Query:`skip?: number`(默认 0)、`take?: number`(默认 100,1≤take≤1000)。

Prisma(`templates`):

```ts
const [list, total] = await prisma.$transaction([
  prisma.template.findMany({
    where: { isPublished: true },
    orderBy: { order: 'asc' },
    skip, take,
    select: {
      id: true, name: true, baseId: true, createdBy: true,
      isPublished: true, featured: true, visitCount: true, usageCount: true,
    },
  }),
  prisma.template.count({ where: { isPublished: true } }),
]);
```

#### GET /api/admin/ai-settings

无 query。

Prisma(`ai-settings`):读 `SettingKey.AI_CONFIG` 行(`name === 'aiConfig'`),返回 content 原值(JSON 解析失败时返回原字符串)。

```ts
const row = await prisma.setting.findFirst({
  where: { name: SettingKey.AI_CONFIG },
  select: { content: true },
});
const aiConfig = row?.content ? safeJsonParse(row.content) : null;
```

#### GET /api/admin/quota-dashboard

Query:`skip?: number`(默认 0)、`take?: number`(默认 50,1≤take≤500)。

Prisma(`quota-dashboard`):

```ts
const [list, total] = await prisma.$transaction([
  prisma.quotaHit.findMany({
    orderBy: { createdTime: 'desc' },
    skip, take,
    select: {
      id: true, spaceId: true, metric: true,
      attempted: true, cap: true, actorId: true, resource: true,
      createdTime: true,
    },
  }),
  prisma.quotaHit.count(),
]);
```

## 3. 验收(Acceptance)

### AC-001 — License 激活联动(A8)

- **GIVEN** 启动 `TEABLE_LICENSE_KEY=plan:business` 的服务
- **WHEN** 请求任意 5 条 admin 路由(任意 query)
- **THEN** 全部返回 `200`,body 形如 `{ list, total, skip, take }` 或对应 settings。

- **GIVEN** 启动 `TEABLE_LICENSE_KEY` 未设置(默认 `self_hosted`)
- **WHEN** 请求任意 5 条 admin 路由
- **THEN** 全部返回 `402`,body 含 `errorCode: 'LICENSE_REQUIRED'`、`meta.capability` 等于路由对应 cap。

### AC-002 — Prisma migration 完整(A10)

- **GIVEN** 本 child 不引入新表 / 新字段
- **WHEN** 运行 `pnpm --filter @teable/db-main-prisma prisma migrate deploy` 与 `pnpm --filter @teable/db-main-prisma prisma generate`
- **THEN** 两个命令均 0 失败,`prisma generate` 输出的 client 仍包含 `users` / `space` / `template` / `setting` / `quota_hit` 模型与 `QuotaMetric` 枚举。

### AC-003 — 单元测试覆盖(A11)

- **GIVEN** `AdminOpenApiService` 单测与 `AdminOpenApiController` 单测
- **WHEN** 运行 `pnpm --filter @teable/backend test-unit`
- **THEN** 至少 6 个 `it` 通过(3 controller + 3 service),覆盖:
  1. 空列表(`user.count/findMany` 返回 0 / [] → 路由返回 `{ list: [], total: 0 }`)
  2. 闸拒绝(`LicenseCapabilityService.isEnabled` 返回 false → `require` 抛 `CustomHttpException` 402)
  3. 分页参数应用(skip=10, take=5 → `prisma.user.findMany` 被调用且其 `skip=10, take=5`)
  4. 服务层 `search` 参数被构造为 OR(name / email contains)
  5. 服务层 quota-dashboard 把 `createdTime desc` 应用到 `findMany`
  6. controller 通过 `ZodValidationPipe` 拒绝 `take=0` / `take>1000` → `BadRequestException`

## 4. 反例与边界(Anti-examples / Boundaries)

- **失败拒绝**:license 缺位时,请求**不**触达 service,直接 `402`。
- **越权拒绝**:`users_read` 不允许读取 `password` / `salt` 等敏感字段;`select` 显式列出字段,不传 `select` 全列。
- **搜索 SQL 注入**:`search` 参数只用 `{ contains, mode: 'insensitive' }`,Prisma 自动参数化;**不**拼接原生 SQL。
- **分页上限**:`take > 1000` 拒绝(由 zod schema 在 controller 入口拦截),避免拖慢服务。
- **降级**:自托管 self_hosted 永远不命中 cap(由 `LicenseCapabilityService.isEnabled` 单一事实来源保证)。
- **不可变主体**:`UserService` / `SpaceService` / `QuotaService` / `SettingService` 主体一行不改;本 child 仅调用 Prisma,不修改它们。
- **不引用 `clerk` 或 `cls`**:admin 路由不走会话,完全无状态。

## 5. 边界与不属于本规格(Out of scope)

- Cloud 独占运营组件:Stripe 增购、发票、私有 License 签发。
- 前端 UI(`apps/nextjs-app`)改动。
- `/api/admin/audit-log`(Stage 6 覆盖)。
- `/api/admin/custom-domain/check`(Stage 10 覆盖)。
- API 速率限制按档位(Stage 12 覆盖,本 child 不重复节流)。
- 自托管 license 申请 / 管理前端流程。