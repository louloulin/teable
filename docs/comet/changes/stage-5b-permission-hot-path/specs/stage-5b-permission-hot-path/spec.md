# Stage 5b — 权限矩阵热路径挂载

> 本 spec 描述归档后 Stage 5b 的完整行为。把已落地的 `PermissionInterceptor` / `PermissionGuard` / `PermissionMatrixService.mergeRecordFilters()` 真正接入 record hot path。

## 1. 能力目标

- 读路径:hidden 字段在 list 响应中为 `null`;row filter 注入 Prisma `where` 实际缩小查询。
- 写路径:hidden / readonly 字段写操作返回 403 `RESTRICTED_RESOURCE`。
- 行权限规则:set membership / 自定义 role 限定行范围。

## 2. 数据模型增量

无新增表。所有表已在 Stage 5 落地。

## 3. 运行时行为

### 3.1 读路径

- `record-open-api.controller.ts` 的 `listRecords` / `getRecord` handler 加 `@UseInterceptors(PermissionInterceptor)` + `@RequirePermissionFilter()`。
- `record-open-api.service.ts` 的 read handler 入口调 `applyPermissionFilter(req, where)`,把 `req.permission.filter`(若存在)与 `where` AND 合并。
- 响应经 `PermissionInterceptor.projectResponse()` 处理:hidden 字段 → `null`。

### 3.2 写路径

- `record-open-api.controller.ts` 的 create / update / delete handler 加 `@UseGuards(PermissionGuard)`。
- `PermissionGuard.assertActionAllowed(roles, tableId, action)` 校验操作允许。
- `PermissionGuard.assertFieldEditAllowed(req, tableId, baseId)` 校验字段允许(hidden 字段 → 403 RESTRICTED_RESOURCE)。

### 3.3 失败

- hidden 字段写 → 403 `RESTRICTED_RESOURCE`。
- 角色不允许该操作 → 403 `RESTRICTED_RESOURCE`。
- row filter 注入后命中 0 行 → 返回空 list(不报错)。

## 4. 验收项

- **AC-001** hidden 字段 list 响应为 `null`。
- **AC-002** 写 hidden 字段返回 403 `RESTRICTED_RESOURCE`。
- **AC-003** row filter 注入 where 后实际 SQL 含 `(role_filter AND user_filter)`。
- **AC-004** readonly 字段保留值,但写时 403。
- **AC-005** 单元测试:`record-open-api-permission-hot-path.spec.ts` 至少 4 个 it(),全部 pass。

## 5. 反例与边界

- 没有角色的 user → PermissionInterceptor 跳过投影(向后兼容)。
- `@RequirePermissionFilter()` 未挂 → interceptor 跳过(零破坏)。

## 6. 边界与不属于本 spec

- 权限矩阵数据模型 → Stage 5。
- 审计埋点 → Stage 6。
- ai_field / ai_app_builder 等独立能力位 → Stage 8b。