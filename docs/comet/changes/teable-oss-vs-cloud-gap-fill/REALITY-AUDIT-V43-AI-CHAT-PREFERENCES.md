# Teable OSS vs Cloud 差距分析与补齐 — V43 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat — 用户偏好持久化（Stage 43）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **接续**：V42 AI Chat Citation

## 1. 真实差距

Cloud 版 AI Chat 在用户设置里可指定「回复语言 / 长度 / 语气 / 是否添加免责声明」，
这些偏好跨会话生效。V42 之前 OSS：

- 无任何用户偏好持久化
- 每次会话都得在 system prompt 里手工塞提示
- 多语言用户被迫每次英文问英文答

→ 体验上：高频用户被迫接受模型默认风格。

## 2. 真实进度（V42 → V43）

| 维度 | V42 | V43 |
|---|---|---|
| AI Chat 单轮 / 流式 / 上下文 / Skills / Memory / Search / Export / Citation | ✅ | ✅ |
| Per-user 偏好持久化（语言/长度/语气/免责声明） | ❌ | ✅ |
| `GET /api/chat/preferences` 查询 | ❌ | ✅ |
| `PUT /api/chat/preferences` 更新 | ❌ | ✅ |
| 偏好注入 system prompt | ❌ | ✅ |

V43 实测设置 `outputLanguage=zh-CN, responseLength=concise, tone=friendly, disclaimer=true` 后：

- 助手实际回复：**中文 + 简短 + 友好 + 免责声明**
  ```
  你好！我是 MiniMax-M3，一个乐于助人的 AI 助手，随时准备为你解答问题或提供帮助。
  *（以上信息基于系统设定，准确度可能有限，仅供参考。）*
  ```
- 助手 thinking 段明确复述「Preferences: Reply in zh-CN / Concise / Friendly / Append accuracy disclaimer」

## 3. 最小改造实现

### 3.1 新增 `AiChatPreferenceService`（140 行）
- 文件：`apps/nestjs-backend/src/features/ai-chat/ai-chat-preference.service.ts`
- **零 schema 变更**：复用 `meta.setting` 现有 `aiConfig` 行，JSON 内嵌套
  `chatPreferences.{userId}` 子树
- 公开能力：
  - `get(userId)` → 读取 + 容错解析（损坏 JSON 返回空对象）
  - `update(userId, input)` → upsert 合并 + 校验
  - `render(prefs)` → 生成 `Preferences:\n  - Reply in language "…"\n  - Response length: …` 片段
- 校验：
  - `outputLanguage`: `/^[a-zA-Z\-]{2,10}$/`
  - `responseLength`: `concise | normal | detailed`
  - `tone`: `neutral | friendly | formal`
  - `disclaimer`: `boolean`
  - 默认值（auto/normal/neutral）不写入 prompt

### 3.2 `AiChatAuthService` 集成
- 注入 `AiChatPreferenceService`（`@Optional`）
- 新增 `resolvePreferences(userId)` 私有方法
- `chatTurn` / `chatTurnStreaming` 在 memory 之后调用
- `buildPrompt()` 新增 `preferences?` 段，顺序：
  `Skill → Context → Memory → Preferences → History → User`

### 3.3 控制器 + 模块
- `AiChatController` 新增 `@Get('preferences')` + `@Put('preferences')`
- `ai-chat.module.ts` 注册 `AiChatPreferenceService`
- `ai-chat/index.ts` 导出类型 `IAiChatPreferences / IAiChatPreferenceSetInput / ResponseLength / Tone`

## 4. 自动化验证

### 4.1 单元测试（72 项全部通过）
```
✓ ai-chat-context.service.spec.ts     (9 tests)
✓ ai-chat-skill.service.spec.ts       (12 tests)
✓ ai-chat-memory.service.spec.ts      (6 tests)
✓ ai-chat-search.service.spec.ts      (8 tests)
✓ ai-chat-export.service.spec.ts      (6 tests)
✓ ai-chat-citation.service.spec.ts    (9 tests)
✓ ai-chat-preference.service.spec.ts  (7 tests)        V43 ★ 新增
✓ ai-chat.auth.service.spec.ts        (15 tests)

Test Files  8 passed (8)
Tests       72 passed (72)
```

覆盖：
- get：无 setting → `{}`；JSON 解析；损坏 JSON 降级
- update：合并现有 + 校验无效值；upsert 调用
- render：默认值 → 空；混合设置 → 多行格式
- sanitize：拒绝非法 enum / regex 不匹配

### 4.2 后端构建
```
webpack 5.90.1 compiled successfully in 7055 ms
```

### 4.3 真实 MiniMax-M3 E2E

**Case A — `GET /api/chat/preferences`（初始）**
```
{}
```

**Case B — `PUT /api/chat/preferences`**
```
Request:  {"outputLanguage":"zh-CN","responseLength":"concise","tone":"friendly","disclaimer":true}
Response: {"outputLanguage":"zh-CN","responseLength":"concise","tone":"friendly","disclaimer":true}
```

**Case C — `GET /api/chat/preferences`（验证持久化）**
```
{"outputLanguage":"zh-CN","responseLength":"concise","tone":"friendly","disclaimer":true}
```

**Case D — chatTurn 应用偏好**
```
promptTokens: 85 （含 preferences 段）
Thinking 段：「Preferences:
  - Reply in zh-CN
  - Concise
  - Friendly
  - Append accuracy disclaimer」

Content:
  你好！我是 MiniMax-M3，一个乐于助人的 AI 助手，随时准备为你解答问题或提供帮助。
  *（以上信息基于系统设定，准确度可能有限，仅供参考。）*
```

## 5. 进度更新

| 模块 | V42 | V43 |
|---|---|---|
| AI Field | 99% | 99% |
| AI Chat（上下文/Skills/Memory/Search/Export/Citations/Preferences） | 90% | **93%** |
| 全局企业级能力 | 90% | **91%** |

仍不能宣称 Cloud 全量等价：
- Function calling（多轮 tool use）
- Artifact 可视化输出
- 24h 长任务
- 自定义 skill 管理
- AI Chat 应用构建器

## 6. 下一步候选（V44+）

1. **V44 — AI Chat Function Calling**：把 `RecordService.listFields / getRecords /
   updateRecord` 包装为 tool schema，让模型自主调用。
2. **V45 — AI Chat 24h Long Tasks**：超 60s 请求转 `ai_chat_task` 异步执行 + UI 轮询。
3. **V46 — AI Chat Custom Skill Manager**：admin UI 定义 skill，存 `ai_chat_skill` 表。
4. **V47 — AI Chat Artifact Generator**：自动识别需要表格/图表的回答，生成 Markdown 表 / Mermaid 图。
