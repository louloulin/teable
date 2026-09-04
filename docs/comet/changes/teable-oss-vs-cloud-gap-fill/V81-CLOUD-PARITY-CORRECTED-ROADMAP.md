# Teable OSS Cloud Parity 路线图（V81+ 校正版）

> 校正时间：2026-09-04 02:12（Asia/Shanghai）
> 基于：[REALITY-AUDIT-V81-DEEP-REALITY-CHECK.md](./REALITY-AUDIT-V81-DEEP-REALITY-CHECK.md)
> 校正原因：原 `pasted-text-1.txt` 路线图假设 R-CHAT-1/2 端到端可用，实际上 controller 类闭合 bug 让 endpoint 未注册。

## 与原路线图的关键差异

| 项目 | 原 roadmap | 校正后 |
|---|---|---|
| 真实 Cloud parity | 70-75% | **53.5%**（实测） |
| R-CHAT-1 闭环状态 | "✅ done" | **⚠️ 30%**（controller bug） |
| R-CHAT-2 闭环状态 | "🔄 80% done" | **⚠️ 10%**（controller bug + schema 仅在 worktree） |
| verify-enterprise gate 数量 | "1-10" | **1-10 但 9/10 永远不跑**（脚本结构 bug） |
| 进入 R-CHAT-3 之前 | 无 | **必须先 FIX 5 个 P0 bug** |

---

## Phase 0 — P0 修复（必须先做，1 天内）

> 不修复这些，后续所有 R-round 的 verify 都是 false-positive。

### FIX-1：ai-chat.controller.ts class 闭合位置修复（0.5h）

```bash
# 当前 bug 位置
$ sed -n '595,605p' apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts
  }               # line 595
  }               # line 596
}                 # line 597 — class 闭合
                  # line 598
  // ── R-CHAT-1: ...  ← 这之后所有内容都在类外

# 修复方法：把 line 597 的 `}` 移到 line 685 之后
# 或者：删除 line 600 之后的 `}` （如果有），让 line 599 的 `}` 作为方法闭合
```

**具体改动**：
1. 打开 `apps/nestjs-backend/src/features/ai-chat/ai-chat.controller.ts`
2. 找到 line 597 的 `}` 和 line 599 的 `}` — 应该是方法闭合 + class 闭合
3. 把 line 600-685 的 R-CHAT-1/2 块**移回** class 内（line 597 之前）

**验收**：
```bash
cd apps/nestjs-backend
npx tsc --noEmit -p .  2>&1 | grep "ai-chat.controller" | wc -l
# 期望: 0
```

### FIX-2：SelectionChips.test.tsx 异步 waitFor 语法修复（0.5h）

```typescript
// apps/nextjs-app/src/features/app/components/chat-panel/SelectionChips.test.tsx
// line 141 — 当前
await waitFor(() => {
  const calls = ((await import('./api')).aiChatApi.clearSelectionByTable as ReturnType<typeof vi.fn>).mock.calls;
  // ...
});

// 修复后
await waitFor(async () => {
  const calls = ((await import('./api')).aiChatApi.clearSelectionByTable as ReturnType<typeof vi.fn>).mock.calls;
  // ...
});
```

**验收**：
```bash
cd apps/nextjs-app
./node_modules/.bin/vitest run --no-coverage --environment happy-dom \
  src/features/app/components/chat-panel/SelectionChips.test.tsx
# 期望: Tests 6 passed (6)
```

### FIX-3：verify-enterprise.sh 结构性 bug 修复（0.5h）

```bash
# 当前 bug：
# line 158 hdr "8/10 ..." 之后是 Summary + exit 0
# line 179 hdr "9/10 ..." 在 Summary 之后，永远跑不到

# 修复方法：把 hdr "9/10 ..." 和 hdr "10/10 ..." 移到 hdr "8/10 ..." 之后、Summary 之前
```

**验收**：
```bash
bash scripts/verify-enterprise.sh
# 期望：能看到 "── 9/10 ──" 和 "── 10/10 ──" 输出，exit code 反映 4 gates pass（如果 backend 起来则 10 gates pass）
```

### FIX-4：R-CHAT-2 schema + migration 同步回主仓（1h）

```bash
# 从 worktree 复制 schema 改动
cp .worktrees/phase-1-clean/packages/db-main-prisma/prisma/postgres/schema.prisma \
   packages/db-main-prisma/prisma/postgres/schema.prisma

# 从 worktree 复制 migration
cp -r .worktrees/phase-1-clean/packages/db-main-prisma/prisma/postgres/migrations/20260906100000_add_ai_chat_intelligence_fields \
      packages/db-main-prisma/prisma/postgres/migrations/

# 重新 generate prisma client
cd packages/db-main-prisma
npx prisma generate

# 验证
grep "smartLevel|tokenBudget|allowedTools" /Users/louloulin/appx/teable/packages/db-main-prisma/prisma/postgres/schema.prisma
ls /Users/louloulin/appx/teable/packages/db-main-prisma/prisma/postgres/migrations/ | grep intelligence
```

### FIX-5：backend live 启动（持续）

```bash
# 启动 PostgreSQL
# 启动 NestJS backend
cd apps/nestjs-backend
pnpm dev  # 或 npm run start:dev

# 验证
curl http://127.0.0.1:3000/api/health
# 期望: 200 或 healthcheck JSON
```

### FIX-6：验证 R-CHAT-1 真实端到端（0.5h）

```bash
# FIX-1+5 完成后，真实跑 e2e
bash scripts/e2e-ai-chat-selection.sh
# 期望: 16 cases pass
```

### FIX-7：验证 R-CHAT-2 真实端到端（0.5h）

```bash
bash scripts/e2e-ai-chat-intelligence.sh
# 期望: 10 cases pass
```

---

## Phase 1 — P0 真实产品闭环（4-6 周，原 roadmap）

> Phase 0 完成后再开 Phase 1。

### R-CHAT-3 语音输入（1 周）

**真实代码改动**：
- `apps/nestjs-backend/src/features/ai-chat/voice.controller.ts`（新，multipart + Whisper）
- `apps/nextjs-app/src/features/app/hooks/useVoiceRecorder.ts`（新，MediaRecorder API）
- `apps/nextjs-app/src/features/app/components/chat-panel/VoiceButton.tsx`（新）

**验收**：
- 录音 → 转写 → 填入输入框 → 可编辑
- 录音失败 / 拒绝权限 → 友好错误
- e2e-ai-chat-voice.sh 6/6 pass
- verify-enterprise.sh gate 11/11（注意：FIX-3 修复后 gate 数从 10 升到 11）

### R-ATTACH-1 文件解析全场景（1.5 周）

**真实代码改动**：
- `apps/nestjs-backend/src/features/attachment/parsers/pdf-parser.service.ts`（pdf-parse）
- `apps/nestjs-backend/src/features/attachment/parsers/excel-parser.service.ts`（xlsx）
- `apps/nestjs-backend/src/features/attachment/parsers/docx-parser.service.ts`（mammoth）
- `apps/nestjs-backend/src/features/attachment/parsers/image-ocr.service.ts`（Tesseract.js 或 OpenAI Vision）
- `apps/nestjs-backend/src/features/attachment/attachment-index.service.ts`（BullMQ）

**验收**：
- 上传 1MB PDF → 90s 内完成文本提取 + 索引
- 文本注入 prompt → AI 回复含真实内容
- 图片走 OpenAI Vision
- e2e-ai-chat-attachment.sh 升级 8/8 → 12/12 pass

### R-ATTACH-2 下载 token + 病毒扫描（1 周）

**真实代码改动**：
- `apps/nestjs-backend/src/features/attachment/attachment-token.service.ts`（HMAC）
- `apps/nestjs-backend/src/features/attachment/attachment-scan.service.ts`（ClamAV 或 mock）

**验收**：
- 过期 token → 401
- 跨用户 token → 403
- EICAR 测试文件 → 扫描拦截
- e2e-ai-chat-attachment-security.sh 8/8 pass

### R-WRITE-1 写入面扩展（1 周）

**真实代码改动**：
- `apps/nestjs-backend/src/features/ai-chat/ai-chat-write-plan.service.ts` 扩展到 table/field/view/app/automation 5 类
- `apps/nextjs-app/src/features/app/components/chat-panel/WritePlanPreview.tsx`（diff 视图）

**验收**：
- "创建一个名为 X 的表，含字段 A/B/C" → 显示 plan → confirm → 真实创建
- 失败回滚：plan 事务化，partial 失败全回滚
- e2e-ai-chat-write-plan.sh 12/12 pass

### R-WRITE-2 幂等性 + 回滚审计（0.5 周）

**真实代码改动**：
- `apps/nestjs-backend/src/features/ai-chat/ai-chat-write-idempotency.service.ts`（新）
- 扩展 `audit_log` module

**验收**：
- 重复 plan apply → 第二次返回原结果
- audit_log 含 `actorType=ai`, `planHash`, `idempotencyKey`
- verify-enterprise gate 新增 AI write audit

---

## Phase 2 — P1 企业可用性（4-6 周，原 roadmap）

> Phase 1 完成后再开 Phase 2。所有 R-IDP/R-AI-MODEL 都需真实 IdP / 真实 backend live 才能验证。

### R-IDP-1 真实 OIDC 接入（1.5 周）
### R-IDP-2 真实 SAML 接入（1 周）
### R-IDP-3 真实 SCIM 接入（1 周）
### R-AI-MODEL Custom AI Model × capability 矩阵（1.5 周）
### R-SANDBOX Sandbox 完整生命周期（1.5 周）
### R-MIGRATE 迁移器升级（1.5 周）
### R-ADMIN-AUDIT 管理后台逐页核对（1 周）

---

## Phase 3 — P1 高级 + P2 治理（2-4 周，原 roadmap）

### R-BACKUP Backup restore 演练
### R-RESIDENCY 数据驻留
### R-KMS KMS 密钥轮换
### R-COMPLIANCE 合规导出
### R-I18N 多语言

---

## 总工作量估算（校正版）

| Phase | R-round | 代码改动 | verify gate 增量 | E2E 脚本数 | 估时 |
|---|---|---:|---:|---:|---:|
| **Phase 0**（修复） | 7 fixes | ~150 行 | 0 | 0 | 1 天 |
| Phase 1（P0） | 7 R-rounds | ~3,000 行 | +5 | +5 | 4-6 周 |
| Phase 2（P1） | 7 R-rounds | ~4,500 行 | +7 | +5 | 4-6 周 |
| Phase 3（P2） | 5 R-rounds | ~1,500 行 | +5 | +3 | 2-4 周 |
| **总计** | **19 R-rounds + 7 fixes** | **~9,150 行** | **+17** | **+13** | **~16 周** |

加上审计报告（V82-V100，~20 份）和 puppeteer 截图（~80 张 PNG）：
- **代码**：9,150 行
- **审计报告**：20 份 × 200 行 = 4,000 行
- **E2E 脚本**：13 个
- **截图**：80 张

---

## 关键里程碑与 Gate（校正版）

| 里程碑 | 时间 | 验收 |
|---|---|---|
| **Phase 0 完成** | 1 天 | FIX-1 ~ FIX-7 全完成；R-CHAT-1 16/16 e2e pass；R-CHAT-2 10/10 e2e pass |
| **V85：Phase 1 完成** | 6 周 | R-CHAT-3/ATTACH-1/2/WRITE-1/2 全 5 个完成（Phase 0 已替代原 R-CHAT-1/2） |
| **V90：Phase 2 完成** | 12 周 | R-IDP/AI-MODEL/SANDBOX/MIGRATE/ADMIN-AUDIT 全 7 个完成 |
| **V100：Phase 3 完成** | 16 周（4 个月） | Backup/Residency/KMS/Compliance/i18n 全 5 个完成 |
| **总对齐率** | V100 | **≥95%**（Cloud 用户可观察能力） |

---

## 不在范围（明确不做）

- Stripe 收款、订阅、发票、增购 credit
- SLA 状态页、客服工单系统
- 公有云多区自动 failover、跨大区 BGP
- 营销漏斗、A/B 测试、conversion tracking
- 移动 App 原生客户端（仅 web 响应式）

---

## 假设与默认值

1. **后端运行环境**：PostgreSQL `:42345`、NestJS `:3000`、Next.js `:3001`
2. **测试账号**：`admin@teable.local / teable`（e2e 默认），`v141788251579@x.com / Passw0rd!`（V12 创建）
3. **git 策略**：不主动 commit，由用户工作日结束一次性 commit
4. **OpenAPI 同步**：v2 packages 遵循 `packages/v2/contract-http` 契约优先
5. **依赖注入**：严格用 `@teable/v2-di`，不直接 import `tsyringe`
6. **不重写**：不重写已工作良好的模块
7. **不引入新框架**
8. **不动 Postgres enum 策略**：沿用 V78/V80 的策略（AppStatus 用 TEXT 而非 enum）

---

## 下一步立即行动

1. **FIX-1**（0.5h）：修复 ai-chat.controller.ts class 闭合位置
2. **FIX-3**（0.5h）：修复 verify-enterprise.sh 结构性 bug
3. **FIX-2**（0.5h）：修复 SelectionChips.test.tsx 语法
4. **FIX-4**（1h）：R-CHAT-2 schema + migration 同步到主仓
5. **FIX-5**：启动 backend live
6. **FIX-6 + FIX-7**：验证 R-CHAT-1/2 端到端 e2e 跑通
7. 然后进入 R-CHAT-3 语音输入

**预计 Phase 0 总耗时：4-5 小时**（含 backend 启动 + e2e 调试）。
