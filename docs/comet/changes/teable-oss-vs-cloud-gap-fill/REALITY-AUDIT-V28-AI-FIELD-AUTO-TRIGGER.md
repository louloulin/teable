# Teable OSS vs Cloud V28 — AI Field 记录写入自动触发

**审计日期**：2026-09-02（Asia/Shanghai）  
**目标**：完成 V27 遗留的“记录写入时自动触发 AI Field 并回写目标字段”。  
**验证环境**：NestJS 127.0.0.1:3000、PostgreSQL 127.0.0.1:42345、MiniMax-M3 OpenAI-compatible API。

## 结论

V27 已能通过管理员 `POST /runs` 真实调用 MiniMax，但记录创建/更新不会触发 V26 `AiField` 管理配置。V28 在不修改 record create/update 热路径的前提下，接入现有事件系统：

- 监听 `TABLE_RECORD_CREATE` / `TABLE_RECORD_UPDATE`。
- 兼容 Open API 发出的 `OPERATION_RECORDS_CREATE` / `OPERATION_RECORDS_UPDATE`。
- 按 `sourceFieldIds` 拼接输入文本，只在来源字段变化时执行 update。
- 调用 V27 的真实 provider 执行逻辑。
- 通过既有 `RecordModifyService.simpleUpdateRecords` 回写目标字段。
- 自动忽略目标字段不是单行文本/长文本的错误配置。
- AI 自己回写目标字段产生的后续 update 不会再次触发，避免递归调用。

## 实现位置

主要改造位于 `apps/nestjs-backend/src/features/ai-field/ai-field.auth.service.ts`：

| 能力 | 实现 |
|---|---|
| 记录事件监听 | `@OnEvent` 监听 table 和 operation 两组事件 |
| 配置查询 | `meta.table_meta` + `aiField` 表 |
| 来源字段过滤 | `sourceFieldIds` 与记录变更字段求交集 |
| 真实模型调用 | 复用 `executeRun()` → `AiService.generateText()` |
| 目标字段回写 | `RecordModifyService.simpleUpdateRecords()` |
| 类型守门 | 仅允许 `singleLineText` / `longText` |
| 递归保护 | update 只处理 source 字段发生变化的记录 |

模块依赖已在 `apps/nestjs-backend/src/features/ai-field/ai-field.module.ts` 接入 `RecordModifyModule`。

## Cloud 行为对比

| Cloud AI Field 能力 | V27 | V28 |
|---|---:|---:|
| 管理 CRUD/UI | ✅ | ✅ |
| 手动真实运行 | ✅ | ✅ |
| 创建记录自动生成 | ❌ | ✅ |
| 更新来源字段自动重新生成 | ❌ | ✅ |
| 写回目标字段 | ❌ | ✅ |
| 来源字段未变化时跳过 | ❌ | ✅ |
| AI 回写递归保护 | ❌ | ✅ |
| 非文本目标字段安全处理 | ❌ | ✅ |
| Score/Image Generation | ❌ | ❌，仍明确为未完成 |

V26/V27 的 AI Field 行为层约 80%，在纳入记录写入自动触发、回写和递归安全后，核心文本 AI Field 约 **90%**。仍不能宣称 Cloud 全部行为 100% 等价，因为 Score、Image Generation、重试/幂等策略和更复杂的 response schema 尚未完成。

## 自动化验证

### 单元测试

```text
ai-field.auth.service.spec.ts   27 passed
ai-field.service.spec.ts         27 passed
ai-setting.auth.service.spec.ts   8 passed
合计：62 passed
```

新增覆盖：

1. 记录创建触发真实模型并回写目标字段。
2. 来源字段更新触发真实模型。
3. 仅目标字段更新不会重复触发。
4. MiniMax gateway model key 和 token/run 持久化。

### 构建

```text
pnpm build
webpack 5.90.1 compiled successfully
```

### 真实端到端

使用真实管理员登录、MiniMax-M3 和真实 Base/table：

```text
POST /api/table/tblLxvWC26Cyv08cotd/record
HTTP 201
recordId=recvbye9TNjP7Budgin

最终读取目标文本字段：非空，内容来自 MiniMax 摘要。
automatic_ai_field_error=none
```

同时验证了历史错误配置：目标字段类型为 `number` 时，监听器输出明确的 incompatible-target 警告并跳过，不再调用模型、不再产生数据库类型错误。

## 当前真实进度

- Enterprise readiness 声明/接线层：80/80 capability，46/46 business parity，14/14 gap coverage（沿用既有审计，不能替代行为验证）。
- AI Field 核心文本行为：约 90%。
- 全局企业级行为：仍低于 100%，需要继续对每个商业能力进行真实 API/UI/DB 验证。
- 全包 `tsc --noEmit` 仍受仓库既有跨模块历史类型错误阻塞；本轮涉及 AI Field 的定向测试与 Nest build 均通过。

## 下一阶段

1. 为自动触发增加幂等键、并发限制、失败重试和 rate-limit 状态。
2. 将自动触发 run 与 `AiFieldRun` usage 统计关联到 record 写入请求上下文。
3. 增加模板库选择和自定义 prompt 的 UI/HTTP 合同验证。
4. 评估 Score、Image Generation 的 OSS 商业版边界，不用 readiness 字段冒充已实现。
5. 继续审计 App Builder、权限矩阵、SSO、审计导出等模块的真实行为差距。
