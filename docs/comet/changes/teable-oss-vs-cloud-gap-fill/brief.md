# Outcome

把 `louloulin/teable` 仓库与 `teable.io` Cloud 商业版的能力差距,在本仓库(AGPL-3.0,自托管 OSS)范围内**全部真实实现**,对外可以宣称"功能上达到 Business 等价",但不复制任何属于 `teableio/teable-ee`(Enterprise Edition)的源代码。最终交付形态是嵌套式 Native change:Supervisor Change 负责整体计划 + 集成验证,N 个 child change 各自负责一个 stage 的"最小真实实现"。

# Scope

## Source coverage

> 来源文档由 louloulin 在 LUM-18 上提供,均为该用户原始撰写的中文分析 + 决策文本,均已在本 change 建立前完整读取并归档。所有可执行语义单元进入对应 child 的 Spec 与验收 ID;背景与非目标保留在 brief。

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| 商业版定价页 | https://teable.ai/zh/pricing?host=cloud | `complete` | 档位 / 配额 / 能力清单的权威 |
| 开源仓库 README + LICENSE + AGPL_LICENSE | `louloulin/teable` worktree | `complete` | 仓库形态、能力边界、合规约束 |
| LUM-18 根评论(差距分析) | comment `01a0343d-7feb-7830-8a8a-6d0fed621dfc` | `complete` | 差距矩阵、排序建议 |
| LUM-18 第 2 轮盘点 | comment `01a035cd-6ce2-71ed-a511-a8693f6e56b3` | `complete` | A→C 优先级与 Stage 划分 |
| LUM-18 第 3 轮盘点 | comment `01a035f0-2b7f-78af-a499-00e336523659` | `complete` | 最新一处"哪些还差"的表格 |
| 权限矩阵实践指南 | https://help.teable.cn/zh/basic/authority-matrix/authority-matrix-practical-guide | `complete`(用户引用作为规范) | Stage 5 完整复刻的依据 |

## 当前已落地(对照商业版可直接启用)

来源:在 6 条 commit `a7e4d299c`/`4de1bbaf0`/`52050393b`/`ad55ecaf4`/`f6a471dbd`/`7441c8d8c` 中落地。

| 能力 | 落地形态 | 对标档位 | 备注 |
|------|---------|---------|------|
| License Key 激活 | `LicenseService` + `TEABLE_LICENSE_KEY=plan:<level>\|<jwt>` | Pro/Business/Enterprise | 启动时把现有 spaces 切到目标 plan |
| 配额 / SLA 跟踪 | `SpaceQuota` + `SpaceUsageCounter` + `QuotaHit` + `QuotaService` | 4 档数值精确对齐 | 默认 self_hosted 计划 = 全 NULL |
| 配额 enforcement 拦截器 | `QuotaEnforcementInterceptor`(opt-in) | 全档 | 默认 OFF,需 `TEABLE_QUOTA_ENFORCEMENT_ENABLED=true` |
| AI 能力 license 闸 | `LicenseCapabilityService` + `LicenseCapabilityGuard.for(...)` | Pro+/Business+ | Pro 解锁 AI 系列,Business 解锁企业全套 |
| 域名验证脚手架 | `OrganizationDomain` + `DomainVerificationService` + DNS TXT | Business | `TEABLE_ADMIN_TOKEN` 鉴权 |
| OIDC SSO 骨架 | `SsoService` + `SsoController` + IdP 注册 + OIDC 验签 + state 持久化 | Business | 已落地 Stage 4,callback 未接通 |
| 权限矩阵数据模型 + 服务 | `PermissionMatrixService` + 6 张表 | Business | 已落地 Stage 5 |
| 权限矩阵读/写路径钩子 | `PermissionInterceptor` + `PermissionGuard` | Business | 已落地 Stage 5.1/5.2,但尚未挂载到 record-open-api |

合计 **45 文件 / ~4126 行新增,0 行现有热路径被改写**(来源:louloulin/teable branch `agent/chong/df9d120d2105`)。

## 本 change 的 scope(尚需补齐)

按用户三轮差距分析整理后,尚未在 OSS 实现的能力:

### Stage 4.1 — SSO callback 接通本地会话
- 把 Stage 4 的 OIDC plumbing 接进 `auth.service.ts`
- 把 verified claims 写进 nest session
- 复用现有 `SsoAuthService.resolveLocalUser`(WIP,已在 `d0d1e13cb`)
- 期望形态:管理员在 SSO IdP 登录后,浏览器跳回 `/api/auth/sso/callback`,自动得到本地 session cookie

### Stage 4.2 — `SsoLoginState` BullMQ 过期清理
- 新增 BullMQ repeatable job,清理 `createdAt + 5min < now()` 的 `SsoLoginState`
- 在 `app.module.ts` 启动时 register
- 不依赖 4.1,可在 4.1 之前独立做

### Stage 6 — 审计日志(Audit Log)
- 新增 `audit_log` 表 + `AuditLogService.record(eventType, payload)` API
- 在 record / permission / SSO / quota 等关键路径埋点
- 提供 `/api/admin/audit-log` 分页/筛选/导出 API
- 关键决策:**不**写云审计 SaaS,只 OSS-friendly sink(本地 JSONL + 可选 S3-compatible),避免和 EE 重复

### Stage 5b — 权限矩阵热路径挂载
- `RecordQueryPermissionInterceptor` 真正把 row filter 注入 Prisma `where`
- `PermissionGuard` 应用到 `record-open-api` 各 handler
- 把已有的"pure helpers"变成"在线生效"

### Stage 8b — AI handler 细分计费
- `ai_field` / `ai_app_builder` / `cuppy_claw` / `ai_chat` 在 `AiService` 各入口分别 `this.caps.require(...)`
- AI 调用前的 quota.consume('ai_credits') 接入

### Stage 7 — 管理面板后端
- 在 `AdminOpenApiModule` 增一组路由:用户列表 / 空间列表 / 模板管理 / AI 设置 / 配额仪表
- 前端在 `apps/nextjs-app` 主战场,后端只暴露路由

### Stage 9 — SAML Provider
- `SsoProviderType.saml` 已枚举留位,新增 SAML 端点 + 签名验证
- 复用现有 SsoLoginState + sso.controller 骨架

### Stage 10 — 自定义应用域名(子集)
- 仅实现"组织内 CNAME 检测 + 反代提示",反向代理与 LB 留给 `teable-deployment`
- 后端只需 `GET /api/admin/custom-domain/check?domain=...` 端点

### Stage 11 — 配额 retention 差异化
- record history / automation run cleanup job 按 plan 取 TTL
- Free 2 周 / Pro 1 年 / Business 3 年(record)/ 1 年(automation)

### Stage 12 — API 速率限制按档位
- 复用 `@nestjs/throttler`,按 plan 读取 throttle 限额
- 三档都 10 req/s,但自托管默认无;激活 license 后开始强制

# Non-goals

- **不复制** `teableio/teable-ee`(Enterprise Edition)任何源代码。本 change 完全运行在 AGPL-3.0 仓库内。
- **不实现** Cloud 独占的运营组件:Stripe 增购、发票、公有云多区部署、官方 SLA、客服、私有化 License 签发。
- **不修改** 现有 hot path(`auth.service.ts` / `record-open-api.service.ts` / `ai.service.ts` 主体 / `space.service.ts` 主体)。
- **不引入** 任何新的 npm 依赖,以保持最小改造原则;Node 内置 + 已有依赖足够。
- **不**做前端 UI 改动(`apps/nextjs-app`);本 change 仅后端。
- **不**实现"自托管 license 申请/管理"前端流程(只暴露 API 端点)。

# Acceptance examples

> 完整验收标准分散到各 child change 的 Spec 中;这里只列跨 child 的端到端验收项(AC-0xx)。

- **AC-001** 在测试库依次应用所有 child 的 migration 后,`prisma generate` 成功,无未定义枚举。
- **AC-002** `pnpm test` 在 `apps/nestjs-backend` 全绿,新增模块单元测试覆盖所有决策点。
- **AC-003** 设 `TEABLE_LICENSE_KEY=plan:business` 后启动,所有现有 spaces 自动切到 business plan,所有 Business-only 能力(sso / permission_matrix / custom_app_domain / admin_panel / audit_log)按 capability map 解锁。
- **AC-004** 浏览器走完 SSO 登录链路后,本地 session cookie 写入,后续 `GET /api/auth/profile` 返回正确 user。
- **AC-005** 用 permission matrix 把某表某字段设为 hidden,该 user 的 record list 响应中该字段为 `null`,PATCH 写入该字段返回 `403 RESTRICTED_RESOURCE`。
- **AC-006** 任何 record create/update/delete 在 DB 留下对应 `audit_log` 行,可在 `/api/admin/audit-log?actorId=&action=&from=&to=` 分页检索。
- **AC-007** 启用 `TEABLE_QUOTA_ENFORCEMENT_ENABLED=true` 后,record 创建超过 plan 上限返回 `402 QUOTA_EXCEEDED`,不再依赖 License 缺失的隐式关闭。

# Constraints and invariants

- **AGPL-3.0 合规**:任何新增源代码在本仓库内,改动可被 fork 验证,不引入与 AGPL 冲突的依赖。
- **零现有热路径改动**:已有 handler 主体逻辑不变,新增能力通过 interceptor / guard / module-level decorator opt-in。
- **零新增 npm 依赖**:Node `crypto` / `dns/promises` / 已有 BullMQ / nestjs-cls / nestjs-i18n / prisma 已经覆盖所有需求。
- **迁移幂等**:所有 Prisma migration 用 `CREATE TABLE IF NOT EXISTS` / `DO $$` 包枚举创建,支持重复执行。
- **能力闸优先**:任何 Business-only 路由挂在 `LicenseCapabilityGuard.for('<cap>')` 顶层;能力位缺位 → 统一 `402 LICENSE_REQUIRED`。
- **审计不污染热路径**:`AuditLogService.record()` 失败时**不**回滚业务事务,只记 error 日志。
- **审计 sink 与 EE 解耦**:本仓库只实现 `LocalJsonlAuditSink` 与 `S3CompatibleAuditSink`(可选),不调云审计 SaaS。

# Decisions

1. **拆分 = Supervisor Change + children**(确认待用户)。理由:剩余 11 个 stage 各自有独立数据模型 / controller / 测试集,真实可并行,符合 split detection 的"至少两个结果可独立实现和验证"条件;若保持单 change,串行迭代会让单次 commit 体量过大、verifier 不可定位失败点。
2. **依赖关系**:Stage 4.2 仅依赖 Stage 4(已落地);Stage 4.1 依赖 Stage 4(已落地);Stage 5b 依赖 Stage 5.1/5.2(已落地);Stage 6 依赖 license capability map(已落地);Stage 7-12 互相独立。
3. **Stage 4.1 优先**:用户的"未做清单"中第一项。优先派发。
4. **审计 sink 实现顺序**:`LocalJsonlAuditSink` 必做;`S3CompatibleAuditSink` 选做,作为可选 install。
5. **Stage 5b 与 Stage 6 的耦合**:两者都需要在 record hot path 接入,但通过不同 interceptor 注入(permission 改写 where,audit 旁路记录),互不干扰,允许并行。
6. **不实现 Cloud 独占能力**:见 Non-goals。

# Open questions

- [blocking] Q1:10 个 child 范围是否 OK?是否需要增 / 减 / 调优先级?
- [blocking] Q2:Stage 9 (SAML) 与 Stage 10 (自定义域名) 是否纳入本 change?(推荐"都纳入")
- [blocking] Q3:Stage 11 保留期数值是否按定价页原文 — record: free 14 天 / pro 365 天 / business 1095 天;automation: 三档 14 天 / 365 天 / 365 天?
- [blocking] Q4:是否接受"Supervisor 在所有 child `done` 后启动端到端 Verifier"?(这是 comet-native Supervisor 的标准流程)
- [blocking] CONFIRM:目标、范围、关键决定、验收标准、非目标摘要确认。

> 已在触发评论 `01a03606-9590-7978-95cb-95b70e811d53` 下发出确认请求,等待用户回复。
> 拆分 = Supervisor + children 已由 Agent 决定(实现选择),不需用户确认。

# Verification expectations

- 每个 child 在独立 worktree 中构建,完成后 merge 回 Supervisor 分支。
- 每个 child 的 Verifier 是新的只读 subagent,验收 child spec 的全部验收项,独立判断。
- Supervisor 在所有 child `done` 后,启动最终 Verifier 在集成分支上验证 AC-001 ~ AC-007。
- 端到端验收脚本(`/scripts/e2e-gap-fill.sh`):建测试库 → 跑所有 migration → 启动服务 → 走完 license 激活 → 走完 SSO 登录 → 创建角色 → 设 hidden 字段 → 创建 record → 验证 audit_log 行 → 验证 quota 拦截。
