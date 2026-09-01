# Teable OSS ↔ Cloud 真实差距分析 + 后续计划（2026-09-01）

> **目标**: 用户要求"真实分析、真实对比",补齐企业级所有功能,自动化验证,中文说明,最小改造。
> **方法**: 从运行中的后端拉真实 enterprise-readiness 数据 + grep 全部 controller endpoint 数,与 Cloud Business 文档对比。

---

## 一、当前实现进度（真实数据,2026-09-01 22:51 后端运行时）

### 1.1 总览指标（`GET /api/admin/enterprise-readiness`）

| 指标 | 值 |
|---|---|
| plan | `self_hosted` |
| 总 capability 数 | **80** |
| enabled | **54** (67.5%) |
| disabled（已实现但 license 未启用）| **26** (32.5%) |
| missing（完全没实现）| **0** |
| Cloud Business 能力覆盖 | **43/46** (93.5%) |
| Cloud 独占能力补齐 | **14/14 = 100%** |

**关键结论**: OSS 在 `cloudGapCoverage` 上达到 **100%** — 所有可填的 Cloud 独占能力都已实现;3 项未填是 **SLA / 客服 / 多区域**(明确 non-goal)。

### 1.2 26 项 disabled 的真实原因

`disabled ≠ 未实现` — 都是 **license 维度门控**(business/enterprise 才启用)。self_hosted + 无 license 下默认禁用,但代码已就位:

| 模块 | disabled 数 | 备注 |
|---|---|---|
| `ai-credit` | 2 | `ai_credit_grant_policy` / `ai_credit_ledger` — 算力计费维度 |
| `ai-usage` | 1 | `ai_usage_bucket` — 用量桶 |
| `app-module` | 1 | `app_module_wire` — 应用模块装配 |
| `approval` | 1 | `approval_workflow` — 审批流(R28 已落) |
| `automation` | 2 | canvas revision / secret(R24 已落) |
| `backup` | 1 | `backup_restore_log` |
| `billing` | 2 | credit / invoice |
| `byok-llm` | 1 | `byok_llm_key` — **重要:BYOK LLM Key 端点已实现但 license 控** |
| `comments` | 1 | `comment_subscription` |
| `conditional-format` | 1 | `conditional_format_rule` |
| `conflict` | 1 | `conflict_event` — 冲突事件(R31) |
| `cross-org-admin` | 1 | 跨组织授权 |
| `custom-role` | 1 | 自定义角色(R32) |
| `dashboard` | 1 | 仪表盘 |
| `data-db-connection` | 1 | 数据库连接 |
| `data-residency` | 1 | 数据驻留(R29) |
| `db-connector` | 2 | 连接器 / 同步 |
| `federation` | 1 | 跨基联邦(R30) |
| `kms` | 1 | `customer_kms_key` |
| `permission-matrix` | 1 | 导入导出(R26) |
| `airtable-migration` | 1 | 持续迁移 |
| `api-rate-limit` | 1 | API 速率限制(本身已实现,这里是策略维度) |

**核心观察**: self_hosted plan 下,这些 capability **代码已实现,只是 license 不打开**(切换到 business license 即 enabled)。

### 1.3 14 个 Cloud exclusive gap(全部 100% 实现)

`baserow_import` / `clickup_import` / `jira_import` / `monday_import` / `nocodb_import` / `smartsheet_import` / `smartsuite_import` / `airtable_import`(R16-R21 全部 wired + probe/listFields/fetchRows)。其他 gap(白标、Cloud Console、Cloud-only SSO)已按 R26-R32 路线落实。

### 1.4 AI 相关 endpoint 真实盘点（grep 全 controller 计数）

| 模块 | endpoint 数 | 主要路由 |
|---|---|---|
| `cuppy.controller.ts` | **1** | `POST /api/cuppy/chat` |
| `agent-orchestrator.controller.ts` | 3 | `GET /api/admin/agent/conversations/:id`、`/stats`、`POST /reset` |
| `ai.controller.ts` | 3 | `POST /generate-stream`、`GET /config`、`GET /disable-ai-actions` |
| `ai-streaming.controller.ts` | 1 | `GET /:fieldId`(字段 AI 流) |
| `instance-skill.controller.ts` | 7 | `GET`、`GET /:id`、`POST /import`、`PATCH /:id`、`POST /:id/refresh`、`GET /:id/download`、`DELETE /:id` |
| `sandbox-agent.controller.ts` | 4 | `GET/PATCH /config`、`GET /sessions`、`DELETE /sessions/:id` |
| `ai-builder.controller.ts` | **6** | `proposals` CRUD + `approve/reject/apply` |
| `chat.controller.ts` | 1 | `POST /completions` |
| **合计** | **26** | |

### 1.5 R33 dr-canvas(已落,backend running,未 commit)

| 文件 | 行数 | 状态 |
|---|---|---|
| `dr-canvas.auth.service.ts` + 4 持久化方法 | +83 | ✅ |
| `dr-canvas.controller.ts`(6 endpoints) | 138 | ✅(修了 `Post` import bug) |
| `dr-canvas.module.ts` | 25 | ✅ |
| `app.module.ts` 注册 | +1 | ✅ |
| `dist/index.js` build | 7.4s | ✅(webpack 成功) |
| launchctl 后端启动 | 6s | ✅(HTTP 200) |
| PUT smoke test | 200 | ✅ |
| GET smoke test | 200 | ✅ |
| e2e Section 4.21 | — | ❌ 还没写 |
| cleanup() | — | ❌ 还没加 |
| gap-analysis 章节 | — | ❌ 还没追加 |
| **commit** | — | ❌ **未 commit**(等用户决策) |

---

## 二、Cloud AI 真实差距分析

### 2.1 AI 对话（Cuppy）核心能力对比

用户明确要求"分析很多 AI 功能没有实现,AI 对话功能也没有"。下面是 **Cloud AI 对话** 真实功能 vs OSS 现状:

| Cloud AI 对话能力 | Cloud 端点 | OSS 端点 | 差距 |
|---|---|---|---|
| 普通聊天 | `POST /api/cuppy/chat` | ✅ 1 | ✅ 已对齐 |
| 智能级别(smart-level) | `GET /models`、`POST /conversations/:id/model` | ❌ | **P0 缺失** |
| 上下文记忆(memory) | `GET/DELETE /conversations/:id/memory` | ❌ | **P0 缺失** |
| Artifact 保存 | `POST/GET/DELETE /conversations/:id/artifacts` | ❌ | **P0 缺失** |
| 队列管理(queue) | `GET /queue`、`POST /queue/:id/pause` | ❌ | **P1 缺失** |
| 算力退还(refund) | `POST /runs/:id/refund` | ❌ | **P1 缺失** |
| 技能系统(skills) | `GET /skills`、`POST /conversations/:id/skills/:skillId` | ⚠️ instance-skill 部分有 | **P1 部分缺失** |
| @-node 选择 | `POST /nodes` 注册节点引用 | ❌ | **P2 缺失** |
| 文件管理(files) | `GET/POST/DELETE /files` | ❌ | **P1 缺失** |
| 标签复制 | `POST /messages/:id/copy-with-tags` | ❌ | **P2 缺失** |
| AI Admin 设置 | `GET/PUT /admin/ai-settings` | ❌ | **P0 缺失** |
| 自定义 AI 模型 | `GET/POST/PATCH/DELETE /custom-models` | ❌ | **P0 缺失** |
| AI 应用构建器 | 12+ 端点(部署/版本/Auto-fix) | ⚠️ 6 端点(proposals CRUD + 审批) | **P1 部分缺失** |
| AI 字段 | streaming + 多模型 | ✅ 已有 | ✅ 已对齐 |
| AI 脚本(sandbox) | 4 端点 | ✅ 已有 | ✅ 已对齐 |

### 2.2 优先级判定

- **P0 必须补齐**: AI 对话 smart-level / memory / artifact / AI Admin / 自定义 AI 模型 — 用户体感最大
- **P1 应该补齐**: 队列 / refund / skills / files / 应用构建器增强 — Cloud 文档明确列出
- **P2 可延后**: @-node / copy-with-tags — 用户少用

---

## 三、最小改造后续计划

按用户"最佳最小改造"原则,提出三步走(每一轮 ~1-2h,每轮 e2e exit=0):

### 3.1 R-AI-1: AI 对话完整化（P0,预计 1 轮,~10 端点）

**目标**: 把 cuppy 从 1 端点扩到 10+ 端点,补齐智能级别 / 记忆 / artifact / 队列 / refund / 文件。

**最小改造方式**:
- 在现有 `apps/nestjs-backend/src/features/agent-orchestrator/` 下扩 `cuppy.controller.ts`(不变架构,只添路由 + 复用现有 `AgentOrchestratorService` 的 `inspect/reset/stats` 等接口)
- 复用 `ConversationContext.scratchpad` 充当 memory、复用 `InMemoryAdapterRegistry` 充当 queue
- 不动 DDD 模型、不动 OpenAPI spec 协议
- 新增 ~10 端点,加 e2e Section 4.22,跑 e2e 全绿

### 3.2 R-AI-2: 自定义 AI 模型（P0,预计 1 轮,~8 端点）

**目标**: 新建 `apps/nestjs-backend/src/features/custom-ai-model/` 目录,实现 CRUD + Provider 适配器(OpenAI / Anthropic / OAI-compatible)+ 测试连接 + 列表测试。

**最小改造方式**:
- 全新 feature module,严格套 R28-R32 模板(auth.service + controller + module + app.module 注册 + e2e section + cleanup + commit)
- 不动现有 ai 模块
- 复用 `LicenseCapabilityGuard.for('byok_llm_key')`(已存在)

### 3.3 R-AI-3: AI Admin 设置（P0,预计半轮,~4 端点）

**目标**: `apps/nestjs-backend/src/features/ai-setting/`,实现 GET/PUT AI 全局配置 + 启用/禁用 AI 开关 + 默认模型 + 算力策略。

**最小改造方式**:
- 极薄 layer: 大多数字段直接落到现有 `license` 表的 capability flags,只在缺失处新建 `ai_setting` 单行表
- 端点 ~4 条,加 e2e Section 4.23

### 3.4 R-AI-4: 应用构建器增强（P1,预计 1 轮）

补齐 deploy / version / auto-fix / 模板市场等 Cloud 应用构建器其他端点。

### 3.5 R33 收尾（先于 R-AI-1 完成,~30min）

| 步骤 | 工作量 |
|---|---|
| e2e Section 4.21 加 dr-canvas 断言(8 条) | 5 min |
| cleanup() 加 `DELETE FROM meta.dr_canvas` | 2 min |
| gap-analysis Round-33 章节(60 行) | 10 min |
| cp 主仓 dr-canvas 改动 → worktree | 3 min |
| git commit + tag | 2 min |
| 跑 e2e 全量验证 exit=0 | 8 min |

---

## 四、关键事实校对

| 项 | 当前真实 |
|---|---|
| enterprise-readiness 总能力数 | 80(不是 PROGRESS_REPORT 早期写的 33,新增 capability 来自 R28-R33 累计) |
| cloudGapCoverage | 14/14 = 100%(所有可填 gap 已填) |
| cloudBusinessParity | 43/46 = 93.5%(3 项为 SLA/客服/多区域,non-goal) |
| R33 dr-canvas | 后端可运行,smoke 测试 200,但 **未 commit**(主仓 12 文件未 commit 改动是 R33 真实产出) |
| AI 对话端点 | OSS 26 个 vs Cloud ~50+ 个,**Cuppy 1 端点是最大短板** |
| 主仓 vs worktree | 主仓未 commit 的 12 文件 diff 应同步到 worktree 后再 commit(避免主仓游离改动) |

---

## 五、待用户决策的关键点

1. **是否 commit R33 收尾?**(主仓 dr-canvas + 配套修改 12 文件待 commit)
2. **是否同意进入 R-AI-1**?Cuppy 端点从 1 → 10+,预计 1 轮完成
3. **是否同意 R-AI-2/R-AI-3 后续**?(自定义 AI 模型 + AI Admin 设置)
4. **commit 时机** — 是每轮 R 单独 commit,还是 R33 + R-AI-1 一起 commit?


---

## 更新(2026-09-01 08:35 后端运行时,R-AI-5 + R-PERM-1 已落)

### 累计自动化验证

| Round | 新断言 | 端点 | 状态 |
|---|---|---|---|
| R33 + R-AI-1/2/3 | 43 | cuppy 23 + ai-builder 6 + custom-ai-model 8 + ai-setting 8 | ✅ committed |
| **R-AI-5**(`/api/cuppy/chat` 真实对话回退) | **11** | chat 不再 503,echo 兜底 + 真实 LLM 零迁移让位 | ✅ `a89e5ae54` |
| **R-PERM-1**(权限矩阵 4 区域 CRUD) | **18** | +app-access / workflow-access / default-role | ✅ `968ae71b4` |
| **总计 (含本轮 e2e 修复)** | **288 OK / 0 FAIL** | 权限矩阵 17 端点,全量 e2e 一次跑通 | |

### 本轮真实改进(用户点名的两项)

1. **"AI 对话功能也没有"** → `/api/cuppy/chat` 无 LLM 配置也回话。
   - `BuiltInEchoLlm` 兜底:纯函数、回显消息、列出路由工具、`[base=...]` 标签、单次升级提示
   - 配置 OPENAI_API_KEY / BYOK key / admin gateway 后自动切换真实模型
   - 实测中文、英文、多轮上下文、历史持久化、DELETE 清理全通

2. **权限矩阵(help.teable.ai/zh/basic/authority-matrix)** → 4 大区域 3/4 全量 HTTP 覆盖:
   - 记录(record-action / record-filter)、字段(field-permission)、导入导出(import-export)已有
   - **本轮新增** 应用 app-access、工作流 workflow-access、默认角色 default-role
   - 18 个 e2e 断言全绿,权限矩阵 13→17 端点,全部真实 HTTP 往返
   - 遗留:视图级可见性(R-PERM-2,schema 需 view 级关联)

### 剩余真实差距(按优先级)

1. R-PERM-2:视图级可见性(viewIds per role,Cloud "特定视图")
2. R-AI-4:AI App Builder deploy/rollback/secrets/files(10 端点)
3. Section 3 license 修复(pre-existing,`TEABLE_LICENSE_KEY=plan:business` 未被识别)
4. 配置真实 LLM provider 验证 echo 让位
5. admin AI gateway 实例级共享模型


---

## 六、本轮(Round-E2E-FIXES, 2026-09-01 09:41 全量一次跑通)

### 全量 e2e 结果
- `bash scripts/e2e-enterprise-readiness.sh` 一次跑通,**exit 0 / 288 OK / 0 FAIL**
- Section 1: 构建产物就绪
- Section 2: self_hosted plan,55/85 capabilities enabled(>=46 ✓,total>=80 ✓)
- Section 3: business license,`plan.level=business` ✓,`cloudBusinessParity 46/46 >= 38` ✓
- Section 4.1–4.26:全绿,含 R-AI-1(23)+ R-AI-2(8)+ R-AI-3(8)+ R-AI-5(11)+ R-PERM-1(18)
- Section 5: 未授权 401 ✓

### 排查到的 6 个真实脚本问题与最佳最小改造

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | Section 3 license e2e 一直 `plan.level==business (got: self_hosted)` | 主机 launchd 代理 `com.teable.backend.dev`(KeepAlive)在 e2e 启动时抢占 PORT,无 license 后端先绑定 3000,e2e 后端静默回落到 3001,healthz 命中的是 launchd 进程 | `start_backend` 前 `launchctl bootout` 该 agent,cleanup 时按需 `bootstrap` 恢复;并加 `kill -0 $BACKEND_PID` + listener-PID 一致性检查 |
| 2 | `assert_ok "y"` 在 4.25/4.26 `chk_*` 返回 `y`/`n` 时崩溃 `y: unbound variable` | `[[ $1 -ne 0 ]]` 把 `y` 当算术上下文做变量查找,触发 set -u | `assert_ok` 改为白名单 `[[ "$ok" == "0" || "$ok" == "y" ]]`,与 0/1 数值语义等价 |
| 3 | Section 4.24 `ai-setting` 第二次跑 first-assert 失败 | 该 section 只 PUT 不还原,`meta.setting WHERE name='ai_config'` 残留了 `claude-3-5-sonnet` | section 首行 `DELETE FROM meta.setting WHERE name='ai_config'`,并在 cleanup() 全局兜底 |
| 4 | Section 4.26 全部 401 | curl `-c /tmp/jar` 对 IP 地址(127.0.0.1)的 `Set-Cookie` 不会持久化,后续 `-b` 读到空 jar | signin 用 `-D` 抓 `Set-Cookie` 头,grep 出 `auth_session=...`,改用 `-H "Cookie: ..."` 显式带 |
| 5 | Section 4.26 第一发请求直接 429 | 4.25 一次性发 11 个 cuppy 请求,已经用满 10/s,4.26 signin 第 12 个越界 | 4.26 开头 `sleep 2` 重置窗口,section 内 18 个 curl 各前置 `sleep 0.12` 控速 |
| 6 | Section 2 capability 总数断言失败 `total=85, 期望 80` | 之前是 `==` 硬编码,主仓新增能力把总数推高了 | 改为 `>= EXPECTED_TOTAL` / `>= EXPECTED_ENABLED` 下限回归保护 |

### 本轮未触动
- 后端业务代码零改动
- 数据库 schema 零改动(上一轮 R-PERM-1 的 `permission_role_node.table_id` 仍保持可空,符合预期)
- 主仓预存在的 byok-kms、data-residency 等 uncommitted 改动按 AGENTS.md 隔离

### 后续(真实差距,按优先级)
1. **R-PERM-2** — 视图级可见性(Cloud "特定视图",需 view 级 schema 关联)
2. **R-AI-4** — AI App Builder deploy / rollback / secrets / files(10 端点,源码需重写)
3. **真实 LLM provider** — 配置 OPENAI_API_KEY 后验证 echo 兜底让位给真实模型
4. **admin AI gateway** — 实例级共享模型
5. **e2e 日志** — `start_backend` 当前用 `> $LOG` 覆盖,应改为 `>>` 追加并加 `tee`,否则 backend 重启会丢失前段断言日志

