# Capability: g2-003-audit-global-interceptor-strict

## Purpose

在 OSS NestJS 后端引入全局 `AuditInterceptor`,作为 `APP_INTERCEPTOR` 自动审计所有 controller 调用,与现有 `@Audit()` 显式装饰器双轨并存。

## Behavior

### 1. AuditInterceptor 实现

- 文件:`apps/nestjs-backend/src/features/audit/audit.interceptor.ts`
- 导出 `class AuditInterceptor implements NestInterceptor`
- `intercept(context, next)`:
  1. 记录 `startedAt = Date.now()`
  2. 解析 `context.switchToHttp().getRequest()`,提取 method / url / controller / handler
  3. 解析 callerId(优先 `cls.get('user.id')`,否则 `null`)
  4. 等待 `next.handle().toPromise()` 拿到响应(或错误)
  5. 计算 `latencyMs = Date.now() - startedAt`
  6. 异步 fire-and-forget 调 `auditLogService.record('http_request', { method, url, controller, handler, callerId, statusCode, latencyMs })`,**不** await(避免阻塞响应)
  7. catch 抛错 → `console.error('AuditInterceptor failed:', error)`,**不** throw(不污染热路径)
  8. 返回响应

### 2. 敏感字段过滤

`AuditInterceptor` 默认**不**记录 `request.headers.authorization`、`request.headers.cookie`、`request.body.password`、`request.body.secret`、`request.body.token` 字段。这些字段在 `payload` 里被替换为 `'[REDACTED]'`。

### 3. APP_INTERCEPTOR 注册

修改 `apps/nestjs-backend/src/global/global.module.ts:115-134`,在现有 providers 列表里追加:

```ts
{
  provide: APP_INTERCEPTOR,
  useClass: AuditInterceptor,
  // 顺序:在 PermissionGuard / RouteTracingInterceptor 之前,
  // 但 PermissionGuard 在 APP_GUARD 中已先于 interceptor 执行,所以 interceptor 看到的是已鉴权 + 已鉴权的请求
},
```

`AuditInterceptor` 依赖 `AuditLogService`,通过 NestJS DI 注入(`audit.module.ts` 已 export `AuditLogService`)。

### 4. 可观测性 hook

`AuditInterceptor` 暴露:

```ts
static instance: AuditInterceptor | null = null;  // 模块实例引用
countRequestsSinceBoot(): number;  // 返回本进程启动以来的请求数
```

供后续 `health.controller.ts` 集成 / e2E 测试断言使用。

## Acceptance criteria

- **AC-GA1 全局审计生效**:任何 controller 端点被调用后,`audit_log` 表新增一行,`event_type='http_request'`,`payload` 含 method/url/controller/handler/callerId/statusCode/latencyMs
- **AC-GA2 与 @Audit() 双轨并存**:同一端点,显式 `@Audit('record.create')` 与 `AuditInterceptor` 写入的事件**两个都出现**
- **AC-GA3 失败不污染**:`AuditLogService.record()` 抛错时,业务 controller 仍返回成功
- **AC-GA4 权限拒绝也审计**:401/403 响应**也**写入 audit_log 行
- **AC-GA5 单测全绿**:`pnpm -F nestjs-backend test` 0 失败;新增 `audit.interceptor.spec.ts` 覆盖成功 / 失败 / 权限拒绝 / 敏感字段过滤 4 个决策点
- **AC-GA6 build 不破坏**:`pnpm -F nestjs-backend build` 通过

## Files

- 新增:`apps/nestjs-backend/src/features/audit/audit.interceptor.ts`
- 新增:`apps/nestjs-backend/src/features/audit/audit.interceptor.spec.ts`
- 修改:`apps/nestjs-backend/src/global/global.module.ts`(providers 追加 1 个 APP_INTERCEPTOR)
- 修改:`apps/nestjs-backend/src/features/audit/audit.module.ts`(providers 列表追加 AuditInterceptor 类)