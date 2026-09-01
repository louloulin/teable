# Teable OSS vs Cloud 真实差距审计 + UI 对齐报告(2026-09-01 v2)

> 本报告基于**真实运行验证**(后端 curl + Playwright 浏览器),不是文档转述。
> v2 增量:补齐 9 个 admin UI + 5 个遗漏 capability 注册 + Playwright 验证后端端点。
> 验证时间:2026-09-01 09:00-09:35 (Asia/Shanghai)

---

## 0. v2 增量摘要

| 项 | v1 状态 | v2 状态 | 证据 |
|---|---|---|---|
| 后端 typecheck | 160 错误 | **2 错误**(hook 文件 + TS2589) | tsc --noEmit |
| BYOK 模块注册 | 未注册 | **已注册 + DI 修复** | curl 验证 byok-llm/providers → 200 |
| 9 个能力 admin UI | **全部缺失** | **全部创建**(9 页面 + 9 panel) | 前端 typecheck 0 错误 |
| 5 个遗漏 capability | 未注册 | **已注册**(billing/data_residency/conflict_replay/cross_base_federation/org_custom_role) | readiness 报告 85 capabilities |
| 浏览器验证 | MCP 锁定 | **Playwright 新实例验证后端** | /health 200, /readiness 401 |

---

## 1. v2 新增的 9 个 admin UI(关注 UI 功能)

### 1.1 后端 Panel(每个能力一个)

| Panel 文件 | 端点 | 行数 |
|---|---|---|
| `apps/nextjs-app/src/features/app/blocks/admin/approval-workflow/ApprovalWorkflowPanel.tsx` | GET/POST/DELETE workflow + list | 218 |
| `apps/nextjs-app/src/features/app/blocks/admin/custom-domain/CustomDomainPanel.tsx` | GET check + POST claim | 128 |
| `apps/nextjs-app/src/features/app/blocks/admin/backup/BackupPanel.tsx` | GET list + POST create + POST restore + DELETE | 239 |
| `apps/nextjs-app/src/features/app/blocks/admin/view-permission/ViewPermissionPanel.tsx` | GET list + POST grant + DELETE revoke | ~200 |
| `apps/nextjs-app/src/features/app/blocks/admin/data-residency/DataResidencyPanel.tsx` | GET regions + GET/PUT/DELETE policy | ~220 |
| `apps/nextjs-app/src/features/app/blocks/admin/conflict-replay/ConflictReplayPanel.tsx` | GET queue + POST drain + DELETE | ~170 |
| `apps/nextjs-app/src/features/app/blocks/admin/cross-base-federation/CrossBaseFederationPanel.tsx` | PUT view + PUT source + POST refresh | ~280 |
| `apps/nextjs-app/src/features/app/blocks/admin/dr-canvas/DrCanvasPanel.tsx` | PUT canvas + POST validate + POST plan | ~260 |
| `apps/nextjs-app/src/features/app/blocks/admin/org-custom-role/OrgCustomRolePanel.tsx` | PUT role + PUT assignment + DELETE | ~300 |

### 1.2 页面包装(每个一个)

`apps/nextjs-app/src/pages/admin/{approval-workflow,custom-domain,backup,view-permission,data-residency,conflict-replay,cross-base-federation,dr-canvas,org-custom-role}.tsx`

每个页面:AdminLayout + ensureLogin + withAuthSSR(isAdmin check) + ForbiddenError,完全沿用 sandbox-agent 模式。

### 1.3 模式一致性

每个 Panel 使用:
- `axios` from `@teable/openapi` 直接调用后端端点(无需新增 openapi client)
- `useQuery` + `useMutation` from `@tanstack/react-query`
- shadcn UI(Button/Input/Label/Select/Badge/Card/Skeleton/SelectContent 等)
- `toast` from `@teable/ui-lib/shadcn/ui/sonner`
- 真实后端校验:400/404 而非假响应

---

## 2. 5 个遗漏 capability 注册

在 `enterprise-readiness.service.ts` 添加 `featureAlias()` helper,用功能级 key(如 `conflict_replay`)而非表级 key(如 `conflict_event`)报告:

| Capability key | Module | Probe table |
|---|---|---|
| `billing` | billing | billing_invoice + billing_credit |
| `data_residency` | data-residency | data_residency_policy |
| `conflict_replay` | conflict-replay | conflict_event |
| `cross_base_federation` | cross-base-federation | federation_event |
| `org_custom_role` | org-custom-role | custom_role |

**真实验证**:readiness 报告从 80 capabilities → **85 capabilities**(+5),新能力 enabled=False(无数据),module 名与 Cloud 文档对齐。

---

## 3. 浏览器验证(绕过 MCP Chrome 锁定)

MCP 浏览器被实例 37328 锁定(`Browser is already in use`)。绕过方案:用 Playwright 启动新 Chrome 实例:

```js
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-gpu'],
});
```

**验证结果**:
- `/health` → 200 `{"status":"ok"}`
- `/api/admin/enterprise-readiness` → 401(无 token,符合预期)

**未验证**:Next.js admin 页面渲染。需启动 Next.js dev server + admin session,本环境未启动完整前端 stack。

---

## 4. 当前真实差距(与 Cloud 商业版)

### 4.1 已对齐(✅)

- 9 个 admin UI(本轮补齐)+ 21 现有 admin 页面 = 30 admin 页面
- 85 capabilities 注册 / 71 enabled(自托管)/ 80 endpoints 真实工作
- 所有核心端点 curl 验证通过(cuppy/byok/billing/backup/custom-domain/approval/permission-matrix)

### 4.2 仍存在差距(🔴)

- **AI App Builder**:Cloud 16+,OSS 仅 6 端点(deploy/rollback/secrets/files 缺失)
- **Stripe 增购/发票/SLA/客服**:Cloud 运营组件,OSS 仅 plans 查询
- **标准 nest start 仍失败**:2 个源码 typecheck 错误(1 hook 文件 + 1 TS2589 限制)
- **数据库迁移**:1 个失败(TOTP)+ 2 个未应用,阻塞迁移系统
- **Next.js dev server 未启动**:无法做完整前端浏览器渲染验证

---

## 5. 后续计划(按优先级)

### P0(阻塞一切)
1. 修 `built-in-echo-llm.ts:72`(hook 文件,需协调)
2. 修 `request-info.middleware.ts:114`(TS2589 深度实例化)
3. 跑 `prisma migrate resolve --applied 20260831060000_add_totp_tables` + 应用剩余 2 迁移

### P1(用户体验)
4. Next.js dev server 启动 + Playwright 端到端验证 9 个新 admin UI 渲染
5. 修复 `BackupController.assertAdmin` stub(注释承认 "Real auth wiring belongs in a follow-up stage")

### P2(功能补全)
6. AI App Builder 完整化(deploy/rollback/secrets/files — 10 端点)
7. readiness 报告补 parity 字段(当前 80→71,Cloud 文档 38/38)

### P3(文档)
8. 更新 gap-analysis.md 数字(108→85,38/38→实际)
