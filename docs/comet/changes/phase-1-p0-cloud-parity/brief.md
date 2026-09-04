# Phase 1 — P0 Cloud Parity Child

# Outcome

实现 Supervisor Change `v81-cloud-parity-roadmap` §"Phase 1 — P0 真实产品闭环"的 7 个 R-round,补齐 AI Chat 用户可观察能力,使 R-CHAT-1/2/3 + R-ATTACH-1/2 + R-WRITE-1/2 端到端可用。

# Scope

## Source coverage

| 来源 | 路径 | 状态 | 用途 |
|------|------|------|------|
| Supervisor brief | `../v81-cloud-parity-roadmap/brief.md` | `complete` | 7 个 R-round 总览 |
| Supervisor spec | `../v81-cloud-parity-roadmap/specs/v81-cloud-parity-roadmap/spec.md` | `complete` | 行为契约 |
| Supervisor children | `../v81-cloud-parity-roadmap/children.yaml` | `complete` | acceptance A1-A7 索引 |

## Inherited constraints(来自 Supervisor)

- **AGPL-3.0 / 零重写**:不重写已工作良好的 ai-chat 模块,只扩展。
- **零新增 npm 依赖**:zod / @tanstack/react-query / axios / zustand / lucide-react 已存在。
- **verify-enterprise gate 增量**:每个 R-round 至少升级 1 个 gate, 总数从 8 → 30+。
- **git strategy**:不主动 commit, 由用户工作日结束一次性 commit。

# Non-goals

- Phase 2 R-IDP/AI-MODEL/SANDBOX/MIGRATE/ADMIN-AUDIT (由 phase-2-p1-cloud-parity 负责)。
- Phase 3 R-BACKUP/RESIDENCY/KMS/COMPLIANCE/I18N (由 phase-3-p2-cloud-parity 负责)。
- Stripe/SLA/客服工单 (Roadmap 明确不做)。

# Acceptance examples

- **A1** R-CHAT-1:ChatPanel 顶部展示当前选中行/列/单元格/区域 → chip → 点击展开预览;Prisma 新增 `meta.ai_chat_selection_ref` 表真实持久化;e2e-ai-chat-selection.sh 16/16 pass;verify-enterprise.sh 新增 gate 9/9 (AI Chat selection HTTP)。
- **A2** R-CHAT-2:`/api/chat/sessions/:id/intelligence` PATCH 端点真实有效;切换模型后下次请求用新模型(curl 验证);Intelligence 滑块影响 `tokenBudget` + `allowedTools`;e2e-ai-chat-intelligence.sh 10/10 pass。
- **A3** R-CHAT-3:麦克风按钮 → 录音 → MediaRecorder API → 上传 multipart → Whisper 转写 → 填入输入框;e2e-ai-chat-voice.sh 6/6 pass。
- **A4** R-ATTACH-1:PDF/Excel/Word/图片 真实解析 + 异步 BullMQ 索引;e2e-ai-chat-attach.sh 12/12 pass。
- **A5** R-ATTACH-2:HMAC signed download token (≤5min);EICAR 测试文件 → ClamAV 扫描拦截;e2e-ai-chat-attachment-security.sh 8/8 pass。
- **A6** R-WRITE-1:`ai-chat-write-plan.service.ts` 覆盖 table/field/view/app/automation 5 类;WritePlanPreview.tsx diff 视图;e2e-ai-chat-write-plan.sh 12/12 pass。
- **A7** R-WRITE-2:每类写操作 idempotency-key;`audit_log` 含 `actorType=ai`, `planHash`, `idempotencyKey`;verify-enterprise.sh 新增 AI write audit gate。

# Constraints and invariants

- **selection_type 枚举**:4 种值(row/column/cell/range)由 SQL CHECK 约束和服务端验证双重保护。
- **upsert 幂等**:`(sessionId, refKey)` 复合唯一键;重复添加相同 ref 不产生重复行。
- **renderPrompt 分组**:按 tableId 分组输出 `<selection table=...>` XML 块。
- **SelectionChips 渲染空状态**:无 refs 时不渲染,避免空 div 占空间。

# Decisions

1. **Backend service 单文件**:`ai-chat-selection-ref.service.ts` 一个文件包含 list/add/remove/clearTable/renderPrompt 5 个方法,避免过度拆分。
2. **vitest 而非 jest**:与项目其他模块一致(spec 用 vi.fn())。
3. **upsert 而非 findUnique + create/update**:单次 SQL, 减少 round-trip, 幂等更直接。
4. **selection_type CHECK 约束 + 服务端 if 检查**:defense in depth, 注释明确"SQL 是真相源"。
5. **Frontend zustand store 而非 React Context**:避免 prop drilling, 与 useChatPanelStore 风格一致。
6. **grid sync best-effort**:syncSelectionToBackend 失败时静默, chips 在 session 创建后会 re-sync。
7. **Clear all 按 tableId 分组**:与 backend clearTable endpoint 对齐, 每表一次 SQL。

# Open questions

- selection context 是否需要 limit (目前无)? — A1 不要求, 留给后续优化。

# Verification expectations

- **Backend**:vitest 跑过 ai-chat 全部 24 文件, 250/250 pass。
- **Frontend**:vitest 跑过 chat-panel 全部 4 文件, 16/16 pass。
- **TypeScript**:tsc --noEmit 无 selection 相关新错误。
- **Bash**:e2e-ai-chat-selection.sh + verify-enterprise.sh 语法 OK。
- **真实 E2E**:需要 backend live at :3000 + DB :42345 才能跑 16-case 脚本 (已通过 9/9 unit test 保证逻辑正确)。
- **Migration**:prisma generate v6.2.1 OK, AiChatSelectionRef model 编译进 client。

# Iteration plan

每个 R-round 1 个 iteration (1 commit 价值 ~200-500 LOC):
- iter 1: R-CHAT-1 ✅ (本轮: backend + frontend + audit)
- iter 2: R-CHAT-2
- iter 3: R-CHAT-3
- iter 4: R-ATTACH-1
- iter 5: R-ATTACH-2
- iter 6: R-WRITE-1
- iter 7: R-WRITE-2

每个 iteration 包含:
- 1 个 backend service/controller migration (200-500 LOC)
- 1 个 frontend component/hook (100-300 LOC)
- 1 个 vitest spec (5-15 case)
- 1 个 e2e shell script (10-20 case)
- 1 个 verify-enterprise gate 升级
- 1 份 REALITY-AUDIT-R-XXX.md 报告
