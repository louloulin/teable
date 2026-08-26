# Capability: g2-002-quota-global-app-interceptor

## Purpose

将 `QuotaEnforcementInterceptor` 注册为 NestJS 全局 `APP_INTERCEPTOR`,由环境变量闸控
(`TEABLE_QUOTA_ENFORCEMENT_ENABLED`,默认 `false`)。闸开启后,所有 controller handler
在执行前会调用 `QuotaService.consume(...)`,按 space / plan 实时判断是否超阈值,
超阈值时抛出 `QuotaExceededException`(HTTP 402,cause `'QUOTA_EXCEEDED'`)。
默认 OFF 保证 OSS 自部署零影响。

## Behavior

### 1. env-gated APP_INTERCEPTOR 注册

修改 `apps/nestjs-backend/src/features/quota/quota.module.ts`,export 静态方法:

```ts
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { QuotaController } from './quota.controller';
import { QuotaEnforcementInterceptor } from './quota.interceptor';
import { QuotaService } from './quota.service';

@Module({
  imports: [PrismaModule],
  controllers: [QuotaController],
  providers: [QuotaService, QuotaEnforcementInterceptor],
  exports: [QuotaService, QuotaEnforcementInterceptor],
})
export class QuotaModule {
  /**
   * Env-gated factory: returns a DynamicModule that registers
   * QuotaEnforcementInterceptor as APP_INTERCEPTOR only when
   * TEABLE_QUOTA_ENFORCEMENT_ENABLED === 'true'. OSS self-host keeps
   * the bare QuotaModule import — no global hookup, no overhead.
   */
  static forRoot(): DynamicModule {
    if (process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED !== 'true') {
      return { module: QuotaModule };
    }
    return {
      module: QuotaModule,
      providers: [
        { provide: APP_INTERCEPTOR, useClass: QuotaEnforcementInterceptor },
      ],
    };
  }
}
```

### 2. AppModule 接入

修改 `apps/nestjs-backend/src/global/global.module.ts` 的 `globalModules.providers`,
在 `AuditInterceptor` 之后、`RouteTracingInterceptor` 之前追加:

```ts
{
  provide: APP_INTERCEPTOR,
  // Conditional registration: when TEABLE_QUOTA_ENFORCEMENT_ENABLED !== 'true',
  // useFactory returns null and NestJS skips the provider entirely. Zero-cost
  // path for OSS self-host; full enforcement path when cloud operator flips
  // the flag.
  useFactory: (): typeof QuotaEnforcementInterceptor | null =>
    process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED === 'true'
      ? QuotaEnforcementInterceptor
      : null,
},
```

**顺序约束**:`QuotaEnforcementInterceptor` 必须在 `AuditInterceptor` **之后**注册
(配额超限的请求不应触发 audit interceptor 的 audit 行);`RouteTracingInterceptor`
仍在最后(tracing span 永远包裹)。

### 3. 现有 QuotaEnforcementInterceptor 行为不变

- 文件:`apps/nestjs-backend/src/features/quota/quota.interceptor.ts`
- env=false 时,`quotaEnforcementEnabled()` 返回 false,`intercept()` 直接 `return next.handle()` — **不**注册 provider 时调用路径根本不会进 `intercept`
- env=true 时,`intercept()` 读取 `spaceId / metric / amount / resource / actorId` 调用 `QuotaService.consume(...)`
- `consume` 抛 `QuotaExceededException` 时,strict 模式透传 throw;permissive 模式 downgrade 到 `console.warn`
- 已实现的 `setQuotaResolver()` 钩子保留,允许未来在 NestJS request 中解析 baseId/tableId → spaceId

### 4. 稳定错误 code

`QuotaExceededException` 沿用现有实现,HTTP 状态码 402(`HttpErrorCode.PAYMENT_REQUIRED`),
`cause` 字段固定为字符串 `'QUOTA_EXCEEDED'`。响应 payload 形态:

```json
{
  "statusCode": 402,
  "code": "payment_required",
  "message": "Quota exceeded for rows on space spX: tried 1500, cap 1000",
  "data": {
    "cause": "QUOTA_EXCEEDED",
    "meta": {
      "metric": "rows",
      "cap": "1000",
      "attempted": "1500",
      "spaceId": "spX"
    }
  }
}
```

`cause: 'QUOTA_EXCEEDED'` 是前端 / API consumer 的稳定分流键(不依赖 HTTP 状态码)。

### 5. Plan-aware 阈值

`QuotaService.consume()` 已按 `space_quota.plan` + `METRIC_TO_COLUMN` 读取阈值,
本 change 不修改 service 主体逻辑。Plan 矩阵(`quota.constants.ts`):

| Plan | rowLimit | attachmentByteLimit | automationRunLimit | aiCreditLimit | apiRequestLimitPerSec |
|------|----------|---------------------|--------------------|---------------|------------------------|
| `free` | 1 000 | 1 GB | 100 | 200 | 10 |
| `pro` | 250 000 | 10 GB | 25 000 | 1 000 | 10 |
| `business` | 1 000 000 | 100 GB | 100 000 | 2 000 | 10 |
| `enterprise` | null (unlimited) | null | null | null | null |
| `self_hosted` | null (unlimited) | null | null | null | null |

`self_hosted` / `enterprise` 全 null → `isUnlimited()` 返回 true → `consume()` 立即 return,
**不**触发 `QuotaExceededException`(确保 OSS 自部署零影响)。

### 6. 单元测试覆盖

`apps/nestjs-backend/src/features/quota/quota.interceptor.spec.ts` 现有 5 个测试用例 + 追加 4 个:

**现有测试**:
1. `is a no-op when the feature flag is off`
2. `calls consume before the handler runs when flag is on`
3. `throws QuotaExceededException in strict mode`
4. `downgrades to log+continue in permissive mode`
5. `honors custom resolver`

**追加测试**:
6. `propagates metric name for multiple resource types (rows / attachment_bytes / automation_runs / ai_credits)` — 验证 `QuotaService.consume` 收到的 metric 参数与 header 一致
7. `plan matrix: free / pro / business limits are not null; enterprise / self_hosted are null` — 验证 `PLAN_LIMITS` 矩阵与 brief.md 一致
8. `boundary: amount === cap passes; amount === cap + 1 fails` — 临界值断言
9. `stable code: QuotaExceededException.code carries 'QUOTA_EXCEEDED' cause` — 验证 `cause` 字段为稳定字符串

## Acceptance criteria

- **AC-GA1 APP_INTERCEPTOR 注册**:`grep -n 'APP_INTERCEPTOR' apps/nestjs-backend/src/global/global.module.ts` 出现 ≥3 行(含本 change 新增)
- **AC-GA2 env 默认关闭**:`grep -n 'TEABLE_QUOTA_ENFORCEMENT_ENABLED' apps/nestjs-backend/src/features/quota/quota.module.ts` 出现,且 `forRoot()` 在 env=false 分支**不**追加 provider
- **AC-GA3 plan-aware 阈值**:env=true + `space_quota.plan = 'free'` + `rowLimit = 1000` → `service.consume('sp', 'rows', 1001, ...)` 抛 `QuotaExceededException`(已在 `quota.service.spec.ts` 覆盖;本 change 不退化)
- **AC-GA4 超额返回稳定 code**:`new QuotaExceededException(...).data.cause === 'QUOTA_EXCEEDED'`,单测断言
- **AC-GA5 单测全绿**:`pnpm -F nestjs-backend vitest run src/features/quota/quota.interceptor.spec.ts` 9 个测试 0 失败
- **AC-GA6 零 OSS 影响**:env=false 时,`grep -n 'APP_INTERCEPTOR.*QuotaEnforcementInterceptor' apps/nestjs-backend/src/global/global.module.ts` **不**匹配(只有 useFactory provider 出现,但 `useFactory` 返回 null 时 NestJS 跳过注册)

## Files

- 修改:`apps/nestjs-backend/src/features/quota/quota.module.ts`(export 静态 `forRoot()` 方法)
- 修改:`apps/nestjs-backend/src/global/global.module.ts`(providers 列表追加 useFactory-gated APP_INTERCEPTOR)
- 修改:`apps/nestjs-backend/src/features/quota/quota.interceptor.spec.ts`(追加 4 个测试用例)
- **不**修改:`quota.interceptor.ts` / `quota.service.ts` / `quota.exception.ts` / `quota.constants.ts` / `quota.controller.ts` / `quota.types.ts`
