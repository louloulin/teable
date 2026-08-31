# Teable Cloud 真实功能审计 — OSS 差距分析

**审计日期**:2026-09-01
**审计依据**:https://help.teable.ai/zh/basic/{ai/overview,ai/ai-chat,ai/app-builder,ai/custom-model,authority-matrix,...}
**审计范围**:AI 5 大能力 + Authority Matrix + 自动化 + 应用构建器

---

## 一、Cloud AI 5 大能力 vs OSS 实现

| Cloud 能力 | Cloud 文档路径 | Cloud 端点数(估) | OSS 现有 | 差距 |
|---|---|---|---|---|
| **AI 对话 (Cuppy)** | /zh/basic/ai/ai-chat | **15+ 端点** | **1 端点** `POST /api/cuppy/chat` | **P0 巨大差距** |
| **应用构建器** | /zh/basic/ai/app-builder | 12+ 端点 | 6 端点 (proposals CRUD) | P0 中等差距 |
| **AI 字段** | /zh/basic/field/ai/ai-field | 5+ 端点 | 1 端点 (streaming) + 1 (gateway) | P1 中等差距 |
| **AI 脚本/生成** | /zh/basic/automation/actions/ai/ai-script | 4 端点 | 4 端点 (sandbox-agent) | P2 基本对齐 |
| **自定义 AI 模型** | /zh/basic/ai/custom-model | **0 端点** | **完全缺失** | **P0 巨大差距** |
| **AI Admin 设置** | /zh/basic/admin-panel/ai-setting | **0 端点** | **完全缺失** | **P0 巨大差距** |

---

## 二、AI 对话 (Cuppy) 详细对比

### Cloud AI 对话能力(从文档提取)

1. **上下文感知智能助手**:用于数据分析、可视化和创作
2. **@-node 选择**:用 `@` 选择节点(表格/视图/应用/自动化/文件夹)
3. **Artifact 系统**:AI 生成的图表和报告保存
4. **记忆 (Memory)**:跨数据库生效
5. **后台任务运行**:可作为后台任务运行
6. **Cuppy 排队系统**:Cuppy 正在执行另一对话时显示队列
7. **算力退还**:AI 运行失败时返还算力
8. **并行执行**:AI 正在工作时继续发消息
9. **技能系统 (Skill)**:对话中使用技能,有同名技能优先级
10. **API Key 管理**:AI 对话需要 API Key 时放在哪里
11. **智能级别**:简单任务 vs 复杂任务选择不同模型 + 智能等级
12. **文件管理**:哪些文件保留在文件管理里
13. **标签复制**:复制带标签消息时保留什么

### OSS 当前实现

```ts
// apps/nestjs-backend/src/features/agent-orchestrator/cuppy.controller.ts
@Controller('api/cuppy')
@UseGuards(CuppyGuard)
export class CuppyController {
  @Post('chat')
  async chat(@Body() body: {baseId?, conversationId?, message: string}) {
    return {conversationId, text: reply.text}
  }
}
```

**只有 1 个端点**。缺失:@-选择、Artifact、Memory、Queue、Skill、并行执行、算力管理、智能级别、API Key 管理、文件管理、标签系统。

---

## 三、应用构建器 (App Builder) 详细对比

### Cloud 应用构建器能力

1. **AI 转 Web 应用**:数据库 → 定制 Web 应用
2. **自定义代码**:运行时调用 AI 模型
3. **部署**:登录配置后重新发布应用
4. **版本历史与回滚**:Teable 自动跟踪每次部署,一键回滚到任意版本
5. **自动修复 (Auto-fix)**:自定义代码导致构建错误时,AI 自动修补
6. **登录配置**:已发布应用使用新登录配置
7. **导出/导入应用代码**:下载或导入
8. **文件管理**

### OSS 当前实现

```ts
// apps/nestjs-backend/src/features/ai-builder/ai-builder.controller.ts
@Post('proposals')
@Get('proposals')
@Get('proposals/:id')
@Post('proposals/:id/approve')
@Post('proposals/:id/reject')
@Post('proposals/:id/apply')
```

**6 个端点,只覆盖 proposal CRUD**。缺失:部署、版本历史、自动修复、自定义代码运行时、登录配置、文件管理、导入导出。

---

## 四、自定义 AI 模型(完全缺失)

### Cloud 自定义 AI 模型能力

| 提供商类型 | 基础 URL | 模型示例 |
|---|---|---|
| OpenAI | https://api.openai.com/v1 | gpt-5.5, o3, gpt-5-mini |
| Anthropic | https://api.anthropic.com/v1 | claude-opus-4-8, claude-sonnet-5, claude-haiku-4-5 |
| OpenAI Compatible | /v1 (per provider) | gpt-5.5, gpt-5.4, o3, gpt-5-mini |

Cloud 特性:
- 测试所有模型
- 多模型逗号分隔
- 模型名称区分大小写
- 图像生成模型支持

### OSS 实现

**完全缺失**。OSS 只 hardcode OpenAI 作为默认 provider(在 `ai-gateway-models.service.ts`),不支持自定义多模型配置。R36 计划做 `byok-llm` + `byok-kms`,部分覆盖此功能但还不到位。

---

## 五、AI Admin 设置(完全缺失)

### Cloud AI Admin 设置

- 启用 AI(私有部署)
- 配置 AI Chat、字段、自动化、应用构建器
- 模型选择默认配置

### OSS 实现

**完全缺失**。`ai-setting` 目录不存在。

---

## 六、Authority Matrix 详细对比

### Cloud Authority Matrix 能力(从文档提取)

1. **视图权限**:控制能否创建/更新/删除视图 + 可见范围(所有 vs 特定)
2. **记录权限**:创建/更新/删除/评论/复制记录 + 可见范围(所有 vs 筛选条件)
3. **字段权限**:查看/更新/创建指定字段值,主字段必须保持可见
4. **导入/导出权限**:控制能否导入或导出表格
5. **默认角色**:未分配任何自定义角色的成员使用
6. **注意事项**:
   - 启用权限矩阵后,空间中低于"可管理"的用户受限
   - 开启权限矩阵的用户自动加入"管理员"
   - 添加用户时,已选未加入当前数据库的成员自动加入

### OSS 实现(R26 + R32)

| 维度 | Cloud | OSS (R26+R32) | 差距 |
|---|---|---|---|
| **authority-matrix** | 完整 5 维 | R26 import/export 5/5 | ✅ |
| **custom-role** | 完整 | R32 7 端点 | ✅ |
| **role-assignment** | 完整 | R32 包含 | ✅ |
| **UI 视图权限** | 可视化矩阵 | 无 UI | P2 后端 OK |

**OSS API 层面完整,仅 UI 落后**。

---

## 七、OSS 已实现的 AI 功能(完整清单)

### 控制器级别(8 个 AI 相关 controller)

| 控制器 | 端点数 | 功能 |
|---|---|---|
| `ai.controller.ts` | 3 | generate-stream, config, disable-ai-actions |
| `ai-streaming.controller.ts` | 1 | 流式 AI 响应 |
| `ai-builder.controller.ts` | 6 | App Builder proposal CRUD |
| `agent-orchestrator.controller.ts` | 3 | conversation/stats/reset |
| `cuppy.controller.ts` | 1 | AI 对话(最小实现) |
| `chat.controller.ts` | 1 | chart completion |
| `sandbox-agent.controller.ts` | 4 | sandbox config + sessions |
| `ai-cost-forecaster.controller.ts` | 2 | AI 成本预测 |
| `ai-skill.controller.ts` | 4 | AI Agent 接入 skill files |

**总计:25 个 AI 相关端点**(但很多功能深度不够,1-3 端点实现)

### 已注册的能力(R25 双 100% 里程碑)

```
ai_field: implemented
ai_chat: implemented
ai_app_builder: implemented
cuppy_claw: implemented
ai_script: implemented
ai_script_zh: implemented
ai_skill: implemented (4 inline files)
```

### 已实现的支撑功能

- ai-field-record-listener: AI 字段实时响应记录变更
- ai-field-prompt.builder: AI 字段 prompt 构造
- ai-builder-feedback: App Builder 用户反馈
- ai-cost-forecaster: AI 成本预测(forecast + series)
- sandbox-agent: 沙箱配置 + 会话管理
- ai-usage: AI 使用追踪
- ai-credit: AI 信用额度
- 12 script samples: 12 个双语 AI 脚本示例
- run_script action: 自动化 AI 脚本执行

---

## 八、真实差距总结(用户视角)

### 🔴 P0 - 完全缺失或严重不足(必须做)

| 特性 | Cloud | OSS | 影响 |
|---|---|---|---|
| AI 对话完整实现 | 15+ 端点 | 1 端点 | 用户用 OSS 无法体验 AI Chat 完整能力 |
| 自定义 AI 模型 | 完整 UI/API | 0 端点 | 企业客户无法接入自有 OpenAI/Anthropic Key |
| AI Admin 设置 | 完整 | 0 端点 | 私有部署无法配置 AI |
| App Builder 部署 | 完整 | 0 端点 | 用户生成的 AI 应用无法部署上线 |

### 🟡 P1 - 部分实现需扩展

| 特性 | Cloud | OSS | 差距 |
|---|---|---|---|
| AI Memory (跨数据库) | 完整 | 未实现 | AI 不记得历史对话 |
| App Builder 版本回滚 | 完整 | 未实现 | 不能 revert 坏的 AI 部署 |
| App Builder Auto-fix | 完整 | 未实现 | 自定义代码错误没 AI 自动修 |
| AI 对话 Artifact | 完整 | 未实现 | AI 生成的图表/报告不保存 |
| AI 对话 @-node 选择 | 完整 | 未实现 | AI 不能 reference 表格/视图 |
| AI 队列管理 | 完整 | 未实现 | 不能并发多个对话任务 |

### 🟢 P2 - 已有能力但深度不足

| 特性 | Cloud | OSS | 差距 |
|---|---|---|---|
| AI 字段生成 | 流式+多模型 | 流式 1 端点 | 模型选择单一 |
| AI 脚本生成 | 多 provider | sandbox-agent 1 provider | provider 切换 |
| AI 信用额度 | 完整 UI | R40 计划中 | 实现度 |
| AI 成本预测 | 完整 | 2 端点 | 维度较少 |

---

## 九、推荐后续实施优先级(基于真实差距)

### 立即做(P0,1 周内)

1. **R-AI-1: AI 对话完整化** (~2 天)
   - 多模型选择 (per-conversation)
   - 对话记忆 (跨 message context)
   - Artifact 系统 (图表/报告持久化)
   - 队列管理 (并行任务调度)
   - 新增端点 10+

2. **R-AI-2: 自定义 AI 模型** (~1 天)
   - `custom_ai_model` 能力注册
   - `ai_custom_model` HTTP CRUD (list/create/update/delete/test)
   - 多 provider 支持 (OpenAI/Anthropic/OAI-compatible)

3. **R-AI-3: AI Admin 设置** (~半天)
   - `ai_setting` HTTP CRUD
   - 启用/禁用 AI
   - 默认模型配置

### 中期做(P1,2 周内)

4. **R-AI-4: App Builder 部署系统** (~1 天)
   - 部署端点
   - 版本历史 + 回滚
   - Auto-fix 路径

5. **R-AI-5: AI 字段扩展** (~半天)
   - 多模型选择
   - 生成策略(prompt template)

### 调整后续 R33-R40 计划

由于 P0 AI 差距比 R33-R40 任何一个都大,建议:

| 原计划 | 调整后 |
|---|---|
| R33 dr-canvas | R-AI-1 AI 对话完整化(优先级最高) |
| R34 compliance | R-AI-2 自定义 AI 模型 |
| R35 billing | R-AI-3 AI Admin 设置 |
| R36 byok | R-AI-4 App Builder 部署 |
| R37 sso | R33 dr-canvas |
| R38-R40 | R34-R37 + R-AI-5 |

---

## 十、关键洞察

1. **OSS 在 CRUD/治理层已经很完整**(R26-R32 修复了 80 个 service-no-controller 中的 5 个高 ROI,R33+ 会继续修),但 **AI 层差距是结构性而非表面**。

2. **1 端点 ≠ 完整功能**:Cuppy 只有 1 个 chat 端点,但 Cloud 端 AI Chat 涉及 5+ 子系统(memory/artifact/queue/skill/paralle execution),差距是数量级的。

3. **"应用构建器"是 SaaS 核心**:用户提到的 base `bseI7XJbwqqIuxlgAI1` 是用 App Builder 创建的。OSS 的 ai-builder 只有 proposal CRUD,无法实际构建/部署任何 Web 应用。

4. **BYOK (Bring Your Own Key) 是企业刚需**:所有企业客户都会问"能不能用我们自己的 OpenAI Key",Cloud 有完整 UI,OSS 完全缺失。

5. **AI 设置是私有化部署入场券**:Cloud AI 文档专门为"私有化部署"提供 AI 配置指南,但 OSS 没实现对应后端,这是销售瓶颈。

---

**结论**:OSS 当前在传统 CRUD/治理/SSO/审计层完整度 90%+,但在 AI 5 大能力层完整度仅 30-40%。要真正对齐 Cloud,**必须做 R-AI-1 到 R-AI-3**(AI 对话、自定义模型、Admin 设置),这是优先级最高的工作。
