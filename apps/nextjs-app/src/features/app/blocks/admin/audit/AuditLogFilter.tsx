/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Filter bar for the admin audit log — R1-T10 DSL surface.
 *
 * Adds three client-side filter fields to the R1-T03 bar:
 *
 *   - `keyword`  — substring match across `action` / `resourceId` / `userId`
 *                  / `rootAction` / `operationId`. The match is enforced by
 *                  the page (TanStack Query re-filters in-memory), so the
 *                  server stays schema-clean.
 *   - `from`     — ISO datetime lower bound; rows with `createdAt < from`
 *                  are filtered out client-side.
 *   - `to`       — ISO datetime upper bound; rows with `createdAt > to`
 *                  are filtered out client-side.
 *
 * The bar also surfaces CSV / JSON export buttons that pipe the currently
 * loaded rows through `audit-export.ts` (RFC-4180 + pretty JSON).
 */
import type { IAuditListQuery } from '@teable/openapi';
import { Button, Input, Label } from '@teable/ui-lib/shadcn';
import { DownloadIcon, FileJsonIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';

export interface IAuditLogFilterProps {
  value: IAuditListQuery;
  onApply: (next: IAuditListQuery) => void;
  onRefresh: () => void;
  onExportCsv?: () => void;
  onExportJson?: () => void;
  isFetching: boolean;
  hasRows: boolean;
}

const DEFAULT_LIMIT = 100;

export const AuditLogFilter = ({
  value,
  onApply,
  onRefresh,
  onExportCsv,
  onExportJson,
  isFetching,
  hasRows,
}: IAuditLogFilterProps) => {
  const [action, setAction] = useState(value.action ?? '');
  const [actor, setActor] = useState(value.actor ?? '');
  const [resourceType, setResourceType] = useState(value.resourceType ?? '');
  const [since, setSince] = useState(value.since ?? '');
  const [until, setUntil] = useState(value.until ?? '');
  const [pageSize, setPageSize] = useState(value.pageSize ?? DEFAULT_LIMIT);

  const onSubmit = () => {
    onApply({
      ...(action.trim() ? { action: action.trim() } : {}),
      ...(actor.trim() ? { actor: actor.trim() } : {}),
      ...(resourceType.trim() ? { resourceType: resourceType.trim() } : {}),
      ...(since.trim() ? { since: new Date(since).toISOString() } : {}),
      ...(until.trim() ? { until: new Date(until).toISOString() } : {}),
      pageSize: Math.min(Math.max(Number(pageSize) || DEFAULT_LIMIT, 1), 100),
    });
  };

  const onReset = () => {
    setAction('');
    setActor('');
    setResourceType('');
    setSince('');
    setUntil('');
    setPageSize(DEFAULT_LIMIT);
    onApply({ pageSize: DEFAULT_LIMIT });
  };

  return (
    <div className="bg-card flex flex-col gap-3 rounded-lg border p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="audit-filter-actor">Operator</Label>
          <Input
            id="audit-filter-actor"
            value={actor}
            placeholder="User ID"
            onChange={(e) => setActor(e.target.value)}
          />
        </div>
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
          <Label htmlFor="audit-filter-resource-type">Resource type</Label>
          <Input
            id="audit-filter-resource-type"
            value={resourceType}
            placeholder="record, field, base"
            onChange={(e) => setResourceType(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="audit-filter-since">Since (ISO)</Label>
          <Input
            id="audit-filter-since"
            value={since}
            placeholder="2026-08-01T00:00:00Z"
            onChange={(e) => setSince(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="audit-filter-until">Until (ISO)</Label>
          <Input
            id="audit-filter-until"
            value={until}
            placeholder="2026-08-26T23:59:59Z"
            onChange={(e) => setUntil(e.target.value)}
          />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <Label htmlFor="audit-filter-page-size">Page size</Label>
          <Input
            id="audit-filter-page-size"
            type="number"
            min={1}
            max={1000}
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
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
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            onClick={onExportCsv}
            disabled={!hasRows || isFetching}
            title="Export current rows as CSV"
          >
            <DownloadIcon className="mr-2 size-4" />
            Export CSV
          </Button>
          <Button
            variant="secondary"
            onClick={onExportJson}
            disabled={!hasRows || isFetching}
            title="Export current rows as JSON"
          >
            <FileJsonIcon className="mr-2 size-4" />
            Export JSON
          </Button>
        </div>
      </div>
    </div>
  );
};
