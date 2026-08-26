# R1-T10 audit log DSL 查询前端

## 目标

在 T-03 已经落地的 `/admin/audit-log` 只读页面基础上,**原地扩展**为支持:

1. **时间范围筛选**(`from` / `to` ISO datetime)
2. **关键词搜索**(针对 `action` / `resourceId` / `userId` / `operationId` / `rootAction` 做 substring match)
3. **导出按钮**(CSV / JSON 二选一,生成 blob 下载)
4. **分页 cursor**(`nextCursor` 拉下一页,前端累计 append)

不修改后端(后端 list 接口已支持 `action` / `resourceId` / `limit`;后续 server-side 全文 / 时间范围能力由独立 change 处理,本 T-10 范围内**所有筛选在客户端实现**,server 端只接 `limit` 增量翻页)。

## 设计要点

- **零后端改动** — 完全在 `apps/nextjs-app` 内完成,`packages/openapi` 只追加 enum(动作 / 资源 / 操作员的 enum 给前端下拉用),不改 service 端。
- **不引入新依赖** — CSV 导出用 vanilla JS(逗号 + 引号转义),不用 `papaparse` 等。
- **保留 SSR 模式** — `/admin/audit-log` 页面继续 `withEnv(ensureLogin(withAuthSSR(...)))`;SSR 仍只 pre-render 标题,数据靠 `useQuery` 拉。
- **可演进** — 预留 `DSL` 字段(纯前端 UI state)给后续 server-side DSL(`audit` log DSL Stage 52 已落服务端能力,但本 stage 暂不接,只把 UI 字段准备好)。

## 文件清单

| 路径 | 类型 | 内容 |
| --- | --- | --- |
| `apps/nextjs-app/src/features/app/blocks/admin/audit/AuditLogFilter.tsx` | 微调 | 增加 `from` / `to` datetime-local 输入、keyword 输入、导出按钮 |
| `apps/nextjs-app/src/features/app/blocks/admin/audit/AuditLogPage.tsx` | 微调 | 增加 `keyword` / `from` / `to` 本地 state,合并到 query key |
| `apps/nextjs-app/src/features/app/blocks/admin/audit/AuditLogTable.tsx` | 微调 | 增加 `load more` 按钮(用 `nextCursor` 翻页) |
| `apps/nextjs-app/src/features/app/blocks/admin/audit/audit-export.ts` | 新增 | CSV / JSON 序列化 + Blob 下载工具 |
| `apps/nextjs-app/src/features/app/blocks/admin/audit/audit-export.spec.ts` | 新增 | vitest 单测:CSV 转义 / JSON 序列化 / 字节序 |
| `apps/nextjs-app/src/features/app/blocks/admin/audit/index.ts` | 微调 | barrel 加 `audit-export` |
| `packages/openapi/src/admin/audit/list-operations.ts` | 微调 | query schema 增加 `from?: string` / `to?: string` / `cursor?: string`(都可选,**向后兼容**) |
| `docs/comet/changes/2026-08-26-r1-t10-audit-dsl-ui/brief.md` | 新增 | 本文件 |

## 验收项(7 条)

- **T10-V01**: `AuditLogFilter` 包含 `from` / `to` / `keyword` 三个新输入,Apply 触发 query 重拉。
- **T10-V02**: `AuditLogTable` 底部出现 `Load more` 按钮,点击后用 `nextCursor` 翻页追加行。
- **T10-V03**: 导出按钮分 CSV / JSON 两个,点击后浏览器下载 `.csv` / `.json` 文件;CSV 引号转义正确。
- **T10-V04**: `audit-export.spec.ts` 单测全绿,覆盖:空行、单行、引号转义、Unicode。
- **T10-V05**: openapi 客户端 query schema 新增字段后,`audit.query.schema.ts` 后端 schema 同步新增(纯 zod,与 brief 一致);server 端 schema 不强制启用这些字段(可选,默认丢弃)。
- **T10-V06**: 现有的 `apps/nestjs-backend/test/r1-t03-audit-frontend-bridge.e2e-spec.ts` 继续通过(0 退化)。
- **T10-V07**: `tsc --noEmit` 0 条新增错误;`vitest` 0 退化。

## 非目标

- 不做 server-side DSL(那是 Stage 52 已经落的服务端能力,本 T-10 不接)。本 stage 所有 keyword / 时间筛选**只在客户端过滤** server 返回的 row 集合,清晰标注。
- 不做实时订阅 / SSE(超出本 stage 范围)。
- 不增加 npm 依赖(CSV 用 vanilla JS)。
- 不改 controller / service / module。

## 风险

- **客户端筛选语义**:`keyword` / `from` / `to` 是 client-side filter;server 端不知道这层筛选,翻页时会丢失客户端过滤状态。**解决方案**:每次 Apply 都把当前 keyword 写进 queryKey,useQuery 自动重置分页;Load more 时把 `keyword` 一并提交到 server(由 server 端决定是否支持,目前 server 端只看 `action` / `resourceId` / `limit`,所以 keyword 在 load more 时**不生效**,只在第一页生效)。这层 UX 限制需要文档化。
- **CSV 导出 PII**:CSV 内含 `userId` 等 PII。导出按钮只对 admin 可见,且 `LicenseCapabilityGuard.for('audit_log')` 已经守卫过 controller,语义上安全。
- **大数据量导出**:前端导出受限于浏览器内存(单 blob 上限 ~500MB 通常足够 audit log,但需要文档化)。

## 红线

- AGPL-3.0,所有源代码在本仓库。
- 零新 npm 依赖。
- 零后端热路径改动(只追加可选 query 字段,不改 controller 主体 / service 主体)。
- 不删除 T-03 已落地的任何文件 / 测试。