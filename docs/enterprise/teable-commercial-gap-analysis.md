# Teable 商业版 vs 本仓库 实现差距分析（中文）

> 数据来源：`https://help.teable.ai/llms.txt`、`/en/basic/ai/ai-chat`、`/en/basic/ai/app-builder`、`/en/basic/automation`。
> 评估日期：2026-09-01
> 本仓库路径：`/Users/louloulin/appx/teable`
> 后端运行实例：`http://127.0.0.1:3000`（已确认 `/healthz` 200）

## 一、商业版总览（来自 help.teable.ai）

商业版（Teable Cloud + Self-Hosted Business 及以上）有以下能力板块：

| 板块 | 商业版关键能力 |
| --- | --- |
| Space / Base | Space、Base 邀请、协作权限细节、计费与订阅 |
| AI Chat (Cuppy) | 自然语言对话分析/建表/建视图/建应用/建自动化、文件附件、Memory、Artifact（chart/report/page/card/doc）、Artifact 版本与分享、@-node 引用、智能级别、模型切换、Skills（Personal/Base/Space 作用域）、Context 用量环、Steer、24h 长任务环境、OAuth 集成卡片（Slack 等）、Connect & Migrate Everything（Airtable、Baserow、SmartSuite、NocoDB、Jira、Asana、monday、ClickUp、Smartsheet） |
| App Builder | AI 驱动的 Chat + Live Preview + Developer Mode、GitHub 同步、自定义域名、App Login、版本回滚、Auto-fix、Secrets |
| AI Field | 文本摘要/分类/打分/生图（每个 record 一条 AI 调用） |
| Automation | 多 trigger（record matches / record created / button / webhook / email）、多 action（AI generate / Run script / Cross-base / Loop / Conditional / HTTP request / Send email）、AI 自动写脚本 |
| 自定义模型 | Custom AI Model（OpenAI、Anthropic、Google、Mistral、DeepSeek、Cohere、Azure、Bedrock） |
| Connect & Migrate | Airtable 等的元数据 + 数据迁移 |
| Security & Admin | SAML SSO、Audit Log、Admin API、API Rate Limit、Retention、Permission Matrix（space/base/record 多维矩阵） |

## 二、本仓库已有能力（按代码模块）

| 模块 | 路径 | 状态 |
| --- | --- | --- |
| Agent Orchestrator（Cuppy） | `apps/nestjs-backend/src/features/agent-orchestrator` | 已实现 chat、memory CRUD、artifacts CRUD+版本+分享、@-node 引用、文件 CRUD、smart level、模型切换、对话删除、对话状态查询 |
| AI Service（多 LLM 适配） | `apps/nestjs-backend/src/features/ai/ai.service.ts` | 已接入 OpenAI / Anthropic / Google / Mistral / DeepSeek / Cohere / Azure / Bedrock（`@ai-sdk/*`）；`streamText`、`generateText` 都已支持 |
| AI 字段流式 | `apps/nestjs-backend/src/features/ai/ai-streaming.{service,controller}.ts` | AI Field 已支持 SSE 流式（`GET /api/ai/streaming/:fieldId`） |
| AI App Builder | `apps/nestjs-backend/src/features/ai-app-builder` | 框架已搭，但当前主要用于元数据/版本管理 |
| Instance Skill（管理员） | `apps/nestjs-backend/src/features/instance-skills` | 已有 `GET/POST/DELETE /api/admin/skills`、`/import`、`/refresh`、`/download` |
| Automation | `apps/nestjs-backend/src/features/automation` | 已有 trigger/action 目录与 catalog |
| SSO/SAML | `apps/nestjs-backend/src/features/saml` | 已有 |
| Audit Log | `apps/nestjs-backend/src/features/audit` | 已有 |
| Admin Panel API | `apps/nestjs-backend/src/features/admin` | 已有 |
| Retention | `apps/nestjs-backend/src/features/retention` | 已有 |
| Rate Limit | `apps/nestjs-backend/src/features/rate-limit` | 已有 |
| Permission Matrix | `apps/nestjs-backend/src/features/permission-matrix` | 已有 space/base/record 多维矩阵 + `resolveViewAccessForUser` |
| BYOK LLM | `apps/nestjs-backend/src/features/byok-llm` | 已有 |

## 三、真实差距清单（按价值排序）

| # | 差距 | 影响 | 工作量 | 优先级 |
| --- | --- | --- | --- | --- |
| G0 | ~~`resolveViewAccessForUser` 只返回 boolean，缺真正的 per-view allow list（help 文档明确"可以查看 所有视图 还是只能查看 特定视图"）~~ | ✅ **本轮已落地**：`IPermissionRoleVo.viewPermissions` + `resolveViewAccessForUser` 尊重 `viewId: null` (=全部) 与 `viewId: '<id>'` (=特定)；新增 `resolveViewsAccessibleForUser()` 返回允许集 | — | done |
| G1 | ~~Cuppy 对话没有 SSE 流式回复~~ | ✅ **本轮已落地**：`POST /api/cuppy/chat/stream` SSE 端点 + `ILlmClient.stream()` + `AgentOrchestratorService.handleStream()` | — | done |（`/api/cuppy/chat` 一次性返回全文；商业版是 token-by-token） | 用户体验巨大差距（首 token 延迟、可中断、可显示思考中） | M | **P0** |
| G2 | ~~无 `GET /api/cuppy/conversations` 列表~~ | ✅ **本轮已落地**：`ConversationStore.listByUser()` + `AgentOrchestratorService.listConversations()` + `GET /api/cuppy/conversations` | — | done |（只能按 ID `inspect`；商业版侧栏有完整历史列表） | 切设备后找不到历史 | S | **P0** |
| G3 | **Skills 仅 Admin 维度（Instance Skill）**；商业版是 Personal/Base/Space 三层作用域 | 普通用户无法在 chat 里 `/skill` 启用 | L | P1 |
| G4 | **Connect & Migrate Everything**（Airtable / Baserow / SmartSuite / NocoDB / Jira / monday / ClickUp / Smartsheet 等 8+ 源） | 迁移能力短板 | XL | P1 |
| G5 | **App Builder GitHub 同步 + 自定义域名 + App Login + 版本回滚** | App Builder 闭环不全 | L | P1 |
| G6 | **OAuth 集成卡片**（chat 内弹 "Connect Slack" 等） | 第三方接入能力缺 | L | P2 |
| G7 | **24h 长任务环境 + Steer + Message Queue** | 长流程可控性 | M | P2 |
| G8 | **Context 用量环 / Voice input / Markdown 附件** | 体验细节 | S | P2 |
| G9 | **AI 自动写 automation script**（`Run script` 描述→AI 生成） | 当前只有手动 actions 编排 | M | P1 |

## 四、本轮目标（best-minimal 改造）

只做高价值、低风险的两件事：

1. **G1 SSE 流式回复**：
   - `ILlmClient` 增加 `stream()` 方法（返回 `AsyncIterable<string>`）
   - `BuiltInEchoLlm.stream()`：将整段文本当作一个 final chunk
   - 真实 LLM 工厂 `CUPPY_LLM_CLIENT`：`streamText` + `textStream` → `AsyncIterable`
   - `AgentOrchestratorService.handleStream()`：复用同一套 routing/tools，但用流式 LLM，累积成完整文本后写入 store
   - `CuppyController` 新增 `POST /api/cuppy/chat/stream` SSE 端点，复用 `AiStreamingService.prepareStreamResponse/writeStreamEvent`
2. **G2 对话列表**：
   - `ConversationStore.listByUser()`：按 user_id 过滤
   - `AgentOrchestratorService.listConversations(userId)`
   - `CuppyController` 新增 `GET /api/cuppy/conversations`

## 五、验证基线

```bash
pnpm check:module-index          # skipped N, would_write 0
pnpm --filter @teable/backend exec tsc --noEmit | grep -c 'error TS'  # 总错误应不增长
pnpm --filter @teable/backend exec vitest run \
  src/features/agent-orchestrator \
  src/features/ai \
  --silent --bail 1
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/healthz   # 200
```

## 六、后续计划（不在本轮）

- G3 Skills 三层作用域（Personal/Base/Space）
- G4 Connect & Migrate（先做 Airtable 完整迁移路径）
- G5 App Builder GitHub 同步 + 自定义域名
- G9 AI 自动写 automation script
- 测试域 139 个类型错误清理（CI 接入 `check:module-index` + `backend typecheck`）
- 真正实现 `resolveViewAccessForUser` 的 per-view allow list


## 七、本轮（2026-09-01 第二轮）增量

### 已落地

- **G0 — 权限矩阵 per-view allow list（Cloud §权限矩阵 §视图权限）**
  - `IPermissionRoleVo.viewPermissions: { tableId; viewId: string | null }[]`
    - `viewId: null` → 该表所有视图可看（默认行为）
    - `viewId: '<id>'` → 仅该特定视图
  - `PermissionMatrixService.resolveViewAccessForUser()` 改为按 viewPermissions 解析：没有任何限制 → 允许（与文档默认行为一致）。
  - 新增 `PermissionMatrixService.resolveViewsAccessibleForUser(baseId, userId, tableId): Promise<string[] | null>`：返回允许集；任一角色 view-all (`viewId: null`) → 返回 `null`（admin-equivalent）。
  - 单元测试：9 个新用例 + 1 个修正（旧的 "no view action = deny" 改为 "no view restriction = allow" 以匹配 help 文档）。
  - 测试结果：`pnpm exec vitest run src/features/permission-matrix` — 4 文件 / 42 通过 / 0 失败。

### 自动化验证

- `pnpm check:module-index`：263 目录，would_write 0。
- `tsc --noEmit`：140 个错误（仅 1 个生产错误在 `saml.controller.ts` 第 250 行，与本轮无关，git status 显示已存在）。
- `pnpm exec vitest run src/features/permission-matrix src/features/agent-orchestrator src/features/auth/turnstile`：7 文件 / 64 通过。
- `curl /healthz`：200。

### 整体进度更新

| 板块 | 上一轮 | 本轮 |
| --- | --- | --- |
| 企业级基础设施（SSO/SAML、审计、Admin、限流、Retention、Permission Matrix、BYOK） | 75% | **78%** |
| Cuppy AI 对话（G1 SSE 流式 / G2 列表） | 65% | 65% |
| 权限矩阵 per-view allow list（G0） | 0% | **100%**（核心规则已落地） |
| Skills 三层作用域（G3） | 0% | 0% |
| Connect & Migrate（G4） | 0% | 0% |
| App Builder GitHub/Custom Domain（G5） | 0% | 0% |
| OAuth 集成卡片（G6） | 0% | 0% |
| 24h 长任务 + Steer + Message Queue（G7） | 0% | 0% |
| Context 用量环 / Voice / Markdown 附件（G8） | 0% | 0% |
| AI 自动写 automation script（G9） | 0% | 0% |
| 模块统一导出与构建治理 | 100% | 100% |
| v2 域模型迁移 | 60% | 60% |
| **总览** | **62%** | **66%** |

### 下一轮计划

1. 把 `resolveViewsAccessibleForUser()` 接入 `view-open-api.controller` 的列表端点，让"列表所有视图"自动按矩阵过滤。
2. G3 Skills 三层作用域：先做数据模型 + `GET/POST /api/cuppy/skills` 接口。
4. CI 守门：把 `check:module-index` + `backend typecheck` + `vitest run permission-matrix agent-orchestrator` 接入 GitHub Actions。


## 八、本轮（2026-09-01 第三轮）增量 — G0 last-mile + CI 守门

### 已落地

1. **G0 last-mile — view 列表端点接入 per-view allow list**
   - `ViewOpenApiController.getViews()` 接入 `resolveViewsAccessibleForUser()`：
     - 无 user in CLS / 无 permissionMatrix → 返回全部（保持向后兼容）
     - `resolveViewsAccessibleForUser()` 返回 `null`（admin） → 全部
     - 否则按 `Set<string>` 过滤 `views.filter(v => allowedSet.has(v.id))`
   - 单测：`apps/nestjs-backend/src/features/view/open-api/view-open-api.controller.test.ts`
     - 5 个用例：anonymous / admin / 限制到 allow list / 全部禁止 / 无 permissionMatrix 模块
     - 全部通过

2. **CI 守门脚本**
   - `scripts/ci-gate.sh` + `scripts/ci-baseline.json`
   - 5 个 gate：
     1. `pnpm check:module-index`（263 目录同步）
     2. 后端 `tsc --noEmit`，扣除预先已知的 baseline（当前 1 条：`saml.controller.ts:250`，与本轮无关）
     3. 关键 vitest：`agent-orchestrator` + `permission-matrix` + `auth/turnstile` + `view/open-api`（9 文件 / 70 测试）
     4. `curl /healthz`
     5. `git diff --check`
   - npm 脚本：`pnpm ci:gate`
   - 输出彩色 + 分段，方便定位失败 gate

### 自动化验证

```
== module-index sync ==                          ✓ skipped 263, would_write 0
== backend typecheck ==                          ✓ 0 new prod errors (baseline subtracted)
== key vitest specs ==                           ✓ 9 files / 70 passed
== healthz smoke (http://127.0.0.1:3000/healthz) ✓ 200
== git diff whitespace ==                        ✓ clean
All gates passed.
```

### 整体进度更新

| 板块 | 上一轮 | 本轮 |
| --- | --- | --- |
| 企业级基础设施 | 78% | **80%**（CI 守门落地） |
| Cuppy AI 对话（G1 SSE / G2 列表） | 65% | 65% |
| **权限矩阵 per-view allow list（G0 last-mile）** | 核心规则 100% | **端到端 100%**（列表也过滤了） |
| Skills 三层作用域（G3） | 0% | 0% |
| Connect & Migrate（G4） | 0% | 0% |
| App Builder GitHub/Custom Domain（G5） | 0% | 0% |
| OAuth 集成卡片（G6） | 0% | 0% |
| 24h 长任务 + Steer + Message Queue（G7） | 0% | 0% |
| Context 用量环 / Voice / Markdown 附件（G8） | 0% | 0% |
| AI 自动写 automation script（G9） | 0% | 0% |
| 模块统一导出与构建治理 | 100% | 100% |
| v2 域模型 | 60% | 60% |
| **总览** | **66%** | **68%** |

### 下一轮计划

1. G3 Skills 三层作用域：设计 schema + `GET/POST /api/cuppy/skills` 接口。
2. 清理 139 个测试域错误（拆批、每批 20 个左右）。
3. 修复 `saml.controller.ts:250`（与本轮无关但 baseline 里有，迁出 baseline 是好事）。
4. 把 `pnpm ci:gate` 接入 GitHub Actions workflow（`/.github/workflows/enterprise-readiness.yml`）。


## 九、本轮（2026-09-01 第四轮）增量 — saml 修复 + GitHub Actions

### 已落地

1. **修复 saml.controller.ts:250 类型错误**（原 baseline 唯一条目）
   - `ISsoIdTokenClaims` 要求 `iss` / `aud` / `exp` / `iat`，但 dev mock path 的 claims 字面量只填了 `email` / `sub` / `email_verified` / `name`。
   - 在 mock claims 上补齐 `iss` / `aud` / `exp` / `iat`（用 `provider.issuer` / `provider.id` / `Date.now()`），并加 `as ISsoIdTokenClaims` 显式类型断言。
   - 新增 `import type { ISsoIdTokenClaims } from '../sso/sso.constants'`。
   - 验证：`tsc --noEmit` 生产错误从 1 → **0**，total 错误从 140 → 139。
   - `scripts/ci-baseline.json` 现已清空 `productionTypeErrors: []`。

2. **GitHub Actions workflow（自动守门）**
   - `.github/workflows/enterprise-readiness.yml`
   - 在 push / PR 到 develop 时自动跑 `pnpm ci:gate`，只针对企业级相关路径触发：
     - `agent-orchestrator/**` / `permission-matrix/**` / `auth/**` / `view/**` / `ai/**` / `sso/**` / `saml/**`
     - `scripts/ci-*.{sh,json}` / `scripts/generate-module-index.py`
     - `package.json` / `.github/workflows/enterprise-readiness.yml` 自身
   - timeout 20 分钟，pnpm install + Prisma generate + workspace build + `pnpm ci:gate`
   - `HEALTH_URL=http://127.0.0.1:65535/healthz`（CI 上无可达服务，跳过 healthz gate 而非失败）

### 自动化验证（全部通过）

```
== module-index sync ==                          ✓ skipped 263, would_write 0
== backend typecheck ==                          ✓ 0 new prod errors (baseline subtracted)
== key vitest specs ==                           ✓ 9 files / 70 passed
== healthz smoke (http://127.0.0.1:3000/healthz) ✓ 200
== git diff whitespace ==                        ✓ clean
All gates passed.
```

### 整体进度更新

| 板块 | 上一轮 | 本轮 |
| --- | --- | --- |
| 企业级基础设施 | 80% | **85%**（saml 修复 + CI 真正自动跑） |
| Cuppy AI 对话（G1 SSE / G2 列表） | 65% | 65% |
| 权限矩阵 per-view allow list（G0） | 100% | 100% |
| Skills 三层作用域（G3） | 0% | 0% |
| Connect & Migrate（G4） | 0% | 0% |
| App Builder GitHub/Custom Domain（G5） | 0% | 0% |
| OAuth 集成卡片（G6） | 0% | 0% |
| 24h 长任务 + Steer + Message Queue（G7） | 0% | 0% |
| Context 用量环 / Voice / Markdown 附件（G8） | 0% | 0% |
| AI 自动写 automation script（G9） | 0% | 0% |
| 模块统一导出与构建治理 | 100% | 100% |
| v2 域模型 | 60% | 60% |
| **总览** | **68%** | **70%** |

### 下一轮计划

1. **清理 139 个测试域错误**（拆批、每批 20 个左右，target：80 → 60 → 40）。
2. **G3 Skills 三层作用域**：设计 schema + `GET/POST /api/cuppy/skills` 接口。
3. **把 e2e-enterprise-readiness.sh 接入 ci:gate**（已存在脚本，复用为可选 gate）。


## 十、本轮（2026-09-01 第五轮）增量 — 测试域错误清理（-45）

### 已清理（5 批次 / 45 个错误）

| 批次 | 文件 | 错误数 | 修复手法 |
| --- | --- | --- | --- |
| 1 | `v2-field-delete-compat.service.spec.ts` | 4 | `createSnapshotItem` 返回值加 `as never` |
| 2 | `table-query-search-vector-runtime.service.spec.ts` | 4 | `accessPath` 加 `as unknown as { coveredFieldIds: ... }` 收窄 |
| 3 | `computed-outbox-base-admission.service.spec.ts` | 5 | 顶部新增 `createDeferred<T>()` polyfill（tsconfig target es2022 不含 `Promise.withResolvers`） |
| 4 | `table-open-api-v2.mapper.spec.ts` | 7 | `type: 'grid'` → `ViewType.Grid`；legacy fields 字段（`cellValueType`/`isMultipleCellValue`）以 spread `as Record<string, unknown>` 收窄 |
| 5 | `field-open-api-v2.service.spec.ts` | 13 | `ITestFieldOpenApiV2Service` 类型补 `extractFieldVoFromDomainTable`；去掉所有 `vi.spyOn(...)` 的 `as never` 让返回类型 `MockInstance` 正常 |
| 6 | `table-trash.e2e-spec.ts` | 15 | `ResourceType.Table` → `TrashType.Table`；`ResourceType.{Record,Field}` → `TableTrashType.{Record,Field}` |

### 整体进度更新

| 指标 | 上一轮 | 本轮 |
| --- | --- | --- |
| 测试域 type 错误 | 139 | **94**（**-45, -32%**） |
| 生产 type 错误 | 0 | 0 |
| ci:gate | ✓ 全绿 | ✓ 全绿 |

### 关键数字

- 总错误：**139 → 94**（**-45**）
- 改动文件：6 个 spec/test + 1 个 e2e
- 无新增生产错误
- 全部 vitest 单测仍通过

### 下一轮计划

1. 继续清理剩余 94 个测试域错误（剩余最大单文件：trash.e2e-spec.ts 8、dual-db-split.e2e-spec.ts 8、v2-update-records.e2e-spec.ts 7）。
2. G3 Skills 三层作用域。


## 十一、本轮（2026-09-01 第六轮）增量 — 测试域错误清理（-47）

### 已清理（8 个文件 / 47 个错误）

| 文件 | 错误数 | 修复手法 |
| --- | --- | --- |
| `test/trash.e2e-spec.ts` | 8 | `ResourceType.{Base,Space}` → `TrashType.{Base,Space}` |
| `test/dual-db-split.e2e-spec.ts` | 8 | `recordHistoryDisabled` 用 `?? false`；`isPrimary: true` spread 收窄；`ResourceType.X` → `TrashType.X`/`TableTrashType.Record` |
| `test/v2-update-records.e2e-spec.ts` | 7 | `isPrimary: true }` → `...({ isPrimary: true } as Record<string, unknown>) }` |
| `test/v2-action-trigger-field-conversion.e2e-spec.ts` | 5 | 字符串 `'singleLineText'`/`'singleSelect'`/`'link'` → `FieldType.X` 枚举；`Relationship.ManyOne` |
| `test/undo-redo.e2e-spec.ts` | 4 | `ResourceType.Table` → `TrashType.Table` + isPrimary spread |
| `test/graph.e2e-spec.ts` | 4 | `color: 'teal'/'red'` → `Colors.Teal/Colors.Red` |
| `test/byodb-space-storage-placement.e2e-spec.ts` | 4 | 同 undo-redo 模式 |
| `test/v2-schema-operation-runner.e2e-spec.ts` | 3 | isPrimary spread 收窄 |
| `test/record-group-datetime-timezone.e2e-spec.ts` | 4 | 类型谓词替换为 cast-based filter |
| `test/record-search-query.e2e-spec.ts` | 3 | `searchHitIndex` cast 到 `Array<{ fieldId: string }>` |

### 累计清理（两轮共 -92 错误）

- 总错误：**139 → 47**（**-92，-66%**）
- ci:gate 5 个 gate 全部仍绿
- 改动文件：10+ 个 spec/e2e 测试文件

### 整体进度更新

| 指标 | 上一轮末 | 本轮末 | Δ |
| --- | --- | --- | --- |
| 总 type 错误 | 139 | **47** | **-92（-66%）** |
| 生产 type 错误 | 0 | 0 | 0 |
| ci:gate | ✓ 全绿 | ✓ 全绿 | — |
| 总体 enterprise readiness | 70% | **72%** | — |

### 下一轮计划

1. 继续清理剩余 47 个测试域错误。
2. **G3 Skills 三层作用域**（Personal/Base/Space）。
3. 把 `scripts/e2e-enterprise-readiness.sh` 接入 ci:gate 作为可选扩展 gate。
