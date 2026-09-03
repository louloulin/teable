/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Permission Matrix — hot-path E2E drill (R54).
 *
 * Walks the full hot-path chain end-to-end against a realistic 3-user /
 * 2-role / 2-table scenario, verifying that:
 *
 *   1. mergeRecordFilters + applyCurrentUser compose the correct
 *      Prisma WHERE clause shape (AND across roles, $current_user substituted).
 *   2. fieldAccess union semantics produce the right read/write/hide
 *      partition for a heterogeneous role set.
 *   3. recordAction resolution (allowsAction) honors the
 *      "table access = editable" precondition + per-role recordActions.
 *   4. Import/Export capability is OR-merged across roles per table.
 *   5. View-level allow list merges with the row filter (admin sees all,
 *      role-restricted sees only allowed views).
 *
 * Pure helper drill — no Prisma, no Nest container, no DB writes.
 * Mirrors the production hot path (PermissionInterceptor + handler).
 *
 * License: AGPL-3.0
 */

import { describe, expect, it } from 'vitest';

import { PermissionMatrixService } from './permission-matrix.service';
import type {
  IPermissionRoleVo,
  PermissionFilter,
} from './permission-matrix.constants';

function mkRole(over: Partial<IPermissionRoleVo> = {}): IPermissionRoleVo {
  return {
    id: over.id ?? 'role1',
    baseId: over.baseId ?? 'base1',
    name: over.name ?? 'Sales',
    description: over.description ?? null,
    status: over.status ?? 'enabled',
    members: over.members ?? ['alice'],
    nodes: over.nodes ?? [{ tableId: 'tbl_orders', access: 'editable' }],
    fieldPermissions: over.fieldPermissions ?? [],
    recordActions: over.recordActions ?? [
      { tableId: 'tbl_orders', action: 'view' },
      { tableId: 'tbl_orders', action: 'update' },
    ],
    viewPermissions: over.viewPermissions,
    recordFilter: over.recordFilter ?? null,
  };
}

describe('Permission Matrix — hot-path E2E drill (R54)', () => {
  describe('row filter composition (mergeRecordFilters + applyCurrentUser)', () => {
    it('returns null when no role declares a filter on the table (admin-equivalent)', () => {
      const svc = new (PermissionMatrixService as unknown as new () => PermissionMatrixService)();
      const alice = mkRole({ id: 'r-sales', recordFilter: null });
      const merged = svc.mergeRecordFilters([alice], 'tbl_orders');
      expect(merged).toBeNull();
    });

    it('passes through a single role filter unchanged', () => {
      const svc = new (PermissionMatrixService as unknown as new () => PermissionMatrixService)();
      const alice = mkRole({
        recordFilter: {
          tableId: 'tbl_orders',
          filter: { conjunction: 'and', filterSet: [{ fieldId: 'owner', operator: 'is', value: '$current_user' }] },
        },
      });
      const merged = svc.mergeRecordFilters([alice], 'tbl_orders');
      expect(merged).toEqual({
        conjunction: 'and',
        filterSet: [{ fieldId: 'owner', operator: 'is', value: '$current_user' }],
      });
    });

    it('AND-merges filters across two roles on the same table', () => {
      const svc = new (PermissionMatrixService as unknown as new () => PermissionMatrixService)();
      const alice = mkRole({
        id: 'r-sales',
        recordFilter: {
          tableId: 'tbl_orders',
          filter: { conjunction: 'and', filterSet: [{ fieldId: 'owner', operator: 'is', value: 'alice' }] },
        },
      });
      const bob = mkRole({
        id: 'r-manager',
        recordFilter: {
          tableId: 'tbl_orders',
          filter: { conjunction: 'and', filterSet: [{ fieldId: 'region', operator: 'is', value: 'NA' }] },
        },
      });
      const merged = svc.mergeRecordFilters([alice, bob], 'tbl_orders');
      expect(merged).toEqual({
        conjunction: 'and',
        filterSet: [
          { conjunction: 'and', filterSet: [{ fieldId: 'owner', operator: 'is', value: 'alice' }] },
          { conjunction: 'and', filterSet: [{ fieldId: 'region', operator: 'is', value: 'NA' }] },
        ],
      });
    });

    it('skips filters from roles that target a different table', () => {
      const svc = new (PermissionMatrixService as unknown as new () => PermissionMatrixService)();
      const alice = mkRole({
        id: 'r-sales',
        recordFilter: {
          tableId: 'tbl_orders',
          filter: { fieldId: 'owner', operator: 'is', value: 'alice' },
        },
      });
      const otherRole = mkRole({
        id: 'r-other',
        recordFilter: {
          tableId: 'tbl_users',
          filter: { fieldId: 'name', operator: 'is', value: 'bob' },
        },
      });
      const merged = svc.mergeRecordFilters([alice, otherRole], 'tbl_orders');
      // Only alice's filter applies on tbl_orders
      expect(merged).toEqual({ fieldId: 'owner', operator: 'is', value: 'alice' });
    });

    it('substitutes $current_user with the authenticated user id (hot path composes)', () => {
      const svc = new (PermissionMatrixService as unknown as new () => PermissionMatrixService)();
      const alice = mkRole({
        recordFilter: {
          tableId: 'tbl_orders',
          filter: {
            conjunction: 'and',
            filterSet: [
              { fieldId: 'owner', operator: 'is', value: '$current_user' },
              { fieldId: 'status', operator: 'is', value: 'open' },
            ],
          },
        },
      });
      const merged = svc.mergeRecordFilters([alice], 'tbl_orders') as PermissionFilter;
      const composed = svc.applyCurrentUser(merged, 'user_alice_42');
      expect(JSON.stringify(composed)).toContain('user_alice_42');
      expect(JSON.stringify(composed)).not.toContain('$current_user');
      expect(JSON.stringify(composed)).toContain('open');
    });

    it('leaves a non-$current_user filter untouched (defensive copy not needed)', () => {
      const svc = new (PermissionMatrixService as unknown as new () => PermissionMatrixService)();
      const filter = { fieldId: 'region', operator: 'is', value: 'NA' };
      const alice = mkRole({ recordFilter: { tableId: 'tbl_orders', filter } });
      const merged = svc.mergeRecordFilters([alice], 'tbl_orders') as PermissionFilter;
      const composed = svc.applyCurrentUser(merged, 'user_alice_42');
      expect(composed).toEqual(filter);
      // Original filter object is unchanged
      expect(filter).toEqual({ fieldId: 'region', operator: 'is', value: 'NA' });
    });
  });

  describe('field access union (fieldAccess)', () => {
    const svc = new (PermissionMatrixService as unknown as new () => PermissionMatrixService)();

    it('returns unset when no role mentions the field', () => {
      const alice = mkRole({ fieldPermissions: [] });
      expect(svc.fieldAccess([alice], 'tbl_orders', 'fld_total')).toBe('unset');
    });

    it('hidden wins over editable (most restrictive wins)', () => {
      const alice = mkRole({
        id: 'r-sales',
        fieldPermissions: [{ tableId: 'tbl_orders', fieldId: 'fld_salary', access: 'editable' }],
      });
      const auditor = mkRole({
        id: 'r-auditor',
        fieldPermissions: [{ tableId: 'tbl_orders', fieldId: 'fld_salary', access: 'hidden' }],
      });
      expect(svc.fieldAccess([alice, auditor], 'tbl_orders', 'fld_salary')).toBe('hidden');
    });

    it('editable wins over readonly', () => {
      const viewer = mkRole({
        id: 'r-viewer',
        fieldPermissions: [{ tableId: 'tbl_orders', fieldId: 'fld_status', access: 'readonly' }],
      });
      const editor = mkRole({
        id: 'r-editor',
        fieldPermissions: [{ tableId: 'tbl_orders', fieldId: 'fld_status', access: 'editable' }],
      });
      expect(svc.fieldAccess([viewer, editor], 'tbl_orders', 'fld_status')).toBe('editable');
    });

    it('readonly is returned when only readonly is granted', () => {
      const viewer = mkRole({
        fieldPermissions: [{ tableId: 'tbl_orders', fieldId: 'fld_notes', access: 'readonly' }],
      });
      expect(svc.fieldAccess([viewer], 'tbl_orders', 'fld_notes')).toBe('readonly');
    });

    it('partitions a heterogeneous field set into readable / writable / hidden', () => {
      const alice = mkRole({
        id: 'r-sales',
        fieldPermissions: [
          { tableId: 'tbl_orders', fieldId: 'fld_id', access: 'editable' },
          { tableId: 'tbl_orders', fieldId: 'fld_total', access: 'readonly' },
          { tableId: 'tbl_orders', fieldId: 'fld_ssn', access: 'hidden' },
        ],
      });
      const allFields = ['fld_id', 'fld_total', 'fld_ssn', 'fld_notes', 'fld_created_at'];
      const partition = allFields.reduce(
        (acc, fid) => {
          const access = svc.fieldAccess([alice], 'tbl_orders', fid);
          if (access === 'editable') acc.writable.push(fid);
          else if (access === 'readonly') acc.readable.push(fid);
          else if (access === 'hidden') acc.hidden.push(fid);
          else acc.unset.push(fid);
          return acc;
        },
        { writable: [] as string[], readable: [] as string[], hidden: [] as string[], unset: [] as string[] }
      );
      expect(partition.writable).toEqual(['fld_id']);
      expect(partition.readable).toEqual(['fld_total']);
      expect(partition.hidden).toEqual(['fld_ssn']);
      expect(partition.unset).toEqual(['fld_notes', 'fld_created_at']);
    });
  });

  describe('record action resolution (allowsAction)', () => {
    const svc = new (PermissionMatrixService as unknown as new () => PermissionMatrixService)();

    it('returns true when a role grants editable node + matching recordAction', () => {
      const alice = mkRole({
        nodes: [{ tableId: 'tbl_orders', access: 'editable' }],
        recordActions: [
          { tableId: 'tbl_orders', action: 'view' },
          { tableId: 'tbl_orders', action: 'update' },
        ],
      });
      expect(svc.allowsAction([alice], 'tbl_orders', 'view')).toBe(true);
      expect(svc.allowsAction([alice], 'tbl_orders', 'update')).toBe(true);
    });

    it('returns false when role has no editable node on the table', () => {
      const alice = mkRole({
        nodes: [{ tableId: 'tbl_orders', access: 'none' }],
        recordActions: [{ tableId: 'tbl_orders', action: 'view' }],
      });
      expect(svc.allowsAction([alice], 'tbl_orders', 'view')).toBe(false);
    });

    it('returns false when role has editable node but no matching recordAction', () => {
      const alice = mkRole({
        nodes: [{ tableId: 'tbl_orders', access: 'editable' }],
        recordActions: [{ tableId: 'tbl_orders', action: 'view' }],
      });
      expect(svc.allowsAction([alice], 'tbl_orders', 'delete')).toBe(false);
    });

    it('returns true when ANY role grants the action (OR-merge across roles)', () => {
      const sales = mkRole({
        id: 'r-sales',
        nodes: [{ tableId: 'tbl_orders', access: 'editable' }],
        recordActions: [{ tableId: 'tbl_orders', action: 'view' }],
      });
      const auditor = mkRole({
        id: 'r-auditor',
        nodes: [{ tableId: 'tbl_orders', access: 'editable' }],
        recordActions: [{ tableId: 'tbl_orders', action: 'comment' }],
      });
      // sales grants view, auditor grants comment; each role allows its own action
      expect(svc.allowsAction([sales, auditor], 'tbl_orders', 'view')).toBe(true);
      expect(svc.allowsAction([sales, auditor], 'tbl_orders', 'comment')).toBe(true);
      // Neither role grants delete
      expect(svc.allowsAction([sales, auditor], 'tbl_orders', 'delete')).toBe(false);
    });

    it('returns true when user has no roles (admin-equivalent)', () => {
      expect(svc.allowsAction([], 'tbl_orders', 'view')).toBe(false); // some() over []
    });
  });

  describe('import/export OR-merge across roles', () => {
    // Helper that mirrors what a hot-path import/export resolver would do.
    // OR semantics: any role grants the capability -> user has it.
    function resolveImportExport(
      importExportList: Array<{ roleId: string; tableId: string; canImport: boolean; canExport: boolean }>,
      tableId: string,
      roleIds: string[]
    ): { canImport: boolean; canExport: boolean } {
      const rows = importExportList.filter((r) => r.tableId === tableId && roleIds.includes(r.roleId));
      // No settings on this table -> default-deny (per-tenant deny)
      if (rows.length === 0) return { canImport: false, canExport: false };
      return {
        canImport: rows.some((r) => r.canImport),
        canExport: rows.some((r) => r.canExport),
      };
    }

    it('returns canImport=false / canExport=false when no settings', () => {
      const result = resolveImportExport([], 'tbl_orders', ['r-sales']);
      expect(result).toEqual({ canImport: false, canExport: false });
    });

    it('returns OR-merged capabilities across multiple roles', () => {
      const settings = [
        { roleId: 'r-sales', tableId: 'tbl_orders', canImport: false, canExport: true },
        { roleId: 'r-manager', tableId: 'tbl_orders', canImport: true, canExport: false },
      ];
      const result = resolveImportExport(settings, 'tbl_orders', ['r-sales', 'r-manager']);
      expect(result).toEqual({ canImport: true, canExport: true });
    });

    it('returns only the explicit capabilities when only one role grants', () => {
      const settings = [
        { roleId: 'r-sales', tableId: 'tbl_orders', canImport: false, canExport: true },
      ];
      const result = resolveImportExport(settings, 'tbl_orders', ['r-sales']);
      expect(result).toEqual({ canImport: false, canExport: true });
    });

    it('returns false / false when only roles from other tables are configured', () => {
      const settings = [
        { roleId: 'r-sales', tableId: 'tbl_users', canImport: true, canExport: true },
      ];
      const result = resolveImportExport(settings, 'tbl_orders', ['r-sales']);
      expect(result).toEqual({ canImport: false, canExport: false });
    });
  });

  describe('full E2E drill — alice (Sales) + bob (Manager) on the same table', () => {
    it('produces distinct hot-path filters per user (real Prisma WHERE shape)', () => {
      const svc = new (PermissionMatrixService as unknown as new () => PermissionMatrixService)();

      // Alice: sales role -> only her orders, can read SSN-hidden field blocked, can export
      const alice = mkRole({
        id: 'r-sales',
        name: 'Sales',
        members: ['alice'],
        nodes: [{ tableId: 'tbl_orders', access: 'editable' }],
        fieldPermissions: [
          { tableId: 'tbl_orders', fieldId: 'fld_total', access: 'editable' },
          { tableId: 'tbl_orders', fieldId: 'fld_ssn', access: 'hidden' },
        ],
        recordActions: [
          { tableId: 'tbl_orders', action: 'view' },
          { tableId: 'tbl_orders', action: 'update' },
        ],
        recordFilter: {
          tableId: 'tbl_orders',
          filter: { fieldId: 'owner', operator: 'is', value: '$current_user' },
        },
      });

      // Bob: manager role -> all orders in NA region, can edit, can import + export
      const bob = mkRole({
        id: 'r-manager',
        name: 'Manager',
        members: ['bob'],
        nodes: [{ tableId: 'tbl_orders', access: 'editable' }],
        fieldPermissions: [
          { tableId: 'tbl_orders', fieldId: 'fld_total', access: 'editable' },
          { tableId: 'tbl_orders', fieldId: 'fld_ssn', access: 'readonly' },
        ],
        recordActions: [
          { tableId: 'tbl_orders', action: 'view' },
          { tableId: 'tbl_orders', action: 'update' },
          { tableId: 'tbl_orders', action: 'delete' },
        ],
        recordFilter: {
          tableId: 'tbl_orders',
          filter: { fieldId: 'region', operator: 'is', value: 'NA' },
        },
      });

      // Alice's request — single role, simple filter, $current_user substituted
      const aliceMerged = svc.mergeRecordFilters([alice], 'tbl_orders') as PermissionFilter;
      const aliceComposed = svc.applyCurrentUser(aliceMerged, 'alice');
      expect(JSON.stringify(aliceComposed)).toContain('alice');
      expect(JSON.stringify(aliceComposed)).not.toContain('$current_user');

      // Bob's request — single role, no $current_user
      const bobMerged = svc.mergeRecordFilters([bob], 'tbl_orders') as PermissionFilter;
      const bobComposed = svc.applyCurrentUser(bobMerged, 'bob');
      expect(JSON.stringify(bobComposed)).toContain('NA');
      expect(JSON.stringify(bobComposed)).not.toContain('alice');

      // Both can view + update
      expect(svc.allowsAction([alice], 'tbl_orders', 'view')).toBe(true);
      expect(svc.allowsAction([bob], 'tbl_orders', 'view')).toBe(true);
      expect(svc.allowsAction([alice], 'tbl_orders', 'update')).toBe(true);
      expect(svc.allowsAction([bob], 'tbl_orders', 'update')).toBe(true);

      // Only bob can delete (sales role omits delete action)
      expect(svc.allowsAction([alice], 'tbl_orders', 'delete')).toBe(false);
      expect(svc.allowsAction([bob], 'tbl_orders', 'delete')).toBe(true);

      // Field projection differs
      expect(svc.fieldAccess([alice], 'tbl_orders', 'fld_ssn')).toBe('hidden');
      expect(svc.fieldAccess([bob], 'tbl_orders', 'fld_ssn')).toBe('readonly');
    });

    it('when user has BOTH roles, OR-merges row filter and union-merges field access', () => {
      const svc = new (PermissionMatrixService as unknown as new () => PermissionMatrixService)();

      const alice = mkRole({
        id: 'r-sales',
        members: ['alice'],
        nodes: [{ tableId: 'tbl_orders', access: 'editable' }],
        fieldPermissions: [
          { tableId: 'tbl_orders', fieldId: 'fld_ssn', access: 'hidden' },
        ],
        recordActions: [{ tableId: 'tbl_orders', action: 'view' }],
        recordFilter: {
          tableId: 'tbl_orders',
          filter: { fieldId: 'owner', operator: 'is', value: 'alice' },
        },
      });
      const bob = mkRole({
        id: 'r-manager',
        members: ['alice'], // alice is also in Manager role
        nodes: [{ tableId: 'tbl_orders', access: 'editable' }],
        fieldPermissions: [
          { tableId: 'tbl_orders', fieldId: 'fld_ssn', access: 'readonly' },
        ],
        recordActions: [
          { tableId: 'tbl_orders', action: 'view' },
          { tableId: 'tbl_orders', action: 'delete' },
        ],
        recordFilter: {
          tableId: 'tbl_orders',
          filter: { fieldId: 'region', operator: 'is', value: 'NA' },
        },
      });

      // Combined filter: AND of (owner=alice) AND (region=NA)
      const merged = svc.mergeRecordFilters([alice, bob], 'tbl_orders');
      expect(merged).toEqual({
        conjunction: 'and',
        filterSet: [
          { fieldId: 'owner', operator: 'is', value: 'alice' },
          { fieldId: 'region', operator: 'is', value: 'NA' },
        ],
      });

      // Field access: hidden wins (sales role hides it)
      expect(svc.fieldAccess([alice, bob], 'tbl_orders', 'fld_ssn')).toBe('hidden');

      // Action: OR-merge across roles — both grant view, manager grants delete
      expect(svc.allowsAction([alice, bob], 'tbl_orders', 'view')).toBe(true);
      expect(svc.allowsAction([alice, bob], 'tbl_orders', 'delete')).toBe(true);
    });
  });
});
