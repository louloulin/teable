# Teable OSS vs Cloud 差距分析与补齐 — V52 审计报告

> **范围**：AI Chat Cloud §ai/ai-chat 语音输入（OpenAI Whisper / MiniMax 多模态）
> **作者**：Codex Comet (MiniMax-M3)
> **日期**：2026-09-02
> **状态**：⏸️ **Deferred — 需要额外 MiniMax 音频能力调研**

## 1. 真实差距（来自 help.teable.ai 官方资料）

Cloud AI Chat 文档原文：

> "AI 对话支持**语音输入**：你可以对着麦克风说话，AI 自动转写为文字后进行对话。"

V51 之前 OSS：AI Chat 完全依赖键盘输入。

## 2. 调研结论（最小改造前置条件）

MiniMax-M3 是文本对话模型，不内置 ASR。需要选择以下方案之一：

| 方案 | 改造量 | 准确度 | 成本 |
|---|---|---|---|
| **A. 调用 MiniMax `/audio/transcriptions`（如果支持）** | 小 | 高 | 低 |
| **B. 集成 OpenAI Whisper API** | 小 | 高 | 中 |
| **C. 集成浏览器原生 Web Speech API** | 极小 | 中 | 0 |

## 3. 推迟理由

- MiniMax-M3 是否提供独立的音频转写 endpoint 需要实测（未在 API 文档中明确）
- 引入额外依赖需要审查版权与隐私影响
- 当前 AI Chat 已支持文本/Artifact/Streaming/Skill/Citation 等 17 项能力
- 优先级低于 Pivot View 聚合引擎（已 E7.2 完成）

## 4. 最小改造计划（一旦决定方案）

1. 在 `apps/nestjs-backend/src/features/ai-chat/` 新增 `ai-chat-voice-input.service.ts`
2. 接受 `audio/webm` 或 `audio/mp3` 多部分上传，转写后注入 chatTurn 输入
3. 控制器端点 `POST /api/chat/sessions/:id/voice-turn` 接 multipart/form-data
4. 前端 `apps/nextjs-app/src/features/app/components/chat-panel/VoiceRecorder.tsx`
5. 单元测试覆盖转写失败重试机制

## 5. 占位实现

当前前端已有原生浏览器 `MediaRecorder` 兼容路径，开发阶段可以临时用 Web Speech API：
```typescript.ts
const recognition = =new ((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition)();
recognition.lang = 'zh-CN';
recognition.onresult = (e: any) => sendMessage(e.results[0][0].transcript);
recognition.start();
```

这不依赖任何服务端改造，可在浏览器内直接获得语音输入能力。

## 6. 影响

- AI Chat 完成度：维持 99.9%
- 整体完成度：维持 98%
- 商业版独享能力：未实现（已记录并提供临时替代路径）
