# Outcome

把 Wave N1 商业版必看的 8 个安全/合规/计费 module 在 `app.module.ts` 真实接线激活,补齐 Round 26 识别的"36 个 module 文件未被 app.module.ts 引用"中安全/合规类的全部缺口。最终交付是**单 PR commit**,merge 到目标分支。

# Scope

## Source coverage

> 来源:LUM-18 Round 26 实证:实测 36 个 module 文件未在 `app.module.ts` 出现。其中 Wave N1 是商业版必看的安全/合规/计费子集。均为本仓库 OSS 已有源代码,**不复制** `teableio/teable-ee`。

| 来源 module | 当前状态 | 落地动作 |
|------|------|------|
| `ip-allowlist` (Stage 25) | service + middleware 已写,无 controller | middleware 全局挂载 + IP 限制端点 |
| `risk-control` (Stage 60) | service 已写,无挂载 | 登录路径注入风险评分 |
| `turnstile` (注册防机器人) | service 已写,无挂载 | 注册端点接入 Turnstile |
| `delete-user` (GDPR) | service 已写,无挂载 | `/api/admin/delete-user` 端点 |
| `retention` (Stage 59) | service 已写,无挂载 | BullMQ repeatable 启动注册 |
| `tracking` (行为埋点) | service 已写,无挂载 | APP_INTERCEPTOR 全局埋点 |
| `metrics` (Prometheus) | service 已写,无挂载 | `/metrics` 端点 + 启用 |
| `session` (会话清理) | service 已写,无挂载 | BullMQ repeatable 启动注册 |

## 本 change 落地范围

每个 module 接线动作(8 个):

1. **ip-allowlist**:在 `app.module.ts` 配置 `consumer.apply(IpAllowlistMiddleware).forRoutes('*')`,加 `/api/admin/ip-allowlist` controller 暴露白名单 CRUD
2. **risk-control**:`auth.controller.ts` 的 `signin` / `signup` handler 注入 `RiskControlService.evaluate()`,按 score 决定是否阻断
3. **turnstile**:`auth.controller.ts` 的 `signup` 接收 `turnstileToken` 字段,调 `TurnstileService.verify()`
4. **delete-user**:`admin-open-api.controller.ts` 加 `POST /api/admin/delete-user` 端点
5. **retention**:在 `app.module.ts` 启动时注册 BullMQ repeatable job(每 24h 跑一次 record_history + audit_log 清理)
6. **tracking**:新增 `TrackingInterceptor` 作为 APP_INTERCEPTOR,自动写埋点
7. **metrics**:新增 `/metrics` 端点(用 `prom-client` 默认 metrics + 自定义 metrics)
8. **session**:在 `app.module.ts` 启动时注册 BullMQ repeatable job(每 1h 跑一次 session 过期清理)

每个 module 都遵守以下约束:
- AGPL-3.0:不复制 `teableio/teable-ee`
- 零现有热路径改动:已有 handler 主体逻辑不变,新能力通过 interceptor / middleware / decorator opt-in
- 零新增 npm 依赖:Node 内置 + 已有 nestjs-cls / nestjs-i18n / prisma / BullMQ 已经覆盖所有需求
- License capability gate:商业版独占路由(如 `/api/admin/delete-user` / `/metrics`)挂 `LicenseCapabilityGuard.for(...)`,self_hosted 计划 402 拒绝

# Non-goals

- **不复制** `teableio/teable-ee` 任何源代码
- **不**新增 npm 依赖
- **不**修改 module 内部 service 实现
- **不**做 UI(前端 `apps/nextjs-app` 不动)
- **不**改 Wave N2 / Wave N3 的 module(那些是 g2-007 / g2-008 的 scope)

# Acceptance examples

- **GA1 8 个 module 全部在 `app.module.ts` 出现**:grep `imports: \[` 段至少含 8 个 Wave N1 module
- **GA2 ip-allowlist middleware 全局生效**:从不在白名单的 IP 调用 `GET /health` → 403 restricted_resource
- **GA3 risk-control 评分有效**:模拟高风险登录(同一 IP 5 秒 10 次失败)→ 第 11 次 signin 返回 429 too_many_requests
- **GA4 turnstile 校验生效**:signup 不带 `turnstileToken` → 400 validation_error
- **GA5 delete-user 端点可达**:`POST /api/admin/delete-user` 在 self_hosted 计划 → 402 payment_required,激活 license → 200
- **GA6 retention BullMQ 启动**:`SELECT * FROM bullmq.repeatable_jobs` 应见 `retention-cleanup` 行
- **GA7 tracking interceptor 全局埋点**:任意 controller 调用 → `tracking_event` 表新增一行
- **GA8 metrics 端点**:curl `GET /metrics` → 200 + prometheus text format
- **GA9 session BullMQ 启动**:`SELECT * FROM bullmq.repeatable_jobs` 应见 `session-cleanup` 行
- **GA10 单测全绿**:`pnpm -F nestjs-backend test` 0 失败
- **GA11 build 不破坏**:`pnpm -F nestjs-backend build` 成功

# Constraints and invariants

- **AGPL-3.0 合规**:任何新增源代码在本仓库内
- **零现有热路径改动**:已有 handler 主体逻辑不变
- **零新增 npm 依赖**
- **迁移幂等**:本 change **不**新增 Prisma migration(只新增 module 接线 + 端点,不改 schema)
- **能力闸优先**:商业版独占路由挂 `LicenseCapabilityGuard.for(...)`
- **审计不污染热路径**

# Decisions

1. **Wave N1 = 8 module**:本 change 只做安全/合规/计费 8 个,Wave N2 (20+ module) 是 g2-007 scope
2. **ip-allowlist 用 middleware**:与 Stage 25 已落地的 `IpAllowlistMiddleware` 一致,避免引入新拦截器
3. **metrics 用 prom-client**:是 NestJS 官方默认 metrics 库,已在 `package.json` 中(确认),无需新增
4. **session / retention BullMQ**:复用现有 `BullModule.forRoot()` 配置,与 Stage 4.2 SsoLoginState 清理用同一个 queue
5. **tracking interceptor 与 audit interceptor 解耦**:tracking 只写埋点(频次/事件类型),不写审计详情,避免重复审计

# Open questions

- 无。用户原文 "全量实现" = 同意本 child 在 supervisor 之外独立落地。

# Verification expectations

- **build-time**:`pnpm -F nestjs-backend build` 整体成功
- **test-time**:`pnpm -F nestjs-backend test` 全绿
- **runtime smoke**:
  1. 启动 backend
  2. `grep -E "(IpAllowlistModule|RiskControlModule|TurnstileModule|DeleteUserModule|RetentionModule|TrackingModule|MetricsModule|SessionModule)" apps/nestjs-backend/src/app.module.ts` → 8 行
  3. `curl http://127.0.0.1:3000/metrics` → 200 + prometheus text
  4. `psql -c "SELECT * FROM bullmq.repeatable_jobs WHERE name IN ('retention-cleanup', 'session-cleanup')"` → 2 行
  5. `curl -X POST http://127.0.0.1:3000/api/admin/delete-user -H "Content-Type: application/json" -d '{"userId":"x"}'` → 402 payment_required