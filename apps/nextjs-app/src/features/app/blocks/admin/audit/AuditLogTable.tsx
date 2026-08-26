/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Renders the audit rows returned by `listAuditOperations`. Read-only —
 * the cell content is plain text / monospaced timestamps, no actions.
 *
 * R1-T10 adds an optional "Load more" affordance when the page is paging
 * through a cursor stream. When `onLoadMore` is provided and `hasMore`
 * is true, a button is appended at the bottom of the table.
 */
import type { IAuditListRow } from '@teable/openapi';
import { Badge, Button } from '@teable/ui-lib/shadcn';
import { formatDistanceToNow } from 'date-fns';
import { Loader2Icon } from 'lucide-react';

export interface IAuditLogTableProps {
  rows: IAuditListRow[];
  total: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

const formatTime = (iso: string): string => {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
};

export const AuditLogTable = ({
  rows,
  total,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: IAuditLogTableProps) => {
  if (rows.length === 0) {
    return (
      <div className="bg-card text-muted-foreground rounded-lg border p-6 text-center text-sm shadow-sm">
        No audit operations matched the current filter.
      </div>
    );
  }

  return (
    <div className="bg-card flex flex-col gap-2 rounded-lg border shadow-sm">
      <div className="text-muted-foreground flex items-center justify-between border-b px-4 py-2 text-sm">
        <span>
          Showing <span className="text-foreground font-medium">{rows.length}</span> of{' '}
          <span className="text-foreground font-medium">{total}</span> rows
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
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
                <td className="text-muted-foreground px-4 py-2 text-xs">
                  {formatTime(row.createdAt)}
                </td>
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
      {onLoadMore && hasMore && (
        <div className="flex justify-center border-t px-4 py-3">
          <Button variant="outline" onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
};
