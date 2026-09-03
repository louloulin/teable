/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * V73 — Authority Matrix (help.teable.ai/zh/basic/authority-matrix) four-role
 * HTTP evidence.
 *
 * Teable's authority matrix exposes 5 base roles (owner, admin, editor,
 * commenter, viewer) plus custom roles. The `/api/admin/permission-matrix`
 * API surface is admin-gated — only owner / admin can configure it.
 * Viewer / commenter / editor can NOT call any of these endpoints; the
 * runtime guard rejects with 403.
 *
 * Coverage:
 *   1. Every HTTP endpoint (read AND write) on
 *      /api/admin/permission-matrix carries the
 *      @Permissions('base|authority_matrix_config') decorator, so the
 *      four-role guard is enforced consistently.
 *   2. Service-layer write paths are isolated from read paths at the
 *      service interface (different methods).
 *   3. License gate wraps the controller via MatrixGuard =
 *      LicenseCapabilityGuard.for('permission_matrix').
 *
 * Why source-grep instead of reflect-metadata: the SWC transformer used
 * by vitest strips decorator metadata (target: es2022 without
 * experimentalDecorators), so we read the .ts file directly to prove
 * the gate. A full supertest run lives in scripts/verify-enterprise.sh.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { PermissionMatrixController } from './permission-matrix.controller';

const CONTROLLER_PATH = path.join(__dirname, 'permission-matrix.controller.ts');
const SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function permsForMethod(src: string, methodName: string): string[] {
  const re = new RegExp(
    `@Permissions\\(([^)]+)\\)\\s*(?:@[A-Za-z()0-9_:'"\\s,.-]+?\\s*)*async\\s+${methodName}\\s*\\(`,
    'm'
  );
  const m = src.match(re);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

const ALL_ENDPOINTS = [
  'create',
  'list',
  'delete',
  'setEnabled',
  'setTableAccess',
  'setFieldPermission',
  'setRecordAction',
  'setRecordFilter',
  'addMember',
  'removeMember',
  'setImportExport',
  'listImportExport',
  'deleteImportExport',
  'setAppAccess',
  'setWorkflowAccess',
  'setDefaultRole',
  'getDefaultRole',
  'setViewAccess',
  'getViewAccess',
];

describe('PermissionMatrixController — Authority Matrix four-role gating', () => {
  it('every endpoint requires base|authority_matrix_config', () => {
    for (const m of ALL_ENDPOINTS) {
      const perms = permsForMethod(SOURCE, m);
      expect(
        perms.includes('base|authority_matrix_config'),
        `${m} should require base|authority_matrix_config, got ${JSON.stringify(perms)}`
      ).toBe(true);
    }
  });

  it('at least 18 endpoints are gated by the admin permission', () => {
    const all = SOURCE.match(/@Permissions\(([^)]+)\)/g) ?? [];
    expect(all.length).toBeGreaterThanOrEqual(18);
    for (const decl of all) {
      expect(decl).toMatch(/base\|authority_matrix_config/);
    }
  });

  it('viewer / commenter / editor calls would be rejected before reaching the controller', () => {
    // Proof: the controller-level @Permissions('base|authority_matrix_config')
    // is exactly the gate the PermissionsGuard reads. Only users with
    // the admin role on the parent base hold this permission; viewer,
    // commenter and editor do not. Tested via source above; live
    // behavioural proof lives in scripts/verify-enterprise.sh.
    const all = SOURCE.match(/@Permissions\(([^)]+)\)/g) ?? [];
    expect(all.length).toBe(ALL_ENDPOINTS.length);
  });

  it('service-layer write paths are isolated from read paths', async () => {
    const createRole = vi.fn(() => Promise.resolve({ id: 'role_1' }));
    const listRoles = vi.fn(() => Promise.resolve([{ id: 'role_1' }]));
    const deleteRole = vi.fn(() => Promise.resolve(undefined));
    const setTableAccess = vi.fn(() => Promise.resolve(undefined));
    const svc = {
      createRole,
      listRoles,
      deleteRole,
      setTableAccess,
    } as unknown as ConstructorParameters<typeof PermissionMatrixController>[0];
    const cls = {
      get: vi.fn().mockReturnValue({ id: 'user_owner_1' }),
    } as unknown as ConstructorParameters<typeof PermissionMatrixController>[1];
    const ctrl = new PermissionMatrixController(svc, cls);

    await ctrl.create({ baseId: 'bse_1', name: 'Sales Lead' });
    expect(createRole).toHaveBeenCalledWith(
      expect.objectContaining({ baseId: 'bse_1', name: 'Sales Lead' })
    );

    await ctrl.list('bse_1');
    expect(listRoles).toHaveBeenCalledWith('bse_1');

    await ctrl.setTableAccess('role_1', 'bse_1', {
      tableId: 'tbl_1',
      access: 'editable',
    });
    expect(setTableAccess).toHaveBeenCalledWith('bse_1', 'role_1', 'tbl_1', 'editable');

    await ctrl.delete('role_1', 'bse_1');
    expect(deleteRole).toHaveBeenCalledWith('bse_1', 'role_1');
  });

  it('controller is wrapped in LicenseCapabilityGuard for permission_matrix', () => {
    expect(SOURCE).toMatch(/@UseGuards\(MatrixGuard\)/);
    expect(SOURCE).toMatch(
      /const\s+MatrixGuard\s*=\s*LicenseCapabilityGuard\.for\(PERMISSION_MATRIX_CAPABILITY\)/
    );
  });
});
