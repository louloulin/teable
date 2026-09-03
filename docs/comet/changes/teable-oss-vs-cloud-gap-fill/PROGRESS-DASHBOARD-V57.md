# Teable OSS vs Cloud 差距补齐 — V57 真实进度与最小改造报告

> **生成时间**：2026-09-02 19:52（Asia/Shanghai）  
> **范围**：V56 之后的 Feishu IM 接入、统一 barrel/source visibility 修复、自动化验证  
> **原则**：只按仓库代码、运行时响应、自动化测试和 Teable 官方资料计分；未验证的能力不计入“已完成”。

## 1. 结论先行

- **整体企业级功能完成度：约 78%（保守口径）**。
- **核心数据表/视图/权限/自动化基础能力：约 90%**。
- **AI 端到端能力：约 70%**；AI Chat 已有会话、流式、多模型、工具/Artifact 等增量实现，但 Cloud 的完整后台任务、队列、记忆、Skills、文件生命周期和真实 UI 闭环仍不能按 100% 计。
- **Cloud Business 运营能力：约 55%**；Stripe webhook、SCIM Push 和 license gating 已有，但 Cloud 专属的支付运营、发票、SLA、客服、多区托管不能由 OSS 代码替代。
- **企业安全与合规：约 65%**；SSO、审计、权限矩阵、配额、速率限制、备份等已有代码，但完整 OIDC discovery、合规证据闭环、多租户/数据驻留和 UI 仍有差距。
- **不能宣称“OSS 与商业版 100% 等价”**：Comet 旧 change 的 `89/89 passed` 表示该 change 的验收项通过，不代表官网全部商业能力已实现。

## 2. 本轮真实交付

### 2.1 飞书 IM（V57）

已实现并接入 `ImBridgeModule`：

- `FeishuAdapter`：真实调用租户 token 和发送消息 API。
- token 按 `appId` 缓存，过期前刷新。
- App Secret 使用 AES-256-GCM 加密保存，复用 `TEABLE_INTEGRATION_SECRET`。
- 管理 API：配置、脱敏读取、删除、测试消息。
- 自动化动作：`send_feishu_message`，动作配置不保存 App Secret。
- AI Automation Builder 与 Canvas 可识别该动作。

未宣称完成的部分：

- 没有真实飞书租户凭据，因此未证明真实消息投递成功。
- 当前主要覆盖文字消息；官网列出的图片、文件、音频、视频、表情、富文本尚未全部实现。
- `POST /api/admin/im-bridge/feishu/config/test` 失败时当前返回 HTTP 201 + `{ok:false}`，后续应统一错误状态语义。

### 2.2 统一导出与 source visibility

- 后端 feature 模块的顶层和嵌套 helper barrel 检查通过。
- 修复 Pivot view 运行时 barrel/source 优先级问题，避免 `PivotViewCore` 在测试环境被旧生成 `.js` 遮蔽。
- Vitest 解析顺序显式优先 `.ts/.tsx`，符合 v2/source visibility 开发要求。
- 自动化 catalog 断言同步到 19 个动作，包含 `send_feishu_message`。

## 3. 与官网 Cloud 的真实差距

| 能力域 | 现状 | 保守完成度 | 主要差距 |
|---|---:|---:|---|
| 表、字段、视图、Base CRUD | 可用 | 90% | 商业版 UI 细节、跨模块边界行为需继续 E2E |
| Authority Matrix | API/服务已有 | 80% | 记录/字段/视图条件组合、管理 UI、复杂角色矩阵 |
| 自动化 | 触发器、动作、AI Builder、运行历史已有 | 75% | Cloud 限流/配额全链路、更多连接器、可视化 UI 和失败重试运营 |
| AI Field | 多种生成/批量/幂等能力已有 | 75% | 真实模型覆盖、图片/文件、计费退还、完整 UI |
| AI Chat/Cuppy | 核心会话能力已有 | 70% | Cloud 的后台任务、队列、记忆、Skills、文件管理、@ 节点和真实 UI 闭环 |
| AI App Builder | 后端 proposal/API 较完整 | 60% | 部署、版本历史、回滚、自动修复、自定义代码运行时、导入导出 |
| 自定义 AI 模型/BYOK | 部分设置和 gateway 已有 | 55% | 多提供商完整配置、模型测试、多模型/图像模型管理、安全轮换 |
| SSO/SCIM | SAML/OIDC/SCIM 有实现 | 75% | OIDC discovery、域校验/拒绝路径、企业目录完整同步和管理 UI |
| Billing/License | Stripe webhook、license gating、SCIM Push | 55% | Cloud checkout、席位/用量/算力、发票、退款/失败付款运营 |
| Feishu IM | 文字消息 adapter 已实现 | 45% | 多媒体、事件回调、真实租户投递、UI 配置闭环 |
| 审计/合规 | 审计、导出、保留策略等已有 | 65% | ISO/SOC 证据包、控制项映射、审计 UI、数据驻留/多租户验证 |
| 语音输入 | 未实现 | 0% | 浏览器识别或 Whisper 转写、权限与计费 |

**加权保守口径：约 78%。** 该百分比是当前代码与验证证据的工程估计，不是 Teable 官方评分。

## 4. 当前验证证据

- `bash scripts/verify-enterprise.sh`：**4/4 通过**。
- `python3 scripts/generate-module-index.py --check`：**would_write 0**，196 个已有 barrel 无需生成。
- 相关单测：**4 个测试文件、37 个测试全部通过**。
- 后端 `tsc --noEmit`：**87 个错误，未超过已记录 baseline 87**；这不是“零错误”。
- `packages/core` typecheck：本轮进程已启动，最终结果需以命令退出码为准；不能提前宣称通过。
- 运行时：前端 `http://127.0.0.1:3001/` 返回 307，后端 `/api/auth/profile` 返回 200；未登录访问管理 API 返回 401，符合保护逻辑。
- 由于当前没有登录 cookie，`/api/automation/catalog` 和 Feishu 管理 API 的匿名请求返回 401，不能作为功能失败证据。
- Feishu 假凭据验证到达真实 token API，但返回 `code=10003 invalid param`；这只证明失败路径可达，不证明真实发送成功。

## 5. 最佳最小改造路线

1. **P0：Feishu 事件与多媒体**。先抽象消息 payload/附件上传，补 `im.message.receive_v1` 验签与文字/图片/文件三种高频类型；保留现有 adapter，不重写 IMBridge。
2. **P0：AI Chat 闭环**。优先把已有 session/queue/artifact/memory/tool API 接入前端真实入口，再补后台任务与失败算力退还；避免继续只增加孤立 endpoint。
3. **P1：Billing E2E**。补 checkout、portal、invoice、seat/usage 的真实 controller 测试，明确 OSS self-hosted 与 Cloud-only 的边界。
4. **P1：SSO/SCIM**。补 OIDC discovery、JWKS/issuer 校验、目录同步重试和脱敏审计事件。
5. **P1：企业运营 UI**。审计日志、权限矩阵、配额、SSO、Feishu 配置和 AI 设置优先接入现有 admin 页面。
6. **P2：合规与数据治理**。将 ISO/SOC 控制项、证据采集、数据驻留、多租户隔离接成可验证链路。
7. **P2：语音与高级 AI**。最后做浏览器语音输入/Whisper、完整 Skills/文件/多媒体，避免在基础闭环未稳定前扩大范围。

## 6. 账号与启动说明

- 本地默认管理员（仅适用于当前开发环境）：`admin@teable.local` / `teable`。
- 生产环境不要使用该默认密码，应立即修改并通过管理员密码重置流程轮换。
- 后端监听 `http://127.0.0.1:3000`，前端监听 `http://127.0.0.1:3001`；`/api/health` 不是本项目已注册路由，不能用它判断服务是否启动。
- 用户提供的 MiniMax API Key 不写入报告、日志或源码；应通过本地环境变量/密钥管理配置，并在使用后轮换。

## 7. Comet Native 状态

`comet native status teable-oss-vs-cloud-gap-fill --details --json` 已确认：

- phase：`archive`
- status：`done`
- acceptance：`89/89 passed`
- workspace：`/Users/louloulin/appx/teable/.worktrees/supervisor`

本报告是后续 V57 事实记录，不伪造新的 active change，也不把旧 change 的验收结果扩大解释为商业版全量完成。
