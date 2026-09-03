# Teable 企业级能力优先级矩阵（2026-09-03）

> 配套审计：`docs/enterprise/teable-commercial-gap-audit-2026-09-03.md`  
> 配套路线图：`docs/enterprise/teable-commercial-implementation-roadmap-2026-09-03.md`  
> 评估对象：`/Users/louloulin/appx/teable` 当前 `develop` 工作区（R46 收官后）

## 1. 评估口径（与审计 §2 一致）

- **E0** 完全缺失
- **E1** 骨架（路由/表/类型）
- **E2** 可调用（有鉴权 + 单测）
- **E3** 业务闭环（写读 + 权限 + 失败 + 幂等 + 前端 + 端到端）
- **E4** 商业等价（Cloud 文档的完整用户流 + 限制 + 运营语义全部可复现）

**重要修正**：本矩阵**不再把"模块存在"等同于 E3**。审计 §4.6/§4.7 列出的 SSO/SAML/SCIM/TOTP/IP Allowlist/Custom Domain/Backup/Quota/Retention 等模块在 R1-R46 之间已经基本具备 module + 鉴权 + 单测（E2），但**行为证据**（真实 IdP 联调 / 真实请求阻断 / 真实恢复演练）大多缺失。本矩阵将 E2 与 E3 严格区分。

## 2. 企业级能力全景（按 Cloud 商业能力域划分）

### 域 A：身份与访问治理（IAM）

| 能力 | 当前证据 | E 等级 | 真实缺口 |
|---|---|---|---|
| SAML SSO | `features/saml/` 完整 SP-initiated 实现（controller 10.2K + service 8.5K + auth.service 5.7K + 4 specs ~31K）；SP metadata XML、AuthnRequest deflate+base64、`SsoLoginState` replay 保护（consumed 标志 + 5min TTL）、mock IdP/dev path 已建 | E2 | 无真实 IdP 联调（samltool.io / samltest.id）；无 domain-verified 联动测试 |
| OIDC | `features/federated-sso/` service 4.6K + auth 2.2K；sso-federation controller + 3 specs | E2 | 同上 |
| SCIM | `features/scim/` service 20K + auth + admin controller + 4 specs；`scim-push/` 已建 | E2 | 无真实 IdP 推送演练 |
| TOTP / MFA | `features/totp/` service 6.2K + auth.service 8.3K + admin controller + 2 specs | E2 | recovery code 流程 + admin bypass 审计未端到端 |
| Login Risk | `features/login-risk/` | E1 | 异常登录 → lockout / notify 未端到端 |
| OAuth Server | `features/oauth-server/` + 1 spec | E1 | client credentials / PKCE / token rotation 未端到端 |
| Custom Role | `features/org-custom-role/` | E1 | role hierarchy / inherit / conflict 检测未覆盖 |
| Ban List | `features/org-ban-list/` | E1 | 自动 / 手动封禁 + 申诉流程未跑 |
| Email Domain Claim | `features/email-domain-claim/` | E2 | 邮件域名验证流程未跑 |

### 域 B：合规与审计

| 能力 | 当前证据 | E 等级 | 真实缺口 |
|---|---|---|---|
| Audit Log | `features/audit/` create/update/delete 事件 | E2 | 全量事件覆盖 / 事务失败降级 / 分页筛选 / 权限矩阵未端到端 |
| Audit Log Query | `features/audit-log-query/` | E2 | 多维查询 + 分页未端到端 |
| Audit Export | `features/audit-export/` | E2 | 脱敏规则（密码/token/PII）不完整 |
| Audit Retention | `features/audit-retention/` | E2 | retention policy 与实际删除的端到端 |
| Compliance Policy | `features/compliance-policy-engine/` | E1 | rule DSL + 自动评估 + 失败阻断未跑 |
| Control Map | `features/compliance-control-map/` | E1 | SOC2/ISO27001 控件映射未对齐 |
| Evidence Collector | `features/compliance-evidence-collector/` | E1 | 自动收集 + 审计包未生成 |
| Audit Pack | `features/compliance-audit-pack/` | E1 | 客户用审计包未组装 |
| Attestation | `features/compliance-attestation/` | E1 | 合规声明签名 / 时间戳未做 |

### 域 C：数据保护与备份恢复

| 能力 | 当前证据 | E 等级 | 真实缺口 |
|---|---|---|---|
| Backup | `features/backup/` R9 P0 已修复 actor bypass；service + controller 完整 | E2 | 外部对象存储 / 异步进度 / 校验和 / 加密 / 真实恢复演练未跑 |
| Restore | 同上 | E2 | 跨租户 / 时间点 / PIT 恢复未跑 |
| Data Masking | `features/data-masking/` | E1 | 字段级 + 角色级 mask 未端到端 |
| Data Residency | `features/data-residency/` 已注册 readiness | E1 | 区域路由 + 跨区域迁移未跑 |
| KMS | `features/kms-encryption/` + `features/byok-kms/` | E2 | 真 KMS provider（AWS/GCP/Azure）未接线 |
| DLP | 仅字段 mask | E1 | 内容扫描 / 拦截 / 告警未做 |

### 域 D：权限矩阵（细粒度授权）

| 能力 | 当前证据 | E 等级 | 真实缺口 |
|---|---|---|---|
| Space/Base/Record 矩阵 | `features/permission-matrix/` view-level allow list（G0 已落地） | E2 | row filter + field projection 联动未端到端 |
| Field Permission | 同上 | E2 | 同上 |
| Record Filter | 同上 | E2 | row-level filter 热路径 E2E |
| App/Workflow Node | 同上 | E2 | 节点级权限 E2E |
| Import/Export | 同上 | E1 | 大批量导入的权限校验未端到端 |
| Cross-Base Federation | `features/cross-base-federation/` | E1 | 跨 base 联合查询未跑 |
| Cross-Org Admin | `features/cross-org-admin/` 已注册 readiness | E1 | admin grant / audit / 撤销未端到端 |

### 域 E：网络与边界安全

| 能力 | 当前证据 | E 等级 | 真实缺口 |
|---|---|---|---|
| IP Allowlist | `features/ip-allowlist/` service 6.3K + auth.service 3.4K + 2 specs | E2 | 名单生效 + 旁路检测未端到端（关键 P0） |
| Custom Domain | `features/custom-domain/` + `features/domain-verification/` + `features/email-domain-claim/`；service 3.1K + 2 specs | E2 | TLS provisioning / cert 自动续签未跑 |
| Risk Control | `features/risk-control/` + `features/risk-event-query/` + `features/risk-policy/` | E1 | 规则评估 + 实时阻断未端到端 |
| API Rate Limit | `features/api-rate-limit/` | E2 | 多维度限流 + token bucket 未端到端 |
| Org Quota | `features/org-quota/` + `features/org-quota-reservation/` | E2 | 超额降级 + 通知未端到端 |
| Storage Metering | `features/storage-metering/` | E1 | 真实字节统计 + 周期账单未跑 |
| Seat Metering | `features/seat-metering/` | E1 | 占位 + 计费联动未跑 |

### 域 F：治理与运营

| 能力 | 当前证据 | E 等级 | 真实缺口 |
|---|---|---|---|
| Worktree Switch | `features/workspace-switch/` | E2 | 多工作区切换未跑 |
| Workspace Mirror | `features/workspace-mirror/` 已注册 readiness | E1 | 镜像同步 / 冲突合并未跑 |
| Dashboard | `features/dashboard/` | E2 | 多面板聚合未端到端 |
| DR Canvas | `features/dr-canvas/` | E1 | 灾备演练 + 自动化未跑 |
| Multi-Region Arbitration | `features/multi-region-arbitration/` | E1 | 区域仲裁 / 故障切换未跑 |
| Readiness Dashboard | `admin/enterprise-readiness.service` + 三态 manifest + Admin Dashboard UI | E3 (R30/R44) | CI gate 未接 |
| Approval Workflow | `features/approval-workflow/` 已注册 readiness | E1 | 流程引擎 + 审批人解析 + 超时未跑 |
| Integrity | `features/integrity/` | E1 | 数据完整性校验未跑 |
| Announcements | `features/announcements/` 已注册 readiness | E1 | 站内信 / 邮件 / 强弹窗未端到端 |

### 域 G：计费与商业运营（已是 R 投入大方向）

| 能力 | R 进度 | E 等级 | 真实缺口 |
|---|---|---|---|
| Stripe Checkout / Webhook | R 7/12 | E3 | — |
| Seat / Plan 改动 + Proration | R 10/12 | E3 | — |
| Dunning Worker | R 14 | E3 | — |
| Billing Portal | R 15/18 | E2 | Stripe Customer Portal 仍 503 stub |
| Metered Invoice | R 18/19 | E3 | — |
| Invoice PDF | R 18/31 | E3 | Cloud 替换为真 Stripe PDF |
| Add-on Metering | R 18 | E2 | cron 调度未接 |
| Org Billing Rollup | `features/org-billing-rollup/` | E1 | 跨周期汇总未端到端 |
| License Key Self | `features/license-key-self/` | E1 | 自助激活 / 降级未端到端 |

### 域 H：可观测与诊断

| 能力 | 当前证据 | E 等级 | 真实缺口 |
|---|---|---|---|
| Eval Harness | `features/eval-harness/` | E1 | 模型/迁移评估未跑 |
| Field Experiment | `features/field-experiment/` | E1 | A/B 框架未跑 |
| AI Cost Forecaster | `features/ai-cost-forecaster/` | E1 | 用量预测未跑 |
| Quota Anomaly | `features/quota-anomaly/` | E1 | 异常检测未跑 |
| Tenant Replay | `features/tenant-replay/` | E1 | 事件回放未跑 |

## 3. 行为证据 vs 静态探针（关键修正）

`admin/enterprise-readiness-behavior.service.ts` 已为以下能力注册 **table-presence 探针**：

- `sso` — `meta.sso_identity_provider` 表存在性
- `saml` — `meta.sso_identity_provider` provider 数
- `scim` — `meta.scim_push_event` 表存在性
- `totp` — `meta.user_totp_factor` 表存在性
- `ip_allowlist` — `meta.organization_ip_allowlist` 表存在性
- `backup` — `meta.backup_snapshot` 表存在性

**但这些探针不是真正的行为证据**。它们只能证明"表被建出来了"，不能证明：
- SAML AuthnRequest 能被真实 IdP 接受并返回有效 SAMLResponse
- IP Allowlist 能在请求路径上真正拒绝未授权 IP
- Backup 能在外部对象存储上 put + get + 校验和验证
- SCIM push 能被真实 IdP 接收并完成 user provisioning

这就是 **当前从 E2 推到 E3 的最大鸿沟**：代码有、测试有、表存在，但**真实行为**没跑过。

## 4. 推荐实现顺序（Top 7 + 第二梯队）

按 **客户签单必要性 × 实现工作量 × 阻塞其他能力** 综合：

| # | 能力 | 域 | 必要性 | 工作量 | 阻塞 | 推荐 Round |
|---|---|---|---|---|---|---|
| 1 | **IP Allowlist 真实请求阻断 E2E** | E | ★★★★★ | S | 否 | R47 |
| 2 | **SAML SSO 真实 IdP 联调**（samltool.io） | A | ★★★★★ | M | 否 | R48 |
| 3 | **SCIM 真实 IdP push 演练** | A | ★★★★★ | M | 否 | R49 |
| 4 | **Audit Log 全量事件 + 导出脱敏 + Retention E2E** | B | ★★★★★ | L | 否 | R50-R51 |
| 5 | **Permission Matrix 热路径 E2E**（field + record filter + import/export） | D | ★★★★ | L | 否 | R52-R53 |
| 6 | **Backup 外部对象存储 + 真实 restore 演练** | C | ★★★★ | L | 否 | R54-R55 |
| 7 | **Stripe Customer Portal 真接通 + cron 调度** | G | ★★★★ | M | 否 | R56 |

**第二梯队**（按 ROI 触发）：

| 能力 | 何时做 | 触发条件 |
|---|---|---|
| Custom Domain / IP Allowlist 真链路 | R57+ | 有客户要求自托管域名 |
| Custom Role / Org Custom Role 完整化 | R58+ | 客户要求 RBAC 自定义 |
| Data Masking 字段级 | R59+ | 医疗/金融客户咨询 |
| Approval Workflow 闭环 | R60+ | 客户要工作流/审批 |
| OAuth Server | R61+ | App Builder App Login 上线 |
| Federated SSO | R62+ | 客户要接多个 IdP |
| Compliance Attestation Pack | R63+ | SOC2 / ISO27001 认证冲刺 |
| Data Residency 路由 | R64+ | 欧洲/中东客户咨询 |

## 5. 跨域前置（建议作为每一轮都坚持的元规则）

1. **失败测试先行**：每个 capability 落地时，先写"伪造身份 / 过期 token / 跨租户 / 跨组织"四种负向测试，再写实现。
2. **行为证据而非静态探针**：readiness 三态里 `verified` 必须有真实 E2E，不可以只检查表存在。
3. **Cloud/OSS 路径分离**：所有 enterprise capability 用 `@Capability('enterprise'|'cloud')` 装饰器显式标注，readiness aggregator 据此分类。
4. **Audit 覆盖所有写操作**：每次 capability 落地同时 emit `audit_event`（actor / tenant / resource / action / result / correlationId）。
5. **per-tenant 默认 deny**：所有 enterprise capability 默认拒绝，仅显式开启才允许。

## 6. 当前明确不能宣称（不变声明）

在以下证据出现前，不得宣称"达到 Cloud Business 等价"：

- 所有 enterprise capability 都有真实行为 E2E（不是表存在）
- SAML/SCIM/SSO 在至少一个真实 IdP 联调通过
- Audit log 全量事件 + 脱敏 + retention E2E 通过
- Permission Matrix 在 record/view/field/import/export 热路径 E2E 通过
- Backup 在外部对象存储 + 真实 restore 通过
- IP Allowlist 在请求路径真实阻断 + 旁路检测通过
