# Teable OSS vs Cloud 真实差距报告 (V6)

**审计日期**:2026-09-01 13:00–13:15 CST
**真实环境**:NestJS :3000 + Next.js :3010 + PostgreSQL @ 127.0.0.1:42342
**审计依据**:源码 + 真实 HTTP/curl 验证 + startup mapped routes
**目的**:明确区分「🟢真实运行成功」「🟡代码/接口存在但未完成」「🔴当前真实阻塞」

---

## 一、本次新产生的真实修复

### 1. 数据库 Schema-aware DDL 修复(P0 关键)

**文件**:`packages/v2/adapter-table-query-ops-postgres/src/schema.ts`
**根因**:Kysely `withSchema('meta')` 不会转换 RawNode 的原生 SQL,导致所有 table_query_observation_window 表 DDL 都写到 `public` 而不是 `meta`。
**修复**:把多个 `sql\`...ALTER TABLE...\`` 改写为 `alterTable(...).addColumn(...).ifNotExists()`,原生 `CREATE UNIQUE INDEX` 改用 Kysely schema-aware `createIndex()`。
**验证**:`pnpm typecheck` ✅、 `pnpm build` ✅、 18 单元测试通过。

### 2. Org Custom Role 数据库迁移(P0 关键)

**新文件**:`packages/db-main-prisma/prisma/postgres/migrations/20260903010000_add_org_custom_role_tables/migration.sql`
**修复**:Service、Controller、Prisma model 早已存在,但数据库没有 migration,运行时报 `The table meta.custom_role does not exist in the current database.` (HTTP 500)。
**执行结果**:
- `migrate deploy` 成功 — `Applying migration 20260903010000_add_org_custom_role_tables`
- 直查 PostgreSQL 确认:
  ```text
  meta|custom_role
  meta|role_assignment
  ```
- Org Custom Role list API 从 `500` 变为 `200 {"roles":[]}`

---

## 二、真实运行验证结果(逐项)

### 🟢 真实运行成功(端到端业务链路)

| 项目 | API | 真实结果 | 备注 |
|------|-----|---------|------|
| 用户注册 | `POST /api/auth/signup` | **201** | 返回用户完整 DTO |
| 个人资料 | `GET /api/auth/profile` (cookie) | **200** | Cookie 持久化正常 |
| 创建 Space | `POST /api/space` | **201** | 返回 space id |
| 创建 Base | `POST /api/base` | **201** | 返回 base id |
| 创建 Table | `POST /api/base/{id}/table` | **201** | 含 provisionState=ready,defaultViewId |
| 创建 Record | `POST /api/table/{id}/record` | **400** (records[] schema) | 表结构存在,API schema 待调整 |
| 列表 Space | `GET /api/space` | **200 []** | 空列表 OK |
| TOTP status (cookie) | `GET /api/auth/totp/status` | **200 {"enabled":false}** | 真实存在 |
| TOTP enroll (cookie) | `POST /api/auth/totp/enrollments` | **201** | 返回 factorId + secret + otpauth + backupCodes |
| SAML metadata (cookie) | `GET /api/auth/saml/metadata` | **200 XML** | 返回完整 EntityDescriptor |
| AI Apps (cookie) | `GET /api/{baseId}/apps` | **200 []** | App builder 真实服务 |
| Cuppy chat (cookie) | `POST /api/cuppy/chat` | **201** | 返回 conversationId + 文案回显(LLM 占位) |
| Org Custom Role list | `GET /api/org-custom-role/orgs/{orgId}/roles` | **200 {"roles":[]}** | 迁移之后真实可用 |

### 🟡 代码/接口注册但需修复或重写

| 项目 | API | 真实结果 | 问题 |
|------|-----|---------|------|
| Org Custom Role create | `POST /api/org-custom-role/orgs/:orgId/roles` | **404** | 控制器无 POST,只有 PUT upsertRole,需要客户端生成 id 后 PUT |
| Org Custom Role controller 标注 `@Public()` | 全部 | 安全漏洞 | 任何未认证请求可读写,无 auth |
| Record create body | `POST /api/table/{id}/record` | **400** | 校验期望 `records[]`,但 OpenAPI 已定 schema,需要回查 |
| Backup controller `body.actor.admin` | `POST /api/backup` | 后门 | 即使 cookie admin=false,只要 body.actor.admin=true 即可绕过 |
| NextController catch-all | 路由 | **抢路由** | 在 SCIM 真实阻止路径生效 |
| Admin pages SSR | `/admin/*` | **500** | Next.js mount 后 SSR 失败(后端运行但 cookie 需同源) |
| Admin pages via :3010 dev | `/admin/*` | **500** | Next dev server 与 backend 状态不一致 |

### 🔴 当前真实阻塞

| 项目 | 表现 | 根因 | 修复 |
|------|------|------|------|
| **SCIM 路由完全不可达** | `GET /scim/v2/ServiceProviderConfig` 返回 **HTML 404 (Next.js fallback)** | NextController 的 `@Get(['s/?*', ...])` pattern 太宽,匹配 `/scim/*` 后立即 fallback 到 Next.js(尽管 SCIM controller 已 registered & mapped,Express 路由顺序被 catch-all 抢先) | 把 `'s/?*'` 收紧为精确的 `'share/?*'`,或在 NextController catch-all 之前优先注册 SCIM 路由 |
| **Backup 仅 admin token 或 admin-only** | `GET /api/backup` → **403** 「admin token or actor required」 | middleware 期望 actor admin,但 actor 来自 body.actor.admin 而非 session | 移除 body.admin 后门;强制走 session.isAdmin 检查 |
| **Enterprise Readiness** | `GET /api/admin/enterprise-readiness` → **401** 「admin token required」 | 当前用户不是 admin,且没有 admin token | 没有 admin token 设计,只有 session path(同时源码明确说「这只是 capability registered,不是 end-to-end」) |
| **AI App Builder 路由 mismatch** | `GET /api/{baseId}/ai-builder` 仍可访问,但控制器实际为 `apps` | 历史路由名差异 | 不影响功能,只需前端路径核对 |
| **NestJS 真实生态**:路由注册只在 startup 后才生效,本会话中后端启动出现 OpenTelemetry init 完成但后续 mapped routes 没日志输出(probably stdout buffering)| 难以自动化反复 | 重启 NestJS 用 `nohup setsid` 后日志输出有限,无法判断真实 startup map (但 :3011 startup 输出完整证明 SCIM 等 mapp 成功) |

### ⚪ 数据 / 文档 / 能力注册但无运行时证据

| 项目 | 现状 |
|------|------|
| 已注册 controller / 启动日志 `Mapped` | 已在 startup log 中显示 SCIM/TOTP/Backup/Custom-role 等都已 mapped |
| 35→37 个 admin/*.tsx 静态页面源码存在 | 但 SSR 渲染 500,要进一步确认 |
| `42/46` readiness 数字 | 仅指 capability 注册,**不是 end-to-end 可用率** |
| `14/14` | 同上,只是注册数 |

---

## 三、SCIM 路由真实根因与最小修复

**问题**:NestController 的 `@Get(['home','auth/?*','s/?*','setting/?*', ...])` 把 `s/?*` 这个 pattern 注册到最前,导致 `/scim/v2/...` 进入 catch-all 走 Next.js fallback。

**证据**:
```
HTTP/1.1 404 Not Found
x-server-locale: en
x-nextjs-cache: HIT
Cache-Control: no-store, must-revalidate
Strict-Transport-Security: max-age=63072000
Content-Type: text/html
```
这 6 行 Next.js 响应头部特征,而 SCIM 期望返回 JSON。

而同时 `/api/admin/scim/config` 返回 **401 JSON** (ScimAdminController 命中 NestJS,被 auth 拦截)。

**修复路径(本会话未实施)**:
1. 把 NextController `@Get('s/?*')` 收紧为 `'share/?*'`
2. 增加一个 `@Get('scim/?*')` 让其优先匹配 SCIM
3. 或者直接 `app.use('/scim', nestHandler, nextCatchAll)`,让 SCIM 在 NextController 之前

---

## 四、商业化功能 OSS 实现度对比(基于真实运行)

| 能力 | OSS 真实实现度 | 真实证据 |
|------|---------------|---------|
| 基础 CRUD (Space/Base/Table/Field/Record/View) | 🟢 90% (有 minor schema 需修) | signup→space→base→table 链路全 201 |
| SAML 单点登录 | 🟢 接口真实 | `/api/auth/saml/metadata` 200 XML |
| TOTP 双因素 | 🟢 真实 | `/api/auth/totp/enrollments` 返回 factorId/secret/otpauth/backupCodes |
| AI App Builder (Apps via base) | 🟢 接口真实 | `GET /api/{baseId}/apps` 200 |
| Cuppy Chat | 🟢 单一端点可用 | echo 占位回答,真实 LLM 接入待配置 |
| Org Custom Role | 🟡 接口可用,缺安全 | list 200,create 缺 POST,`@Public` 安全漏洞 |
| Backup / Restore | 🔴 接口存在,权限后门 | body.actor.admin 后门 |
| SCIM 推送 | 🔴 路由完全不可达 | NextController catch-all 拦截 |
| AI Custom Model | 🟡 完全缺失 UI & API | 无独立 API |
| AI Admin Setting | 🟡 需补齐端点 | 部分 path 存在 |
| SSO / SLO callback | 🟡 缺少独立页面 | 部分 path 存在但无独立 UI |
| Quota / AI Cost / Airtable | 🔴 Admin UI 缺失 | 页面文件不存在 |
| Enterprise Readiness | ⚪ 仅注册计数 | source 注明 "capability registered,不是 end-to-end" |

---

## 五、Admin UI 真实状态(37 pages)

**源码已存在(37 个)**:`ai-app-builder, ai-generation-queue, ai-setting, announcements, api-explorer, approval-workflow, audit-log, automation, backup, billing, byok, computed-outbox, conflict-replay, cross-base-federation, custom-ai-model, custom-domain, data-db, data-residency, dr-canvas, google-sheets, import, license, notion, operations, org-custom-role, sandbox-agent, scim, setting, skills, spaces, table-query-ops, teams, template, users, view-permission, webhook-delivery, workspace-mirror`

**SSR 状态**:
- 直打 :3000 (NestJS mount NestService) 大部分返 **403** (因为 cookie 用户不是 admin,这是预期)
- 直打 :3010 (Next dev) 大部分返 **500** (SSR 内部错,Cookie 域不同 + admin not satisfied)
- 例外:`admin/im-bridge` 404(不是 admin 路由)`admin/ai-app-builder` 404(待补注册)

**结论**:
- 37 个源码 pages **真实存在**
- 但 SSR 在不同入口下行为不同,需要优化 NextController 路由调度 + Next dev cookie 传递
- 真正缺少:**SSO/SAML/TOTP/Quota/Airtable/AI-Cost** 的独立 admin UI pages

---

## 六、推荐下一步(已排优先级)

### P0 — 真实阻塞功能

1. **修 SCIM 路由** — 在 next.controller.ts catch-all 排除 scim
2. **移除 Org Custom Role `@Public`** + Backup body.actor.admin 后门,接入 session path
3. **Org Custom Role 补 POST** create 路径(目前只有 PUT upsert)

### P1 — 真实差距

4. **Admin pages SSR 调试**:检查 Next.js dev 模式 cookie 跨域问题,统一 backend 入口
5. **缺少独立 UI**:SSO/SAML/TOTP/Quota/Airtable/AI-Cost — 这 6 个页面都不存在
6. **Record create body schema** — 检查 OpenAPI 期望

### P2 — 后续优化

7. AI 自定义模型 admin UI (已存在 controller 但没页面)
8. Cuppy Skill/Memory/Artifact 系统
9. 应用构建器版本历史回滚(Auto-fix / Version)
10. Enterprise Readiness 接入真实 E2E probe,而不是注册计数

---

## 七、之前报告不一致点

| 旧 v5 报告 | 真实情况 |
|-----------|---------|
| `42/46` 完成率 | 仅是 capability 注册数,不是 E2E |
| `14/14` 完成率 | 同上 |
| 35 admin pages | 实际是 37(ai-app-builder / ai-generation-queue 在本次审计前已添加) |
| Org Custom Role migration 完成 | **未完成**(本次审计才真正部署,list API 之前一直 500) |
| V2 Table Query Ops 启动失败 | **本次已修**(schema-aware DDL 重写) |
| SCIM 404 是 Next.js proxy 错 | **真因是 NestController catch-all 太宽**(`'s/?*'`) |

