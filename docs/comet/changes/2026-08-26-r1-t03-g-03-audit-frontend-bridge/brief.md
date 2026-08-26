# R1-T03 G-03 — 前端桥接入 audit

> Teable OSS — AGPL-3.0 — Single Native change
> Branch: `comet/r1-t03-g-03-audit-frontend-bridge`
> Target branch: `agent/chong/df9d120d2105-stage6-audit-log`

## 1. 背景与目标

上一轮 R1-T02 (comet/r1-t02-g2-008-expand) 已经把 audit 模块扩展成 thin-DI wrapper 模式 (`AuditAuthService.listAuditOperations` 已经能读 `prisma.auditLog` 行),但前端还没有任何桥接入口:`apps/nextjs-app/src/features/app/blocks/admin/` 下不存在 audit 相关页面,`packages/openapi/src/` 也没有 audit 相关 endpoint 客户端,`apps/nextjs-app/src/pages/admin/` 也只有 `setting.tsx` 和 `template.tsx` 两个页面。

本轮目标是把 audit 读端 (`AuditAuthService.listAuditOperations`) 真正接通到前端,让管理员能在 OSS 实例上看到自己的 HTTP request audit 行 / 域事件 audit 行。

### 1.1 范围

| 模块 | 改动 |
| --- | --- |
| `apps/nestjs-backend/src/features/audit/audit.controller.ts` (新) | 新增 admin-only 控制器,暴露 `GET /api/admin/audit/operations` 与 `GET /api/admin/audit/operations/summary`,只调用 `AuditAuthService` |
| `packages/openapi/src/admin/audit/` (新) | 新增 zod schema + `registerRoute` + axios 客户端 (`listAuditOperations`, `getAuditOperationsSummary`) |
| `packages/openapi/src/index.ts` | 把 audit 客户端挂到 root 桶 |
| `apps/nextjs-app/src/features/app/blocks/admin/audit/` (新) | 新建 admin audit 区块:`AuditLogPage.tsx` + `AuditLogTable.tsx` + `AuditLogFilter.tsx` + `index.ts` + i18n 占位 |
| `apps/nextjs-app/src/pages/admin/audit-log.tsx` (新) | 新建 admin page,挂 `getServerSideProps` 鉴权 + 渲染 `AuditLogPage` |
| `apps/nextjs-app/src/features/app/blocks/admin/index.ts` | 把 audit 子区块挂到 admin barrel |
| `apps/nestjs-backend/test/r1-t03-audit-frontend-bridge.e2e-spec.ts` (新) | 验证 admin 才能命中 `/api/admin/audit/operations`,非 admin 返回 403 |

### 1.2 非目标

- **不**改写 audit 写路径 (`AuditScope.emitAtomic` / `AuditLogService.record`) — 已有 g2-003 / g2-006 / Stage 6 在管。
- **不**改写 `audit.interceptor.ts` — 红名单 / 元数据写入路径保持不变。
- **不**新增 npm 依赖,只用 shadcn/ui + TanStack Query + axios + zod 这些已经在 nextjs-app 内的库。
- **不**实现 audit 行导出 / SIEM webhook — 这是 T-04 之后的事,这里只做"读 + 渲染"。
- **不**做实时 SSE / WebSocket 推送 — 一次 `useQuery` 拉取足够本轮验收。

## 2. 已有约束(继承 T-02)

- `AuditAuthService.listAuditOperations(filter: IAuditListFilter)` 已是 thin-DI wrapper:`limit` 默认 100 / 最大 1000,可按 `action` / `resourceId` 过滤,返回 `{ rows, nextCursor }`。
- `audit/` 是 `@Global()` 模块,`AuditAuthService` 已经导出,新控制器直接 `@Inject` 即可。
- 任何新增源代码都在本仓库内(AGPL-3 合规)。
- 零热路径改动:已有 handler 主体逻辑不变。
- 零新增 npm 依赖。

## 3. 验收项

| ID | 说明 | 验收方式 |
| --- | --- | --- |
| T03-V01 | `GET /api/admin/audit/operations?action=...` 在 admin 鉴权下返回 `{ rows: IAuditListRow[], nextCursor: string \| null }` 形态 | e2e spec 命中 admin 路由,断言 status 200 + 数据形状 |
| T03-V02 | `GET /api/admin/audit/operations` 在非 admin 用户下返回 403 | e2e spec 用 `createNewUserAxios`(普通 user)发起,断言 403 |
| T03-V03 | `getAuditOperationsList` / `getAuditOperationsSummary` 在 `@teable/openapi` 客户端内可被导入,并被 `packages/openapi/src/index.ts` re-export | tsc `--noEmit` 通过 |
| T03-V04 | admin audit page `/admin/audit-log` 在无 session 时 302 到 `/auth/login`,有 session 时渲染 `AuditLogPage`(无白屏 / 无 unhandled error) | `pages/admin/audit-log.tsx` 的 `getServerSideProps` 走 SSO 鉴权 + 渲染组件 |
| T03-V05 | `AuditLogFilter` 支持按 `action` / `resourceId` 过滤 + `limit` 调整,提交后 `useQuery` 重新拉取 | 单元化手动验证(无 e2e),走 typecheck |
| T03-V06 | 任何 audit 文件顶部包含 `Teable Open Source — AGPL-3.0 license` 注释 | git diff 抽样 5 个新增 .ts,人工 + e2e 启动检查 |
| T03-V07 | typecheck + lint + vitest 通过 | `pnpm -F nestjs-backend test` + `pnpm -F openapi build` |

## 4. 关键文件清单(参考)

### 4.1 后端新增/修改

```
apps/nestjs-backend/src/features/audit/audit.controller.ts          (新增 ~80 行)
apps/nestjs-backend/src/features/audit/audit.module.ts              (修改 — 把 controller 加进 controllers:)
apps/nestjs-backend/test/r1-t03-audit-frontend-bridge.e2e-spec.ts  (新增 ~70 行)
```

### 4.2 OpenAPI 客户端新增

```
packages/openapi/src/admin/audit/index.ts                          (新增)
packages/openapi/src/admin/audit/list-operations.ts                (新增)
packages/openapi/src/admin/audit/list-operations-summary.ts        (新增)
packages/openapi/src/index.ts                                      (修改 — 1 行 export * from './admin/audit')
packages/openapi/src/admin/index.ts                                 (检查是否需要 export)
```

### 4.3 前端新增/修改

```
apps/nextjs-app/src/features/app/blocks/admin/audit/AuditLogPage.tsx       (新增)
apps/nextjs-app/src/features/app/blocks/admin/audit/AuditLogTable.tsx      (新增)
apps/nextjs-app/src/features/app/blocks/admin/audit/AuditLogFilter.tsx     (新增)
apps/nextjs-app/src/features/app/blocks/admin/audit/index.ts               (新增)
apps/nextjs-app/src/features/app/blocks/admin/index.ts                     (修改 — 1 行 export * from './audit')
apps/nextjs-app/src/pages/admin/audit-log.tsx                              (新增)
apps/nextjs-app/src/features/app/blocks/admin/setting/SettingPage.tsx      (修改 — 添加跳转链接)
```

## 5. 设计权衡

- **Admin-only vs 任意鉴权**:audit 行含 `callerId` / `params`,可能包含用户 PII,因此强制走 `@Permissions` admin 守卫 + admin 路由前缀 `/api/admin/audit/...`。这与 `enterprise-license/status` / `admin/setting` 已有模式一致。
- **读端是否引入分页**:先做 limit + 简单 filter,真正的 cursor 分页留到后续 Stage(T-04 之后的 Gap-fill)。本轮不做。
- **filter schema**:zod schema 写在 openapi 包内,前后端共享 — 后端 `ZodValidationPipe` 复用同一份 schema,避免类型漂移。
- **i18n 占位**:文案用 `t('admin.auditLog.*')` 占位,先放空 key,后续由产品/翻译补齐 — 不阻塞本轮验收。
- **是否引入 SSE / 轮询**:不做。本轮一次性 `useQuery` + 手动 refresh button 已经满足"前端能看到 audit 行"的目标,实时推送留给后续轮次。

## 6. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| admin user 在 dev fixture 里没有现成 seed | e2e spec 通过 `axios.post('/api/auth/signin')` 创建 admin user 再做断言,沿用 `init-app` 现有模式 |
| 前端 page 编译失败,阻塞 e2e 启动 | 先跑 backend vitest + typecheck,再跑 frontend build;分两步验证 |
| `audit.auth.service.spec.ts` 在新 controller 注入后失败 | 控制器只 `import { AuditAuthService }`,不直接 mock prisma;测试只断言 e2e HTTP 形态 |

## 7. 完成定义

- T03-V01 ~ V07 全部通过
- 一个 commit + 一个 PR,标题 `feat(r1-t03): 前端桥接入 audit (admin audit page + list endpoint)`
- `pnpm -F nestjs-backend test` 跑过(包含新增 e2e spec)
- `pnpm -F openapi build` 通过(让新 endpoint 进入客户端 barrel)
- 回复 LUM-18 thread `01a03d97-5ecb-7173-a1a8-06dabc410b62` 终态评论