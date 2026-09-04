# Phase 1 — P0 Cloud Parity 完整目标规格

> 本文件是 phase-1-p0-cloud-parity child change 的完整目标规格。范围:7 个 R-round 覆盖 AI Chat 用户可观察能力补齐。

---

## §R-CHAT-1 AI Chat selection chips

**目标**:ChatPanel 头部展示当前 Grid 选中行/列/单元格/区域 → chip → 点击展开预览 → AI 回复自动引用 selection 上下文。

**规格详情（1）**:
- 新增组件:`apps/nextjs-app/src/features/app/components/chat-panel/SelectionChips.tsx`
- Grid selection store 接入(`useSelection()` hook)
- chip 显示规则:行数 ≤3 显示完整 row preview;>3 显示 "3 rows selected";列显示 "column: <name>";单元格显示 "<table>.<field>: <truncated value>"
- 后端新增:`meta.ai_chat_selection_ref` 表(Prisma migration),字段:`id`, `sessionId`, `refType`, `refValue`(JSON), `createdAt`
- 后端扩展:`ai-chat-node-ref.service.ts` 增加 `selectionRef` 持久化方法
- chatTurn 在 prompt 注入 `<selection>` XML block,引用 selection ref 解析后的字段摘要
- 后端 endpoint:`GET /api/chat/sessions/:sessionId/selection`(list)、`POST` (add)、`DELETE /:refId`

**Acceptance A1**:选中 3 行 → ChatPanel 头部出现 3 个 chip;chip 点击展开字段摘要;AI 回复引用 selection 上下文;e2e-ai-chat-selection.sh 8/8 pass;verify-enterprise 新增 AI Chat selection HTTP gate。

---

## §R-CHAT-2 模型/Intelligence 菜单

**目标**:ChatPanel 头部模型 dropdown + Intelligence 滑块(low/medium/high → 影响 token 预算 + 工具权限)。

**规格详情（2）**:
- 新增组件:`IntelligenceMenu.tsx` + `ModelSelect.tsx`
- 后端:`/api/chat/sessions/:sessionId/intelligence` PATCH,body `{ smartLevel: 'low'|'medium'|'high', model?: string }`
- token 预算映射:low=4K, medium=16K, high=64K(可被 license cap 覆盖)
- 工具权限映射:low=read-only, medium=read+comment, high=read+write
- session.metadata 增加 `tokenBudget` + `allowedTools` 字段
- chatTurn 在 LLM 调用前校验 token budget + 工具权限
- 模型选择持久化到 session.metadata.model

**Acceptance A2**:切换模型后下次请求用新模型(curl 验证);Intelligence 滑块影响 tokenBudget + allowedTools(session metadata);e2e-ai-chat-intelligence.sh 10/10 pass。

---

## §R-CHAT-3 语音输入

**目标**:麦克风按钮 → 录音 → VAD 自动结束 → Whisper 转写 → 填入输入框(可编辑/丢弃/重录)。

**规格详情（3）**:
- 新增 hook:`useVoiceRecorder.ts`(MediaRecorder API + VAD via RMS threshold)
- 新增组件:`VoiceButton.tsx`(录音中显示波形 + 计时器)
- 后端:`voice.controller.ts` `POST /api/chat/voice/transcribe`,multipart 上传 webm/opus → Whisper `whisper-1` → 返回 text
- 新增环境变量:`WHISPER_MODEL` 默认 `whisper-1`
- 转写后自动填入 composer,可编辑/丢弃/重录
- VAD 阈值:RMS > 0.05 持续 300ms 触发 stop

**Acceptance A3**:录音 → 转写 → 填入输入框 → 可编辑;录音失败/拒绝权限友好错误;e2e-ai-chat-voice.sh 6/6 pass(mock MediaRecorder + 真实 multipart)。

---

## §R-ATTACH-1 文件解析全场景

**目标**:PDF/Excel/Word/图片 OCR + 异步 BullMQ 索引 + 文本注入 prompt。

**规格详情（4）**:
- 扩展 `ai-chat-attachment-extractor.service.ts`:
  - PDF:`pdf-parse` → 文本(支持表格识别)
  - Excel:`xlsx` → sheet-by-sheet 文本
  - Word:`mammoth` → 纯文本
  - 图片:Vision LLM(OpenAI gpt-4o-vision 或本地 Tesseract) → OCR 文本
- 异步索引:BullMQ `attachment-index` queue,worker 处理解析 + 文本块存储
- 文本注入 prompt(已有 V75 text 类解析,扩展到全部格式)
- 进度跟踪:`attachment.status` = `pending | processing | indexed | failed`
- 文件大小上限:50MB(text/word) / 200MB(pdf) / 100MB(excel)
- 解析超时:60s/文件

**Acceptance A4**:PDF/Excel/Word/图片 4 种格式全部解析成功;异步索引 ≤30s/PDF(10页);e2e-ai-chat-attach.sh 12/12 pass;verify-enterprise 新增 attachment parser gate。

---

## §R-ATTACH-2 下载 token + 病毒扫描 + 内容权限

**目标**:HMAC signed download token(≤5min) + ClamAV mock 病毒扫描 + 跨用户内容权限校验 + 细粒度审计。

**规格详情（5）**:
- 新增 `attachment-token.service.ts`:HMAC-SHA256(secret, attachmentId + userId + exp),exp ≤ 5min
- 新增 `attachment-virus-scan.service.ts`:ClamAV mock(开发环境走 mock,生产可接真实 ClamAV)
- 扩展 `attachment.controller.ts`:`GET /api/attachment/:id` 强制要求有效 token,缺/失效 → 401
- 内容权限:跨用户访问 → 403;登录用户在 base 外访问 → 403
- 审计:每次下载写 `audit_event`(`action=attachment.download`, `actorId`, `attachmentId`, `tokenExp`, `ip`)

**Acceptance A5**:download token 验证通过;过期/篡改/跨用户 → 401/403;病毒扫描挂载;e2e-attachment-token.sh 10/10 pass;verify-enterprise 新增 attachment audit gate。

---

## §R-WRITE-1 AI 写入面扩展

**目标**:table/field/view/app/automation 都有 plan → diff → confirm → apply。

**规格详情（6）**:
- 扩展 `ai-chat-write-plan.service.ts`:现有 record write 扩展到 table/field/view/app/automation 5 类
- 每类 write 生成:`plan` JSON(操作列表) + `diff`(当前 vs 目标) + `risk`(高/中/低)
- UI 确认:`/api/chat/plans/:planId/confirm` POST → 执行;`/api/chat/plans/:planId/cancel` POST → 取消
- apply 是事务性:Prisma transaction 包裹所有写入,失败全回滚
- 应用后返回 `appliedResults` JSON,前端展示
- 新增组件:`WritePlanPreview.tsx`

**Acceptance A6**:5 类 write 都有 plan + diff + confirm + apply;失败回滚;e2e-ai-write-faces.sh 10/10 pass;verify-enterprise 新增 5 类 write gate。

---

## §R-WRITE-2 幂等性 + 失败回滚审计

**目标**:每类写操作 `idempotency-key`;重复 plan apply → 第二次返回原结果;`audit_log` 含 `actorType=ai`, `planHash=...`, `idempotencyKey=...`。

**规格详情（7）**:
- 扩展 `audit_event` 表:`actorType`, `planHash`, `idempotencyKey`, `rollbackId` 字段
- 每个 AI write 请求带 `Idempotency-Key` header;服务端去重存储 24h
- 重复请求直接返回首次结果(从 audit_event 读取)
- 失败回滚:每个 plan apply 前创建 `rollback_snapshot`(JSON);失败时自动执行反操作
- `planHash` = SHA256(plan JSON)
- 去重存储:Redis `idempotency:{userId}:{key}` → audit_event.id

**Acceptance A7**:每类写操作有 idempotency-key;重复 plan apply → 第二次返回原结果;audit_log 含完整字段;verify-enterprise 新增 AI write audit gate。

---

## §验收清单(完整,A1-A7)

| ID | R-round | 描述 |
|---|---|---|
| A1 | R-CHAT-1 | AI Chat selection chips 持久化 + chip 展开 + 上下文引用 |
| A2 | R-CHAT-2 | 模型/Intelligence 菜单 + token 预算 + 工具权限 |
| A3 | R-CHAT-3 | 语音输入(MediaRecorder + Whisper) |
| A4 | R-ATTACH-1 | PDF/Excel/Word/图片 OCR + 异步索引 |
| A5 | R-ATTACH-2 | 下载 token + 病毒扫描 + 内容权限 + 审计 |
| A6 | R-WRITE-1 | 5 类 AI 写入面 plan/diff/confirm/apply |
| A7 | R-WRITE-2 | 幂等性 + 失败回滚审计 |
