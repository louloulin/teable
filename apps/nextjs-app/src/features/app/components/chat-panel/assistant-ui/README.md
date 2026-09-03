# assistant-ui 改造 — ChatPanel

## 当前实现

`ChatPanel.tsx` 已使用真实 `@assistant-ui/react` 0.10 API：

- `useLocalRuntime(adapter)` 接入 Cuppy 的 `ChatModelAdapter`
- `AssistantRuntimeProvider` 提供运行时上下文
- `ThreadPrimitive.Root/Viewport/Messages/Empty/Suggestion` 负责线程 UI
- `MessagePrimitive.Root/Parts` 负责用户和助手消息渲染
- `ComposerPrimitive.Root/Input/AddAttachment/Send` 负责输入和附件
- `AttachmentAdapter` 负责把文件上传到 Cuppy 文件存储

`Runtime.tsx` 把 assistant-ui 的 `ThreadMessage` 转为现有 HTTP API：

- 无 `baseId`：`POST /api/cuppy/chat/stream`
- 有 `baseId`：创建 `/api/chat/sessions`，随后调用
  `POST /api/chat/sessions/:id/turn/stream`
- `attachmentIds` 从 assistant-ui attachment metadata/id 提取并透传给后端
- SSE delta 转成 assistant-ui `ChatModelRunResult`，支持流式渲染

## 依赖与安装

`apps/nextjs-app/package.json` 和根 `pnpm-lock.yaml` 已声明
`@assistant-ui/react: ^0.10`，锁定解析版本为 `0.10.50`。本机当前
`pnpm install` 受到 Node 24 + pnpm 递归栈溢出影响（`RangeError:
Maximum call stack size exceeded`），所以当前工作区没有生成
`apps/nextjs-app/node_modules/@assistant-ui/react`；这不是代码 shim。

在可正常安装依赖的环境执行：

```bash
pnpm install --frozen-lockfile
pnpm --filter @teable/app exec tsc --noEmit
```

不要再把 `@assistant-ui/react` 路径映射到本地 shim；实现必须使用真实包。

## 保留与未完成项

- `ChatPanel.legacy.tsx` 暂时保留用于回滚/A-B 对比，不再是默认实现。
- Cuppy `@node` picker 与 `V51ArtifactViewer` 尚未嵌入 assistant-ui 的
  `ThreadPrimitive.Messages components`，下一步应注册自定义 tool/source/artifact
  part，而不是继续复制旧 DOM。
- Usage、model picker、voice input、citation、rename/fork 等 Cloud UI
  仍需分别接入 assistant-ui runtime/adapter。
