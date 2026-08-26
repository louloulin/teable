# R1-T04 DI 工厂 `createFeatureModule`

## 目标

把 `apps/nestjs-backend/src/features/<feature>/` 目录下"controller + service + module + zod schema"四件套样板收敛为一行工厂调用,作为 T-05/06/07/08/09 后续 feature 的复用底座。

工厂签名(目标形态):

```ts
// apps/nestjs-backend/src/factory/create-feature-module.ts
export interface CreateFeatureModuleOptions<
  TService extends Type<unknown>,
  TController extends Type<unknown>,
  TQuery extends ZodTypeAny,
  TBody extends ZodTypeAny,
> {
  name: string;                          // 'audit' / 'dashboard' / ...
  service: TService;                    // 要塞进 DI 容器的 service class
  controller?: TController;             // 可选 controller(只读服务可以无 controller)
  querySchema?: TQuery;                 // GET query zod schema
  bodySchema?: TBody;                   // POST/PATCH body zod schema
  guards?: Type<CanActivate>[];         // 默认 [],可挂 LicenseCapabilityGuard 等
  exportedProviders?: Provider[];       // 默认 [service]
  global?: boolean;                     // 默认 false
  zodValidationPipe?: new (...args: never[]) => ZodValidationPipe;
}

export function createFeatureModule<
  TService extends Type<unknown>,
  TController extends Type<unknown> | undefined,
  TQuery extends ZodTypeAny | undefined,
  TBody extends ZodTypeAny | undefined,
>(opts: CreateFeatureModuleOptions<TService, TController, TQuery, TBody>): DynamicModule;
```

## 设计要点

1. **不引入新依赖** —— 用 `@nestjs/common` 已有的 `DynamicModule` + `Type<unknown>` 实现,无需 `@golevelup/nestjs-*` 或同类包。
2. **零热路径改动** —— 不修改任何已存在的 controller / service / module;`createFeatureModule` 是**新基础设施**,使用与否由调用方决定。
3. **类型推导** —— 工厂利用 `Parameters<typeof TService>[...]` 反推 service 构造器类型,让调用方拿到 `TService` 的 token 时仍有完整类型。
4. **可演进** —— 后续 stage 可以把守卫 / middleware / interceptor 作为可选字段加进 options;当前阶段只覆盖最常用的 6 个字段。

## 文件清单

| 路径 | 类型 | 内容 |
| --- | --- | --- |
| `apps/nestjs-backend/src/factory/create-feature-module.ts` | 新增 | 工厂本体 |
| `apps/nestjs-backend/src/factory/create-feature-module.spec.ts` | 新增 | vitest 单测,覆盖 4 种典型形态(纯服务 / 服务+controller / 带守卫 / 全局模块) |
| `apps/nestjs-backend/src/factory/index.ts` | 新增 | barrel |
| `apps/nestjs-backend/src/features/audit/audit.module.ts` | 微调 | 把 `AuditModule` 改为用 `createFeatureModule` 描述(等价改写,行为不变,作为工厂首个调用样例) |
| `docs/comet/changes/2026-08-26-r1-t04-di-factory/brief.md` | 新增 | 本文件 |

> 微调 `audit.module.ts` 只为给工厂提供"首调用"验证:**改写后行为不变**,且 `apps/nestjs-backend/test/r1-t03-audit-frontend-bridge.e2e-spec.ts` 必须继续绿。

## 验收项(7 条)

- **T04-V01**: `createFeatureModule` 工厂存在且导出,签名符合 brief。
- **T04-V02**: 单测覆盖 4 种典型形态且全绿(纯 service / service + controller / 带 guards / global)。
- **T04-V03**: `apps/nestjs-backend/src/factory/index.ts` barrel 导出工厂。
- **T04-V04**: `audit.module.ts` 改用工厂后,**所有现有 audit 测试**(T-03 的 e2e + audit 模块自身的 spec)继续通过,**行为零变化**。
- **T04-V05**: `tsc --noEmit` 0 条新增错误(相对 Round 26 baseline 206 条)。
- **T04-V06**: `vitest run apps/nestjs-backend/test/r1-t03-audit-frontend-bridge.e2e-spec.ts` → 3 / 3 通过。
- **T04-V07**: 零新 npm 依赖;`package.json` + `pnpm-lock.yaml` 未变;`grep -E '^  "@teable/(sdk|openapi|core|formula|ui-lib)'` 与 base 一致。

## 非目标

- 不强制把现有 feature 重构成工厂(那将是大范围改动,违反"零热路径改动"红线)。后续 wave 启动时再决定是否渐进迁移。
- 不引入 `reflect-metadata` / `inversify` 等 DI 容器替代方案。
- 不写 dead code;若没有调用方,工厂只用于 `audit.module.ts` 一个示例,但 spec 必须证明工厂能覆盖 4 种形态。

## 风险

- **类型推导极限**:复杂泛型可能让 `tsc` 变慢。当前 spec 控制类型参数 ≤ 6,应可承受。
- **破坏 `reflect-metadata` 行为**:NestJS 需要 service 装饰器元数据,工厂**不能绕过** `@Injectable()`,只是把 `Module({ providers, exports, controllers })` 这层用函数生成。
- **测试覆盖**:`AuditModule` 改写后必须用真实 `NestFactory.create` 跑一遍,确保 DI 容器正确装配 service + controller;不能仅依赖 `Test.createTestingModule({ providers: [...] })`。

## 红线

- AGPL-3.0,所有源代码在本仓库。
- 零新 npm 依赖。
- 零热路径改动:`audit.controller.ts` / `audit.auth.service.ts` / `audit.interceptor.ts` 等不改;只改 `audit.module.ts` 的**装配方式**。
- 不能删除 T-03 已落地的任何文件 / 测试。