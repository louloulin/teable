import { describe, expect, it, vi } from 'vitest';
import { PermissionMatrixController } from './permission-matrix.controller';
import type { PermissionMatrixService } from './permission-matrix.service';

/**
 * V24 — Authority Matrix Cloud §应用权限 / §工作流权限 / §默认角色
 * write-side coverage. Verifies the controller delegates the correct
 * service call with the exact Cloud semantics:
 *
 *   PUT /roles/:id/app-access       body { baseId, appId, access: 'accessible' | 'none' | 'editable' }
 *   PUT /roles/:id/workflow-access body { baseId, workflowId, access: 'accessible' | 'none' | 'editable' }
 *   PUT /default-role               body { baseId, roleId: string | null }
 *   GET /default-role               query { baseId }
 *
 * Per the controller implementation, "accessible" is rewritten to "editable"
 * before persistence so the existing (nodeType, nodeId) constraint can hold
 * without a schema change.
 */
describe('PermissionMatrixController — V24 Cloud §应用权限 / §工作流权限 / §默认角色', () => {
  const build = () => {
    const svc: Pick<
      PermissionMatrixService,
      'setNodeAccess' | 'setDefaultRoleForUnassigned' | 'getDefaultRoleForUnassigned'
    > = {
      setNodeAccess: vi.fn(() => Promise.resolve(undefined)),
      setDefaultRoleForUnassigned: vi.fn().mockResolvedValue(undefined),
      getDefaultRoleForUnassigned: vi.fn().mockResolvedValue('pr_default'),
    };
    const controller = new PermissionMatrixController(svc as unknown as PermissionMatrixService);
    return { controller, svc };
  };

  it('PUT /app-access  persists accessible by mapping to editable', async () => {
    const { controller, svc } = build();
    const out = await controller.setAppAccess('role_1', {
      baseId: 'bse_1',
      appId: 'app_42',
      access: 'accessible',
    });
    expect(svc.setNodeAccess).toHaveBeenCalledWith('bse_1', 'role_1', 'app', 'app_42', 'editable');
    expect(out).toEqual({ ok: true, nodeType: 'app', access: 'accessible' });
  });

  it('PUT /app-access  none → persisted as none', async () => {
    const { controller, svc } = build();
    const out = await controller.setAppAccess('role_1', {
      baseId: 'bse_1',
      appId: 'app_42',
      access: 'none',
    });
    expect(svc.setNodeAccess).toHaveBeenCalledWith('bse_1', 'role_1', 'app', 'app_42', 'none');
    expect(out.access).toBe('none');
  });

  it('PUT /workflow-access  accessible → persisted as editable', async () => {
    const { controller, svc } = build();
    const out = await controller.setWorkflowAccess('role_1', {
      baseId: 'bse_1',
      workflowId: 'wfl_42',
      access: 'accessible',
    });
    expect(svc.setNodeAccess).toHaveBeenCalledWith(
      'bse_1',
      'role_1',
      'workflow',
      'wfl_42',
      'editable'
    );
    expect(out).toEqual({ ok: true, nodeType: 'workflow', access: 'accessible' });
  });

  it('PUT /workflow-access  none → persisted as none', async () => {
    const { controller, svc } = build();
    const out = await controller.setWorkflowAccess('role_1', {
      baseId: 'bse_1',
      workflowId: 'wfl_42',
      access: 'none',
    });
    expect(svc.setNodeAccess).toHaveBeenCalledWith(
      'bse_1',
      'role_1',
      'workflow',
      'wfl_42',
      'none'
    );
    expect(out.access).toBe('none');
  });

  it('PUT /default-role  persists roleId', async () => {
    const { controller, svc } = build();
    const out = await controller.setDefaultRole({ baseId: 'bse_1', roleId: 'role_42' });
    expect(svc.setDefaultRoleForUnassigned).toHaveBeenCalledWith('bse_1', 'role_42');
    expect(out).toEqual({ ok: true, baseId: 'bse_1', defaultRoleId: 'role_42' });
  });

  it('PUT /default-role  null roleId clears default', async () => {
    const { controller, svc } = build();
    const out = await controller.setDefaultRole({ baseId: 'bse_1', roleId: null });
    expect(svc.setDefaultRoleForUnassigned).toHaveBeenCalledWith('bse_1', null);
    expect(out.defaultRoleId).toBeNull();
  });

  it('GET /default-role  returns persisted defaultRoleId', async () => {
    const { controller, svc } = build();
    const out = await controller.getDefaultRole('bse_1');
    expect(svc.getDefaultRoleForUnassigned).toHaveBeenCalledWith('bse_1');
    expect(out).toEqual({ baseId: 'bse_1', defaultRoleId: 'pr_default' });
  });
});
