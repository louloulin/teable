# Stage 6 — Audit log query endpoint + SSO event enums

> 本 spec 描述归档后 Stage 6 中"可读 + 枚举"两个交付物的完整行为。父 change `teable-oss-vs-cloud-gap-fill` §3.3 已经给出端点契约,本 spec 把它落到 NestJS 现有模块结构。Verifier 在本 child 集成分支上按 AC-001 ~ AC-006 验收。

## 1. 能力目标

让管理员侧可以分页、筛选、查询 OSS 自托管实例写入的 `audit_log` 行,且把 SSO 登录成功/失败两个新事件值挂入 `Events` 枚举,使既有 `audit-log.emit` → `AuditLogListener` 链路自动把它们落进表。本 child **不**新增写入路径、不动 `AuditScope` / `@Audit` 装饰器。

## 2. 数据模型增量

无新增 Prisma 表。本 child 假设 `audit_log` 表(由 supervisor 集成阶段 / 后续 commit 落地)存在,字段如下,与 `audit-scope.ts` 中 `scheduleEmit` 入参对齐:

| 列 | 类型 | 用途 |
|----|------|------|
| `id` | `text` (cuid) | 主键 |
| `user_id` | `text` | actor(对应 query 参数 `actor`) |
| `action` | `text` | 事件名(对应 query 参数 `action`,如 `user.sso.login.success`) |
| `resource_type` | `text` | 资源类型(对应 query 参数 `resourceType`,如 `user` / `base`) |
| `resource_id` | `text?` | 资源 id |
| `payload` | `jsonb` | 自由 payload |
| `root_action` | `text?` | 复合操作根 |
| `operation_id` | `text?` | 复合操作 id |
| `created_at` | `timestamptz` | 入库时间,排序键 |

索引:(`user_id`, `created_at desc`) / (`resource_type`, `resource_id`, `created_at desc`)。`audit-log.emit` listener 写入时由 listener 自定,本 child 不创建迁移。

## 3. 运行时行为

### 3.1 路由与权限

- `GET /api/admin/audit-log?actor=&action=&resourceType=&since=&until=&page=&pageSize=` — 由 `AuditLogController.query()` 实现。
- 顶层 `@UseGuards(LicenseCapabilityGuard.for('audit_log'))`;`audit_log` cap 缺位 → `402 LICENSE_REQUIRED`(由 `LicenseCapabilityGuard.canActivate` 抛 `CustomHttpException(HttpErrorCode.PAYMENT_REQUIRED)`)。
- 无 `@Permissions()`:capability 闸已隐含"仅 license 持有者可读"。

### 3.2 查询参数

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `actor` | `string?` | undefined | 等值匹配 `user_id` |
| `action` | `string?` | undefined | 等值匹配 `action`(e.g. `user.sso.login.success`) |
| `resourceType` | `string?` | undefined | 等值匹配 `resource_type` |
| `since` | `ISO8601?` | undefined | `created_at >= since` |
| `until` | `ISO8601?` | undefined | `created_at <= until` |
| `page` | `int>=1` | `1` | 页码 |
| `pageSize` | `1<=int<=100` | `20` | 每页条数;`>100` 强制 100 |

非法参数(`page < 1` / `pageSize < 1` / `since/until` 非 ISO8601)→ `400 VALIDATION`。

### 3.3 响应

```json
{
  "rows": [
    {
      "id": "ckl...",
      "userId": "u1",
      "action": "user.sso.login.success",
      "resourceType": "user",
      "resourceId": "u1",
      "payload": { "reason": null },
      "rootAction": null,
      "operationId": null,
      "createdAt": "2026-08-25T10:00:00.000Z"
    }
  ],
  "total": 42
}
```

- `rows` 按 `createdAt desc`。
- `total` 是符合 `where` 的总行数(无 skip/take 限制)。

### 3.4 Where 子句构造

`AuditLogService.query()` 把合法字段映射到 Prisma `where` 字段:

```ts
const where: Prisma.AuditLogWhereInput = {
  ...(filter.actor ? { userId: filter.actor } : {}),
  ...(filter.action ? { action: filter.action } : {}),
  ...(filter.resourceType ? { resourceType: filter.resourceType } : {}),
  ...(filter.since || filter.until
    ? {
        createdAt: {
          ...(filter.since ? { gte: filter.since } : {}),
          ...(filter.until ? { lte: filter.until } : {}),
        },
      }
    : {}),
};
```

- 字段名是 Prisma 已识别的(`userId` / `action` / `resourceType` / `createdAt`);**不**接受 query 参数中的任意 key,以防反射未知字段。
- 字符串值经 ISO8601 解析(`Date`)后才进入 Prisma,避免直接传 `Date|string` 造成排序混乱。

### 3.5 事件枚举

`apps/nestjs-backend/src/event-emitter/events/event.enum.ts` 在 `USER_*` 段尾追加:

```ts
USER_SSO_LOGIN_SUCCESS = 'user.sso.login.success',
USER_SSO_LOGIN_FAILURE = 'user.sso.login.failure',
```

兄弟 child(Stage 4.1 / 4.2)在 `SsoAuthService.completeCallback()` 用 `@Audit({ action: Events.USER_SSO_LOGIN_SUCCESS, emit: true })` 装饰,失败分支 `auditScope.emitAtomic({ action: Events.USER_SSO_LOGIN_FAILURE, ... })`;`AuditScope.emitAtomic()` → `Events.AUDIT_LOG_EMIT` → `AuditLogListener` 监听器把它们落进 `audit_log`。

## 4. 验收项

- **AC-001** 空结果:`GET /api/admin/audit-log` 无过滤参数且表为空 → `{ rows: [], total: 0 }`。
- **AC-002** 单过滤:`?action=user.sso.login.success` → Prisma `where.action = 'user.sso.login.success'`,`orderBy.createdAt = 'desc'`。
- **AC-003** 分页:`?page=2&pageSize=20` → Prisma `skip=20, take=20`;`total` 是无分页总数。
- **AC-004** capability guard 拒绝:plan=self_hosted → controller 调用前 `LicenseCapabilityGuard.canActivate()` 抛 `CustomHttpException(PAYMENT_REQUIRED, 'LICENSE_REQUIRED')`;handler 不被触达。
- **AC-005** 字符串过滤含转义:`?action=user.sso.login.failure' OR 1=1--` → Prisma `where.action = "user.sso.login.failure' OR 1=1--"`(整字符串匹配,Prisma 参数化),不会注入。
- **AC-006** 事件枚举存在:`import { Events } from '...'`,`Events.USER_SSO_LOGIN_SUCCESS === 'user.sso.login.success'`;`Events.USER_SSO_LOGIN_FAILURE === 'user.sso.login.failure'`。

## 5. 反例与边界

- 同一 actor 多次登录:`rows` 按时间倒序,`total` 反映全部。
- `pageSize > 100` → 强制 100,不报错(防止 DoS);`pageSize < 1` → 400。
- `since > until` → 返回空集(`total: 0`),不报错(由 Prisma 自身决定)。
- capability 已开但表为空 → 200 + `{ rows: [], total: 0 }`;capability 关 → 402。

## 6. 边界与不属于本 spec

- 写入 `audit_log` 的 listener(`AuditLogListener.handleAuditLogEmit`)→ 已有 Stage 1-3.5 / Stage 5 / Stage 4 路径。
- 复合操作审计 row(`operationId` 关联)→ Stage 5 已示范。
- 前端 UI / CSV 导出 / SSE → `stage-7-admin-panel-api`。
- `audit_log` 表 Prisma migration → 后续 commit 决策。
- Quota hit / plan change / license key activate 的具体埋点 → 兄弟 child 或后续 commit。