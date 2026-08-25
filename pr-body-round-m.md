## Wave M (Round 18) — Runtime wiring + Controller/Guard — 完成

Stages 90–94 全部落地，所有测试通过并已推送到 `comet/teable-oss-vs-cloud-gap-fill` 分支。

### 新增模块

| Stage | 名称 | 文件数 | 测试数 |
| --- | --- | --- | --- |
| 90 | module-wiring — feature module 注册中心 | 5 | 19 |
| 91 | controller-factory — 统一 CRUD controller 脚手架 | 5 | 18 |
| 92 | interceptor-guard — auth / error / audit 拦截 + guard | 5 | 24 |
| 93 | openapi-metadata — `/api/explorer` 路由元数据聚合 | 5 | 21 |
| 94 | e2e-test-utils — e2e 测试夹具 + 断言 helper | 5 | 31 |
| **合计** | | **25** | **113** |

### 累计状态（Wave J→L→M）

- **模块总数**：20（J5+K5+L5+M5）
- **新增代码行**：约 5.6k
- **累计测试数**：约 3.7k passing
- **Prisma 模型新增**：ModuleEntry、ControllerSpec、GuardAudit、OpenApiOperation、TestFixture、TestCallLog（共 6 个）
- **PR 状态**：[louloulin/teable#1](https://github.com/louloulin/teable/pull/1) 已自动更新

### Wave M 关键设计

- **module-wiring** 暴露 `FEATURE_MODULE_NAMES`（15 模块名）+ `validateEntry` 双闸门（registered-but-no-controller、guarded-without-controller）。
- **controller-factory** 把 controller 抽成 `IControllerSpec / IRouteSpec`，路由表持久化到 `ControllerSpec`，Stage 92/93 直接消费同一份表。
- **interceptor-guard** 串联 Stage 92（认证）+ Stage 93（审计），形成 trace-id 闭环：`GuardAudit.traceId` ↔ `IErrorEnvelope.traceId`。
- **openapi-metadata** 把 Stage 91 的 route spec 自动转 OpenAPI 元数据（verb / path / auth / response schemas），不依赖 controller 装饰器反射。
- **e2e-test-utils** 给 Stage 90–93 的 feature module 提供 fixture 回放（seed-based）+ 断言 helper（equal/contains/matches）+ 调用日志，方便下游 stage 串 e2e。

### 后续建议（不强制）

- Round 19：把 Stage 90–94 的 NestJS 服务在 AppModule 注册（依赖注入 wiring），补最小 main.ts bootstrap。
- Round 20：补一组真 e2e（基于 Stage 94 fixture 的 supertest + jest 全链路 smoke）。
- Round 21：把 Stage 91/93 的 route 元数据导出成静态 `openapi.json` + UI。

完整代码已就绪，下一波等待用户指令。