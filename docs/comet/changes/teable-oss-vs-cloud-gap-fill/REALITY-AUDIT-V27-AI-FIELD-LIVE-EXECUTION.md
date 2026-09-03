# Teable OSS vs Cloud V27 — AI Field 真实 LLM 执行闭环

**审计日期**：2026-09-02（Asia/Shanghai）  
**目标**：将 V26 暴露的 AI Field stub 执行，替换为可由管理员网关驱动的真实模型调用。  
**验证环境**：NestJS 127.0.0.1:3000、PostgreSQL 127.0.0.1:42345、MiniMax OpenAI-compatible API。

## 结论

V26 的 AI Field 已经有管理 API 和管理 UI，但 `POST /api/admin/ai-field/:aiFieldId/runs` 仍然只记录 `stubOutput`，Cloud 真实执行能力不能算完成。

V27 已完成以下最小闭环：

1. 普通 `runs` 请求会解析 Base、Table、Field、operation、config 和 prompt。
2. 默认模型通过 `aiGateway@<model>@teable` 进入管理员 AI Gateway。
3. MiniMax 使用项目已有的 `OPENAI_COMPATIBLE` provider 和 Chat Completions 协议。
4. 模型输出经过 operation guard 后写入 `AiFieldRun`。
5. token、状态、错误信息、开始/完成时间和实际耗时持久化。
6. `stubOutput` 仍保留，仅用于 dry-run 和确定性单测，不影响真实路径。

## 真实能力对比

| 能力 | V26 | V27 之后 |
|---|---:|---:|
| AI Field CRUD | ✅ | ✅ |
| run CRUD/usage/template API | ✅ | ✅ |
| 管理 UI `/admin/ai-field` | ✅ | ✅ |
| 真实 MiniMax-M3 模型调用 | ❌ | ✅ |
| 模型失败记录 | ⚠️ 仅有 stub 记录 | ✅ `status=failed` + `errorMessage` |
| token 统计 | 估算 | ✅ prompt/completion token 估算并持久化 |
| 执行耗时 | 0/未完成时间 | ✅ 实际 `durationMs` + `finishedAt` |
| 记录写入时自动触发 | ❌ | 仍未实现 |

## Cloud §field/ai/ai-field 行为对齐

根据现有 Cloud 能力描述，V27 之后该子模块按功能权重估算约 **80%**：

- Summarize：真实 provider、guard、持久化完成。
- Translate：真实 provider、guard、持久化完成。
- Classify：prompt 与 guard 已存在，真实 provider 已接通。
- 自定义模型与 MiniMax-M3：真实配置和调用已接通。
- 记录写入时自动触发：仍是下一步，不是本轮最小改造。
- Score、Image Generation：Cloud-only 能力，OSS 当前仍不应伪装为已完成。

## 关键根因修复

### 1. 网关模型 key

`AiService` 的 `isGatewayModel()` 会解析 `type@model@name`，因此模型 key 必须为：

```text
aiGateway@MiniMax-M3@teable
```

不能写成 `MiniMax-M3@teable`，否则会被当作普通 provider。

### 2. MiniMax 协议

MiniMax 官方接口返回 OpenAI Chat Completions 结构，但 Vercel `createGateway()` 固定走 AI Gateway `/language-model` 协议。V27 复用项目已有 `OPENAI_COMPATIBLE` 分支，避免把错误协议误判为模型故障。

### 3. 运行记录时间

此前 `recordRun()` 虽在内存中构造了 `startedAt/finishedAt`，但 Prisma `create` 没有写入这两个字段。现在运行记录和返回 DTO 都能得到真实时间、耗时和状态。

## 自动化验证证据

### 单元测试

```text
ai-field.auth.service.spec.ts   24 passed
ai-field.service.spec.ts         27 passed
ai-setting.auth.service.spec.ts    8 passed
合计：59 passed
```

覆盖内容包括：真实模型 key、MiniMax gateway 镜像、真实 provider 成功执行、stub dry-run、run 状态、token、usage 和模板 CRUD。

### 构建

```text
pnpm build
webpack 5.90.1 compiled successfully
```

### 真实端到端

使用已登录管理员和 `MiniMax-M3` 网关执行翻译：

```text
POST /api/admin/ai-field/aif_mtjabugw_kfehnkhk/runs
HTTP 201
status=ok
model=MiniMax-M3
promptTokens=21
completionTokens=241
durationMs=3095
finishedAt=2026-09-01T23:19:40.820Z
output=Real AI Field has completed the model call.
```

同时确认日志中没有 `Gateway request failed`、`Invalid error response` 或 `stepModel.doGenerate is not a function`。

## 仍需完成

1. 记录创建/更新时自动触发 AI Field，并将目标字段回写真实 Table record。
2. 统一 AI Field 的模板选择、模板变量和 operation-specific response schema。
3. 增加 record write 事务内的幂等键、失败重试和 rate-limit 处理。
4. 评估 Cloud-only Score/Image Generation 是否纳入 OSS 商业版边界。
5. 继续补齐其他仍未达到行为层对齐的企业模块，而不是只增加 readiness 声明。

## 全局对齐说明

当前仓库存在两组不能混淆的指标：

- **声明/接线层**：enterprise-readiness capability 80/80、Cloud business parity 46/46、gap coverage 14/14，说明模块探测和权限注册较完整。
- **行为层**：AI Field 现已达到约 80%，但自动触发、记录回写、Cloud-only AI 能力仍未完成，因此不能宣称 OSS 与 Cloud 行为 100% 等价。

后端全包 typecheck 仍被仓库既有的约 74+ 个历史类型错误阻塞；本次定向测试和 Nest build 均通过，未把全局历史错误冒充为 V27 成功。
