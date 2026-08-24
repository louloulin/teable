# Outcome

把 Supervisor Change `teable-oss-vs-cloud-gap-fill` 中划定的 Stage 6 在本 worktree 真实实现的可读查询部分暴露到管理员侧:新增 `GET /api/admin/audit-log` 分页/筛选端点,以及把 SSO 登录成功/失败两个事件名挂到 `Events` 枚举,使 Stage 4.1 / 4.2 / 5b 等兄弟 child 在 callback / hot path 调 `AuditScope.emitAtomic()` 时,经既有 `audit-log.emit` → `AuditLogListener` 链路落进 `audit_log` 表后,本 child 提供的查询端点可立即分页筛选。本 child 是 Supervisor acceptance `A2 / A10 / A11` 中"端点可读"那一段。

# Scope

## Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Supervisor brief | `../teable-oss-vs-cloud-gap-fill/brief.md` §"Stage 6" | `complete` | 端点路径 + 能力闸约束 |
| Supervisor spec | `../teable-oss-vs-cloud-gap-fill/specs/teable-oss-vs-cloud-gap-fill/spec.md` §3.3 | `complete` | 端点契约 + 字段 |
| 已落地 `AuditScope` | `apps/nestjs-backend/src/features/audit/audit-scope.ts` | `complete` | 已有 emit 路径;不重复 |
| 已落地 `@Audit` 装饰器 | `apps/nestjs-backend/src/features/audit/audit.decorator.ts` | `complete` | 兄弟 child 沿用 |
| 已落地 `LicenseCapabilityGuard.for('audit_log')` | `apps/nestjs-backend/src/features/license/license-capability.guard.ts` | `complete` | 端点顶层闸 |
| `Events` 枚举 | `apps/nestjs-backend/src/event-emitter/events/event.enum.ts` | `complete` | 增 SSO 事件值 |

## Inherited constraints(来自 Supervisor)

- **AGPL-3.0 / 零热路径改动**:本 child **只**新增 audit-log 读端点 + 新增 SSO 事件枚举值;不修改 `auth.service.ts` / `record-open-api.service.ts` / `ai.service.ts` 主体;不重写 `AuditScope` / `@Audit` 装饰器。
- **零新增 npm 依赖**:`PrismaService` / `@teable/db-main-prisma` 已提供。
- **能力闸**:`@LicenseCapabilityGuard.for('audit_log')` 挂在 controller 顶层;`audit_log` cap 在 `LicenseCapabilityService` 已就位(Pro/Business/Enterprise 开启,OSS / self_hosted 关闭)。
- **审计 sink 与 EE 解耦**:不引入云审计 SaaS 客户端,只读 OSS 本地 `audit_log` 表。
- **失败 idempotency**:重复请求产生相同结果(查询参数决定分页/筛选,无副作用)。

# Non-goals

- 不实现 `audit_log` 表的写入链路(由 `AuditLogListener` 复用 Stage 5 / Stage 1 / Stage 3.5 已落地的 `audit-log.emit` 监听器负责);本 child 仅消费。
- 不实现 SSE 实时推送 / 导出 CSV / 全文检索(由后续 `stage-7-admin-panel-api` 决定是否扩展)。
- 不实现 quota hit / plan change / license key activate 的具体埋点;本 child 仅在 `Events` 枚举预留语义。
- 不实现 `audit_log` 表的 Prisma migration(由后续 `stage-6-prisma` 决策;本 child 在 service 中通过类型断言安全访问 `prisma.auditLog`,测试用 mock 覆盖)。
- 不修改 `record-open-api` / `auth.service` / `ai.service` 主体逻辑(本 child 仅枚举层 + 读端点)。
- 不动 `apps/nextjs-app` 前端。

# Acceptance examples

> 验收以 Supervisor acceptance `A2 / A10 / A11` 的语义为准;具体可观察步骤如下。

- **A2** 审计日志存在与可检索:
  1. 已启用 `audit_log` 能力的 license 下,`GET /api/admin/audit-log?actor=u1&action=user.sso.login.success&resourceType=user&page=1&pageSize=20` → 200,响应 `{ rows: [...], total: N }`,`rows` 按 `createdAt desc`。
  2. 同样的 `actor` 多次出现时,只在第一页出现一次;`page=2&pageSize=20` 给出第二页。
  3. `since=2026-08-01T00:00:00Z&until=2026-08-25T23:59:59Z` 限定时间窗,落库行落在窗外的被排除。
  4. 多个筛选维度 AND 组合(`actor + action + since + until`)→ `where` 子句四者同时存在。
- **A10** Prisma migration 全部成功(本 child 不新增 migration,故沿用既有迁移顺序 0 失败)。
- **A11** 单测全绿:`pnpm -F nestjs-backend test` 0 失败;`audit-log.controller.spec.ts` 至少 4 个 it()、`audit-log.service.spec.ts` 至少 3 个 it()。

# Constraints and invariants

- **只读 endpoint**:`GET /api/admin/audit-log` 不接受任何写入请求;不修改数据库。
- **Where 子句安全**:所有用户输入(`actor` / `action` / `resourceType` / `since` / `until`)经 Prisma `where` 字段名绑定,不拼接原生 SQL。
- **失败拒绝**:`audit_log` 能力位缺位 → `402 LICENSE_REQUIRED`(由 `LicenseCapabilityGuard` 统一抛出);`page < 1` / `pageSize < 1` → `400 VALIDATION`。
- **分页上限**:`pageSize` 默认 20,上限 100,超过则强制 100(防止 DoS)。
- **不污染热路径**:本 child 不引入任何 new module-level side-effect;`event-emitter/events/event.enum.ts` 仅追加 2 个 enum value。

# Decisions

1. **Controller 路径**:`@Controller('api/admin/audit-log')`,顶层 `@UseGuards(LicenseCapabilityGuard.for('audit_log'))`;无 `@Permissions()`(审计只读不需要 admin|read 写权限;capability 已隐含)。
2. **Service 形态**:`AuditLogService.query(filter)` 返回 `{ rows, total }`;`filter` 字段:`{ actor?, action?, resourceType?, since?, until?, page?, pageSize? }`。
3. **Where 子句**:仅把字段值绑定到 Prisma 已识别的字段(`userId` / `action` / `resourceType` / `createdAt`);不暴露任意 key,以防 `where: { [req.query.fieldName]: ... }` 反射任意字段名。
4. **类型访问**:在 `PrismaService` 类型未包含 `auditLog` 时(本 child 不引入 migration),service 通过 `as unknown as { auditLog: Prisma.AuditLogDelegate }` 类型断言;测试用 jest mock 覆盖完整路径,不依赖 prisma generate。
5. **事件枚举**:`Events.USER_SSO_LOGIN_SUCCESS = 'user.sso.login.success'` / `Events.USER_SSO_LOGIN_FAILURE = 'user.sso.login.failure'` 在 `event.enum.ts` 的 `USER_*` 段追加(与既有 `USER_SIGNIN` 同段);**不**修改现有任何值。
6. **Module 注册**:`AuditLogModule` 独立存在(controllers + providers),挂到 `AppModule.imports`;`AuditSourceModule` 已 `@Global()`,service 直接 `inject` `PrismaService`。
7. **测试**:controller 用 `Test.createTestingModule` 注入 mock service;service 用纯 jest mock 验证 `prisma.auditLog.findMany` 的入参形状。

# Open questions

- **Q-A**:Stage 6 的 Prisma migration(`audit_log` 表 + `model AuditLog`)是否在 sibling child / 后续 commit 落地?若未落地,本 child 的 service 通过类型断言 + mock 测试保证可读;运行时是否能落表由 supervisor 集成验证决定。
- **Q-B**:`audit_log.payload` 的 schema 是否需要 zod 解析?本 child 默认返回原始 `Prisma.JsonValue`,由前端决定渲染方式。

# Verification expectations

- 单元测试 `audit-log.controller.spec.ts`:≥4 个 it()(空结果、单筛选、组合筛选 + 分页、capability guard 拒绝)。
- 单元测试 `audit-log.service.spec.ts`:≥3 个 it()(构建正确 Prisma where、分页 skip/take、字符串字段过滤包含转义)。
- `pnpm -F nestjs-backend test` 0 失败;新模块单测全部 pass。
- `git diff comet/stage-6-audit-log..comet/teable-oss-vs-cloud-gap-fill` 仅本 child 改动文件;**不**触碰 supervisor 已落地的 6 个 commit(`a7e4d299c` / `4de1bbaf0` / `52050393b` / `ad55ecaf4` / `f6a471dbd` / `7441c8d8c`)或 Stage 4.1 / 4.2 / 5b 等兄弟 child。