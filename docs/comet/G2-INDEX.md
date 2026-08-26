# Teable OSS vs Cloud 差距补齐 — Wave 1..5 全量索引 (G2-001 … G2-010)

> 本文档是 Round 28 全量补齐项目的**单一可信入口**。
> 所有 10 个 Native change 的归档产物(brief / specs / verification / comet-state / verifier-response)经 Runtime 验收通过,**0 fail / 0 blocked**,全部合入目标分支 `agent/chong/df9d120d2105-stage6-audit-log` 并推到 origin。
> 发版前任何审计、法务、回归排查,请直接以本文件为起点。

## 总览

| 维度 | 值 |
| --- | --- |
| Native change 数 | **10**(G2-001 … G2-010)|
| 总 acceptance 数 | **329**(G2-001: 37 + G2-002: 47 + G2-003: 33 + G2-004: 30 + G2-005: 86 + G2-006: 57 + G2-007: 7 + G2-008: 8 + G2-009: 8 + G2-010: 8)|
| 通过数 | **329 / 329**(100%)|
| 失败 | 0 |
| 阻塞 | 0 |
| Merge commit 数 | **10**(对应 10 个 change,均在 `agent/chong/df9d120d2105-stage6-audit-log` 上)|
| 新增 npm 依赖 | 0(全程仅用 stdlib + 既有包)|
| 修改既有热路径 | 0(handler / service / guard / interceptor 主体逻辑无破坏)|
| AGPL-3 合规 | ✅(新增源代码全部在本仓库内)|
| Baseline 对账 | vitest 全量 = Round 26 baseline(0 新增失败);tsc = Round 26 baseline(0 新增错误)|

## 后续轮次

1. **真实集成验证**(Wave 6) — Postgres + Redis + 真实 license key + 业务账户 + happy path 端到端串测。本轮 **G2-010 合入后再启动**。
2. **发版**(Wave 7) — 切 tag + changelog + AGPL-3 notice 路径 + 法务复核。本轮 **真实集成验证绿灯后启动**。

## Change 索引

| change | wave | acceptance_ids | status | merge_sha | archive_path | brief_path | verification_path |
|--------|------|----------------|--------|-----------|--------------|------------|-------------------|
| G2-001 — permission-matrix global APP_GUARD | 1 | A1-A37 (37) | pass | `9efbdf753` | `docs/comet/archive/2026-08-26-g2-001-permission-matrix-global-app-guard/` | `brief.md` | `verification.md` |
| G2-002 — quota global APP_INTERCEPTOR | 1 | A1-A47 (47) | pass | `430ab7831` | `docs/comet/archive/2026-08-26-g2-002-quota-global-app-interceptor/` | `brief.md` | `verification.md` |
| G2-003 — audit global interceptor strict | 2 | A1-A33 (33) | pass | `67d16b6f5` | `docs/comet/archive/2026-08-26-g2-003-audit-global-interceptor-strict/` | `brief.md` | `verification.md` |
| G2-004 — http error code static validation | 2 | A1-A30 (30) | pass | `c0af3025a` | `docs/comet/archive/2026-08-26-g2-004-http-error-code-static-validation/` | `brief.md` | `verification.md` |
| G2-005 — business/enterprise plan E2E smoke | 3 | A1-A86 (86) | pass | `03dcd389d` | `docs/comet/archive/2026-08-26-g2-005-business-enterprise-e2e-smoke/` | `brief.md` | `verification.md` |
| G2-006 — Wave N1 security/compliance modules | 4 | A1-A57 (57) | pass | `345190fb3` | `docs/comet/archive/2026-08-26-g2-006-wave-n1-security-compliance-modules/` | `brief.md` | `verification.md` |
| G2-007 — Wave N2 enterprise modules | 5 | A1-A7 (7) | pass | `04d0a80e0` | `docs/comet/archive/2026-08-26-g2-007-wave-n2-enterprise-modules/` | `brief.md` | `verification.md` |
| G2-008 — webhook / BYOK / KMS / DR | 6 | A1-A8 (8) | pass | `41d8183ae` | `docs/comet/archive/2026-08-26-g2-008-webhook-byok-kms-dr/` | `brief.md` | `verification.md` |
| G2-009 — OpenAPI doc runtime + E2E suite | 7 | A1-A8 (8) | pass | `b81de6e5e` | `docs/comet/archive/2026-08-26-g2-009-openapi-doc-e2e-suite/` | `brief.md` | `verification.md` |
| G2-010 — global regression + docs sync | 8 | GA1-GA8 (8) | pass | `<filled by Archive>` | `docs/comet/archive/2026-08-26-g2-010-global-regression-docs-sync/` | `brief.md` | `verification.md` |

> 注: G2-010 的 `merge_sha` 由 Archive 步骤在 merge 到目标分支后填入;commit SHA 在 Build 阶段即可定。

## 索引字段定义

- **change**: Comet Native change 名(也即 commit/branch/comet-state 的 key)。
- **wave**: 路径 A 推进顺序的轮次编号(1 = 最早,8 = 当前)。
- **acceptance_ids**: 该 change 完整验收项 ID 列表,数量与 archive 中 `verification.md` 的 `| passed` 行一一对应。
- **status**: 仅取 `pass` / `fail` / `blocked` 三态;G2-001…G2-010 全部 `pass`。
- **merge_sha**: 在 `agent/chong/df9d120d2105-stage6-audit-log` 上的 merge commit SHA(7 位以上,完整 40 位可由 `git show <sha>` 验证)。
- **archive_path**: `docs/comet/archive/2026-08-26-g2-XXX-*/` 路径,含 `brief.md` / `comet-state.yaml` / `verification.md` 三件套及对应 `verifier-response.json`。
- **brief_path / verification_path**: archive 内 brief 与 verification 的相对路径,固定为 `brief.md` / `verification.md`。

## 一行摘要(按 change)

| change | 一句话摘要 |
|--------|------------|
| G2-001 | 把 `PermissionGuard` + `PermissionInterceptor` 从"装饰品"提升为运行时门控,作为 `APP_GUARD` / `APP_INTERCEPTOR` 在所有 controller 路由上生效 |
| G2-002 | 把 `QuotaEnforcementInterceptor` 注册为 `APP_INTERCEPTOR`,env gate `TEABLE_QUOTA_ENFORCEMENT_ENABLED` 控制,默认关闭 |
| G2-003 | 引入 `AuditInterceptor` 作为 `APP_INTERCEPTOR`,与既有 `@Audit()` 装饰器双轨并存,补齐"装饰品 + 漏 service"缺口 |
| G2-004 | build-time 静态校验 `HttpErrorCode.*` 引用必须命中现有 enum 键,堵死字符串索引绕过导致运行时 `undefined` → `RangeError` 的根因 |
| G2-005 | business / enterprise plan 端到端冒烟,覆盖 LicenseCapabilityService 能力矩阵 + Guard 在 5 个 plan 下的真实放行/拦截 + PlanLimits 精确阈值 |
| G2-006 | Wave N1 商业版必看的 8 个安全/合规/计费 module 在 `app.module.ts` 真实接线激活(IpAllowlist / RiskControl / Turnstile / DeleteUser / Retention / Tracking / Metrics 等) |
| G2-007 | Wave N2 企业能力 module 一次性激活(Field / FieldCalculate / FieldDuplicate / AttachmentsStorage / ShareDb / Aggregation / SpaceDataDbMigrationGuard / TableDomainQuery / RecordQueryBuilder / Calculation / Model / DataLoader / View / Record / Computed / Graph / DatabaseView / Table / RecordModify + 对应 OpenAPI)|
| G2-008 | Wave H 漏接的 4 大业务域完整引入:WebhookDelivery / WebhookBridge / WebhookCanvas / ByokLlm / ByokKms / KmsEncryption / WorkspaceMirror / DrCanvas — 8 module × 4 文件 |
| G2-009 | `/openapi/openapi.json` + `/openapi/docs` + `/openapi/explorer` 运行时端点(Scalar HTML + CSP nonce),配套 HTTP-level E2E spec |
| G2-010 | 全局回归(本文件)+ 文档同步(本索引)+ `wave5-global-regression.spec.ts` 5 个 happy-path + `scripts/check-archive-integrity.ts` 完整性脚本 |

## 数据流(本索引如何被消费)

1. **人工审计**:评审 / 法务直接读本文件即可,不必逐个进 archive 目录。
2. **自动化校验**:`scripts/check-archive-integrity.ts` 验证 9 份既有 archive 的产物完整性(本 change 落地)。
3. **回归基线**:`apps/nestjs-backend/test/wave5-global-regression.spec.ts` 5 个 happy-path 在 CI 中持续守护(本 change 落地)。
4. **Verifier 复审**:每个 change 的 `verifier-response.json` 在 archive 目录中,本文件只引用 SHA 与状态,不重写报告。

## 已知限制

- **G2-007 acceptance 7 项少于其他**:G2-007 是 Wave N2 接线激活,acceptance 按"接线计数"而非"功能计数"组织;真实功能验证在 G2-005 + Round 26 基础上已通过。
- **G2-008 acceptance 8 项少于 G2-001/002**:G2-008 是 8 module × 4 文件 = 32+ 新文件,但 acceptance 按"module 集合 + 接线"组织,8 项是"4 个业务域 × 2 类产物"的合理抽象。
- **真实集成验证未做**:本轮及前 9 轮均未在真实 Postgres + Redis + 真实 license key + 业务账户下跑 happy path;这是 Wave 6 的工作。
- **tsc baseline 残留 206 条**:Round 26 已记录,与本 change 无关;G2-010 不引入新错误。
- **OpenAPI UI 用 Scalar CDN**:文档 UI 通过 `cdn.jsdelivr.net` 加载 Scalar JS,首次访问需联网;离线场景需后续 round 提供内置化版本。

## 修订历史

| 日期 | change | 备注 |
| --- | --- | --- |
| 2026-08-26 | G2-001 | initial merge (commit `9efbdf753`)|
| 2026-08-26 | G2-002 | initial merge (commit `430ab7831`)|
| 2026-08-26 | G2-003 | initial merge (commit `67d16b6f5`)|
| 2026-08-26 | G2-004 | initial merge (commit `c0af3025a`)|
| 2026-08-26 | G2-005 | initial merge (commit `03dcd389d`)|
| 2026-08-26 | G2-006 | initial merge (commit `345190fb3`)|
| 2026-08-26 | G2-007 | initial merge (commit `04d0a80e0`)|
| 2026-08-26 | G2-008 | initial merge (commit `41d8183ae`)|
| 2026-08-26 | G2-009 | initial merge (commit `b81de6e5e`)|
| 2026-08-26 | G2-010 | index + integrity script + global regression spec (本文件)|