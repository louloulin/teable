# Outcome

把 G2-001…G2-009 共 9 个已完成 Native change 在 `agent/chong/df9d120d2105-stage6-audit-log` 分支上的所有产物(brief / specs / verification / comet-state / verifier-response / archive)做一次**统一对账**,落一份**单文件索引**作为发版前唯一可信入口,并新增一个**全量回归 happy-path**冒烟,在该分支上重跑 vitest + tsc 证明**无新退化**。完成后,`docs/comet/` 下形成可独立审计、可独立交付、可独立签收的完整文档契约。

# Scope

## Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| 用户评论 `01a03cca` | "Wave 5 立即作为下一轮启动" | `complete` | Outcome + 8 项 Acceptance |
| 用户评论 `01a03cad` | "路径 A (稳)" | `complete` | Decision D1:本轮为路径 A 第四轮 |
| 9 份既有 archive | `docs/comet/archive/2026-08-26-g2-001..009-*` | `complete` | Acceptance GA2 |
| 9 份既有 spec | `docs/comet/specs/g2-001..009-*` | `complete` | Acceptance GA2 |
| Round 26 baseline | 5225 passed / 16 skipped / 0 failed | `complete` | Acceptance GA3 |
| Round 26 tsc baseline | 206 pre-existing errors(均不在本次范围) | `complete` | Acceptance GA4 |
| g2-009 OpenAPI doc + E2E 模板 | `apps/nestjs-backend/test/openapi-e2e.spec.ts` | `complete` | 复用 Node http + 最小 Nest 测试模块模式 |
| v2 OpenAPI controller 模板 | `src/features/v2/v2-openapi.controller.ts` | `complete` | Scalar HTML + CSP nonce 模式 |
| License / permission / quota 子系统 | apps/nestjs-backend/src/features/{license,permission-matrix,quota} | `complete` | Wave 1-3 已合入主干,GA5 happy-path 用 |

## 本 change 落地范围

1. **新增 docs/comet/G2-INDEX.md 单文件入口**: 列 10 个 change(G2-001…G2-009 + G2-010),每行至少包含 change 名、acceptance 数、status(pass/fail/blocked)、merge commit SHA(全 7 位)、archive 路径、关键文件位置。

2. **新增归档完整性脚本**: `scripts/check-archive-integrity.ts`(单文件,无 npm 依赖,使用 fs.readdirSync + path.resolve),枚举 9 份既有 archive,断言含 `brief.md` / `comet-state.yaml` / `verification.md` / 对应 `verifier-response.json`。脚本以 `pnpm exec tsx scripts/check-archive-integrity.ts` 调用,输出每份 archive 的 `[ok]` 或 `[missing] <file>`。

3. **新增 wave5-global-regression.spec.ts**: `apps/nestjs-backend/test/wave5-global-regression.spec.ts`,5 个 happy-path it:
   - it(health): `GET /health` → 200 + `info.metaDatabase.status === 'up'`
   - it(openapi.json): `GET /openapi/openapi.json` → 200 + body.paths 含 `auth` + `base`
   - it(openapi.docs): `GET /openapi/docs` → 200 + HTML + Scalar marker
   - it(openapi.docs.csp): `GET /openapi/docs` → CSP nonce header 存在
   - it(openapi.v2.regression): `GET /api/v2/openapi.json` → 200(回归 G2-009 与 v2)
   - 复用 G2-009 的 `OpenApiTestModule`(最小 Nest module)+ Node `http` 模块驱动。

4. **vitest 全量重跑**: `pnpm exec vitest run`(默认 exclude 含 e2e-spec),对比 Round 26 baseline 5225/16/0,要求失败数 = 0 且无新增失败。

5. **tsc --noEmit 重跑**: `pnpm exec tsc --noEmit`,对比 Round 26 baseline 206 pre-existing,要求 0 新错误(允许只在 g2-010 新文件内)。

6. **commit + merge + push**: 把 G2-010 工作树产物合入 `agent/chong/df9d120d2105-stage6-audit-log` 并推到 origin。

# Non-goals

- 重新打开任意 G2-001…G2-009 archive 改动其产物。
- 重写 / 覆盖已有的 verification.md 报告 — 本 change 只引用既有产物。
- 把 OpenAPI 文档从 `/openapi/*` 拆回 `/api/openapi/*` — G2-009 已建立的路由契约保持稳定。
- 强制 `tsc --noEmit` 全部清零 — 仅要求 G2-010 不引入新错误;Round 26 的 206 条遗留属历史代码,不在本轮范围。
- 修改任何 G2-001…G2-009 已合入的 handler / service / guard / interceptor 主体 — 严格只增不改。
- 新增商业版功能模块 — Wave 5 仅做对账 + 回归 + 索引,不做能力扩张。
- 删除 `docs/comet/changes/g2-XXX/` 工作树 — 归档产物必须保留。
- 修改 `package.json` / `pnpm-lock.yaml` — 简报禁止新依赖,Wave 5 严格遵循。
- 引入新测试运行器 — 仅用现有 `pnpm exec vitest`。
- 真实集成验证(Postgres + Redis + 真实 license key + happy path)— Wave 5 之后的下一轮,不在本 change 范围。
- 发版切 tag / changelog / 法务复核 — G2-010 合入并验证后才启动。

# Acceptance examples

- **GA1 G2-INDEX.md 存在且结构完整**: `docs/comet/G2-INDEX.md` 存在,行数 ≥ 80,文本扫描至少包含 10 个 change 行(G2-001…G2-010),每行至少包含:change 名、acceptance 数、status、merge SHA(7 位)、archive 路径。

- **GA2 9 份既有 archive 完整性**: 9 份 `docs/comet/archive/2026-08-26-g2-001..009-*` 全部包含 `brief.md`、`comet-state.yaml`、`verification.md`;9 份 `docs/comet/specs/g2-001..009-*` 包含 `00-*.md` 至少 1 份 spec 文件。`pnpm exec tsx scripts/check-archive-integrity.ts` 输出 9 份 `[ok]`、0 份 `[missing]`。

- **GA3 vitest 全量无新退化**: `pnpm exec vitest run 2>&1 | tail -40` 解析 Test Files / Tests 行,失败数 = 0,与 Round 26 baseline(5225/16/0)对比无新增失败。

- **GA4 tsc --noEmit 0 新错误**: `pnpm exec tsc --noEmit 2>&1 | wc -l` 错误数与 Round 26 baseline(206)对比,0 新错误(若有任何新增错误,允许只在 g2-010 新文件内,其他文件新增错误视为失败)。

- **GA5 wave5-global-regression.spec.ts 全绿**: `pnpm exec vitest run test/wave5-global-regression.spec.ts` 全部 5 个 happy-path it 通过。

- **GA6 G2-INDEX.md 中 10 个 merge SHA 在 git 实际出现**: `git log --merges --oneline | grep -F` 10 次匹配 G2-INDEX.md 列出的 SHA。

- **GA7 .gitignore 已含产物路径**: `cat .gitignore | grep -E "(\.comet|worktrees|verifier-response)"` 命中,与 g2-009 一致,Wave 5 不再追加新条目。

- **GA8 commit + merge + push**: `git log comet/g2-010 --oneline | head -5` 包含 g2-010 feat commit;`git log agent/chong/df9d120d2105-stage6-audit-log --oneline | head -5` 包含 g2-010 merge commit;`git fetch origin --dry-run` 干净。

# Constraints and invariants

- **AGPL-3 合规**: 任何新增源代码在本仓库内,严禁引入非 AGPL/非自有代码;新文件全部以 `/* eslint-disable @typescript-eslint/naming-convention */` 开头。
- **零现有热路径改动**: 已合入的 9 份 archive 对应的 `app.module.ts`、handler、service、guard、interceptor 主体逻辑保持不变。
- **零新增 npm 依赖**: `package.json` + `pnpm-lock.yaml` 必须在 Wave 5 commit 中保持字节一致。
- **comet-state 保留**: `.comet/runtime/native/changes/g2-010/comet-state.yaml` 必须随 archive 提交,作为 Runtime 的状态快照。
- **归档目录命名**: `docs/comet/archive/2026-08-26-g2-010-global-regression-docs-sync/`(与 G2-001..G2-009 一致的时间戳 + change 名格式)。
- **commit message**: `chore(g2-010): global regression + docs sync`(独立 feat commit 标题),archive commit 走 Runtime 自动生成。
- **merge target**: `agent/chong/df9d120d2105-stage6-audit-log`(本轮唯一 target,绝不直接合入 main / master)。
- **vitest exclude 保持**: `vitest.config.ts` 的 `exclude` 数组不变(已含 e2e-spec),避免拖慢全量回归。

# Decisions

1. **D1**: Wave 5 路径 — "全局回归 + 文档同步"二合一,合并到一个 change(G2-010),不做拆分。原因: 两者均不引入新业务能力,产出都是对账性产物,合并跑节省 1 round,与"2-3 round 内发版"目标匹配。
2. **D2**: G2-INDEX.md 选 Markdown 表格 + 10 行结构,而非 JSON / YAML。理由: 发版前由人工 / 法务 / 评审快速浏览,Markdown 可读性最高,与现有 verification.md 风格统一。
3. **D3**: `wave5-global-regression.spec.ts` 用 Node 内置 `http` 模块 + 最小 Nest 测试模块(同 G2-009 的 OpenApiTestModule 模式),不引入 supertest。理由: brief 禁止新 npm 依赖;且 G2-009 已建立此模式可复用,避免每个 change 引入不同的 test harness。
4. **D4**: tsc baseline 校验只看"g2-010 新文件是否引入新错误"。理由: Round 26 的 206 条遗留是历史债务,不属于 Wave 5 的产出边界。
5. **D5**: 不发 PR。理由: 本仓库工作流是 `agent/chong/*` 分支 + merge to `agent/chong/df9d120d2105-stage6-audit-log`,发版前 push 即可,无需 PR;若发版环节需要 PR,后续轮次单独处理。
6. **D6**: Verifier 必须独立跑一次完整 vitest(而非复用 Runtime check 的截断输出)。理由: GA3 是全量 vitest baseline,Runtime 的 `checks: []` 仅做存在性检查;GA3 必须由 Verifier 独立跑并比对 baseline。

# Open questions

- **OQ1**: Wave 5 之后立即启动 "真实集成验证"(Postgres + Redis + 真实 license key + happy path),还是先发版再真实验证? 倾向: 先真实验证、再发版。理由: 路径 A 写的是 Wave 5 → 真实集成验证 → 发版,顺序固定。状态: 非 blocking,留给 Wave 5 verify-pass 后下一轮决定。
- **OQ2**: G2-INDEX.md 是否要包含 `next-action` 字段(提示每个 change 后续还需要做什么)? 倾向: 不包含。理由: 索引只反映"已交付事实",不掺杂前瞻。状态: 非 blocking,仅影响可读性,无功能影响。
- **OQ3**: 若 vitest 全量跑出现 1-2 个 flaky 失败(非新引入),Wave 5 是否仍然 accept? 倾向: 不 accept。原因: GA3 要求"与 baseline 对比无新增失败";flaky 也算新增,需要先 reproduce 后再单独 round 修。状态: 非 blocking,假定 vitest 全量干净(基线已知为 0 fail)。

# Verification expectations

1. **Runtime check**(由 Runtime 自动执行):
   - brief.md 存在
   - changes 目录结构合规
   - workspace 状态可读
2. **Builder check**(由 Build subagent 执行并写入 builder-handoff):
   - G2-INDEX.md 写入并校验行数 ≥ 80
   - `scripts/check-archive-integrity.ts` 运行后输出 9 份 `[ok]`、0 份 `[missing]`
   - vitest 全量 baseline 对比
   - tsc --noEmit baseline 对比
   - 新 e2e spec 通过
3. **Verifier check**(由独立 Verifier subagent 执行):
   - GA1–GA8 全部逐项 pass
   - 0 个 fail,0 个 blocked;若有任何 blocked 须有明确原因(例: 本地无网络导致 npm install 失败)
   - 重新独立跑一次 `pnpm exec vitest run`(全量)+ `pnpm exec tsc --noEmit`(全量)+ 5 个 happy-path it
   - 校验 G2-INDEX.md 中 10 个 merge SHA 与 `git log --merges` 完全一致
4. **Archive 步骤**(由 Runtime 自动执行):
   - `docs/comet/archive/2026-08-26-g2-010-global-regression-docs-sync/` 目录创建
   - `brief.md`、`specs/`、`comet-state.yaml`、`verification.md` 同步落入
   - merge to `agent/chong/df9d120d2105-stage6-audit-log` 成功
   - push to origin 成功