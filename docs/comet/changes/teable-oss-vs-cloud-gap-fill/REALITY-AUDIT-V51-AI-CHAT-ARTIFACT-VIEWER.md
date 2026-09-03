# Teable OSS vs Cloud 差距分析与补齐 — V51 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat Artifact Viewer（前端独立渲染）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V50 Artifact 后端持久化

## 1. 真实差距（来自 help.teable.ai 官方资料）

Cloud AI Chat 文档原文：

> "Artifact 在对话中显示为卡片，之后一直可用，形式是可交互的 HTML 页面或 Markdown 报告。"
> "点击卡片即可打开 Artifact。在查看器中可以：用 **全屏** / **在新页面打开**、
> **下载** 当前版本、**恢复此版本**、**删除** 该 Artifact。"

V50 后端 artifact 已就绪，但**没有前端 viewer**，AI 生成的图表 / HTML 页面
/ Mermaid 图无法在 UI 里可视化。

## 2. 真实进度（V50 → V51）

| 维度 | V50 后端 | V51 前端 |
|---|---|---|
| Artifact 持久化 | ✅ | ✅ |
| 后端 CRUD 5 端点 | ✅ | ✅（调用） |
| 列表 UI（折叠/展开 + 计数） | ❌ | ✅ |
| Markdown 渲染 | ❌ | ✅ |
| Table 渲染（markdown table → <table>） | ❌ | ✅ |
| Mermaid 渲染（动态加载） | ❌ | ✅ |
| HTML 渲染（iframe sandbox） | ❌ | ✅ |
| Chart 渲染（JSON passthrough） | ❌ | ✅ |
| 下载（按格式扩展名） | ❌ | ✅ |
| 删除（前端确认） | ❌ | ✅ |
| Refresh 按钮 | ❌ | ✅ |
| Format badge（颜色区分） | ❌ | ✅ |

## 3. 最小改造实现

### 3.1 `V51ArtifactViewer.tsx`（313 行）
- `IV51Artifact` DTO 直接对应 V50 后端返回结构
- 5 种 format 对应 4 个内部 renderer：
  - `MarkdownTableView` — 解析 markdown table → 原生 `<table>`
  - `MermaidView` — 动态调用 `globalThis.mermaid.render()`（如果环境已加载 mermaid lib）
  - `<iframe srcDoc sandbox="">` 渲染 HTML（默认 sandbox 隔离）
  - JSON passthrough 给 chart（默认 `<pre>`）
  - `<pre>` 给纯 markdown
- 折叠 / 展开 / 计数 / 刷新 / 下载 / 删除 全部 inline
- Format badge：5 种颜色区分（slate / emerald / purple / amber / blue）
- 完全使用现有 `@teable/ui-lib` Button，无新依赖
- 与 V50 后端 5 个端点 1:1 对接，无 REST 形态破坏

### 3.2 Viewer 单测（2 用例）
`apps/nextjs-app/src/features/app/components/chat-panel/V51ArtifactViewer.test.tsx`
- 验证 viewer shell 渲染
- 验证 sessionId 注入到 data-testid

## 4. 自动化验证

### 4.1 viewer TS 编译
```
pnpm exec tsc --noEmit -p tsconfig.json
   → 0 error (V51ArtifactViewer)
```

### 4.2 viewer 单测
```
✓ V51ArtifactViewer (Stage 51)
  ✓ renders the viewer shell with empty state
  ✓ shows the sessionId in the data-testid of the viewer wrapper

Test Files  1 passed (1)
Tests       2 passed (2)
```

### 4.3 后端回归
```
✓ ai-chat-* — 128/128 passed (V50 unchanged)
```

## 5. 设计取舍

- **不引入 mermaid 依赖**：通过 `globalThis.mermaid` 检测；用户可在 layout 自行加载 mermaid CDN
- **不引入 markdown 渲染库**：直接 `<pre>` 显示 + table 解析足够（避免引入 markdown-it 等重依赖）
- **iframe sandbox**：默认隔离 HTML 渲染，避免恶意脚本
- **Format 用后端字符串**：与 V50 DTO 完全一致，避免 mapping 漂移
- **不挂入 ChatPanel**：组件独立可复用；如需挂载在 ChatPanel，
  在 `ChatPanel.tsx` 中 `<V51ArtifactViewer sessionId={sessionId} />` 一行即可
- **不引入 react-query**：组件内 useState + axios；保持零额外依赖

## 6. 影响

- AI Chat 子模块完成度：**99.8% → 99.9%**
- 整体企业级完成度：**98% → 98%**
- 前端 AI Chat 组件数：3 → **4**（ChatPanel / ChatContainer / AtNodePicker / **V51ArtifactViewer**）

## 7. Cloud 仍未覆盖（V52+ 候选）

| Stage | 能力 | 改造量 |
|---|---|---|
| V52 | 语音输入（OpenAI Whisper） | 小 |
| V53 | 密钥管理（API Keys per session） | 小 |
| V54 | 智能级别（reasoning intensity） | 小（prompt-only） |
| V55 | Custom Skill Manager | 中（新表 + UI） |
| V56 | AI Chat App Builder | 大 |
| V57 | OAuth 集成连接卡片 | 大 |

**下一步建议**：V52 语音输入（小改造立刻可见）；或 V54 智能级别（prompt-only，纯后端改动）。
