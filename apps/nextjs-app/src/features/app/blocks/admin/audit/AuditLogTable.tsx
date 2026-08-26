/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Renders the audit rows returned by `listAuditOperations`. Read-only —
 * the cell content is plain text / monospaced timestamps, no actions.
 */
import type { IAuditListRow } from '@teable/openapi';
import { Badge } from '@teable/ui-lib/shadcn';
import { formatDistanceToNow } from 'date-fns';

export interface IAuditLogTableProps {
  rows: IAuditListRow[];
  total: number;
}

const formatTime = (iso: string): string => {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
};

export const AuditLogTable = ({ rows, total }: IAuditLogTableProps) => {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
        No audit operations matched the current filter.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-2 text-sm text-muted-foreground">
        <span>
          Showing <span className="font-medium text-foreground">{rows.length}</span> of{' '}
          <span className="font-medium text-foreground">{total}</span> rows
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Resource</th>
              <th className="px-4 py-2">Caller</th>
              <th className="px-4 py-2">Root action</th>
              <th className="px-4 py-2">Operation</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/20">
                <td className="px-4 py-2 text-xs text-muted-foreground">{formatTime(row.createdAt)}</td>
                <td className="px-4 py-2">
                  <Badge variant="secondary">{row.action}</Badge>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{row.resourceId}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.userId ?? '—'}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.rootAction ?? '—'}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.operationId ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};