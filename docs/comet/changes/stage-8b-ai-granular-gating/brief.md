# Outcome

Stage 8b AI 细分计费: LicenseCapabilityGuard 四档独立门控, plan → cap 阶梯映射。

# Scope

| 能力 | 来源 plan | 备注 |
|---|---|---|
| ai_field | pro+ | 单字段 AI 补全 |
| ai_chat | business | AI chat 助手 |
| ai_app_builder | business | App Builder AI |
| cuppy_claw | pro+ | AI cuppy-claw |

# Acceptance

A4: free plan 调 ai_field 返回 402 LICENSE_REQUIRED; pro plan 调 cuppy_claw 返回 402; business plan 调 ai_app_builder 不返错。
