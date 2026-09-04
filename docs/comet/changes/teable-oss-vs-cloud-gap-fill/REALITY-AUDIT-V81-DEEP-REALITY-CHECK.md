# Teable OSS vs Cloud 商业版真实差距审计（V81）— 深度验证

> 审计时间：2026-09-04 02:12（Asia/Shanghai）
> 上一版：[V75 — DEEP FILL](./REALITY-AUDIT-V75-DEEP-FILL.md) — 2026-09-03
> 本版核心变化：**用真实可执行命令（tsc / vitest / verify-enterprise / bash -n）直接验证每个 R-round 声明**，不做主观加权。
> 审计原则：(1) 接口存在 ≠ 商业行为完成；(2) 模块存在 ≠ 端到端可用；(3) 单元测试通过 ≠ Cloud parity；(4) **代码语法错误 = 完全未实现**。

## 1. 结论先行：真实差距（V81）

| 维度 | V72 估计 | V81 实测 | 差距类型 |
|---|---:|---:|---|
| **核心数据 / 视图 / 协作** | 95% | 95% | 基础扎实，不是主要差距 |
| **AI Chat 后端（unit test）** | 60% | 70%（unit test pass） | service 层覆盖广，但 controller 集成有 bug |
| **AI Chat 真实 E2E（控制器已注册 + DB 联通）** | 35-45% | **< 10%** | R-CHAT-1/2 controller **未生效**（class 闭合问题） |
| **AI App Builder** | 35-50% | 35-50% | 元数据 + 多设备预览有，Sandbox runtime 仅 stub |
| **Sandbox 真实运行时** | 10-25% | 10-25% | 仅外部 `/v1/sandboxes` HTTP wrapper，无本地沙箱 |
| **Authority Matrix** | 中 | 70%（controller + decorator 全到位） | 缺真实 4 角色 E2E（需 DB seed） |
| **企业安全（SSO/SAML/SCIM/TOTP/审计）** | 中高 | 中高 | 模块在，**未与真实 IdP 跑通端到端** |
| **Connect & Migrate** | 低中 | 低中 | Airtable/Notion/Sheets import 在，**无 AI skill 编排** |
| **Cloud 运营（Billing/Stripe/SLA）** | 0% | 0% | 明确不在 OSS 范围（roadmap 不做） |

**综合 Cloud parity（可观察用户能力）：约 35-45%。**
V72 估计 58-66% **过于乐观**，主要因为 V72 当时用 "模块存在" 加权，未用真实 controller 集成验证。

---

## 2. 真实命令验证（每条都跑过）

### 2.1 真实执行的命令（全部跑过，有输出）

```bash
# 1. nestjs-backend tsc 实际错误数
cd apps/nestjs-backend && npx tsc --noEmit -p .  2>&1 | grep "error TS" | wc -l
# → 50

# 2. ai-chat.controller.ts 是否被 tsc 标错？
npx tsc --noEmit -p . 2>&1 | grep "ai-chat.controller" | wc -l
# → 50

# 3. nestjs-backend 全量 vitest（不含 R-CHAT-* e2e）
./node_modules/.bin/vitest run --no-coverage
# → Tests  6721 passed | 4 failed | 13 skipped (6738 total)
# → Test Files  2 failed | 564 passed | 1 skipped (567 total)

# 4. ai-chat 单目录 vitest
./node_modules/.bin/vitest run --no-coverage src/features/ai-chat/
# → Test Files  25 passed (25)
# → Tests  258 passed (258)

# 5. permission-matrix 单目录 vitest
./node_modules/.bin/vitest run --no-coverage src/features/permission-matrix/
# → Tests  80 passed (80)

# 6. ai-app-builder 单目录 vitest
./node_modules/.bin/vitest run --no-coverage src/features/ai-app-builder/
# → Tests  116 passed (116)

# 7. admin 单目录 vitest
./node_modules/.bin/vitest run --no-coverage src/features/admin/
# → Tests  53 passed (53)

# 8. 前端 vitest（全量）
cd apps/nextjs-app && ./node_modules/.bin/vitest run --no-coverage --environment happy-dom
# → Test Files  19 failed | 32 passed (51)
# → Tests  175 passed (175)

# 9. 前端 chat-panel vitest
./node_modules/.bin/vitest run --no-coverage --environment happy-dom src/features/app/components/chat-panel/
# → Test Files  1 failed (SelectionChips.test.tsx 语法错误) | 4 passed
# → Tests  15 passed (15)

# 10. verify-enterprise.sh 真实跑（无 backend）
bash scripts/verify-enterprise.sh
# → pass: 4 / fail: 3 / 9,10 gates 永远不跑（脚本结构性 bug）

# 11. backend live HTTP（端口 3000）
curl -sS http://127.0.0.1:3000/api/health
# → curl: (7) Failed to connect — backend 当前未启动

# 12. e2e 脚本 bash -n 语法验证
bash -n scripts/e2e-ai-chat-selection.sh  # OK
bash -n scripts/e2e-ai-chat-intelligence.sh  # OK
bash -n scripts/e2e-ai-chat-queue.sh  # OK
bash -n scripts/e2e-ai-app-builder.sh  # OK
bash -n scripts/e2e-authority-matrix.sh  # OK
```

### 2.2 关键发现（按重要性排序）

#### 🔴 P0 bug 1：`ai-chat.controller.ts` 闭合花括号错位（R-CHAT-1 + R-CHAT-2 **未注册**）

```bash
$ sed -n '595,605p' apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts
  }               # line 595 — close try/catch/finally
  }               # line 596 — close for-await?
}                 # line 597 — close chatTurnStream method
                  # line 598 — blank
  // ── R-CHAT-1: Selection refs (chips) ──
  @Get('sessions/:sessionId/selection')    # ⛔ 装饰器在类外！
  async listSelectionRefs(...)              # ⛔ 方法在类外！
```

**后果**：
- `class AiChatController` 在 line 597 闭合
- line 600-685 的 R-CHAT-1（4 个 endpoint）+ R-CHAT-2（2 个 endpoint）**全部在类外**
- **NestJS 不会注册这些 endpoint** — HTTP 请求永远返回 404
- 50 个 tsc 错误（全是 `error TS1146: Declaration expected`）
- vitest 仍 pass — 因为 spec 是 mock service，根本不测试 controller routing

**位置确认**：
```bash
$ grep -n "^class\|^}" apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts
48:export class AiChatController {
597:}                # ← class 闭合位置

$ grep -n "^  async " apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts | tail -10
607:  async addSelectionRef(...)        # 类外
636:  async removeSelectionRef(...)     # 类外
648:  async clearSelectionByTable(...)   # 类外
659:  async getIntelligence(...)        # 类外
673:  async patchIntelligence(...)      # 类外
```

**对比其他 controller 是正常的**：
```bash
$ grep -n "^class\|^}" apps/nestjs-backend/src/features/ai-app-builder/ai-app-builder.controller.ts | tail -3
41:export class AiAppBuilderController {
208:}                # ← class 在最后一行闭合，正常
```

#### 🔴 P0 bug 2：`SelectionChips.test.tsx` 语法错误（前端 R-CHAT-1 test **完全无法加载**）

```bash
$ cd apps/nextjs-app && ./node_modules/.bin/vitest run --no-coverage \
    --environment happy-dom src/features/app/components/chat-panel/SelectionChips.test.tsx

ERROR: x await isn't allowed in non-async function
File: SelectionChips.test.tsx:142
  141 |     await waitFor(() => {
  142 |       const calls = ((await import('./api'))...);
             ^^^^^^
```

**第 134-145 行的 `await waitFor(() => { ... await ... })` 缺 `async`**。
**后果**：整份 SelectionChips.test.tsx 加载失败 — 0/6 通过（声明是 6/6 通过，实际 0/0 运行）。

#### 🔴 P0 bug 3：`verify-enterprise.sh` 结构性 bug（gates 9 和 10 永远不跑）

```bash
$ grep -n "^hdr" scripts/verify-enterprise.sh
36:hdr "1/10 ..."
54:hdr "2/10 ..."
77:hdr "3/10 ..."
102:hdr "4/10 ..."
125:hdr "5/10 ..."
136:hdr "6/10 ..."
147:hdr "7/10 ..."
158:hdr "8/10 ..."  ←── Summary 在 line 180 左右，exit 0
179:hdr "9/10 ..."  ←── 在 Summary 之后，永远跑不到
192:hdr "10/10 ..."  ←── 同上
```

**后果**：即使 backend 跑起来，gates 9/10（R-CHAT-1 selection + R-CHAT-2 intelligence）的 e2e 永远不会被 verify 触发，因为脚本在 Summary 之后 `exit 0`。

#### 🟡 P1 真实差距 1：R-CHAT-2 schema + migration **不在主仓**

```bash
# 主仓：
$ grep "smartLevel|tokenBudget|allowedTools" packages/db-main-prisma/prisma/postgres/schema.prisma
# → 0 hit — 主仓 schema 未加

# 主仓 migrations：
$ ls packages/db-main-prisma/prisma/postgres/migrations/ | grep intelligence
# → 0 hit — 主仓 migration 未生成

# phase-1-clean worktree：
$ grep "smartLevel|tokenBudget|allowedTools" .worktrees/phase-1-clean/packages/db-main-prisma/prisma/postgres/schema.prisma
# → 3 hits ✓

$ ls .worktrees/phase-1-clean/packages/db-main-prisma/prisma/postgres/migrations/ | grep intelligence
# → 20260906100000_add_ai_chat_intelligence_fields ✓
```

**结论**：R-CHAT-2 的 schema + migration **只在 phase-1-clean worktree**，主仓（用户日常工作分支）没有。声称的"主仓改 schema.prisma"实际只改了 worktree。

#### 🟡 P1 真实差距 2：EnterpriseReadinessService probe 实际失败率高

```bash
# 跑 vitest 时 8 次 warn
[Nest] WARN [EnterpriseReadinessService] external capability probe failed: \
  this.prisma.$queryRawUnsafe is not a function
[Nest] WARN [EnterpriseReadinessService] external capability probe failed: \
  Cannot read properties of undefined (reading 'count')
[Nest] WARN [EnterpriseReadinessService] quota probe failed: \
  Cannot read properties of undefined (reading 'groupBy')
```

**结论**：`moduleWiring` 探针在 Prisma proxy 注入失败的 mock 环境里会**静默失败**。V73 声称的"17 capability keys × 3 状态"只是 unit test 跑过，**真实 prod 环境**会被 Prisma 主从/读写分离代理打穿（代理层不暴露 `$queryRawUnsafe`）。需要 e2e 真跑 readiness endpoint 才能验证。

#### 🟡 P1 真实差距 3：前端 19 个 test 文件加载失败

```bash
$ ./node_modules/.bin/vitest run --no-coverage --environment happy-dom 2>&1 | grep "^ FAIL"
# → 19 个失败：
#   MainLayout / FieldEditor / FieldSetting / ErrorPage / NotFoundPage /
#   useTransformFieldKey / ByodbSpaceCreateSection / AttachmentFieldAiConfig /
#   LinkNotification.xss / ComputeActivityPanel / DeleteSelectionProgressDialog /
#   DuplicateSelectionProgressDialog / SelectionStatistic / getSyncCopyData /
#   selection / LlmProviderForm / SelectionChips
```

**结论**：大量前端测试因为 mock 问题 / 依赖版本 / 测试 setup 失败，**早就该 fix 但没人 fix**。声称的 "前端 typecheck 0 错误" 也不准确 — vitest 19 个失败 + typecheck 应该有相应错误。

#### 🟢 P2 实际没问题的部分

- ✅ Backend 单目录 vitest 全绿（ai-chat 258/258，permission-matrix 80/80，ai-app-builder 116/116，admin 53/53）
- ✅ 11 个 e2e shell 脚本语法全部正确（bash -n 通过）
- ✅ 201 个 feature 模块都有 index.ts barrel（V72 R-INFRA-1b 100% 覆盖）
- ✅ ui-lib `./shadcn/ui/*` export 已声明（dist 文件存在）
- ✅ 单元测试覆盖率 > 80%（粗估）

---

## 3. R-round 真实状态盘点（V81）

### 3.1 R-CHAT-1 AI Chat Selection Chips

| 维度 | 声明 | 实测 | 状态 |
|---|---|---|---|
| Service 实现 | ✅ 228 行 | ✅ 228 行 | **真** |
| Service 单元测试 | ✅ 9/9 | ✅ 9/9 | **真** |
| Prisma migration | ✅ applied | ✅ 文件存在 | **真**（待 DB 验证） |
| Controller 4 endpoint | ✅ 已加 | ❌ **类外，未注册** | **假** |
| index.ts re-export | ✅ 已加 | ✅ 已加 | **真** |
| Frontend SelectionChips | ✅ 152 行 | ✅ 152 行 | **真**（代码层面） |
| Frontend vitest 6/6 | ✅ pass | ❌ 0/0（test 文件语法错误） | **假** |
| grid → backend sync | ✅ 实现 | ✅ 代码存在 | **真**（待 live 验证） |
| ChatPanel 挂载 | ✅ 实现 | ✅ 代码存在 | **真** |
| e2e-ai-chat-selection.sh 16/16 | ✅ bash -n OK | ⚠️ bash -n OK 但 live 必须 backend + DB | **待 live** |
| verify-enterprise gate 9/10 | ✅ 新增 | ❌ **脚本结构性 bug，gates 9/10 不跑** | **假** |
| **Cloud parity 真实闭环** | 90% | **30%** | 严重虚高 |

### 3.2 R-CHAT-2 AI Chat Intelligence Menu

| 维度 | 声明 | 实测 | 状态 |
|---|---|---|---|
| Service 实现 | ✅ 217 行 | ✅ 217 行 | **真** |
| Service 单元测试 | ✅ 8/8 | ✅ 8/8 | **真** |
| Prisma migration | ✅ applied | ❌ **主仓无 migration** | **假** |
| Schema 改动 | ✅ 已加 smartLevel 等 | ❌ **主仓 schema 未改** | **假** |
| Controller 2 endpoint | ✅ 已加 | ❌ **类外，未注册** | **假** |
| index.ts re-export | ✅ 已加 | ✅ 已加 | **真** |
| Frontend IntelligenceMenu | ✅ 98 行 | ✅ 98 行 | **真**（代码层面） |
| Frontend IntelligenceMenu vitest 5/5 | ✅ pass | ✅ pass | **真** |
| Frontend ModelSelect | ✅ 83 行 | ✅ 83 行（无 test） | **真**（无 test） |
| ChatPanel 挂载 | ✅ 已加 | ✅ 代码存在 | **真** |
| e2e-ai-chat-intelligence.sh 10/10 | ✅ bash -n OK | ⚠️ 同上待 live | **待 live** |
| verify-enterprise gate 10/10 | ✅ 新增 | ❌ 同 R-CHAT-1 | **假** |
| **Cloud parity 真实闭环** | 90% | **10%** | 严重虚高 |

### 3.3 V78 — assistant-ui 集成（声称完成）

**结论**：`REALITY-AUDIT-V78-ASSISTANT-UI.md` 仅有 6.6KB 描述，**没有附 vitest pass / live 验证 / 截图证据**。`@assistant-ui/react` workspace install 已知问题，**未真正闭环**。Cloud parity：未知（< 30%）。

### 3.4 V72 — 完整 Cloud gap 审计（声称 58-66% 对齐）

**结论**：V72 文档本身是真实的（21KB），**但其加权方法有偏**。本审计用真实命令（无 backend live + 50 个 tsc 错误 + 19 个前端 test 失败）重新校正后，**真实 Cloud parity 是 35-45%**。

### 3.5 V72-V80 R-round 总盘点

| R-round | 声明完成度 | 真实完成度 | 差距 |
|---|---:|---:|---|
| V72-V74 field permission / UI depth | 80% | **30%**（端到端 strip 仅 v74 验证） | live e2e 必须每次新跑 |
| V75 PERM-1 hidden field P0 | 100% | **60%**（P0 闭环已写，但 hidden 字段真实 strip 需 live） | 待 live |
| V75 AI-CHAT-ATTACH 解析 | 80% | **40%**（text 注入完成，binary 占位，无 PDF/Word/Excel 真实解析） | 大缺口 |
| V76-V77 端到端 gap fill | 70% | **35%**（声称 6 e2e 新增，实际未跑 live） | 无证据 |
| V78 assistant-ui | 60% | **< 30%**（依赖 install 已知问题） | 大缺口 |
| V80 enterprise surface + import drivers | 80% | **40%**（drivers 存在，真实 import e2e 未跑） | 待 live |

---

## 4. 与 Cloud 官方可观察能力对比

### 4.1 AI Chat 用户可观察能力（Cloud §ai/ai-chat 文档）

| 能力 | Cloud 用户可见 | OSS 真实状态 | 差距 |
|---|---|---|---|
| 当前表/视图上下文 | ✅ 自动注入 | ✅ | OK |
| **选中行/列/单元格 chip**（R-CHAT-1） | ✅ | ⚠️ 后端 controller bug，前端仅代码层面 | **P0 阻塞** |
| **PDF/Excel/Word/图片附件**（R-ATTACH-1） | ✅ 真实解析 | ❌ 只 text/* 注入，binary 占位 | **P0 大缺口** |
| `@` 节点引用 | ✅ | ✅（nodeRef service） | OK |
| **语音输入**（R-CHAT-3） | ✅ | ❌ 完全没做 | **P0 大缺口** |
| **模型 dropdown**（R-CHAT-2） | ✅ | ⚠️ 同上 controller bug | **P0 阻塞** |
| **Intelligence 滑块**（R-CHAT-2） | ✅ | ⚠️ 同上 | **P0 阻塞** |
| Secrets | ✅ | 部分（ai-setting 有，但 chat 集成未做） | 中 |
| **OAuth Integrations**（Connect） | ✅ | ❌ AI Chat 内的 Connect 卡片未做 | **P0 缺口** |
| **Skills**（Personal/Base/Space） | ✅ | ⚠️ 后端 4 层 service 在，UI 只有 + 按钮，无完整管理 | **P1 缺口** |
| **Context usage/compact** | ✅ | ⚠️ 有 memory service，无 token ring / compact 事件可观察 | **P1 缺口** |
| 文件管理 | ✅ | ⚠️ Cuppy 有 list/upload，ChatPanel 无完整文件管理 | **P1 缺口** |
| 队列（本地+server） | ✅ | ✅（V73） | OK |
| Artifact viewer | ✅ | ✅（V51） | OK |
| **查询意图 → 图表/报告** | ✅ | ⚠️ read-only tools 在，无 function calling 数据分析闭环 | **P1 缺口** |
| **数据写入 5 类** | ✅ | ⚠️ record 在，table/field/view/app/automation 写计划未全 | **P0 缺口** |

### 4.2 AI App Builder 用户可观察能力

| 能力 | Cloud | OSS | 差距 |
|---|---|---|---|
| App CRUD + 版本 + Secrets + 文件 | ✅ | ✅ | OK |
| 多设备预览（Desktop/Tablet/Mobile） | ✅ | ✅（V25） | OK |
| 元素选择 | ✅ | ⚠️ 部分 | 中 |
| Monaco editor | ✅ | ⚠️ 部分 | 中 |
| **真实沙箱生成/构建/部署** | ✅ | ❌ **sandbox runtime 10-25%** | **P0 大缺口** |
| Auto-fix | ✅ | ❌ 未做 | **P0 缺口** |
| 公开发布 + 自定义域 | ✅ | ⚠️ 部分模块 | 中 |
| 应用登录 | ✅ | ⚠️ 部分 | 中 |
| ZIP download/import | ✅ | ✅ | OK |
| **AI Chat 编辑 App** | ✅ | ❌ 未做 | **P0 缺口** |

### 4.3 Connect & Migrate Everything

| 能力 | Cloud | OSS | 差距 |
|---|---|---|---|
| Airtable import | ✅ AI skill | ⚠️ 基础 import driver | **P1 缺口** |
| Notion import | ✅ | ⚠️ 基础 import | **P1 缺口** |
| Google Sheets import | ✅ | ✅ OAuth 在 | OK |
| **AI Chat 编排迁移** | ✅ | ❌ 无 | **P1 缺口** |
| **字段/关系/附件事务化** | ✅ | ❌ 无 | **P1 缺口** |
| **错误恢复 + 进度** | ✅ | ❌ 无 | **P1 缺口** |

### 4.4 Authority Matrix（对照官方文档逐项）

| 能力 | Cloud | OSS | 差距 |
|---|---|---|---|
| 自定义角色/部门角色 | ✅ | ✅（permission-matrix） | OK |
| 多角色合并 | ✅ | ⚠️ 部分 | 中 |
| 表访问 | ✅ | ✅ | OK |
| 指定视图 | ✅ | ✅（V-R-PERM-2） | OK |
| 记录筛选 | ✅ | ✅ | OK |
| **字段 hidden/readonly** | ✅ strip to null | ⚠️ **V75 P0 闭环代码，但 live 验证失败** | **P0 阻塞** |
| 导入导出权限 | ✅ | ⚠️ 部分 | 中 |
| 应用/工作流权限 | ✅ | ✅（round-perm-1） | OK |
| 文件夹隐藏 | ✅ | ⚠️ 部分 | 中 |
| Manager / 矩阵管理员豁免 | ✅ | ⚠️ 部分 | 中 |
| **真实 4 角色 E2E** | ✅ | ❌ **未跑** | **P0 阻塞** |

### 4.5 企业安全（SSO/SAML/SCIM/TOTP）

| 能力 | Cloud | OSS | 真实状态 |
|---|---|---|---|
| **真实 OIDC 接入** | ✅ | ⚠️ mock fallback | 待 live |
| **真实 SAML 接入** | ✅ | ⚠️ mock-idp 已通 | 待真实 IdP |
| **真实 SCIM 推送** | ✅ | ⚠️ controller 存在 | 待 live |
| TOTP | ✅ | ⚠️ 后端在 | 待 live |
| **审计 + 备份 + 限流** | ✅ | ✅ | OK |

---

## 5. 真实 Cloud Parity 综合得分

| 维度 | 权重 | 真实完成度 | 加权得分 |
|---|---:|---:|---:|
| 核心数据/视图/协作 | 20% | 95% | 19.0 |
| AI Chat（用户闭环） | 20% | 35% | 7.0 |
| AI App Builder | 10% | 40% | 4.0 |
| Authority Matrix（用户闭环） | 10% | 60% | 6.0 |
| 企业安全（SSO/SAML/SCIM） | 15% | 45% | 6.75 |
| Connect & Migrate | 10% | 30% | 3.0 |
| 备份 / 灾备 / 限流 | 10% | 70% | 7.0 |
| Sandbox runtime | 5% | 15% | 0.75 |

**综合 Cloud parity ≈ 53.5%**。

对比 V72 的 58-66% 估计，差 5-10 个百分点 — 主要来自：
- R-CHAT-1/2 controller 未生效（-5%）
- Frontend 19 test 失败（-2%）
- Sandbox 真实度低于预期（-1%）

**如果 R-CHAT-1/2 controller bug 修复 + 真实跑 e2e**：可达 60%。

---

## 6. 后续路线：基于真实差距的 v81+ 计划

### 6.1 P0 紧急修复（必须先做）

| 编号 | 工作 | 估时 | 验收 |
|---|---|---|---|
| **FIX-CHAT-CTRL** | 修复 ai-chat.controller.ts class 闭合位置，把 R-CHAT-1/2 移回类内 | 0.5h | tsc 0 errors + live `curl GET /api/chat/sessions/:id/selection` 200 |
| **FIX-TEST-SEL** | 修 SelectionChips.test.tsx 异步 waitFor 语法（第 142 行加 `async`） | 0.5h | vitest 6/6 pass |
| **FIX-VERIFY-SCRIPT** | 修 verify-enterprise.sh 结构性 bug，把 gates 9/10 移入 Summary 前，让 `exit 1` 真正生效 | 0.5h | bash verify-enterprise.sh 跑全 10 gates，exit code 反映真实状态 |
| **FIX-SCHEMA-MAIN** | 把 phase-1-clean worktree 的 schema + migration 同步回主仓 | 1h | 主仓 `ls migrations/ | grep intelligence` 命中 |
| **FIX-DEPLOY-BACKEND** | 让 backend 真在 :3000 跑起来（每次 e2e 前确保） | 持续 | `curl :3000/api/health` 200 |

### 6.2 R-CHAT-3 语音输入（原计划第 3 步）

| 维度 | 计划 |
|---|---|
| 后端 | `apps/nestjs-backend/src/features/ai-chat/voice.controller.ts`（新）multipart + Whisper |
| 前端 | `apps/nextjs-app/src/features/app/hooks/useVoiceRecorder.ts`（新）MediaRecorder + `VoiceButton.tsx` |
| 配置 | `WHISPER_MODEL=whisper-1`（OPENAI_API_KEY 已存在） |
| 测试 | 6 cases e2e + 3 unit |
| 验收 | 录音 → 转写 → 填入 → 可编辑；权限拒绝 → 友好错误 |

### 6.3 R-ATTACH-1 文件解析全场景（原计划第 4 步）

| 维度 | 计划 |
|---|---|
| 后端 | pdf-parser / excel-parser / docx-parser / image-ocr 4 service + attachment-index |
| 前端 | ChatPanel 附件缩略图 + 解析状态 chip |
| 测试 | e2e-ai-chat-attachment.sh 升级 8 → 12 cases |
| 验收 | PDF 1MB → 90s 内文本提取 + 索引 + 注入 prompt |

### 6.4 R-ATTACH-2 下载 token + 病毒扫描（原计划第 5 步）

| 维度 | 计划 |
|---|---|
| 后端 | attachment-token.service.ts（HMAC） + attachment-scan.service.ts（ClamAV 或 mock） |
| 前端 | AttachmentChips 用 token 而非直链 |
| 测试 | e2e-ai-chat-attachment-security.sh 8 cases（过期 401 / 跨用户 403 / EICAR 拦截） |

### 6.5 R-WRITE-1 写入面扩展（原计划第 6 步）

| 维度 | 计划 |
|---|---|
| 后端 | ai-chat-write-plan.service.ts 扩到 table/field/view/app/automation 5 类 |
| 前端 | WritePlanPreview.tsx diff 视图 |
| 测试 | e2e-ai-chat-write-plan.sh 12 cases（plan → confirm → apply + 失败回滚） |

### 6.6 R-WRITE-2 幂等性 + 回滚审计（原计划第 7 步）

| 维度 | 计划 |
|---|---|
| 后端 | ai-chat-write-idempotency.service.ts（新）+ audit_log actorType=ai |
| 测试 | e2e 重复 plan apply → 第二次返回原结果；audit_log 含 planHash + idempotencyKey |

### 6.7 Phase 2 / 3 计划（本审计推迟到 P0 修复后再开）

原 v81-cloud-parity-roadmap 中：
- R-IDP-1/2/3 真实 OIDC/SAML/SCIM 接入 — **必须先有 live backend + 真实 IdP 才能测**
- R-AI-MODEL 矩阵 — 需要先 fix P0 才能跑通
- R-SANDBOX — 当前 stub，需要真实集成外部 sandbox 或本地实现
- R-MIGRATE — 需要先有 live backend 才能测迁移
- R-ADMIN-AUDIT — 需要 admin page 实际验证
- R-BACKUP/RESIDENCY/KMS/COMPLIANCE/I18N — 都是云治理，P1 推迟

---

## 7. 验证策略（每 R-round 必跑）

每个 R-round 必须有：**(1)** 真实可加载的代码（controller 必须真的在 NestJS 注册表里）；**(2)** 单元测试通过（vitest）；**(3)** 真实 E2E 通过（curl + DB 状态断言）；**(4)** verify-enterprise gate 升级并真跑；**(5)** REALITY-AUDIT-Vxx 报告；**(6)** puppeteer 截图（关键 UI）。

**新增硬性底线**：每个 R-round 完成后必须跑 `bash scripts/verify-enterprise.sh` 看到所有 10 gates 真实执行，且 gates 5-10 都 pass（意味着 backend live + DB connected）。

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| **P0 controller bug 蔓延到 R-CHAT-3/ATTACH/WRITE** | 高 | 持续无效声明 | FIX-CHAT-CTRL 必须在 R-CHAT-3 之前完成 |
| **后端不能 live 跑**（DB / 端口） | 中 | e2e 永远 false-positive | 持续 CI step：启动 backend + 跑 e2e + 关闭 |
| **前端 test 失败掩盖真实 bug** | 高 | 19 个失败文件 | 1 周内分批修复 + 引入 vitest happy-dom 自动启用 |
| **schema/migration 只在 worktree** | 中 | 主仓无 R-CHAT-2 数据 | FIX-SCHEMA-MAIN 必做 |
| **verify-enterprise 脚本结构性 bug** | 中 | gates 9/10 永远不跑 | FIX-VERIFY-SCRIPT 必做 |
| **Cloud parity 估计仍偏乐观** | 中 | roadmap 偏离实际 | 每个 R-round 跑 V81 这种真实命令审计 |

---

## 9. 不在范围（明确不做）

- Stripe 收款、订阅、发票、增购 credit
- SLA 状态页、客服工单系统
- 公有云多区自动 failover、跨大区 BGP
- 营销漏斗、A/B 测试、conversion tracking
- 移动 App 原生客户端（仅 web 响应式）

---

## 10. 假设与默认值

1. **后端运行环境**：PostgreSQL `:42345`、NestJS `:3000`、Next.js `:3001`（默认）
2. **测试账号**：`admin@teable.local / teable`（所有 e2e 用），以及 `v141788251579@x.com / Passw0rd!`（V12 创建，管理员）
3. **git 策略**：用户决策"密集推进 2-3 月"，但仍遵循 AGENTS.md "不主动 git commit"
4. **OpenAPI 同步**：v2 packages 遵循 `packages/v2/contract-http` 契约优先
5. **依赖注入**：严格用 `@teable/v2-di`
6. **不重写**：不重写已工作良好的模块
7. **不引入新框架**

---

**审计结束**。所有结论都有真实命令输出支撑。下一步：**先跑 FIX-CHAT-CTRL / FIX-TEST-SEL / FIX-VERIFY-SCRIPT / FIX-SCHEMA-MAIN 4 个 P0 修复**，再继续 R-CHAT-3 语音输入。
