# Outcome

在 OSS 仓库的 build-time 静态校验所有 `HttpErrorCode.*` 引用必须命中现有 enum 键,任何字符串索引访问绕过 TypeScript 类型检查的写法 → build fail。补齐 Round 26 G1 修复暴露的"enum 名字幻觉"根因(Stage 21 sso FAILED、Stage 131 domain-verification FORBIDDEN 都是字符串索引访问绕过 → 运行时 undefined → RangeError)。最终交付是**单 PR commit**。

# Scope

## Source coverage

> 来源:LUM-18 Round 26 / Round 27 修复暴露的 4 个 enum 名字幻觉,均为本用户原创或同一会话前序交付。

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Round 26 Bug 1 | `domain-verification.controller.ts:80,86` / `custom-domain.controller.ts:60` | `complete` | `HttpErrorCode.FORBIDDEN` 不存在,实际写的是 `undefined` |
| Round 26 Bug 2 | `sso-auth.service.ts:64,126` / `sso.service.ts:162,252,259,321,371` | `complete` | `HttpErrorCode.FAILED` 不存在,实际写的是 `undefined` |
| 现存 enum | `packages/core/src/errors/http/http-response.types.ts` | `complete` | 现有合法键:`RESTRICTED_RESOURCE` (403) / `UNAUTHORIZED` (401) / `VALIDATION` (400) / `FAILED_DEPENDENCY` (424) 等 |

## 本 change 落地范围

1. **新增 build-time 静态校验**:
   - 文件:`packages/core/src/errors/http/enum-guard.test.ts`
   - 用 Node `fs.readdirSync` + `fs.readFileSync` + 正则 `/\bHttpErrorCode\.([A-Za-z_][A-Za-z0-9_]*)/g` 扫描 `apps/` 和 `packages/` 下所有 `.ts` 文件
   - 对每个匹配项,验证 `HttpErrorCode[<key>]` 在 `packages/core/src/errors/http/http-response.types.ts` 的 enum 里**存在**
   - 不存在 → vitest 测试 fail,build 终止
   - 退出码:vitest 0=pass,1=fail,正常集成到 `pnpm -F nestjs-backend build` 的 `prebuild` 钩子里

2. **修复现存所有 enum 幻觉引用**:
   - 扫全仓库,列出当前**已知**的 enum 幻觉:`FORBIDDEN` (应改 `RESTRICTED_RESOURCE`)、`FAILED` (应按语义改 `UNAUTHORIZED` / `VALIDATION` / `FAILED_DEPENDENCY`)
   - 历史已修:Round 26 已修 domain-verification / custom-domain / sso-auth / sso.service.ts 的 9 处
   - **本 change** 不重复修,只确保新增静态校验后未来不再发生

3. **CI 集成**:`apps/nestjs-backend/package.json` `scripts.build` 改为 `"prebuild": "vitest run packages/core/src/errors/http/enum-guard.test.ts && tsc ..."` 或类似钩子(vitest 在 pnpm 8+ 已内置,与项目 `vitest run` 命令一致)

4. **可执行验证**:新增 `apps/nestjs-backend/test-helpers/enum-check.ts` CLI 工具,运行 `pnpm ts-node test-helpers/enum-check.ts` 输出"扫描 N 文件,发现 M 引用,全部命中 / 列出失败引用"

# Non-goals

- **不修改** `HttpErrorCode` enum 本身(只补校验,不重命名 enum 键)
- **不引入** TypeScript ESLint 插件(避免新增 npm 依赖;用 Node 内置 fs + 正则)
- **不修改** 现有业务逻辑
- **不复制** `teableio/teable-ee` 任何源代码
- **不**修历史 enum 幻觉(已修)
- **不**做运行时的 enum key 反射增强

# Acceptance examples

- **GA1 静态校验生效**:`pnpm -F nestjs-backend build` 时,`enum-guard.test.ts` 自动跑;**0 个错误引用**(现状)→ build pass
- **GA2 故意引入失配即 fail**:在临时文件 `apps/nestjs-backend/src/_temp.ts` 写 `throw new Error(HttpErrorCode.FOO)`;`pnpm -F nestjs-backend build` → **build fail**,错误信息列出 `FOO` 不在 enum 键集合里
- **GA3 CI 钩子生效**:`pnpm -F nestjs-backend test` 输出含 `enum-guard.test.ts` 通过
- **GA4 现有业务无回归**:`pnpm -F nestjs-backend build` 整体成功,dist/index.js 重新生成
- **GA5 现有 enum 键**:`packages/core/src/errors/http/http-response.types.ts` 的合法键集合大小**不变**(只补强校验,不增减键)

# Constraints and invariants

- **AGPL-3.0 合规**:任何新增源代码在本仓库内
- **零现有热路径改动**:`HttpErrorCode` enum 本身不变
- **零新增 npm 依赖**:Node `fs` / `path` / 正则足够,`vitest` 已是项目依赖
- **build-time only**:不在 runtime 抛错,只 build 时 fail
- **扫描范围**:只扫 `apps/` 和 `packages/`,跳过 `node_modules/` / `dist/` / `.worktrees/`

# Decisions

1. **build-time test vs ESLint rule**:选 vitest 测试 + prebuild 钩子,因为不引入新依赖、可以直接用现有 `vitest run` 命令;ESLint plugin 需要新增 `@typescript-eslint/utils` 等依赖
2. **正则 vs AST**:选正则,因为 enum key 访问语法固定 `HttpErrorCode.NAME`,AST 反而过度工程
4. **修复历史 vs 只补校验**:选只补校验,因为历史 9 处已在 Round 26 修复,本 change 只防止**未来**再发生
3. **CI prebuild 钩子 vs husky pre-commit**:选 prebuild,因为 enum 幻觉会立即导致运行时 RangeError,build-time fail 阻断 CI;pre-commit 太晚(本地可能跳过)

# Open questions

- 无。用户原文 "全量实现" = 同意本 child 在 supervisor 之外独立落地。

# Verification expectations

- **build-time**:`pnpm -F nestjs-backend build` 整体成功(`enum-guard.test.ts` 在 prebuild 钩子中通过)
- **test-time**:`pnpm -F nestjs-backend test` 含 `enum-guard.test.ts` 通过
- **failure 路径**:故意引入 `HttpErrorCode.FOO` → `pnpm build` 应该 fail 并列出 FOO
- **扫描输出**:`pnpm ts-node test-helpers/enum-check.ts` 输出文件数 + 引用数 + 命中/失败列表