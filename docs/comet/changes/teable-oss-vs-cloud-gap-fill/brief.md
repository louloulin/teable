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

## 本 change 的 scope (Round 2:Stage 13-20,平台能力扩展)

对照 teable Cloud 商业版定价页的能力清单,**已完成 Round 1 (Stage 4-12)** 仅覆盖 SSO/审计/权限/AI/管理面板/SAML/域名/retention/rate-limit。

**Round 1 后剩余的真实差距**(全部从 teable.ai/zh/pricing 与 Cloud 控制台逐项核对):

| 能力 | Cloud 档位 | OSS 现状 | 差距 |
|------|----------|---------|------|
| 自动化引擎(Trigger + Action) | Business 必备 | 完全无 | 全栈补齐 |
| 出站 Webhook | Pro+ | 完全无 | automation action 加 webhook 类型 |
| IM 桥接(Slack/Discord/Telegram/WhatsApp) | Business | 完全无 | automation action 加 IM 类型 |
| OAuth 2.0 应用(第三方授权) | Business+ | 完全无 | 起 OAuth server |
| 视图层级权限 | Business | 仅 field/row/table 级 | 扩到 view 级 |
| 字段条件格式规则 | Pro+ | 完全无 | table 元数据 + 响应阶段 apply |
| 内置 SMTP 发送 | Pro+ | 完全无 | nodemailer + OrganizationSmtpConfig |
| 备份/恢复 API | Business | 完全无 | JSONL 导出/导入端点 |

### Stage 13 — 自动化引擎 MVP(母体)
- trigger 框架:`event`(record create/update/delete)+ `schedule`(cron)
- action 框架:`update_record` / `webhook` / `email` / `slack` / `discord` / `telegram`
- 持久化:`automation` / `automation_trigger` / `automation_action` / `automation_run` 四表
- 入口:`POST /api/automation/run`(手动触发)+ BullMQ job(定时/事件)
- history:`GET /api/automation/run/:id` 查 run 详情
- 决策:**不**做可视化拖拽编辑器(只暴露 REST + JSON schema,前端 UI 在 `apps/nextjs-app` 后续另立 change)

### Stage 14 — 出站 Webhook 动作
- 复用 Stage 13 action 框架,新增 `type=webhook`
- `automation_action.config = { url, method, headers, secret, retryPolicy }`
- 调用:Node `fetch` + HMAC-SHA256 签名头 `X-Teable-Signature`
- 重试:指数退避 1s/5s/30s,共 3 次;`automation_run.retry_count` 跟踪
- 错误:`automation_run.error` 持久化(不抛回业务事务)

### Stage 15 — IM 桥接脚手架
- 凭证存储:`organization_integration` 表(provider=slack|discord|telegram|whatsapp, encrypted_token)
- action 类型:`slack`(channel via chat.postMessage)/ `discord`(webhook URL)/ `telegram`(bot API)
- 不实现:**WhatsApp Business API**(需 Meta 审核 + 商业账户),只留 stub 类型并显式 NOT_SUPPORTED
- 失败语义:凭证缺失 → action 跳过并 log;HTTP 4xx → 不重试

### Stage 16 — OAuth 2.0 服务器
- 端点:`/oauth/authorize` / `/oauth/token` / `/oauth/revoke` / `/oauth/userinfo`
- Grant:Authorization Code + Refresh Token(PKCE 强制)
- Scope:`read`(只读)/ `write`(读写)/ `admin`(管理)
- 凭证:`oauth_application` 表(client_id, client_secret_hash, redirect_uris, scopes)
- 关联:access_token 关联到 user;refresh_token 关联到 application

### Stage 17 — 视图层级权限
- 数据:`view_role_grant`(view_id, role_id)新增表
- record read 路径:`RecordQueryPermissionInterceptor` 在合并 role filter 后,若 user 拥有 view_role_grant,追加 view_id 过滤
- user 无权 view → 响应中该 view 的记录 = 空集(不 403,避免枚举)
- 与 Stage 5b 的 row filter 用 AND 合并,不重写

### Stage 18 — 字段条件格式规则
- 数据:`conditional_formatting_rule`(table_id, priority, predicate jsonb, format jsonb)
- predicate schema:`{ field, op: eq|gt|lt|contains, value }`;format:`{ color, bold, italic, icon }`
- 应用点:**响应阶段**(`RecordOpenApiService.formatResponse`),**不**改 query 阶段
- 写权限:仅 owner / admin 可改 rule
- API:`GET /api/table/:id/rules`、`POST/PATCH/DELETE` 全套

### Stage 19 — 内置 SMTP
- 数据:`organization_smtp_config`(host, port, user, encrypted_pass, from_addr, tls_mode)
- nodemailer 包装:`MailSenderService.send(to, subject, html, options)`
- 与 Stage 13 集成:automation `action.type=email` 直接调 `MailSenderService`
- 验证:`POST /api/admin/smtp/test`(发一封到测试地址,返回 200/4xx)
- 加密:pass 字段用 NestJS ConfigModule 加密(AES-256-GCM)

### Stage 20 — 备份/恢复 API
- 导出:`GET /api/admin/backup/export?spaceId=X&format=jsonl` 流式返回所有 table + record + view + permission 配置
- 导入:`POST /api/admin/backup/restore` 上传 JSONL,ConflictPolicy = skip(默认)/ overwrite / fail
- 增量:`?since=ISO8601` 只导出自该时间以来变更
- 审计:导入/导出在 audit_log 各留一条 `event_type=backup.export|backup.restore`
- 鉴权:`TEABLE_ADMIN_TOKEN` 顶层 guard

# Non-goals

- **不复制** `teableio/teable-ee`(Enterprise Edition)任何源代码。本 change 完全运行在 AGPL-3.0 仓库内。
- **不实现** Cloud 独占的运营组件:Stripe 增购、发票、公有云多区部署、官方 SLA、客服、私有化 License 签发。
- **不修改** 现有 hot path(`auth.service.ts` / `record-open-api.service.ts` / `ai.service.ts` 主体 / `space.service.ts` 主体)。
- **不引入** 任何新的 npm 依赖,以保持最小改造原则;Node 内置 + 已有依赖足够。
- **不**做前端 UI 改动(`apps/nextjs-app`);本 change 仅后端。
- **不**实现"自托管 license 申请/管理"前端流程(只暴露 API 端点)。

# Acceptance examples

> 完整验收标准分散到各 child change 的 Spec 中;这里只列跨 child 的端到端验收项。

- **A1** SSO callback 完整会话链路:从 /api/auth/sso/login 走完到本地 session cookie 写入,后续 /api/auth/profile 返回正确 user。
- **A2** 审计日志存在与可检索:任何 record create/update/delete 在 DB 留对应 audit_log 行,可在 /api/admin/audit-log 分页筛选。
- **A3** 权限矩阵热路径生效:hidden 字段在 list 响应中为 null,PATCH 写 hidden 字段返回 403 RESTRICTED_RESOURCE,row filter 实际缩小查询结果。
- **A4** AI 细分计费:free plan 调 ai_field 返回 402 LICENSE_REQUIRED;pro plan 调 cuppy_claw 返回 402;business plan 调 ai_app_builder 不返错。
- **A5** 自定义应用域名端点:/api/admin/custom-domain/check?domain=foo.com 返回 cnameTarget。
- **A6** 配额 retention 差异化:plan 切到 business 后,record history cleanup 保留期内记录保留,过期记录被删除。
- **A7** API 速率限制按档位:business plan 下超过 10 req/s 返回 429;self_hosted plan 默认无限。
- **A8** License 激活联动:设 TEABLE_LICENSE_KEY=plan:business,启动后所有 spaces 自动切到 business plan。
- **A9** SsoLoginState BullMQ 清理:超过 5 分钟的 state 行被删除,DB 中无残留。
- **A10** Prisma migration 全部成功:测试库顺序应用 0 失败,prisma generate 拿到全部枚举。
- **A11** 单测全绿:pnpm test 在 apps/nestjs-backend 0 失败,新模块单元测试覆盖所有决策点。
- **A12** 自动化引擎 MVP:trigger(event/schedule)+ action(update_record/webhook/email)+ automation_run 持久化;POST /api/automation/run 触发,GET /api/automation/run/:id 查 history。
- **A13** 出站 Webhook 动作:automation action.type=webhook 时 POST 到配置 URL,带 HMAC-SHA256 签名头 X-Teable-Signature,失败可重试 3 次指数退避。
- **A14** IM 桥接脚手架:automation action.type=slack|discord|telegram 时按 channel 投递,凭证从 OrganizationIntegration 读取,失败回退到 automation_run.error。
- **A15** OAuth 2.0 服务器:第三方应用通过 /oauth/authorize + /oauth/token 拿 access_token;Authorization Code + Refresh Token grant;scope 粒度 read/write/admin。
- **A16** 视图层级权限:view 配置 role 时,该 role 在 record read 路径上附加 view_id 过滤,user 无权 view 返回空集而非 403(返回结果合法但不暴露其他 view 数据)。
- **A17** 字段条件格式规则:table 配置 conditional_formatting rule 列表,GET /api/table/:id/rules 返回规则集,record list 响应携带 applied_format 标记;不写热路径,响应阶段 apply。
- **A18** 内置 SMTP:OrganizationSmtpConfig 保存 host/port/user/pass/tls,automation action.type=email 通过 nodemailer 发送;POST /api/admin/smtp/test 验证连通性。
- **A19** 备份/恢复 API:GET /api/admin/backup/export?format=jsonl 导出全 space 到 JSONL 流;POST /api/admin/backup/restore 上传 JSONL 恢复(冲突策略 = skip/overwrite/fail)。

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

- **Q1 解决 (2026-08-24T23:18Z)**:用户授权全 10 个 child 范围,无增/减/调优先级。
- **Q2 解决 (2026-08-24T23:18Z)**:Stage 9 (SAML) + Stage 10 (自定义域名) 均纳入本 change。
- **Q3 解决 (2026-08-24T23:18Z)**:Stage 11 retention 按定价页原文 — record free 14 天 / pro 365 天 / business 1095 天;automation 三档 14 天 / 365 天 / 365 天。
- **Q4 解决 (2026-08-24T23:18Z)**:Supervisor 端到端 Verifier 流程接受。
- **CONFIRM 解决 (2026-08-24T23:18Z)**:用户原文 "继续完善分析,综合考虑,基于 comet 实现后续的功能,自动实现完善整个功能" = 整体授权,无新增约束。
> 用户授权:10 个 child 范围、SAML + 自定义域名纳入、retention 按定价页数值、Supervisor 端到端 Verifier。
> 拆分 = Supervisor + children 已由 Agent 决定(实现选择),不需用户确认。
> 当前 shape 已确认,Supervisor 进入 Build。

# Verification expectations

- 每个 child 在独立 worktree 中构建,完成后 merge 回 Supervisor 分支。
- 每个 child 的 Verifier 是新的只读 subagent,验收 child spec 的全部验收项,独立判断。
- Supervisor 在所有 child `done` 后,启动最终 Verifier 在集成分支上验证 AC-001 ~ AC-007。
- 端到端验收脚本(`/scripts/e2e-gap-fill.sh`):建测试库 → 跑所有 migration → 启动服务 → 走完 license 激活 → 走完 SSO 登录 → 创建角色 → 设 hidden 字段 → 创建 record → 验证 audit_log 行 → 验证 quota 拦截。
