# Outcome

将已存在但未挂载的 `QuotaEnforcementInterceptor` 注册为 NestJS 全局 `APP_INTERCEPTOR`,
由 `TEABLE_QUOTA_ENFORCEMENT_ENABLED` 环境变量闸控(默认 `false` → OSS 自部署零影响)。
闸开启后,拦截器在所有 controller handler 运行前调用 `QuotaService.consume(...)`,
按 space / plan 实时判断是否超阈值,超阈值时通过稳定的 `QUOTA_EXCEEDED` cause 抛出
`QuotaExceededException`(HTTP 402 语义,业务层视作资源耗尽)。最终交付是**单 PR commit**。

# Scope

## Source coverage

> 来源:LUM-18 Round 27 G2-002 "QuotaEnforcementInterceptor 写好了但没挂载"审计发现,
> `apps/nestjs-backend/src/features/quota/quota.interceptor.ts` 与 `quota.exception.ts`
> 已实现但未注册为 `APP_INTERCEPTOR`,OSS 自部署无法触发按 plan 的 quota 限流。

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| 现有 interceptor | `apps/nestjs-backend/src/features/quota/quota.interceptor.ts` | `complete` | 已有 `QuotaEnforcementInterceptor.intercept()`、`quotaEnforcementEnabled()`、`setQuotaResolver()` 全部待用 |
| 现有 exception | `apps/nestjs-backend/src/features/quota/quota.exception.ts` | `complete` | 已有 `QuotaExceededException`,通过 `HttpErrorCode.PAYMENT_REQUIRED` 走 402;`cause: 'QUOTA_EXCEEDED'` 已可用 |
| 现有 service | `apps/nestjs-backend/src/features/quota/quota.service.ts` | `complete` | `consume(spaceId, metric, amount, ctx)` 已有 plan-aware 实现(读 `space_quota.plan` + `METRIC_TO_COLUMN`) |
| Plan 矩阵 | `apps/nestjs-backend/src/features/quota/quota.constants.ts` | `complete` | `PLAN_LIMITS.free / pro / business / enterprise / self_hosted` 已定义阈值;`self_hosted` / `enterprise` 全 null = 无限 |
| 全局注册参考 | `apps/nestjs-backend/src/global/global.module.ts` | `complete` | g2-003 已在此处注册 `AuditInterceptor` 为 `APP_INTERCEPTOR`;本 change 在同一文件追加 |
| ForRoot 模式 | `apps/nestjs-backend/src/features/user/tracking/tracking.module.ts` | `complete` | `TrackingModule.forRoot()` 提供 env-conditional APP_INTERCEPTOR 注册参考 |
| HttpErrorCode enum | `packages/core/src/errors/http/http-response.types.ts` | `complete` | 现有键 `TOO_MANY_REQUESTS=429` 可直接复用,**不需要新增 enum 键**(402 语义已通过 PAYMENT_REQUIRED 表达) |

## 本 change 落地范围

1. **新增 `QuotaEnforcementModule.forRoot()` 工厂**:
   - 文件:`apps/nestjs-backend/src/features/quota/quota.module.ts`(export 静态 `forRoot`)
   - 实现:仅当 `process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED === 'true'` 时,在 `providers` 列表追加 `{ provide: APP_INTERCEPTOR, useClass: QuotaEnforcementInterceptor }`
   - env=false 时,`forRoot()` 返回**不**带 APP_INTERCEPTOR provider 的 DynamicModule — 拦截器**完全不注册**,handler 调用路径 0 字节 / 0 微秒开销
   - 满足"OSS 默认零影响"硬性约束

2. **`global.module.ts` 集成**:
   - 修改 `apps/nestjs-backend/src/global/global.module.ts` 的 `register()` 静态方法
   - 把 `QuotaModule.forRoot()`(只在 env=true 时返回 APP_INTERCEPTOR)的引用替换成 **env-gated 直接 provider**
   - 实际方案:在 `globalModules.providers` 末尾用 `useFactory` + `inject: [ConfigService]` / 直接读 `process.env` 注册 `APP_INTERCEPTOR`(env=false 时 `useFactory` 返回 `undefined` / `null`,NestJS 自动跳过)
   - 顺序:在 `AuditInterceptor` 之后、`RouteTracingInterceptor` 之前(配额检查 → 审计 → tracing)

3. **stable 错误 code**:
   - 复用 `quota.exception.ts` 现有的 `cause: 'QUOTA_EXCEEDED'` 作为 HTTP 402 响应的稳定 code
   - **不**新增 `HttpErrorCode.QUOTA_EXCEEDED`(避免 enum 膨胀;g2-004 enum-guard 已通过 402 + PAYMENT_REQUIRED 表达"资源耗尽"语义)
   - `meta` 字段包含 `metric / cap / attempted / spaceId`,前端可直接解析

4. **plan-aware 阈值**:
   - `QuotaService.consume()` 已经按 plan 读取 `space_quota` 表
   - 本 change **不**修改 service 主体逻辑,只复用现有实现
   - 计划矩阵(沿用 `quota.constants.ts`):
     - `free`:1000 行 / 1GB 附件 / 100 automation runs / 200 AI credits
     - `pro`:250k 行 / 10GB 附件 / 25k automation runs / 1k AI credits
     - `business`:1M 行 / 100GB 附件 / 100k automation runs / 2k AI credits
     - `enterprise`:全部 null = 无限(Sales contracts override)
     - `self_hosted`:全部 null = 无限(OSS 默认零影响)

5. **单元测试**:
   - 文件:`apps/nestjs-backend/src/features/quota/quota.interceptor.spec.ts`(已存在 5 个测试)
   - **追加**新测试:
     - `is no-op when env flag is off` (existing):验证 env=false 时不调 `consume`
     - `blocks when env=true and consume throws QuotaExceededException` (existing)
     - `downgrades to log+continue in permissive mode` (existing)
     - `honors custom resolver` (existing)
     - `multiple resource types (rows / attachment_bytes / automation_runs) propagate metric name` (**new**)
     - `plan matrix maps (free / pro / business / enterprise / self_hosted) to expected caps` (**new**,纯 unit,against `PLAN_LIMITS` constant)
     - `boundary: amount === cap passes; amount === cap + 1 fails` (**new**)
     - `stable code: QuotaExceededException cause is 'QUOTA_EXCEEDED'` (**new**)

# Non-goals

- **不修改** 现有 `QuotaService.consume()` 主体逻辑(plan 读取已经正确)
- **不修改** `HttpErrorCode` enum 本身(沿用现有 `PAYMENT_REQUIRED` 402)
- **不**新增 `HttpErrorCode.QUOTA_EXCEEDED`(避免 enum 膨胀;现有 `cause: 'QUOTA_EXCEEDED'` 字符串足够稳定)
- **不**改前端(`apps/nextjs-app`)
- **不**引入 `@nestjs/throttler` 或 rate-limiter-flexible 之类的第三方限流库(本 change 只挂拦截器)
- **不**实现 `/api/quota/:spaceId` 的额外路由(已有 quota.controller.ts)
- **不**做 e2E / runtime smoke(由 Verifier / Runtime 端触发)
- **不**复制 `teableio/teable-ee` 任何源代码

# Acceptance examples

- **GA1 APP_INTERCEPTOR 注册**:`QuotaEnforcementInterceptor` 出现在 `global.module.ts` 的 `providers` 列表中,且绑定到 `APP_INTERCEPTOR` token(参考 g2-003 同位置)
- **GA2 env 默认关闭**:`TEABLE_QUOTA_ENFORCEMENT_ENABLED` 不设或 `false` 时,`forRoot()` 不注册 APP_INTERCEPTOR,handler 调用路径无任何额外调用
- **GA3 plan-aware 阈值**:env=true + 配 `space_quota.plan = 'free'` + `rowLimit = 1000` → `consume('sp', 'rows', 1001, ...)` 抛 `QuotaExceededException`
- **GA4 超额返回稳定 code**:响应 payload 的 `code` 字段 = `'quota_exceeded'`(来自 `HttpErrorCode.PAYMENT_REQUIRED`,由 `cause: 'QUOTA_EXCEEDED'` 标记);meta 含 `metric / cap / attempted / spaceId`
- **GA5 单测覆盖**:新增 4 个测试用例(multiple resource types / plan matrix / 临界 / stable code),与现有 5 个用例合计 9 个测试全部通过
- **GA6 零 OSS 影响**:env=false 时,`QuotaEnforcementInterceptor` 不出现在 `globalModules.providers`(可通过 grep 验证);`QuotaService` 仍可被 controller 主动调用,但**不被拦截器**强制

# Constraints and invariants

- **AGPL-3.0 合规**:所有新增 / 修改源代码在本仓库内
- **零现有热路径改动**:`QuotaService.consume()` / `QuotaExceededException` / `quota.constants.ts` 主体逻辑不变
- **零新增 npm 依赖**:Node 内置 `process.env` + 已有 `@nestjs/core` 的 `APP_INTERCEPTOR` 足够
- **env 默认 OFF**:不破坏现有 OSS 自部署用户体验;env=false 时拦截器**不**注册(NestJS provider 数组为空)
- **build-time only**:不在 runtime 抛错;只在请求进入 handler 前由 interceptor 决策
- **scan range**:仅修改 `global.module.ts` + `quota.module.ts` + 追加 `quota.interceptor.spec.ts` 测试用例,其它文件**不**动
- **commit 风格**:Conventional Commits,`feat(quota): wire QuotaEnforcementInterceptor as APP_INTERCEPTOR + env gate (G2-002)`
- **commitlint**:commit message 满足现有 commitlint 配置

# Decisions

1. **useFactory vs class-based registration**:选 useFactory + 直接读 `process.env`,因为 `global.module.ts` 是 `@Global()` Module,没有 `ConfigModule` 依赖,直接读 env 字符串最简单;`useFactory` 返回 `null` 时 NestJS 自动跳过 provider,实现"env=false 时拦截器完全不注册"
2. **forRoot 静态方法**:选 `QuotaModule.forRoot()`,与 `TrackingModule.forRoot()` 风格一致;AppModule 调用时传 env 判断,test fixture 可 import bare `QuotaModule`(不带 interceptor)
3. **不新增 HttpErrorCode.QUOTA_EXCEEDED**:现有 `cause: 'QUOTA_EXCEEDED'` 字符串已稳定,前端按 cause 字符串分流;新增 enum 键会导致所有 ErrorCodeToStatusMap 调用方都要改(参见 g2-004 enum-guard 经验)
4. **402 vs 429**:QuotaExceededException 仍走 402 PAYMENT_REQUIRED,因为 "付费计划超阈值" 语义更接近 Payment Required;429 TOO_MANY_REQUESTS 留给 rate-limit 中间件
5. **顺序**:`AuditInterceptor` → `QuotaEnforcementInterceptor` → `RouteTracingInterceptor`(配额检查先于审计,避免配额超限的请求产生冗余 audit 行;但 audit 仍记录 402 响应,因为 audit interceptor 在 quota interceptor 之后 catchError)
6. **permissive 模式**:`TEABLE_QUOTA_ENFORCEMENT_PERMISSIVE=true` 仍保留(拦截器已实现),用于 staged rollout;env 默认 false 时连 permissive 都没注册,无需单独讨论

# Open questions

- 无。用户原文"全量实现"= 同意本 child 在 supervisor 之外独立落地,所有用户可见决定已在 Decisions 段处理。

# Verification expectations

- **build-time**:`pnpm -F nestjs-backend build` 整体成功(prebuild 钩子含 enum-guard.test.ts)
- **test-time**:`pnpm -F nestjs-backend vitest run src/features/quota/quota.interceptor.spec.ts` 9 个测试全绿
- **test-time(plan matrix)**:`pnpm -F nestjs-backend vitest run src/features/quota/quota.service.spec.ts` 现有测试不退步;**新增** `PLAN_LIMITS` 矩阵断言
- **static check**:`grep -n 'APP_INTERCEPTOR.*QuotaEnforcementInterceptor' apps/nestjs-backend/src/global/global.module.ts` 有 1 行匹配;`grep -n 'QuotaEnforcementInterceptor' apps/nestjs-backend/src/features/quota/quota.module.ts` 在 `forRoot()` providers 中
- **env gate**:把 `process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED` 暂时设成 `'true'` 后,单测 `is a no-op when feature flag is off` 必须仍然通过(useFactory 在 env=false 分支返回 null,provider 不存在)
- **runtime smoke**(由 Verifier 端执行):启动 backend → curl 模拟 over-quota → 验证 402 响应含 `code: 'quota_exceeded'`
