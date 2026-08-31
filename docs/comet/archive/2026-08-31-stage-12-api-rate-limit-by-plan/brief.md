# Outcome

为 Teable OSS 后端实现"按 plan 档位差异化 API 速率限制"的最小真实实现,使激活了商业 license 的自托管部署与 `teable.io` Cloud 的对外 API 限速档位对齐(均 10 req/s/单 IP),而 OSS / 自托管默认状态无限,以保留 Stage 1 已经达成的"零依赖、零热路径改写"约束。

# Scope

## 来源决策

- 商业版定价页(https://teable.ai/zh/pricing?host=cloud)标注 `free / pro / business` 三档对外 API 速率限制统一为 `10 req/s/instance`;Enterprise 由 Cloud 协商。
- 自托管(无 license / `self_hosted`)按 OSS 惯例无限,直到运营显式激活 license。
- 旧 issue / sync 反馈中 `risk-control` 服务端的"实例级硬上限"**不在本 change scope**;本 change 只做单 IP 应用层 throttle,与 Cloud 的"业务档位速率"对齐,不重写底层基础设施。

## In scope

1. 新增 `apps/nestjs-backend/src/features/api-rate-limit/api-rate-limit.guard.ts`:
   - 实现 `CanActivate`,在 `canActivate` 里读取:
     - `request.ip`(Express,支持 `trust proxy` 已经在 bootstrap 中开启)。
     - `LicenseCapabilityService.currentPlan()` 的实时值。
   - `self_hosted` 档:直接 `return true`,不计数、不抛错。
   - `free / pro / business / enterprise` 档:同一档内每 IP 10 req/s;超出则抛 `CustomHttpException(TOO_MANY_REQUESTS, 429)`。
   - 桶使用进程内 `Map<ipKey, { windowStart: number; count: number }>`,1s 滚动窗口。无需新 npm 依赖、不引入 `@nestjs/throttler`(检查 `apps/nestjs-backend/package.json` 已确认不在依赖列表里)。
2. 新增 `api-rate-limit.module.ts`:封装 guard,导出供 `GlobalModule` 注入 `APP_GUARD`。
3. 新增 `api-rate-limit.guard.spec.ts`:Vitest 单元测试,覆盖 4 个决策点:
   - AC-001 `self_hosted` 无限:`self_hosted` plan 下无论调用多少次 `canActivate`,都返回 `true`,且桶保持空。
   - AC-002 `business` 10 req/s:同一 IP 第 1~10 次返回 `true`,第 11 次抛出 `TOO_MANY_REQUESTS` 的 `CustomHttpException`,status 429。
   - AC-003 多 IP 独立计数:IP A 触达上限时,IP B 的请求仍放行。
   - AC-004 plan 切换立即生效:同 IP 已经被 `business` 限速的桶,在 mock service `currentPlan()` 改为 `self_hosted` 后,下一次调用直接放行,不再读桶。
4. 在 `apps/nestjs-backend/src/global/global.module.ts` 的 `globalModules.providers` 数组中追加 `{ provide: APP_GUARD, useClass: ApiThrottleGuard }`,**放在** `AuthGuard` 与 `PermissionGuard` 之后(顺序即 NestJS 求值顺序,throttle 必须最后执行,保证 rate-limited 401/403 不会影响 throttle 桶)。
5. `ApiRateLimitModule` 注册到 `appModules.imports`,顺序与 `LicenseModule` 紧邻。

## Out of scope

- 任何 controller / handler 改动:本 change 不修改 `*.controller.ts`,不修改 `*.service.ts`,不挂 `@Throttle()` / `@SkipThrottle()` 装饰器。
- 全局实例级速率限制(Cloud 的硬上限)、IP 黑名单、地理封禁、bot 检测、Cloudflare 集成 —— 全部为后续 Stage 的 scope。
- 替换底层 throttle 引擎为 Redis / BullMQ 共享桶 —— 当前仅进程内,单实例足够;后续若多实例部署需引入 redis store,留到下一阶段。
- LicenseService / LicenseCapabilityService 行为变更 —— 不动。
- 前端 UI / i18n。

# Acceptance examples

- **AC-001** self_hosted plan 下,对同一 IP 调用 `guard.canActivate(ctx)` 100 次,返回值始终为 `true`,且 throttle 桶内没有条目被创建。
- **AC-002** business plan 下,对同一 IP 连续 11 次调用,第 11 次 `canActivate(ctx)` 抛出 `CustomHttpException`,其 `getStatus()` 等于 `429`,`code === 'too_many_requests'`。
- **AC-003** business plan 下,IP `10.0.0.1` 第 11 次请求被 throttle 时,**同一瞬间** IP `10.0.0.2` 的 `canActivate(ctx)` 仍返回 `true`。
- **AC-004** 在测试中 mock `LicenseCapabilityService.currentPlan()` 从 `business` 切到 `self_hosted`,即使 bucket 已经存在(被 `business` 期间填满),下一次 `canActivate` 也直接放行。

# Constraints and invariants

- **AGPL-3.0**:本 change 完全运行在 AGPL-3.0 仓库内,不动 EE / Cloud 私有代码。
- **零新增 npm 依赖**:经 `apps/nestjs-backend/package.json` 检查,`@nestjs/throttler` 不在 dependencies / devDependencies;本 change 自己用 Map + 1s 滚动窗口实现,无新增依赖。
- **零现有 controller 改动**:本 change 不修改任何 `*.controller.ts`、`.service.ts` 主体实现;只新增 3 个文件 + 修改 `global.module.ts` 一处 provider 列表。
- **零热路径改写**:`AuthGuard` / `PermissionGuard` 不被改动;throttle 在它们之后执行,失败请求仍走现有 NestJS 异常管道。
- **self_hosted 100% opt-out**:`self_hosted` 路径不读取 / 不写桶,不消耗任何 CPU 之外的资源。
- **node 单实例假设**:当前 throttle 桶为进程内 Map。多实例(>1 个 backend pod)的限速会按实例数放大,这是已知 trade-off,由运营层通过 ingress 限速补齐 —— 不在 stage-12 scope。

# Decisions

- D1:不引入 `@nestjs/throttler`。原计划"prefer `@nestjs/throttler` if imported"已确认未导入,引入需新增 dep,违反 "zero new npm deps" 约束,故改为手写 in-memory sliding window。
- D2:使用 1s 固定窗口而不是真正的 sliding window log。`free / pro / business` 三档定价页都写"10 req/s",工程语义"每秒最多 10 次",固定窗口实现简单且零内存增长(每 IP 仅 2 个 number);真正的 sliding window log 会按 O(N) 增长桶内数组。
- D3:`canActivate` 内部不依赖 `ExecutionContext.switchToHttp().getRequest()` 的强类型,而用 `as { ip?: string }` 兜底,避免与 Express 类型增量冲突。
- D4:`APP_GUARD` 顺序为 `AuthGuard → PermissionGuard → ApiThrottleGuard`。throttle 在最外层,这样:
  - 匿名攻击者可以早期被 throttle,不消耗 auth / permission 的 DB 查询。
  - 已认证用户的"刷爆"仍受 10 req/s 限制,符合 Cloud 定价页语义。

# Open questions

- 无。本 change 范围与定价页约束完全对齐,不引入新的产品决策。

# Verification expectations

- `pnpm --filter @teable/backend test-unit -- api-rate-limit.guard.spec.ts`:本 change 新增的 spec 通过,4 个 AC 全部覆盖。
- `pnpm --filter @teable/backend lint`:新增 3 个文件零 lint 错误。
- `pnpm --filter @teable/backend typecheck`:全模块 typecheck 通过(guard 注入的 `LicenseCapabilityService` 已在 `LicenseModule` 中 export,DI 链合法)。
- 手动 smoke:`TEABLE_LICENSE_KEY=plan:business pnpm dev` 后,`ab -c 1 -n 20 http://localhost:3000/api/auth/profile` 第 11 次起返回 429;`unset TEABLE_LICENSE_KEY` 后相同 ab 测试全部返回 200/401。
