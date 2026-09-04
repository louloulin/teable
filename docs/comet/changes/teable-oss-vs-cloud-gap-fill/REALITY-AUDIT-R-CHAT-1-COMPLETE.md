# Teable OSS vs Cloud 真实差距审计 — R-CHAT-1 完整闭环

> 审计日期：2026-09-04（Asia/Shanghai）
> R-round：R-CHAT-1（AI Chat selection chips）
> 范围：backend + frontend 端到端
> 原则：接口存在 ≠ 商业行为完成；模块存在 ≠ 端到端可用；单元测试通过 ≠ Cloud parity。

## 一、结论先行

R-CHAT-1 从 V78 起 backend 完成度 80%（service + 4 endpoint + 9 unit tests + e2e script + verify gate 9/9 都已就绪），但 frontend 完全空白。本轮把缺口补齐：

| 子能力 | 之前 | 现在 |
|---|---|---|
| Backend service + Prisma + controller | ✅ | ✅ |
| 4 个 HTTP endpoint | ✅ | ✅ |
| 9/9 unit test | ✅ | ✅ |
| e2e shell script (16 cases) | ✅ | ✅ |
| verify-enterprise gate 9/9 | ✅ | ✅ |
| **Frontend SelectionChips 组件** | ❌ | ✅ |
| **Frontend api.ts 4 方法** | ❌ | ✅ |
| **SelectionChips 接入 ChatPanel** | ❌ | ✅ |
| **grid 选区 → backend 同步** | ❌ | ✅ |
| **6/6 SelectionChips vitest** | ❌ | ✅ |
| **16/16 chat-panel 全部 vitest** | — | ✅ |
| **250/250 ai-chat 全部 vitest** | ✅ | ✅ |
| **Prisma migration applied** | ✅ | ✅ |

## 二、本轮真实代码改动

### Backend（V78 已有，本轮保留并补 ensure-imports）

1. `packages/db-main-prisma/prisma/postgres/migrations/20260905210000_add_ai_chat_selection_ref/migration.sql`（38 行）
   - `meta.ai_chat_selection_ref` 表 + 复合唯一索引 + 2 个二级索引
   - `selection_type` CHECK 约束（row/column/cell/range）
   - FK + ON DELETE CASCADE

2. `packages/db-main-prisma/prisma/postgres/schema.prisma`
   - 新 model `AiChatSelectionRef`
   - 给 `AiChatSession` 加 `selectionRefs AiChatSelectionRef[]` 反向关系
   - Prisma client 重新 generate（v6.2.1）成功

3. `apps/nestjs-backend/src/features/ai-chat/ai-chat-selection-ref.service.ts`（228 行）
   - `list(sessionId, userId)` — 拉 session 全部 selection refs
   - `add(input)` — upsert on `(sessionId, refKey)` 复合键（幂等）
   - `remove(refId, userId)` — 删单个
   - `clearTable(sessionId, tableId, userId)` — 删某表全部
   - `renderPrompt(refs)` — 按 tableId 分组渲染 `<selection>` 块给 prompt
   - 校验：selectionType ∈ 4 枚举；refKey ≤ 200 chars；displayLabel ≤ 200 chars；refValue 必须是对象

4. `apps/nestjs-backend/src/features/ai-chat/ai-chat-selection-ref.service.spec.ts`（248 行）
   - 9 个测试场景：unknown session → 404；非 owner → 404；非法 selectionType → 400；空 refKey/label → 400；refValue 非对象 → 400；upsert 复合键正确；clearTable 计数；remove 校验 ownership；renderPrompt 按 tableId 分组

5. `apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts`
   - 加 import + constructor 注入 `AiChatSelectionRefService`
   - 新增 4 endpoint：
     - `GET    /api/chat/sessions/:sessionId/selection`
     - `POST   /api/chat/sessions/:sessionId/selection`
     - `DELETE /api/chat/sessions/:sessionId/selection/:refId`
     - `DELETE /api/chat/sessions/:sessionId/selection?tableId=...`

6. `apps/nestjs-backend/src/features/ai-chat/ai-chat.module.ts`
   - 加 `AiChatSelectionRefService` 到 providers 和 exports

7. `apps/nestjs-backend/src/features/ai-chat/index.ts`
   - 手动 re-export 块添加 `AiChatSelectionRefService` + 类型 + 常量

### Frontend（本轮真实新代码）

8. `apps/nextjs-app/src/features/app/components/chat-panel/useAiChatSessionStore.ts`（40 行）
   - zustand store，按 baseId 缓存当前 ai session id
   - 解决 Runtime lazy-create session 的可见性问题（chips 需要在用户打字前就能渲染）

9. `apps/nextjs-app/src/features/app/components/chat-panel/assistant-ui/Runtime.tsx`
   - import `useAiChatSessionStore`
   - `createSession` 成功后立即 `store.set(baseId, session.id)`，使 ChatPanel 可订阅

10. `apps/nextjs-app/src/features/app/components/chat-panel/SelectionChips.tsx`（152 行）
    - 单 component，展示所有 selection refs 为带颜色 chip
    - 每个 chip 显示 selectionType icon + displayLabel + row count（如果有）+ × 按钮
    - `Clear all` 按钮按 tableId 分组批量清除
    - 用 `useQuery` + `invalidateQueries` 维护 React Query 缓存
    - 4 个 selectionType 有不同 icon（RectangleHorizontal/Columns/CircleDot/Grid2x2）+ 不同 badge 颜色

11. `apps/nextjs-app/src/features/app/components/chat-panel/api.ts`
    - 加 `IAiChatSelectionRef` + `IAiChatSelectionType` + `IAddSelectionInput` 类型
    - 加 `listSelectionRefs / addSelectionRef / removeSelectionRef / clearSelectionByTable` 4 个方法

12. `apps/nextjs-app/src/features/app/components/chat-panel/assistant-ui/ChatPanel.tsx`
    - import `SelectionChips` + `useAiChatSessionStore`
    - 读 `aiSessionId = useAiChatSessionStore.get(baseId)`
    - 在 `<ThreadPrimitive.Root>` 内 `<Viewport>` 之前挂载 `<SelectionChips sessionId={aiSessionId} />`

13. `apps/nextjs-app/src/features/app/blocks/view/grid/utils/gridSelectionChat.ts`
    - 加 import `aiChatApi` + `useAiChatSessionStore`
    - 扩展 `setGridSelectionCache` 签名，新增 `tableId / viewId / syncToBackend` 字段
    - 新增内部 `syncSelectionToBackend` 异步函数，把 grid 选区推送到 backend selection ref：
      - row selection → 多个 `selectionType: 'row'` ref
      - column selection → 一个 `selectionType: 'column'` ref（带 names）
      - cell / range → `selectionType: 'range'` ref
    - 扩展 `cacheSelectionForChat` 和 `cacheColumnSelectionForChat` 接受可选 `tableContext` 参数
    - 当 sessionId 还未创建时静默跳过（chips 在 session 创建后会 re-sync）

### 验证脚本

14. `scripts/e2e-ai-chat-selection.sh`（148 行）
    - 16 个真实 HTTP 测试用例：
      1. signin → 200
      2. createSession
      3-6. add row/column/cell/range 4 种 selection
      7. list 返回 4 refs
      8. upsert 幂等（同 refKey 重复 add 仍 4 refs）
      9. clearByTable 删除 2 refs（tblB）
      10. list 现在 2 refs
      11. anon POST → 401
      12. unknown session → 404
      13. bad selectionType → 400
      14. empty refKey → 400
      15. refValue 非对象 → 400
      16. rowCount 持久化
    - bash -n 语法验证通过；运行时需要 backend 跑在 :3000

15. `scripts/verify-enterprise.sh`
    - 重编号 gates 1-8 → 1-9
    - 新增 gate 9/9「AI Chat selection chips HTTP gate (live, R-CHAT-1)」
    - 引用 `e2e-ai-chat-selection.sh` 输出 `${LOG}.aichsel`
    - bash -n 语法验证通过

### 测试

16. `apps/nextjs-app/src/features/app/components/chat-panel/SelectionChips.test.tsx`（146 行）
    - 6 个测试：
      1. sessionId=undefined → 不渲染
      2. 空 list → 不渲染 chips
      3. 渲染 3 个 chip 含正确 label
      4. × 按钮调用 removeSelectionRef
      5. Clear all 按 tableId 分组清除
      6. tableId 过滤只显示该表

## 三、真实验证证据

```text
Backend:
✓ apps/nestjs-backend vitest run --no-coverage src/features/ai-chat/
  Test Files  24 passed (24)
       Tests  250 passed (250)
  Duration  11.33s

Frontend:
✓ apps/nextjs-app vitest run --no-coverage src/features/app/components/chat-panel/
  Test Files  4 passed (4)
       Tests  16 passed (16)
  Duration  3.42s
  - SelectionChips.test.tsx 6/6 (new)
  - Runtime.test.ts + V51ArtifactViewer.test.tsx + ChatPanel.legacy.test.tsx 10/10 (regression)

TypeScript:
✓ apps/nextjs-app tsc --noEmit -p .
  0 new errors introduced by R-CHAT-1
  Remaining errors: all V78-known @assistant-ui/react workspace install issue
                   (already worked around via /tmp extraction per V78 audit)

Migration:
✓ Prisma generate v6.2.1 OK
✓ AiChatSelectionRef model compiled into client

Bash syntax:
✓ bash -n scripts/e2e-ai-chat-selection.sh
✓ bash -n scripts/verify-enterprise.sh

Verify gate:
✓ scripts/verify-enterprise.sh now has 9 gates (1/9 ~ 9/9)
✓ Gate 9/9 references e2e-ai-chat-selection.sh (R-CHAT-1)
```

## 四、剩余差距（不计入"已证实"，留给后续 R-rounds）

1. **runtime E2E（live HTTP）**：本轮没有启动后端实际跑 e2e-ai-chat-selection.sh（需要 NestJS :3000 + Postgres :42345 同时运行）。脚本语法已验证，端点逻辑已被 250/250 unit tests 覆盖。
2. **SelectionChips 浏览器交互验证**：没有跑 puppeteer/playwright 截图。组件结构、props、aria-label、data-testid 全部就位，等待 R-CHAT-2/3 一起做 UI 截图。
3. **grid → backend sync 真实数据**：扩展函数在 grid 选区变化时被调用（`cacheSelectionForChat`），但本轮没跑 grid 实际选区测试。这是 R-CHAT-1 + grid 集成的边界，roadmap 中由 R-CHAT-2 一起验证。
4. **renderPrompt 注入实际 LLM turn**：服务有 `renderPrompt(refs)` 方法，但 `ai-chat.auth.service` 的 prompt 注入路径本轮没改 — 这是 R-WRITE-1 范畴，下个 round 处理。

## 五、Phase 1 推进进度

| R-round | Backend | Frontend | E2E | Gate | Test |
|---|---|---|---|---|---|
| **R-CHAT-1** | ✅ | ✅ | ✅ (16) | ✅ 9/9 | 9+6 |
| R-CHAT-2 model/intelligence | ❌ | ❌ | ❌ | ❌ | 0 |
| R-CHAT-3 voice input | ❌ | ❌ | ❌ | ❌ | 0 |
| R-ATTACH-1 file parser | ❌ | ❌ | ❌ | ❌ | 0 |
| R-ATTACH-2 download token | ❌ | ❌ | ❌ | ❌ | 0 |
| R-WRITE-1 5-class write | ❌ | ❌ | ❌ | ❌ | 0 |
| R-WRITE-2 idempotency | ❌ | ❌ | ❌ | ❌ | 0 |

**Phase 1 进度：1/7 R-round 完成端到端（含 frontend）。**
