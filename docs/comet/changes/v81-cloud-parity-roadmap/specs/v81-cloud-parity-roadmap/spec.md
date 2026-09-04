# Teable OSS Cloud Parity 路线图 (V81+) — 完整目标规格

> 目标:本 change 不是单一 capability 的实现,而是 Supervisor Change —— 编排 3 个 Phase 子 change,在本仓库(AGPL-3.0)范围内,基于 V72-V78 + V25-V80 综合审计基线(70-75% Cloud parity)推进 20 个 R-round,实现 Cloud 商业版用户可观察能力 95%+ 对齐。
> 不复制 teableio/teable-ee 任何源代码;不冒充 Cloud 运营能力(Billing / Stripe / SLA / 公有云多区)。

---

## §0 范围与基线

### 0.1 当前基线(V80 末态)

| 能力域 | 当前真实对齐 | 关键证据 |
|---|---:|---|
| 数据与协作基础 | 90% | record / view / formula / undo-redo / attachment |
| Authority Matrix | 68% | 19 endpoint + 5 维 + field hidden strip + custom role(V73-V75) |
| 企业安全 | 72% | SSO / SAML / SCIM / TOTP / Audit / Backup / RateLimit / CustomDomain |
| AI Chat / Cuppy | 75% | 25+ 端点 + assistant-ui 0.10.50 + queue + attachment(V78) |
| AI App Builder | 45% | 15 端点 + publish,但 sandbox 真实运行时 + auto-fix 未闭环 |
| Custom AI Model / BYOK | 65% | 5 provider + test + batchTest + usage(V58) |
| 自动化 / IM | 77% | Feishu/Teams + AI script + Webhook |
| 数据迁移 | 40% | Airtable/Notion/Sheets/Baserow,差 AI Chat skill 编排 |
| Admin / Audit / Backup | 70% | enterprise-readiness 三层口径(V73) + audit_log + backup |

加权综合:**~75% Cloud parity**(排除 Cloud-only 运营能力)

### 0.2 目标对齐率

V100(20 R-round 完成)后:**≥95%** 用户可观察能力对齐。
剩余 5% 主要是 Cloud 运营能力(不在范围)+ Sandbox 真实底层容器编排(接受等价降级)。

### 0.3 关键决策

- 嵌套式 Supervisor Change:3 个 child change(每个 Phase 一个),在独立 worktree 中创建,完成后 merge 到 Supervisor 分支
- 每个 R-round 必产出:真实代码改动 + 单测 + e2e-*.sh 真实 HTTP 证据 + verify-enterprise gate 升级 + REALITY-AUDIT 报告
- 不重写已工作模块;只扩展/补齐
- 不引入新框架(Cloud 文档未点名的技术栈)
- Postgres enum 策略保持 TEXT(不引入 enum)

---

## §1 Phase 1 — P0 真实产品闭环(4-6 周, ~3000 行)

> 目标:补齐 AI Chat 与 App Builder 的真实产品闭环(用户可感知的 UI / 交互 / 内容),Cloud 体验对齐。

### R-CHAT-1 AI Chat selection chips

**目标**:ChatPanel 头部展示当前 Grid 选中行/列/单元格/区域 → chip → 点击展开预览 → AI 回复自动引用 selection 上下文。

**完整规格 (R-CHAT-1)**:
- 新增组件:`apps/nextjs-app/src/features/app/components/chat-panel/SelectionChips.tsx`
- Grid selection store 接入(`useSelection()` hook)
- chip 显示规则:行数 ≤3 显示完整 row preview;>3 显示 "3 rows selected";列显示 "column: <name>";单元格显示 "<table>.<field>: <truncated value>"
- 后端新增:`meta.ai_chat_selection_ref` 表(Prisma migration),字段:`id`, `sessionId`, `refType`, `refValue`(JSON), `createdAt`
- 后端扩展:`ai-chat-node-ref.service.ts` 增加 `selectionRef` 持久化方法
- chatTurn 在 prompt 注入 `<selection>` XML block,引用 selection ref 解析后的字段摘要

**Acceptance A1**:选中 3 行 → ChatPanel 头部出现 3 个 chip;chip 点击展开字段摘要;AI 回复引用 selection 上下文;e2e-ai-chat-selection.sh 8/8 pass;verify-enterprise 新增 AI Chat selection HTTP gate。

### R-CHAT-2 模型/Intelligence 菜单

**目标**:ChatPanel 头部模型 dropdown + Intelligence 滑块(low/medium/high → 影响 token 预算 + 工具权限)。

**完整规格 (R-CHAT-2)**:
- 新增组件:`IntelligenceMenu.tsx` + `ModelSelect.tsx`
- 后端:`/api/chat/sessions/:sessionId/intelligence` PATCH,body `{ smartLevel: 'low'|'medium'|'high', model?: string }`
- token 预算映射:low=4K, medium=16K, high=64K(可被 license cap 覆盖)
- 工具权限映射:low=read-only, medium=read+comment, high=read+write
- session.metadata 增加 `tokenBudget` + `allowedTools` 字段
- chatTurn 在 LLM 调用前校验 token budget + 工具权限

**Acceptance A2**:切换模型后下次请求用新模型(curl 验证);Intelligence 滑块影响 tokenBudget + allowedTools(session metadata);e2e-ai-chat-intelligence.sh 10/10 pass。

### R-CHAT-3 语音输入

**目标**:麦克风按钮 → 录音 → VAD 自动结束 → Whisper 转写 → 填入输入框(可编辑/丢弃/重录)。

**完整规格 (R-CHAT-3)**:
- 新增 hook:`useVoiceRecorder.ts`(MediaRecorder API + VAD via RMS threshold)
- 新增组件:`VoiceButton.tsx`(录音中显示波形 + 计时器)
- 后端:`voice.controller.ts` `POST /api/chat/voice/transcribe`,multipart 上传 webm/opus → Whisper `whisper-1` → 返回 text
- 新增环境变量:`WHISPER_MODEL` 默认 `whisper-1`
- 转写后自动填入 composer,可编辑/丢弃/重录

**Acceptance A3**:录音 → 转写 → 填入输入框 → 可编辑;录音失败/拒绝权限友好错误;e2e-ai-chat-voice.sh 6/6 pass(mock MediaRecorder + 真实 multipart)。

### R-ATTACH-1 文件解析全场景

**目标**:PDF/Excel/Word/图片 OCR + 异步 BullMQ 索引 + 文本注入 prompt。

**完整规格 (R-ATTACH-1)**:
- 扩展 `ai-chat-attachment-extractor.service.ts`:
  - PDF:`pdf-parse` → 文本(支持表格识别)
  - Excel:`xlsx` → sheet-by-sheet 文本
  - Word:`mammoth` → 纯文本
  - 图片:Vision LLM(OpenAI gpt-4o-vision 或本地 Tesseract) → OCR 文本
- 异步索引:BullMQ `attachment-index` queue,worker 处理解析 + 文本块存储
- 文本注入 prompt(已有 V75 text 类解析,扩展到全部格式)
- 进度跟踪:`attachment.status` = `pending | processing | indexed | failed`

**Acceptance A4**:PDF/Excel/Word/图片 4 种格式全部解析成功;异步索引 ≤30s/PDF(10页);e2e-ai-chat-attach.sh 12/12 pass;verify-enterprise 新增 attachment parser gate。

### R-ATTACH-2 下载 token + 病毒扫描 + 内容权限

**目标**:HMAC signed download token(≤5min) + ClamAV mock 病毒扫描 + 跨用户内容权限校验 + 细粒度审计。

**完整规格 (R-ATTACH-2)**:
- 新增 `attachment-token.service.ts`:HMAC-SHA256(secret, attachmentId + userId + exp),exp ≤ 5min
- 新增 `attachment-virus-scan.service.ts`:ClamAV mock(开发环境走 mock,生产可接真实 ClamAV)
- 扩展 `attachment.controller.ts`:`GET /api/attachment/:id` 强制要求有效 token,缺/失效 → 401
- 内容权限:跨用户访问 → 403;登录用户在 base 外访问 → 403
- 审计:每次下载写 `audit_event`(`action=attachment.download`, `actorId`, `attachmentId`, `tokenExp`, `ip`)

**Acceptance A5**:download token 验证通过;过期/篡改/跨用户 → 401/403;病毒扫描挂载;e2e-attachment-token.sh 10/10 pass;verify-enterprise 新增 attachment audit gate。

### R-WRITE-1 AI 写入面扩展

**目标**:table/field/view/app/automation 都有 plan → diff → confirm → apply。

**完整规格 (R-WRITE-1)**:
- 扩展 `ai-chat-write-plan.service.ts`:现有 record write 扩展到 table/field/view/app/automation 5 类
- 每类 write 生成:`plan` JSON(操作列表) + `diff`(当前 vs 目标) + `risk`(高/中/低)
- UI 确认:`/api/chat/plans/:planId/confirm` POST → 执行;`/api/chat/plans/:planId/cancel` POST → 取消
- apply 是事务性:Prisma transaction 包裹所有写入,失败全回滚
- 应用后返回 `appliedResults` JSON,前端展示

**Acceptance A6**:5 类 write 都有 plan + diff + confirm + apply;失败回滚;e2e-ai-write-faces.sh 10/10 pass;verify-enterprise 新增 5 类 write gate。

### R-WRITE-2 幂等性 + 失败回滚审计

**目标**:每类写操作 `idempotency-key`;重复 plan apply → 第二次返回原结果;`audit_log` 含 `actorType=ai`, `planHash=...`, `idempotencyKey=...`。

**完整规格 (R-WRITE-2)**:
- 扩展 `audit_event` 表:`actorType`, `planHash`, `idempotencyKey`, `rollbackId` 字段
- 每个 AI write 请求带 `Idempotency-Key` header;服务端去重存储 24h
- 重复请求直接返回首次结果(从 audit_event 读取)
- 失败回滚:每个 plan apply 前创建 `rollback_snapshot`(JSON);失败时自动执行反操作

**Acceptance A7**:每类写操作有 idempotency-key;重复 plan apply → 第二次返回原结果;audit_log 含完整字段;verify-enterprise 新增 AI write audit gate。

---

## §2 Phase 2 — P1 企业可用性(4-6 周, ~4500 行)

> 目标:让 OSS 能真正替代企业部署的真实 IdP / Sandbox / Migration / Admin。

### R-IDP-1 真实 OIDC 接入

**目标**:外部 OIDC IdP(Okta/Azure AD/Google)端到端登录/登出/refresh/group claim 自动映射。

**Acceptance A8**:外部 OIDC mock-IdP 端到端登录/登出/refresh/group claim;group claim → permission role 自动映射;e2e-sso-oidc.sh 10/10 pass。

### R-IDP-2 真实 SAML 接入

**目标**:V18 mock-idp 基础上接入真实 IdP(OneLogin/Okta);SP-initiated + IdP-initiated + assertion 验签 + 加密 assertion 解析。

**Acceptance A9**:SP-initiated SSO + IdP-initiated SSO;assertion 验签 + 加密 assertion 解析;e2e-saml-real-idp.sh 8/8 pass。

### R-IDP-3 真实 SCIM 接入

**目标**:Cloud SCIM endpoint 接外部 IdP push user/group + 周期性 reconcile。

**Acceptance A10**:SCIM `POST /Users` / `PATCH /Users/:id` / `DELETE /Users/:id`;周期性 reconcile;e2e-scim-realtime.sh 10/10 pass。

### R-AI-MODEL Custom AI Model × capability 矩阵

**目标**:4 capability (Chat/Field/Automation/App Builder) × 3 provider (OpenAI/Anthropic/MiniMax) = 12 组合全验证。

**Acceptance A11**:`ai-model-resolver.service.ts` capability → model 解析;12 组合全 pass;verify-enterprise 新增 12 组合 gate;e2e-ai-model-matrix.sh 12/12 pass。

### R-SANDBOX Sandbox 完整生命周期

**目标**:create/start/stop/stream/cleanup + 资源隔离 + 超时 + 失败恢复(Docker container 或 firecracker)。

**Acceptance A12**:`sandbox.controller.ts` CRUD + lifecycle;`sandbox-process.service.ts` 资源隔离 + 超时 + 失败恢复;BullMQ delayed cleanup;e2e-sandbox.sh 15/15 pass。

### R-MIGRATE 迁移器升级

**目标**:AI Chat skill 驱动的迁移闭环 + 字段/关系/附件转换事务。

**Acceptance A13**:Airtable/Notion/Google Sheets 迁移器扩展;统一 `MigrationTransactionService` + 字段类型映射表;失败回滚 + 进度 + 错误定位;e2e-migrate-airtable.sh 8/8 pass。

### R-ADMIN-AUDIT 管理后台逐页核对官方清单

**目标**:Skills / AI queue / Sandbox / Query Ops / License / Users-Spaces UI 30 个页面逐一走完官方 checklist。

**Acceptance A14**:30 个 admin page 走完 checklist;缺失元素补齐;e2e-admin-pages.sh 30/30 pass。

---

## §3 Phase 3 — P1 高级 + P2 治理(2-4 周, ~1500 行)

> 目标:补齐数据驻留、KMS、合规、i18n,达成 95%+ Cloud parity。

### R-BACKUP Backup restore 演练

**Acceptance A15**:真实 restore 演练;RPO ≤ 5min / RTO ≤ 30min 证据;e2e-backup-restore.sh 8/8 pass。

### R-RESIDENCY 数据驻留

**Acceptance A16**:per-tenant region tag;跨区访问 → 403 + 审计;EU 租户数据 → EU region DB;e2e-residency.sh 6/6 pass。

### R-KMS KMS 密钥轮换

**Acceptance A17**:BYOK 定期轮换;新写入用新密钥;旧数据用旧密钥解密;verify-enterprise 新增 BYOK 轮换 gate。

### R-COMPLIANCE 合规导出

**Acceptance A18**:GDPR/CCPA 数据导出 JSON bundle;删除 user 全部数据不可恢复 + 审计;e2e-compliance.sh 8/8 pass。

### R-I18N 多语言/i18n 完整

**Acceptance A19**:zh-CN/en/de/ja 至少覆盖所有 admin page;切换语言 → admin page 完整翻译;e2e-i18n.sh 验证每页 4 语言切换。

### R-V100 集成验证(Supervisor Change 验收)

**Acceptance A20**:3 个 Phase child 全部 `done` 后,Supervisor 在最终集成分支上检查 95%+ 对齐率(每个 child 已完成的 acceptance pass + 端到端验证)。

---

## §4 关键约束与不变式

1. **环境**:PostgreSQL `:42345`、NestJS `:3070`、Next.js `:3000`、`OPENAI_API_KEY` 用户自配
2. **测试账号**:`v141788251579@x.com / Passw0rd!`(admin, V12 创建)
3. **git 策略**:遵循 AGENTS.md "不主动 git commit",仅在工作日结束一次性 commit(除非用户明确要求)
4. **OpenAPI 同步**:v2 packages 遵循 `packages/v2/contract-http` 契约优先
5. **依赖注入**:严格用 `@teable/v2-di`,不直接 import `tsyringe`
6. **不重写**:不重写已有工作良好的模块;只扩展/补齐
7. **Backend 100% module-barrel coverage**:每个 feature module 都有 `index.ts`
8. **Cloud 文档作权威**:teable.ai/zh 帮助文档作为可观察能力对照基线
9. **审计优先**:每个 AI 写操作都有 `audit_event`,含 `actorType=ai`, `planHash`, `idempotencyKey`
10. **真实证据**:每个 acceptance 都有 e2e-*.sh 真实 HTTP 脚本,不允许单测当端到端证据

---

## §5 验收清单(完整,A1-A20)

| ID | R-round | Phase | 描述 |
|---|---|---|---|
| A1 | R-CHAT-1 | 1 | AI Chat selection chips 持久化 + chip 展开 + 上下文引用 |
| A2 | R-CHAT-2 | 1 | 模型/Intelligence 菜单 + token 预算 + 工具权限 |
| A3 | R-CHAT-3 | 1 | 语音输入(MediaRecorder + Whisper) |
| A4 | R-ATTACH-1 | 1 | PDF/Excel/Word/图片 OCR + 异步索引 |
| A5 | R-ATTACH-2 | 1 | 下载 token + 病毒扫描 + 内容权限 + 审计 |
| A6 | R-WRITE-1 | 1 | 5 类 AI 写入面 plan/diff/confirm/apply |
| A7 | R-WRITE-2 | 1 | 幂等性 + 失败回滚审计 |
| A8 | R-IDP-1 | 2 | 真实 OIDC 接入(端到端) |
| A9 | R-IDP-2 | 2 | 真实 SAML 接入(SP + IdP initiated) |
| A10 | R-IDP-3 | 2 | 真实 SCIM 接入 |
| A11 | R-AI-MODEL | 2 | 12 组合 capability × provider 矩阵 |
| A12 | R-SANDBOX | 2 | Sandbox 完整生命周期 |
| A13 | R-MIGRATE | 2 | 迁移器升级(事务 + AI skill) |
| A14 | R-ADMIN-AUDIT | 2 | admin 30 页 checklist |
| A15 | R-BACKUP | 3 | Backup restore + RPO/RTO 证据 |
| A16 | R-RESIDENCY | 3 | 数据驻留(per-tenant region tag) |
| A17 | R-KMS | 3 | KMS 密钥轮换 + 旧密钥解密 |
| A18 | R-COMPLIANCE | 3 | GDPR/CCPA 导出/删除 + 审计 |
| A19 | R-I18N | 3 | 4 语言 admin page 翻译 |
| A20 | V100 | 3 | Supervisor Change 集成验证(95%+ parity) |
