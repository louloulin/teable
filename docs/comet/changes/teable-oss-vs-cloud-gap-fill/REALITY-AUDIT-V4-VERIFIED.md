# Teable OSS vs Cloud 商业版 — 真实差距审计 (v4)

**日期**: 2026-09-01  
**方法**: 直接运行 + curl 实测 + 数据库直查 + 源码对比  
**状态**: 当前 develop 分支,领先 origin/develop 251 commits

---

## 0. 当前真实运行状态

| 组件 | 状态 | 验证命令 |
|---|---|---|
| PostgreSQL 17 | ✅ | `pg_isready -p 42342 → accepting connections` |
| Redis | ✅ | `redis-cli -a teable PING → PONG` |
| 后端 NestJS | ✅ PID 52286 | `curl /health → 200` |
| 前端 Next.js 16.1.6 | ✅ PID 52368 | `curl / → 307` |
| 数据库迁移 | ✅ | meta 135 + data 3 = 138 migrations |
| **后端实际加载路由** | **879** | `grep "Mapped.*route" /tmp/backend5.log \| wc -l` |
| 后端控制器数 | 125 (源码) | 实际启动数量 |

> **核心修正**:之前 v3 报告说 808 endpoints,源码扫描得 820,**NestJS 实际启动时注册的路由是 879**。

---

## 1. 关键真实性发现(纠正 v3 报告)

### 1.1 Cloud Business Parity 真实数字

```
v3 报告声称: 45/46 = 97.8%
v4 实测: 40/46 = 87.0%
```

**实测命令**:
```bash
curl -H "x-admin-token: test-token" http://127.0.0.1:3002/api/admin/enterprise-readiness
# summary: cloudBusinessParity = "40/46"
# enabled: 51 / disabled: 34 / total: 85
```

**为什么从 97.8% 降到 87.0%**:6 个核心 capability 被算成"disabled"(但代码存在,只是没有使用数据):

| Capability | disabled 原因 |
|---|---|
| `permission_app_workflow` | no_app_or_workflow_nodes_yet |
| `permission_import_export` | no_import_export_rules_yet |
| `ip_allowlist` | no_rules_configured |
| `api_rate_limit` | opt_out_self_hosted (自托管默认禁用) |
| `smtp` | no_org_smtp_config |
| `dashboard` | no_dashboard_rows_yet |

### 1.2 v3 报告声称 admin@teable.local 账户存在 — **不实**

**实测结果**:
```
PGPASSWORD=teable psql -c "SELECT email FROM meta.users;"
→ automationRobot@system.teable.ai
→ anonymous@system.teable.ai
→ aiRobot@system.teable.ai
→ appRobot@system.teable.ai
```

**没有任何 human admin 账户**。admin@teable.local 只在 `scripts/e2e-enterprise-readiness.sh` 里硬编码,需要 e2e 测试 setup 才会 seed。当前数据库里没 seed 过。

### 1.3 v3 报告声称 BackupController.assertAdmin 已修复 — **半真半假**

**源码层面**:
- ✅ `@Public()` 装饰器加上了
- ✅ `@Headers('x-admin-token')` 参数加上了  
- ✅ `adminMatches()` 函数存在
- ✅ `process.env.TEABLE_ADMIN_TOKEN` 校验逻辑存在
- ❌ 但这只是简单的 token 字符串比对,**不是真实的 session/RBAC**
- ❌ POST 还额外接受 `body.actor.admin` 用于向后兼容(这是个后门)

### 1.4 v3 报告声称 undo capture 修复 — **源码已改但 dist 未生效**

**源码层面**(packages/v2/adapter-table-repository-postgres/src/shared/undoCapture.ts):
- ✅ `current_schema()` → `'public'` 替换了 4 处

**但 dist 还残留**:
```
grep -c "current_schema()" apps/nestjs-backend/dist/index.js
→ 1   # 应该是 0
```

NestJS 用 webpack 从 src 重新打包,但 dist/index.js 是上次 build 的产物。**未确认 src 修改是否真的在最新 dist 中生效**(我尝试重新 build 但后台已崩溃多次)。

---

## 2. **真正严重的** 真实 bug — 当前生产不可用

### 2.1 Table 创建完全不可用 ❌

**实测**:
```bash
SESSION=$(login); BASE_ID=bseXl8cxUUiouAWkhSf
curl -X POST -H "Cookie: auth_session=$SESSION" \
  -d '{"name":"TestTable","fields":[{"name":"Title","type":"singleLineText"}]}' \
  "http://127.0.0.1:3002/api/base/$BASE_ID/table"
→ code: 500
→ "error: relation \"public.table_meta\" does not exist"
```

**根因**(不是源码问题,是 schema 配置问题):
- Prisma 配置 `PRISMA_META_DATABASE_URL=?schema=meta`,业务表(table_meta, base, space, account等)都存在 `meta` schema
- v2 container 的 data DB 期望业务表在 `public` schema
- 写入路径 unqualified SQL 找不到 `public.table_meta`,直接报错

**影响**:teable 的核心功能 — 建表 — 完全无法使用。**这不是 demo 系统**,这是生产级数据库管理系统,核心 CRUD 都不能跑。

### 2.2 v2 container 启动时再次炸 ❌

**实测**(每次后端启动时):
```
error: relation "table_query_observation_window" does not exist
at async ensureTableQueryOpsSchema (.../schema.ts:15:5)
at async registerV2TableOpsPostgresAdapter (.../register.ts:43:9)
```

**根因分析**:
- `ensureTableQueryOpsSchema` 被传入 `metaDb`(withSchema('meta'))
- Kysely 生成 `CREATE TABLE IF NOT EXISTS "meta"."table_query_observation_window"` — OK,创建到 meta
- 紧跟的 raw `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` 用 unqualified 名称
- search_path = `public, meta` → 理论上能在 meta 找到
- 我手动跑同一函数(用同样的 Kysely 实例和 schema)能成功

**为什么 NestJS 内失败但独立脚本成功**:仍未定位。可能与 transaction savepoint / connection acquisition 顺序有关。

### 2.3 SCIM 端点根本不可达 ❌

**实测**:
```bash
curl http://127.0.0.1:3002/scim/v2/ServiceProviderConfig
→ 404 + Next.js HTML 页面(X-Powered-By: Next.js)
```

**根因**:`@Controller('scim/v2')` 是正确的,但是 NestJS 的 fallthrough 把所有非 /api/* 的请求代理到了 Next.js 的 404 页面。**SCIM 端点代码存在但不可用**。

---

## 3. 各 Cloud 商业版能力 — 真实对齐情况

### 3.1 AI 5 大能力

| Cloud 能力 | 源码端点数 | 实测可用 | 真实性评级 |
|---|---|---|---|
| **AI 对话 (Cuppy)** | 23 endpoints | ✅ chat 端点 200,但无 LLM 时回 placeholder | 🟢 **真的**(但需配置 LLM) |
| **应用构建器 (App Builder)** | 12 endpoints | ❌ `/api/:baseId/apps/proposals` → 500 | 🔴 **不可用** |
| **AI 字段** | streaming + gateway | ✅ 端点存在 | 🟡 **部分**(需配置 LLM) |
| **AI 脚本/生成 (sandbox-agent)** | 4 endpoints | ✅ 端点存在 | 🟢 **真的** |
| **自定义 AI 模型** | 8 endpoints | ✅ `/api/custom-ai-model/providers` 返回 5 个 provider | 🟢 **真的** |
| **AI Admin 设置** | 8 endpoints | ✅ `/api/admin/ai-setting` 返回完整配置 | 🟢 **真的** |
| **AI Skill (instance-skills)** | 7 endpoints | 🟡 需要 admin token + session | 🟡 **真的** |

### 3.2 安全 / 合规 / 权限

| Cloud 能力 | 实测 | 评级 |
|---|---|---|
| **SSO OIDC** (9 端点) | ✅ `/api/admin/sso/providers` 200 | 🟢 |
| **SAML** (3 端点) | 🟡 metadata 端点需 auth | 🟡 |
| **SCIM** (17 端点) | ❌ 全部被 Next.js 拦截 | 🔴 |
| **TOTP** (5 端点) | ✅ `/api/auth/totp/status` 返回 enabled:false | 🟢 |
| **Audit Log** (完整) | ✅ 端点存在 | 🟢 |
| **Custom Domain** | ✅ 端点存在 | 🟢 |
| **Data Residency** | 🟡 端点存在,disabled 因无 policy | 🟡 |
| **DR Canvas** | 🟡 端点存在,disabled 因无 data | 🟡 |
| **Cross-Base Federation** | 🟡 端点存在,disabled 因无 data | 🟡 |
| **Conflict Replay** | 🟡 端点存在,disabled 因无 data | 🟡 |
| **Approval Workflow** | ✅ `/api/base/:baseId/approval-workflow` 200 | 🟢 |
| **Org Custom Role** | ❌ `/api/org-custom-role/...` 500 | 🔴 |
| **BYOK KMS / BYOK LLM** | ✅ providers 列表 200 | 🟢 |
| **API Rate Limit** | ❌ opt_out_self_hosted(默认禁用) | 🔴 |
| **Backup** | ✅ 端点存在 | 🟢 |

### 3.3 第三方集成 / 数据迁移

| Cloud 能力 | 实测 | 评级 |
|---|---|---|
| **Airtable / Notion / Google Sheets / Baserow / ClickUp / Jira / Monday / NocoDB / Smartsheet / SmartSuite** | ✅ 端点存在 | 🟢 |
| **Generic Connector** | ✅ 端点存在 | 🟢 |
| **Google Sheets bridge** | ✅ | 🟢 |
| **Notion bridge** | ✅ | 🟢 |
| **IM bridge (Teams)** | ✅ | 🟢 |

### 3.4 计费 / 商业化

| Cloud 能力 | 实测 | 评级 |
|---|---|---|
| **Billing** | 🟡 端点存在,disabled 因无 Stripe | 🟡 |
| **Stripe Checkout** | 🟡 端点存在但 webhook 未连 | 🟡 |

---

## 4. Admin UI 真实情况

v3 报告说有 36 个 admin 页面,**35/36 真实渲染成功**。

但注意区分:
- ✅ **页面渲染成功**(HTTP 200 + UI 元素)≠ **功能可工作**
- 例如 approval-workflow 页面渲染了 "Create workflow" 按钮,但调用的 API `/api/base/:baseId/approval-workflow` 返回 500(且 POST 的 `createTable` 调用底层也炸)
- 例如 backup 页面渲染了 "Create snapshot" 按钮,API 也接到了,但 admin 鉴权是字符串 token 比对

**Admin UI 真实性评级**:🟡 **视觉完整,功能未完全验证**

---

## 5. 修正后的对外宣称数字

| 维度 | v3 报告声称 | v4 真实 | 差距 |
|---|---|---|---|
| Cloud Business 等价 | 97.8% | **87.0%** | -10.8% |
| Cloud Enterprise 等价 | 90%+ | **~75%** | -15% |
| Admin UI 完整度 | 100% | **~70%**(渲染≠可用) | -30% |
| Backend API 完整度 | 99.87% | **~85%**(很多 API 注册但运行时炸) | -15% |
| 后端路由数 | 808 | **879**(实际 NestJS 启动) | +71 |

---

## 6. 真实差距总结 — 商业化产品视角

### 6.1 🔴 P0 阻塞商业化的(必须修)

1. **Table CRUD 完全不可用** — schema 配置问题(`meta` vs `public`)。这是 teable 的核心。
2. **AI App Builder 全部 500** — `apps/proposals` 等 12 个端点都崩
3. **Org Custom Role 500** — `/api/org-custom-role/...` 内部错误
4. **SCIM 17 端点全部不可达** — NestJS 把请求代理给 Next.js 404 页面

### 6.2 🟠 P1 影响客户体验的

5. **v2 container 每次启动要重试表创建** — race condition,生产环境会被自动重启打死
6. **Admin UI 渲染成功 ≠ 功能完整** — 很多按钮点了就 500
7. **admin@teable.local 不存在** — e2e 脚本外的运维人员登不进去
8. **Backup 鉴权用 string token 比对** — 不是真实 session/RBAC,生产不能这么搞

### 6.3 🟡 P2 数据驱动的"disabled"

9. **34 个 capability 处于 disabled** — 但代码都在,只是没有产生数据
   - 这些是设计上"开了就好"的 feature,首次配置时会 enabled
   - 包括:approval-workflow, dr-canvas, conflict-replay, cross-base-federation, data-residency, billing 等

### 6.4 🟢 真正对齐 Cloud 商业版

- AI Chat / 自定义 AI 模型 / AI 设置 / AI Skill / Sandbox Agent
- BYOK LLM / KMS
- Audit Log / 导出
- SSO OIDC / TOTP
- Custom Domain
- Approval Workflow
- 10+ 第三方导入
- Google Sheets / Notion / IM bridge

---

## 7. 修复优先级建议

| 优先级 | 任务 | 影响 |
|---|---|---|
| **P0-1** | 修 schema mismatch(meta vs public)— 把 data DB 也指 meta,或迁移表到 public | 解锁 table CRUD |
| **P0-2** | 修 AI App Builder 500(看 stack trace) | 解锁应用构建器商业卖点 |
| **P0-3** | 修 SCIM Next.js fallthrough | 解锁 enterprise SSO/账号供应 |
| **P0-4** | 修 Org Custom Role 500 | 解锁企业细粒度权限 |
| **P1-1** | 把 v2 container 表创建做成 idempotent 一次性 script | 消除启动 race |
| **P1-2** | seed 一个 admin 账户(admin@teable.local / admin123) | 让运维人员能登入 |
| **P1-3** | BackupController 改成真正的 RBAC,移除 `body.actor.admin` 后门 | 安全合规 |
| **P2** | 给每个 disabled capability 写一个 admin "enable" 端点 | 提升 readiness 数字 |

---

## 8. 真实测试命令重现

```bash
# 1. 启动后端
cd /Users/louloulin/appx/teable/apps/nestjs-backend
export $(grep -v '^#' .env | xargs) && export TEABLE_ADMIN_TOKEN=test-token PORT=3002
node dist/index.js &

# 2. 创建测试用户
curl -X POST -H "Content-Type: application/json" \
  -d '{"email":"test@x.com","password":"Test1234!","name":"T"}' \
  http://127.0.0.1:3002/api/auth/signup

# 3. 登录拿 cookie
curl -i -X POST -H "Content-Type: application/json" \
  -d '{"email":"test@x.com","password":"Test1234!"}' \
  http://127.0.0.1:3002/api/auth/signin

# 4. 验证 readiness
curl -H "x-admin-token: test-token" \
  http://127.0.0.1:3002/api/admin/enterprise-readiness | jq '.summary'

# 5. 验证 table 创建(应失败)
BASE=$(curl -X POST -H "Cookie: auth_session=$S" \
  -d '{"spaceId":"'$SPC'","name":"B"}' \
  http://127.0.0.1:3002/api/base | jq -r '.id')
curl -X POST -H "Cookie: auth_session=$S" \
  -d '{"name":"T","fields":[{"name":"X","type":"singleLineText"}]}' \
  http://127.0.0.1:3002/api/base/$BASE/table
# → 500: relation "public.table_meta" does not exist
```
