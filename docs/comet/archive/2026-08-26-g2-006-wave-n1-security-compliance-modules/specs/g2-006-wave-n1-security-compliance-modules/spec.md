# Capability: g2-006-wave-n1-security-compliance-modules

## Purpose

把 Wave N1 商业版必看的 8 个安全/合规/计费 module 在 `app.module.ts` 真实接线激活,补齐"36 个 module 未被 app.module.ts 引用"中安全/合规类的全部缺口。

## 8 个 module 接线细节

### 1. ip-allowlist (Stage 25)

- `app.module.ts` 的 `configure(consumer: MiddlewareConsumer)` 段添加 `consumer.apply(IpAllowlistMiddleware).forRoutes('*')`
- 加 `IpAllowlistController`:`GET /api/admin/ip-allowlist`、`POST /api/admin/ip-allowlist`、`DELETE /api/admin/ip-allowlist/:id`
- 挂 `LicenseCapabilityGuard.for('ip_allowlist')`(self_hosted 计划 402 拒绝)
- `IpAllowlistModule` 加入 `AppModule.imports`

### 2. risk-control (Stage 60)

- `auth.controller.ts` 的 `signin` / `signup` handler 注入 `RiskControlService`
- 高风险 IP / 5 秒内 10+ 次失败 → 返回 429
- `RiskControlModule` 加入 `AppModule.imports`

### 3. turnstile (注册防机器人)

- `auth.controller.ts` 的 `signup` 接收 `turnstileToken` 字段
- `TurnstileService.verify(token, ip)` 失败 → 400 validation_error
- `TurnstileModule` 加入 `AppModule.imports`

### 4. delete-user (GDPR)

- `admin-open-api.controller.ts` 加 `POST /api/admin/delete-user` 端点
- 挂 `LicenseCapabilityGuard.for('delete_user')`
- `DeleteUserModule` 加入 `AppModule.imports`

### 5. retention (Stage 59)

- `RetentionModule` 加入 `AppModule.imports`,启动时注册 BullMQ repeatable job,key=`retention-cleanup`,cron=`0 3 * * *`(每天 3 点),调 `RetentionService.purgeExpiredRecords()`
- retention TTL 按 plan 取值(self_hosted / free 14 天 / pro 365 天 / business 1095 天)

### 6. tracking (行为埋点)

- 新增 `TrackingInterceptor`,在 `TrackingModule` 内
- 注册为 APP_INTERCEPTOR,自动调 `TrackingService.recordEvent('http_request', { method, url })`
- `TrackingModule` 加入 `AppModule.imports`

### 7. metrics (Prometheus)

- 新增 `MetricsController`:`GET /metrics` 返回 prometheus text format
- 用 `prom-client` 默认 metrics(已在项目 `package.json`)
- 挂 `LicenseCapabilityGuard.for('metrics')`(可选;商业版独看)

### 8. session (会话清理)

- `SessionModule` 加入 `AppModule.imports`,启动时注册 BullMQ repeatable job,key=`session-cleanup`,cron=`0 * * * *`(每小时),调 `SessionService.purgeExpiredSessions()`

## Acceptance criteria

- **AC-GA1 8 module 在 app.module.ts 出现**:grep 至少 8 个 Wave N1 module
- **AC-GA2 ip-allowlist middleware 全局生效**:白名单外 IP 调 `/health` → 403
- **AC-GA3 risk-control 评分有效**:高频失败登录 → 429
- **AC-GA4 turnstile 校验生效**:无 token 注册 → 400
- **AC-GA5 delete-user 端点可达**:self_hosted 402,business 200
- **AC-GA6 retention BullMQ 启动**:repeatable_jobs 表 2 行(retention-cleanup + session-cleanup)
- **AC-GA7 tracking interceptor 全局埋点**:`tracking_event` 表新增
- **AC-GA8 metrics 端点**:`/metrics` 200 + prometheus text
- **AC-GA9 session BullMQ 启动**(合并到 GA6)
- **AC-GA10 单测全绿**:`pnpm -F nestjs-backend test` 0 失败
- **AC-GA11 build 不破坏**:`pnpm -F nestjs-backend build` 成功

## Files

- 修改:`apps/nestjs-backend/src/app.module.ts`(imports 追加 8 module)
- 修改:`apps/nestjs-backend/src/global/global.module.ts`(configure 段加 ip-allowlist middleware)
- 修改:`apps/nestjs-backend/src/features/auth/auth.controller.ts`(注入 risk-control / turnstile)
- 修改:`apps/nestjs-backend/src/features/admin-open-api/admin-open-api.controller.ts`(加 delete-user 端点)
- 新增:`apps/nestjs-backend/src/features/metrics/metrics.controller.ts`
- 新增:`apps/nestjs-backend/src/features/tracking/tracking.interceptor.ts`
- 各 module 内可能新增 `*.module.ts` import / `*.controller.ts` 端点

## Verification

- `grep -E "(IpAllowlistModule|RiskControlModule|TurnstileModule|DeleteUserModule|RetentionModule|TrackingModule|MetricsModule|SessionModule)" apps/nestjs-backend/src/app.module.ts` → 8 行
- `curl /metrics` → 200
- `psql bullmq.repeatable_jobs` → retention-cleanup + session-cleanup
- `curl /api/admin/delete-user` self_hosted → 402
- `curl /health` 从非白名单 IP → 403