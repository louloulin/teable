/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Filter bar for the admin audit log. Local form state — only commits the
 * filter back to the parent on submit so the user can tweak several fields
 * without re-fetching on every keystroke.
 */
import type { IAuditListQuery } from '@teable/openapi';
import { Button, Input, Label } from '@teable/ui-lib/shadcn';
import { RefreshCwIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';

export interface IAuditLogFilterProps {
  value: IAuditListQuery;
  onApply: (next: IAuditListQuery) => void;
  onRefresh: () => void;
  isFetching: boolean;
}

const DEFAULT_LIMIT = 100;

export const AuditLogFilter = ({ value, onApply, onRefresh, isFetching }: IAuditLogFilterProps) => {
  const [action, setAction] = useState(value.action ?? '');
  const [resourceId, setResourceId] = useState(value.resourceId ?? '');
  const [limit, setLimit] = useState(value.limit ?? DEFAULT_LIMIT);

  const onSubmit = () => {
    onApply({
      ...(action.trim() ? { action: action.trim() } : {}),
      ...(resourceId.trim() ? { resourceId: resourceId.trim() } : {}),
      limit: Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 1000),
    });
  };

  const onReset = () => {
    setAction('');
    setResourceId('');
    setLimit(DEFAULT_LIMIT);
    onApply({ limit: DEFAULT_LIMIT });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="audit-filter-action">Action</Label>
        <Input
          id="audit-filter-action"
          value={action}
          placeholder="e.g. http_request, createRecord"
          onChange={(e) => setAction(e.target.value)}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="audit-filter-resource">Resource ID</Label>
        <Input
          id="audit-filter-resource"
          value={resourceId}
          placeholder="e.g. tblXXXX, recYYYY"
          onChange={(e) => setResourceId(e.target.value)}
        />
      </div>
      <div className="flex w-32 flex-col gap-1">
        <Label htmlFor="audit-filter-limit">Limit</Label>
        <Input
          id="audit-filter-limit"
          type="number"
          min={1}
          max={1000}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={isFetching}>
          <SearchIcon className="mr-2 size-4" />
          Apply
        </Button>
        <Button variant="outline" onClick={onRefresh} disabled={isFetching}>
          <RefreshCwIcon className={`mr-2 size-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button variant="ghost" onClick={onReset} disabled={isFetching}>
          Reset
        </Button>
      </div>
    </div>
  );
};