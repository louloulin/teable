# Teable OSS 与 Cloud 差距审计（V78）— assistant-ui 真实接入

> 审计日期：2026-09-03（Asia/Shanghai）
> 本版范围：AI Chat UI 迁移、附件流转、真实构建验证。
> 原则：声明了依赖不等于依赖已安装；组件能编译不等于 HTTP 行为闭环。

## 一、结论先行

V78 已把默认 `ChatPanel` 改成真实 assistant-ui runtime 架构，不再使用上一轮
临时 shim：

- 使用 `@assistant-ui/react` 0.10 的 `useLocalRuntime`、
  `AssistantRuntimeProvider`、`ThreadPrimitive`、`MessagePrimitive`、
  `ComposerPrimitive`。
- `CuppyAdapter` 实现真实 `ChatModelAdapter`，消费 `ThreadMessage`，以
  `AsyncGenerator<ChatModelRunResult>` 输出流式 delta。
- 附件先创建/复用 Cuppy conversation，再上传文件；首条消息不会因为 AI
  session 尚未创建而丢附件。
- AI Chat stream 已将 `attachmentIds` 从前端传到后端；后端 `chatTurn` 与
  `chatTurnStreaming` 都注入附件文本块。前端优先发送后端 `token`（不是
  `attachmentId`），避免上传成功但内容查不到。

依赖安装仍存在工作区级阻断：`pnpm install --frozen-lockfile --lockfile-only`
可以通过，但完整链接阶段在当前 workspace 循环依赖上触发
`RangeError: Maximum call stack size exceeded`/OOM。为验证源码本身，我从锁定版本
安装真实 `@assistant-ui/react@0.10.50` 到隔离目录并复制到未跟踪的本地依赖目录；
这不是最终安装方案，但足以证明真实包下的 TypeScript 与 production build 可通过。

## 二、已实现的最小改造

| 文件 | 改造 | 状态 |
|---|---|---|
| `apps/nextjs-app/src/features/app/components/chat-panel/ChatPanel.tsx` | 改为 assistant-ui public barrel | 已完成 |
| `.../assistant-ui/ChatPanel.tsx` | 真实 primitives + attachment adapter | 已完成，依赖安装后验证 |
| `.../assistant-ui/Runtime.tsx` | Cuppy/AI Chat stream → ChatModelAdapter | 已完成，tsc 通过 |
| `.../chat-panel/api.ts` | AI stream 接收并发送 `attachmentIds` | 已完成 |
| `apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts` | stream body 接收 `attachmentIds` | 已完成 |
| `apps/nestjs-backend/src/features/ai-chat/ai-chat.auth.service.ts` | streaming prompt 注入附件文本 | 已完成 |
| `apps/nextjs-app/package.json` | 声明 `@assistant-ui/react: ^0.10` | 已完成 |
| `pnpm-lock.yaml` | 锁定 0.10.50 及其依赖 | 已完成 |
| `apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts` | 修复 SWC 不支持的动态 Express 类型 | 已完成 |
| `apps/nestjs-backend/src/features/ai-chat/ai-chat-attachment-extractor.service.ts` | 按真实 Prisma 模型从 `path` 派生文件名 | 已完成 |

## 三、真实验证证据

### 通过

```text
apps/nextjs-app: tsc --noEmit --skipLibCheck -p .  # 0 errors with real package
apps/nextjs-app: next build                         # compiled + pages generated
apps/nextjs-app vitest: Runtime.test.ts + ChatPanel.legacy.test.tsx   # 8/8
apps/nestjs-backend vitest: attachment extractor + prompt injection # 10/10
module indexes: top-level + recursive --check                         # 0 drift
HTTP: backend /auth/login=200, frontend /auth/login=200, / -> 307 /space
HTTP: unauthenticated /api/chat/sessions=401
```

上述前端 tsc 使用了从 lockfile 解包到 `/tmp` 的真实 0.10.50 类型进行类型
解析；不是本地 shim。

### 失败或未完成

```text
pnpm install --filter @teable/app --frozen-lockfile --offline
→ workspace link phase still hits RangeError/OOM in pnpm 9.13

backend full tsc --noEmit
→ existing baseline errors remain across agent-orchestrator/ai-chat specs and e2e;
  no new controller error after the SWC fix
```

前一次 `next build` 的缺包失败是依赖物化失败的直接结果；使用真实包本地副本后
已通过。生产启动必须显式设置 `BACKEND_API_URL=http://127.0.0.1:3000`，否则
前端会把自己的 `PORT` 当成后端端口，SSR 登录页返回 500；这属于部署配置约束，
不是 assistant-ui 代码错误。

## 四、与 Cloud 商业版仍存在的 UI 差距

| Cloud 能力 | V78 当前真实状态 | 差距 |
|---|---|---|
| 对话线程、流式输出、空状态、suggestions | assistant-ui primitives 已接入 | 基础闭环 |
| 文件附件 | 前端 AttachmentAdapter + 后端文本注入 | 需要真实部署后上传/回显 E2E |
| @node | 旧 `AtNodePicker` 仍存在，但未接入 composer 统一状态 | P1 |
| Artifact / tool call | 默认 Message parts 尚未注册自定义 artifact renderer | P1 |
| Usage/tokens | 后端已有 usage，面板未展示 | P1 |
| model picker / smart level | 后端接口存在，新的 composer 未接入 | P1 |
| Citation/source | 后端 citation 模块存在，assistant-ui Source part 未映射 | P1 |
| voice input | 未实现 | P1 |
| rename/fork/edit/regenerate | 旧面板部分逻辑未迁移 | P1 |
| Skills UI | 后端 skill scope 存在，前端入口仍缺 | P0/P1 |
| Connect & Migrate 对话式编排 | 未闭环 | P1 |
| Auto-fix build | 未实现 | P2 |

因此，Cloud parity 不能因“采用 assistant-ui”直接上调；AI Chat UI 估计由
V77 约 60% 提升到约 66%，整体 Cloud parity 仍约 75%。这是功能覆盖估算，
不是商业版等价声明；附件真实登录后上传→stream→内容回显 E2E 仍未完成。

## 五、后续计划（按最佳最小改造）

### V79 — 先让默认构建与上传闭环

1. 修复 workspace 循环依赖或升级兼容的 pnpm 安装链，完成真实
   `pnpm install --frozen-lockfile`；禁止把隔离复制包作为交付方案。
2. 在带 `BACKEND_API_URL` 的标准启动命令下重新运行 `next build` 和服务启动。
3. 新增真实 E2E：登录 → 打开 ChatPanel → 上传 text 文件 → 发送消息 →
   断言 stream 请求携带 attachment token、assistant response 可见文件内容。
4. 修复 `CuppyAdapter` session/conversation 清理和取消请求（`abortSignal`）。

### V80 — assistant-ui 原生能力补齐

1. `ThreadPrimitive.Messages components` 注册 artifact/tool/source parts。
2. 用 `useThread`/`useThreadComposer` 接入 @node picker、model picker、smart level。
3. 展示 usage/tokens、citation/source、错误与 fallback 状态。
4. 迁移 rename/fork/edit/regenerate，旧面板只保留一个版本周期。

### V81+ — Cloud 企业能力

Skills UI、Connect & Migrate、voice、公开 URL/自定义域真实部署、Billing/配额、
SIEM/合规策略、Auto-fix sandbox，均必须逐项拥有 HTTP/UI E2E 证据。
