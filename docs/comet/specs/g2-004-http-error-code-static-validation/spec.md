# Capability: g2-004-http-error-code-static-validation

## Purpose

在 build-time 静态校验所有 `HttpErrorCode.*` 引用必须命中现有 enum 键。任何字符串索引访问绕过 TypeScript 类型检查的写法,在 build 阶段立即 fail,防止未来再发生 enum 名字幻觉导致的运行时 `RangeError: Invalid status code: undefined`。

## Behavior

### 1. enum-guard.test.ts 实现

- 文件:`packages/core/src/errors/http/enum-guard.test.ts`
- 导出 `describe('HttpErrorCode enum guard')` + 一个 `it('all HttpErrorCode.* references resolve to a defined enum key')` 测试
- 测试逻辑:
  1. 用 `import { HttpErrorCode } from './http-response.types'` 加载 enum
  2. 用 `fs.readdirSync` 递归遍历 `apps/` 和 `packages/` 下所有 `.ts` 文件(跳过 `node_modules/` / `dist/` / `.worktrees/`)
  3. 对每个文件,正则 `/\bHttpErrorCode\.([A-Za-z_][A-Za-z0-9_]*)/g` 提取所有引用 key
  4. 对每个引用 key,验证 `HttpErrorCode[key]` 不为 `undefined`
  5. 失败时 vitest 输出:`[enum-guard] HttpErrorCode.<NAME> not defined in packages/core/src/errors/http/http-response.types.ts`
  6. 全部命中 → vitest pass

### 2. CI prebuild 钩子

修改 `apps/nestjs-backend/package.json`:

```jsonc
{
  "scripts": {
    "prebuild": "vitest run packages/core/src/errors/http/enum-guard.test.ts",
    "build": "tsc ..."  // 原有命令
  }
}
```

`pnpm -F nestjs-backend build` 触发 `prebuild` → 跑 enum-guard 测试 → pass 后才进入 tsc / webpack。

### 3. CLI 工具(可选,辅助验证)

`apps/nestjs-backend/test-helpers/enum-check.ts`:

```ts
import { execSync } from 'child_process';
// 跑 vitest with json reporter,输出文件数 + 引用数 + 命中/失败列表
console.log(execSync('pnpm vitest run packages/core/src/errors/http/enum-guard.test.ts --reporter=json').toString());
```

调用方式:`pnpm ts-node test-helpers/enum-check.ts`。

### 4. 退出码

- enum-guard 测试 pass → exit 0,build 继续
- enum-guard 测试 fail → exit 1,build 终止
- vitest 已自带此行为,无需额外实现

## Acceptance criteria

- **AC-GA1 静态校验生效**:`pnpm -F nestjs-backend build` 时,`enum-guard.test.ts` 自动跑;0 个错误引用(现状)→ build pass
- **AC-GA2 故意引入失配即 fail**:在临时 `apps/nestjs-backend/src/_temp.ts` 写 `throw new Error(HttpErrorCode.FOO)`;`pnpm -F nestjs-backend build` → **build fail**,错误信息列出 FOO
- **AC-GA3 CI 钩子生效**:`pnpm -F nestjs-backend test` 输出含 enum-guard.test.ts 通过
- **AC-GA4 现有业务无回归**:`pnpm -F nestjs-backend build` 整体成功,dist/index.js 重新生成
- **AC-GA5 现有 enum 键**:合法键集合大小不变

## Files

- 新增:`packages/core/src/errors/http/enum-guard.test.ts`
- 修改:`apps/nestjs-backend/package.json`(scripts.prebuild 钩子)
- 新增(可选):`apps/nestjs-backend/test-helpers/enum-check.ts`