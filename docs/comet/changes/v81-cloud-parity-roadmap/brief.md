# Teable OSS Cloud Parity 路线图 (V81+ 后续 2-3 月密集推进)

# Outcome

基于 V72-V78 + V25-V80 综合审计得出的 70-75% 真实对齐率,按 20 个 R-round、3 个 Phase 推进,在本仓库(AGPL-3.0)范围内实现 Cloud 商业版用户可观察能力 95%+ 对齐;不复制任何 teableio/teable-ee 源代码。最终交付形态是嵌套式 Native change:Supervisor Change 负责整体计划 + 集成验证,3 个 child change 各自负责一个 Phase 的最小真实实现。

# Scope

## Source coverage

来源:pasted-text-1.txt,完整 348 行已读取,状态 `complete`。

| 来源单元 | 标题 | 状态 | 对应 Spec 位置 | 对应验收 ID | 覆盖状态 |
|---------|------|------|---------------|------------|---------|
| 总路线 Phase 1 (R-CHAT-1/2/3, R-ATTACH-1/2, R-WRITE-1/2) | P0 真实产品闭环 | complete | specs/v81-cloud-parity-roadmap/spec.md §1 | A1-A7 | covered |
| 总路线 Phase 2 (R-IDP-1/2/3, R-AI-MODEL, R-SANDBOX, R-MIGRATE, R-ADMIN-AUDIT) | P1 企业可用性 | complete | specs/v81-cloud-parity-roadmap/spec.md §2 | A8-A14 | covered |
| 总路线 Phase 3 (R-BACKUP, R-RESIDENCY, R-KMS, R-COMPLIANCE, R-I18N) | P1 高级 + P2 治理 | complete | specs/v81-cloud-parity-roadmap/spec.md §3 | A15-A20 | covered |
| 用户决策 (Cloud parity, 2-3 月密集, 完整 verify gate) | 用户确认 | complete | spec §0 Decisions | (非验收, 决定项) | covered |
| 明确不做 (Stripe/SLA/营销/移动 App) | 边界 | complete | spec §0 Non-goals | (非验收, 边界项) | covered |

所有可执行语义单元(20 个 R-round + 3 个 Phase 集成)均有 Spec 位置 + 验收 ID 双重映射。

## 当前已落地(对照商业版可直接启用,基线为 V80 末态)

- V72-V80 综合审计基线:真实对齐率 70-75%
- 已完成 25+ R-round(R-AI-1~14, R-PERM-1/3/3b/4, R-INFRA-1/1b/4/5/6, R-VERIFY-7, V25)
- 已有 734+ 单测覆盖
- 已落地的关键能力(参见 V72 §3 完整盘点):基础数据/协作 98%,企业安全 80%,Authority Matrix 70%,AI Chat/Cuppy 78%,AI App Builder 65%,Connect & Migrate 40%

## 本 change 的 scope(尚需补齐)

### Phase 1 — P0 真实产品闭环(4-6 周, ~3000 行)

1. **R-CHAT-1 AI Chat selection chips**:ChatPanel 头部展示当前选中行/列/单元格/区域 → chip → 点击展开预览;Prisma 新增 `meta.ai_chat_selection_ref` 表
2. **R-CHAT-2 模型/Intelligence 菜单**:ChatPanel 头部模型 dropdown + Intelligence 滑块(low/medium/high → token 预算 + 工具权限);`/api/chat/sessions/:id/intelligence` PATCH
3. **R-CHAT-3 语音输入**:麦克风按钮 → MediaRecorder API → Whisper 转写 → 填入输入框(可编辑/丢弃/重录)
4. **R-ATTACH-1 文件解析全场景**:PDF/Excel/Word/图片 OCR + 异步 BullMQ 索引 + 文本注入 prompt
5. **R-ATTACH-2 下载 token + 病毒扫描 + 内容权限**:HMAC signed token (≤5min) + ClamAV mock + 跨用户权限校验
6. **R-WRITE-1 AI 写入面扩展**:table/field/view/app/automation 都有 plan → diff → confirm → apply
7. **R-WRITE-2 幂等性 + 失败回滚审计**:每类写操作 idempotency-key + audit_event(`actorType=ai`, `planHash=...`, `idempotencyKey=...`)

### Phase 2 — P1 企业可用性(4-6 周, ~4500 行)

8. **R-IDP-1 真实 OIDC 接入**:外部 OIDC IdP(Okta/Azure AD/Google)端到端登录/登出/refresh/group claim
9. **R-IDP-2 真实 SAML 接入**:V18 mock-idp 基础上接入真实 IdP(OneLogin/Okta);SP-initiated + IdP-initiated
10. **R-IDP-3 真实 SCIM 接入**:Cloud SCIM endpoint 接外部 IdP push user/group + 反向 reconcile
11. **R-AI-MODEL Custom AI Model × capability 矩阵**:4 capability (Chat/Field/Automation/App Builder) × 3 provider (OpenAI/Anthropic/MiniMax) = 12 组合验证
12. **R-SANDBOX Sandbox 完整生命周期**:create/start/stop/stream/cleanup + 资源隔离 + 超时 + 失败恢复(Docker container 或 firecracker)
13. **R-MIGRATE 迁移器升级**:AI Chat skill 驱动的迁移闭环 + 字段/关系/附件转换事务
14. **R-ADMIN-AUDIT 管理后台逐页核对官方清单**:Skills/AI queue/Sandbox/Query Ops/License/Users-Spaces UI

### Phase 3 — P1 高级 + P2 治理(2-4 周, ~1500 行)

15. **R-BACKUP Backup restore 演练**:真实 restore + RPO ≤ 5min / RTO ≤ 30min 证据
16. **R-RESIDENCY 数据驻留**:per-tenant region tag + 跨区路由拒绝
17. **R-KMS KMS 密钥轮换**:BYOK + 定期轮换 + 旧密钥仍可解密
18. **R-COMPLIANCE 合规导出**:GDPR/CCPA 数据导出 + 删除请求 + 审计
19. **R-I18N 多语言/i18n 完整**:zh-CN/en/de/ja 至少覆盖所有 admin page
20. **V100 集成验证**:3 个 Phase child 全部 `done` 后,Supervisor 在最终集成分支上检查 95%+ 对齐率

# Non-goals

- Stripe 收款、订阅、发票生成、增购 credit
- SLA 状态页、客服工单系统
- 公有云多区自动 failover、跨大区 BGP
- 营销漏斗、A/B 测试、conversion tracking
- 移动 App 原生客户端(仅 web 响应式)

# Acceptance examples

> 每项验收 ID 来自 brief 派生的父级验收索引;Runtime 在 Shape 确认时保存完整验收文字及其来源。每个 child 必须覆盖 assigned acceptance IDs 的全部。Runtime 从此一级标题下的顶级列表项提取 acceptance text(每项一行,中间不留其他元素)。

- **A1** R-CHAT-1:ChatPanel 顶部展示当前选中行/列/单元格/区域 → chip → 点击展开预览;Prisma 新增 `meta.ai_chat_selection_ref` 表真实持久化;e2e-ai-chat-selection.sh 8/8 pass;verify-enterprise.sh 新增 gate 8(AI Chat selection HTTP)。
- **A2** R-CHAT-2:`/api/chat/sessions/:id/intelligence` PATCH 端点真实有效;切换模型后下次请求用新模型(curl 验证);Intelligence 滑块影响 `tokenBudget` + `allowedTools`;e2e-ai-chat-intelligence.sh 10/10 pass。
- **A3** R-CHAT-3:麦克风按钮 → 录音 → MediaRecorder API → 上传 multipart → Whisper 转写 → 填入输入框;录音失败/拒绝权限 → 友好错误;e2e-ai-chat-voice.sh 6/6 pass。
- **A4** R-ATTACH-1:PDF/Excel/Word/图片 真实解析(PDF → pdf-parse;Excel → xlsx;Docx → mammoth;图片 → Tesseract 或 OpenAI Vision);异步 BullMQ 索引;文本注入 prompt → AI 回复含真实内容;e2e-ai-chat-attachment.sh 升级 8/8 → 12/12 pass。
- **A5** R-ATTACH-2:下载走 HMAC signed token (≤5min);过期 token → 401;跨用户 token → 403;EICAR 测试文件 → ClamAV mock 扫描拦截;e2e-ai-chat-attachment-security.sh 8/8 pass。
- **A6** R-WRITE-1:`ai-chat-write-plan.service.ts` 覆盖 table/field/view/app/automation;plan → diff → confirm → apply 流程真实工作;WritePlanPreview.tsx 显示 diff 视图;失败回滚事务化;e2e-ai-chat-write-plan.sh 12/12 pass。
- **A7** R-WRITE-2:每类写操作有 idempotency-key;重复 plan apply → 第二次返回原结果;`audit_log` 含 `actorType=ai`, `planHash=...`, `idempotencyKey=...`;verify-enterprise.sh 新增 AI write audit gate。
- **A8** R-IDP-1:外部 OIDC IdP(mock-IdP,参考 V18)端到端登录/登出/refresh/group claim;group claim 自动映射到 permission role;e2e-sso-oidc.sh 10/10 pass。
- **A9** R-IDP-2:SP-initiated SSO(用户从 OSS 触发) + IdP-initiated SSO(用户从 IdP 触发,直接到 OSS);assertion 验签 + 加密 assertion 解析;e2e-saml-real-idp.sh 8/8 pass。
- **A10** R-IDP-3:SCIM endpoint 支持 `POST /Users` / `PATCH /Users/:id` / `DELETE /Users/:id`;周期性 reconcile;e2e-scim-realtime.sh 10/10 pass。
- **A11** R-AI-MODEL:4 capability × 3 provider = 12 组合全 pass;`ai-model-resolver.service.ts` capability → model 解析;verify-enterprise.sh 新增 12 组合 gate;e2e-ai-model-matrix.sh 12/12 pass。
- **A12** R-SANDBOX:`sandbox.controller.ts` CRUD + lifecycle;`sandbox-process.service.ts` 资源隔离 + 超时 + 失败恢复;BullMQ delayed cleanup;e2e-sandbox.sh 15/15 pass。
- **A13** R-MIGRATE:Airtable/Notion/Google Sheets 迁移器扩展;统一 MigrationTransactionService + 字段类型映射表;失败回滚 + 进度 + 错误定位;e2e-migrate-airtable.sh 8/8 pass。
- **A14** R-ADMIN-AUDIT:管理后台 30 个页面逐一走完官方清单 checklist;Skills/AI queue/Sandbox/Query Ops/License/Users-Spaces UI 缺失元素补齐;e2e-admin-pages.sh 30/30 pass。
- **A15** R-BACKUP:真实 restore 演练;RPO ≤ 5min / RTO ≤ 30min 证据;e2e-backup-restore.sh 8/8 pass。
- **A16** R-RESIDENCY:per-tenant region tag;跨区访问 → 403 + 审计;EU 租户数据 → EU region DB;e2e-residency.sh 6/6 pass。
- **A17** R-KMS:BYOK 定期轮换;新写入用新密钥;旧数据用旧密钥解密;verify-enterprise gate 新增 BYOK 轮换成功。
- **A18** R-COMPLIANCE:GDPR/CCPA 数据导出 JSON bundle;删除 user 全部数据不可恢复 + 审计;e2e-compliance.sh 8/8 pass。
- **A19** R-I18N:zh-CN/en/de/ja 至少覆盖所有 admin page;切换语言 → admin page 完整翻译;e2e-i18n.sh 验证每页 4 语言切换。
- **A20** V100:3 个 Phase child 全部 `done` 后,Supervisor 在最终集成分支上检查 95%+ 对齐率(每个 child 已完成的 acceptance pass + 端到端验证)。

# Constraints and invariants

1. **环境**:PostgreSQL `:42345`、NestJS `:3070`、Next.js `:3000`、`OPENAI_API_KEY` 用户自配
2. **测试账号**:`v141788251579@x.com / Passw0rd!`(admin, V12 创建)
3. **git 策略**:遵循 AGENTS.md "不主动 git commit",仅在工作日结束一次性 commit(除非用户明确要求)
4. **OpenAPI 同步**:v2 packages 遵循 `packages/v2/contract-http` 契约优先;新增 endpoint 必须先在 contract-http 暴露,再在 router 实现
5. **依赖注入**:严格用 `@teable/v2-di`,不直接 import `tsyringe`
6. **不重写**:不重写已有工作良好的模块;只扩展/补齐
7. **不引入新框架**:不引入 Cloud 文档中没明确点名的技术栈
8. **不动 Postgres enum 策略**:沿用 V78/V80 的策略(AppStatus 用 TEXT 而非 enum)
9. **Backend 100% module-barrel coverage**:每个 feature module 都有 `index.ts`
10. **Cloud 文档作权威**:Cloud 帮助文档(teable.ai/zh)作为可观察能力的对照基线

# Decisions

- **对齐目标**:Cloud parity(企业深度对齐),2-3 个月密集推进 25-30 R-round(实际本 change 20 R-round)
- **时间线**:2-3 个月密集,每天多次 commit
- **验证**:完整 verify-enterprise gate + 真实 E2E(每项升级 gate + 新增 e2e-*.sh live HTTP 证据)
- **Supervisor Change 形态**:3 个 Phase child change(每个 Phase 一个 child,在独立 worktree 中创建,merge 到 Supervisor 分支)
- **不做项**:Stripe/SLA/营销/移动 App(明确边界)
- **AGENTS.md 边界**:不主动 git commit、不 revert 未知改动、严格 `@teable/v2-di`、v2 contract-http 优先

# Open questions

无未解决用户问题。所有用户决策(对齐目标/时间线/验证方式)已在 # Decisions 中固化。所有可执行语义单元均有 Spec + 验收 ID 双重映射(Source coverage 表)。

# Verification expectations

每个 R-round 必须产出(per "验证策略" 段):
1. 真实代码改动(后端 + 前端,按 P0/P1/P2 类别)
2. 单元测试(>80% 新代码覆盖率)
3. 真实 E2E:新增或更新 `scripts/e2e-<name>.sh`,curl + 真实 DB 状态验证
4. verify-enterprise gate 升级:每个 R-round 至少升级 1 个 gate,最终 verify-enterprise.sh 包含 30+ gates
5. REALITY-AUDIT-V81+ 报告:描述真实根因 + 真实改动 + 真实验证证据
6. 真实 puppeteer 浏览器截图(关键 UI 改动):4-6 张 PNG 验证页面渲染,放在 `v{NN}-screenshots/`

总产出估算:9,000 行真实代码 + 20 份审计报告(REALITY-AUDIT-V81~V100, ~200 行/份) + 13 个 E2E 脚本 + ~80 张 puppeteer PNG。
