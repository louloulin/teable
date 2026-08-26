# Outcome

在 OSS NestJS 后端引入全局 `AuditInterceptor` 作为 `APP_INTERCEPTOR`,与现有 `@Audit()` 显式装饰器双轨并存,确保所有 controller 调用都会自动写 audit 行,补齐 Round 27 G1 审计识别的"装饰品 + 漏 service"缺口。最终交付是**单 PR commit**,直接 merge 到目标分支 `agent/chong/df9d120d2105-stage6-audit-log`。

# Scope

## Source coverage

> 来源:LUM-18 Round 27 G1-034~037 修复 + Round 26 Stage 6 (audit_log) 完整落地,均为本用户原创或同一会话前序交付。已确认 `AuditLogService.record()` / `LocalJsonlAuditSink` / `audit_log` 表已存在并写入端到端可用;本 change 只补"全局自动审计"能力。

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Round 26 Stage 6 audit-log 实现 | commit `stage-6-audit-log` (合并入 supervisor) | `complete` | 现有 `AuditLogService` / `audit_log` 表 / `@Audit()` 装饰器 / `LocalJsonlAuditSink` |
| Round 27 G1-034 LicenseCapability union | commit `ee8fa7be5` | `complete` | `audit_log_query` capability 已加入 business/enterprise plan |
| `global.module.ts` APP_INTERCEPTOR 注册 | `apps/nestjs-backend/src/global/global.module.ts:115-134` | `complete` | 现有全局守卫链注册位置,本 change 在同一文件追加 interceptor |

## 本 change 落地范围

1. **新增 `AuditInterceptor`**:
   - 文件:`apps/nestjs-backend/src/features/audit/audit.interceptor.ts`
   - 实现 NestJS `NestInterceptor`,在所有 controller 进入点拦截,自动调 `AuditLogService.record('http_request', { method, url, controller, handler, callerId, statusCode, latencyMs })`
   - 与现有 `@Audit()` 装饰器双轨并存:`@Audit()` 走显式事件,`AuditInterceptor` 走"任何 controller 调用"自动事件
   - 失败时(`AuditLogService.record` 抛错)**不**回滚业务事务,只 `console.error`,符合现有"审计不污染热路径"约束

2. **注册为 APP_INTERCEPTOR**:
   - 修改 `apps/nestjs-backend/src/global/global.module.ts:115-134` 的 providers 列表,追加 `AuditInterceptor`
   - 顺序:在 `RouteTracingInterceptor` 之前(先 audit 再 tracing),在 `PermissionGuard` 之后(权限拒绝的请求也要审计,但 record 用 403 状态码)

3. **敏感字段过滤**:`AuditInterceptor` 默认跳过 `Authorization` header / `Cookie` header / request body 中的 `password` / `secret` / `token` 字段(基础防护,无新增 npm 依赖)

4. **可观测性 hook**:`AuditInterceptor` 暴露 `countRequestsSinceBoot()` 帮助函数,供健康检查 / 冒烟测试验证是否真的注册了

# Non-goals

- **不修改** 现有 `@Audit()` 装饰器行为
- **不修改** `AuditLogService.record()` 接口
- **不新增** 任何 npm 依赖
- **不修改** `LocalJsonlAuditSink` / `S3CompatibleAuditSink` 实现
- **不复制** `teableio/teable-ee` 任何源代码
- **不**改前端(`apps/nextjs-app`)
- **不**做"`@Audit()` decorator 参数化扩展"之类的额外能力,本 change 只补"全局自动审计"

# Acceptance examples

- **GA1 全局审计生效**:任意 controller 端点被调用后,`audit_log` 表新增一行,`event_type='http_request'`,`payload` 包含 method/url/controller/handler/callerId/statusCode/latencyMs。
- **GA2 与 @Audit() 双轨并存**:同一端点上,显式 `@Audit('record.create')` 写入的事件 + `AuditInterceptor` 写入的 `http_request` 事件**两个都出现**,互不覆盖。
- **GA3 失败不污染**:模拟 `AuditLogService.record()` 抛错(如临时把表 drop),业务 controller 仍返回成功,只 console.error,事务不回滚。
- **GA4 权限拒绝也审计**:未鉴权用户访问 `GET /api/space/:id` → 401 响应,**同时** audit_log 写入 `http_request` 事件(`statusCode=401`,`callerId=null`)。
- **GA5 单测全绿**:`pnpm -F nestjs-backend test` 0 失败;新增 `audit.interceptor.spec.ts` 覆盖 4 个决策点(成功 / 失败 / 权限拒绝 / 敏感字段过滤)。
- **GA6 build 不破坏**:`pnpm -F nestjs-backend build` 通过,dist/index.js 重新生成。

# Constraints and invariants

- **AGPL-3.0 合规**:任何新增源代码在本仓库内,改动可被 fork 验证,不引入与 AGPL 冲突的依赖
- **零现有热路径改动**:`audit_log` / `AuditLogService` / `@Audit()` 装饰器主体逻辑不变,只新增一个独立 interceptor
- **零新增 npm 依赖**:Node 内置 + 已有 nestjs-cls / nestjs-i18n / prisma 已经覆盖所有需求
- **迁移幂等**:本 change **不**新增任何 Prisma migration(只新增代码,不改 schema)
- **能力闸优先**:`AuditInterceptor` 不引入新的 LicenseCapabilityGuard(它本身只读,不挡业务)
- **审计不污染热路径**:`AuditInterceptor` 调用 `AuditLogService.record()` 抛错时**不**回滚业务事务

# Decisions

1. **APP_INTERCEPTOR vs 装饰器**:选 APP_INTERCEPTOR 全局生效,与"装饰品 + 漏 service"识别的根因(装饰器是 opt-in)直接对应
2. **event_type = 'http_request'**:与现有 `@Audit('xxx')` 事件类型并列,不冲突;前端 / 审计后台按 `event_type` 分流
3. **敏感字段过滤最小集**:只过滤 Authorization / Cookie header + password / secret / token body 字段,不引入更复杂的过滤(避免过度工程)
4. **不引入 CAP theorem / 异步队列**:`AuditLogService.record()` 已经是 best-effort 异步,本 change 直接同步调,沿用现有契约
5. **顺序**:在 `RouteTracingInterceptor` 之前(先 audit 再 tracing),与权限 guard 无关(权限 guard 在 NestJS 早期阶段先于 interceptor)

# Open questions

- 无。用户原文 "全量实现" = 同意本 child 在 supervisor 之外独立落地,所有用户可见决定已在 Decisions 段处理。

# Verification expectations

- **build-time**:`pnpm -F nestjs-backend build` 成功
- **test-time**:`pnpm -F nestjs-backend test` 全绿(包含新增 `audit.interceptor.spec.ts`)
- **runtime smoke**:
  1. 启动 backend
  2. `curl POST /api/auth/signup` 创建 user
  3. `curl GET /api/license/capabilities`(应 200)
  4. `psql -c "SELECT event_type, payload->>'method' AS method, payload->>'url' AS url FROM audit_log ORDER BY id DESC LIMIT 5"`
  5. 应见 `http_request / GET /api/license/capabilities` 行
- **故障路径**:模拟 `AuditLogService.record()` 抛错 → 业务路径仍返回 200 → 后端日志见 `console.error`,无未捕获异常