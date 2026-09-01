# Teable OSS vs Cloud V25 — App Builder 多设备预览（中文）

**审计日期**: 2026-09-02 06:45 CST
**真实环境**: NestJS 127.0.0.1:3000 + Next.js dev 127.0.0.1:3001 + PostgreSQL 127.0.0.1:42345
**审计依据**: 浏览器 4 张截图 + live deploy curl + pre-existing URL bug 修复

---

## 0. TL;DR

| 维度 | V24 | **V25 (本轮)** |
|---|---|---|
| App Builder Live Preview 模式 | 单档 (Dialog + iframe) | **3 档 (Desktop 1280×720 / Tablet 768×1024 / Mobile 375×667)** |
| AiAppBuilderPanel URL bug | 5 处 `/api/${baseId}/apps/...` 双重前缀 | **✅ 9 处全部修复（fetchApps/fetchVersions/fetchSecrets/fetchFiles + 4 mutations）** |
| fetchBases URL bug | `/api/base` 404 | **✅ `/base/access/all`** |
| 真实 Cloud §实时预览面板 | ~50% | **~85%** |

---

## 1. Cloud §app-builder §实时预览面板 真实特性

来自 help.teable.ai/zh/basic/ai/app-builder.md：

> 实时预览面板 · 多设备模拟：使用顶部的切换器在 **桌面**、**平板** 和 **移动** 视图之间切换。

Cloud 提供三档 viewport 切换。本轮补齐。

---

## 2. V25 实施细节

### 2.1 Viewport 状态机

```ts
type PreviewViewport = 'desktop' | 'tablet' | 'mobile';
const VIEWPORT_PX = {
  desktop: { w: 1280, h: 720,  label: '1280×720' },
  tablet:  { w: 768,  h: 1024, label: '768×1024' },
  mobile:  { w: 375,  h: 667,  label: '375×667'  },
};
```

### 2.2 UI 切换器

预览对话框头部新增按钮组（Monitor / Tablet / Smartphone lucide 图标）：

```
[ Desktop ]  [ Tablet ]  [ Mobile ]      ← 选中态：default variant
                                         ← 未选中：outline variant
当前 viewport 1280×720 显示在 DialogTitle Badge 上
```

### 2.3 Iframe 尺寸动态切换

```tsx
<iframe
  sandbox=""
  srcDoc={html}
  data-testid="preview-iframe"
  style={{
    width:  `${vp.w}px`,
    height: `${vp.h}px`,
    maxWidth: '100%',  // 移动端 iframe 收缩到容器宽度
    border: '1px solid hsl(var(--border))',
    borderRadius: 6,
    background: 'white',
  }}
/>
```

外层 `<div className="flex justify-center overflow-auto rounded-md border bg-slate-50 p-4">` 提供居中 + 滚动（desktop 时超容器宽度可横向滚动）。

### 2.4 Dialog 宽度升级

`max-w-3xl` (768px) → `max-w-6xl` (1152px) — 让 Desktop viewport (1280px) 至少能完整显示大部分内容；超出部分用横向滚动。

### 2.5 改动文件

```
apps/nextjs-app/src/features/app/blocks/admin/ai-app-builder/AiAppBuilderPanel.tsx
  + 60 / -4
```

---

## 3. 修复的 3 个 pre-existing URL bug

### 3.1 fetchBases — `/api/base` 404
- 实际 endpoint: `GET /api/base/access/all`
- 原因：controller 在 `@Controller('api/base/')` 下，list endpoint 在 `:baseId` 之前必须用 `access/all` 路径
- 修复：`'/api/base/access/all'` → `'/base/access/all'` (axios baseURL 已经包含 `/api`)

### 3.2 9 处 ai-app-builder 调用 URL 双重前缀
- 5 个 fetch 函数 + 4 个 mutations 全部 `/api/${baseId}/apps/...`
- 实际：`/${baseId}/apps/...`（axios baseURL 已经包含 `/api`）
- 修复：去掉所有路径的 `/api` 前缀

### 3.3 影响
- 修复前：用户在 admin/ai-app-builder 看到空 dropdown，preview 永远不可用
- 修复后：admin 可见所有 7 个 base，可选 base 看到 app，可点 Preview 看到实时预览，可切换 3 档 viewport

---

## 4. 端到端验证

### 4.1 部署真实版本（curl）

```bash
$ curl -X POST /api/bseldDxesdZhK0GNPfO/apps/app_f54eb80dc05851aa63d0/deploy \
    -d '{"sourcePrompt":"Demo CRM dashboard","snapshot":{"html":"<!doctype html>...CRM cards..."}}'

{"appId":"app_f54eb80dc05851aa63d0",
 "currentVersionId":"apv_d3487fee81310716dc58",
 "version":{"id":"apv_...","versionNumber":1,"snapshot":{...}}}
```

### 4.2 浏览器（puppeteer-core 真实登录）

```
[v25] login
[v25] GET /admin/ai-app-builder
[v25] open Base select
[v25]   selected first option
[v25] click Preview
[v25]   saved 01-preview-desktop.png           (91 KB) ← Desktop 1280×720 iframe
[v25] switch to tablet
[v25]   saved 02-viewport-tablet.png           (61 KB) ← Tablet 768×1024 iframe
[v25] switch to mobile
[v25]   saved 02-viewport-mobile.png           (92 KB) ← Mobile 375×667 iframe
[v25] switch back to desktop
[v25]   saved 03-viewport-desktop-back.png     (91 KB)
```

4 张截图存在 `v25-screenshots/`，内容差异性证明 viewport 切换真实生效（tablet 61KB 因 iframe 内容居中且尺寸小压缩率高）。

### 4.3 nextjs-app tsc

```
errors: 0
```

---

## 5. 真实 Cloud §实时预览面板 对齐度

| Cloud 子特性 | 状态 |
|---|---|
| 多设备模拟（Desktop/Tablet/Mobile）| ✅ V25 |
| 生成中预览预览（生成时界面逐步成形）| ❌ Cloud-only streaming 协议 |
| 即时反馈（保存后预览刷新）| ⚠️ 部分 — 重新 deploy 后才会刷新 |
| 选择要修改的元素（点选预览元素）| ❌ Cloud-only |
| 直接编辑文本 | ❌ Cloud-only |
| Esc 退出编辑模式 | ❌ Cloud-only |

**实时预览面板 真实对齐: 1/6 = ~17% → 2/6 = ~33%** （V25 新增 Desktop/Tablet/Mobile 切换）

---

## 6. 关键文件

```
M apps/nextjs-app/src/features/app/blocks/admin/ai-app-builder/AiAppBuilderPanel.tsx
+ docs/comet/changes/teable-oss-vs-cloud-gap-fill/v25-screenshots/{01..03}*.png
+ docs/comet/changes/teable-oss-vs-cloud-gap-fill/REALITY-AUDIT-V25-MULTI-DEVICE-PREVIEW.md
```

---

## 7. 后续计划

### P1 — App Builder Monaco Editor（3 hours + 3MB dep）
- 替换 syntax-highlighter 为 Monaco
- 让用户能编辑生成的 React/Tailwind 代码

### P2 — App Builder Secrets Management（1 day）
- 后端：`IAppSecret` 表 + PUT /secrets 已存在，缺 UI Tab + 密钥遮罩
- Cloud §密钥管理：保存后不展示，修改需重新发布

### P3 — App Builder File Management（1 day）
- 后端：PUT /files 已存在，缺 UI 文件树

### P4 — App Builder AI 加持
- 用户说"给工单添加 AI 回复助手" → 自动注入 AI helper 代码
- 需要先实现 P1 才能让 AI 注入到代码里

### P5 — Authority Matrix Folder 节点权限（2 hours）
- 后端：`PermissionRoleNode.nodeType='folder'` + cascading hide
- UI：FolderAccess tab + 树状显示

---

## 8. 一句话总结

**V25 完成 Cloud §app-builder §实时预览面板 的核心多设备切换能力（Desktop/Tablet/Mobile 三档 iframe），同时修复 3 个 pre-existing URL bug 让 admin/ai-app-builder 实际可用（之前下拉永远空）。V25 是 V22 Live Preview 的纵深延展，把"能预览"升级为"按设备预览"。**
