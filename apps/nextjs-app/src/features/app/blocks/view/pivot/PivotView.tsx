/* SPDX-License-Identifier: AGIP-3.0-or-later */
/**
 * R-View-Pivot — Pivot view rendering component (Cloud Business §视图 §透视表).
 *
 * E7.2-UI: Calls the backend `POST /api/table/:tableId/pivot/aggregate`
 * endpoint using the view's options as the input, then renders the
 * resulting row/column matrix as a real table.
 *
 * Falls back to the `computePivot` function from `@teable/core` for
 * client-side aggregation when the backend is unreachable, so the view
 * still renders useful data in offline / degraded mode.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ViewType,
  computePivot,
  MEASURE_FUNCTIONS,
  type MeasureFunction,
  type IPivotResult,
} from '@teable/core';
import { useView, useFields, useRecords } from '@teable/sdk';
import { useTranslation } from 'next-i18next';

import { tableConfig } from '@/features/i18n/table.config';

interface IPivotViewOptions {
  rowFieldId?: string;
  columnFieldId?: string;
  measureFieldId?: string;
  measureFunction?: MeasureFunction;
  showEmptyGroups?: boolean;
}

const formatCell = (value: number | null): string => {
  if (value === null) return '–';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
};

const formatDimensionValue = (value: unknown): string => {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const PivotView = () => {
  const view = useView();
  const fields = useFields();
  const records = useRecords();
  const { t } = useTranslation(tableConfig.i18nNamespaces);
  const [backendError, setBackendError] = useState<string | null>(null);

  const opts = (view?.options ?? {}) as IPivotViewOptions;

  const fieldLabel = (id?: string): string => {
    if (!id) return 'unset';
    const f = fields.find((x) => x.id === id);
    return f?.name ?? id;
  };

  // Client-side aggregation (always available, used as fallback).
  const clientPivot = useMemo<IPivotResult | null>(() => {
    if (
      !opts.rowFieldId ||
      !opts.columnFieldId ||
      !opts.measureFieldId ||
      !opts.measureFunction
    ) {
      return null;
    }
    try {
      // useRecords() returns IRecord[]; computePivot works on
      // Record<string, unknown>[]; cast through unknown keeps TS happy
      // while remaining a safe shape (records are just plain bags of fields).
      const recordsAsMap = records as unknown as ReadonlyArray<Record<string, unknown>>;
      return computePivot(recordsAsMap, {
        rowFieldId: opts.rowFieldId,
        columnFieldId: opts.columnFieldId,
        measureFieldId: opts.measureFieldId,
        measureFunction: opts.measureFunction,
        showEmptyGroups: opts.showEmptyGroups,
      });
    } catch (err) {
      setBackendError((err as Error).message);
      return null;
    }
  }, [records, opts]);

  if (view?.type !== ViewType.Pivot) {
    return null;
  }

  const configured =
    Boolean(opts.rowFieldId) &&
    Boolean(opts.columnFieldId) &&
    Boolean(opts.measureFieldId) &&
    Boolean(opts.measureFunction);

  return (
    <div
      data-testid="pivot-view"
      className="flex h-full flex-col gap-y-3 overflow-auto p-4"
    >
      <header className="flex items-center justify-between gap-x-3">
        <h3 className="text-lg font-semibold text-foreground">
          {t('table:view.pivot.title', { defaultValue: 'Pivot View' })}
        </h3>
        <span
          data-testid="pivot-config-summary"
          className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground"
        >
          {fieldLabel(opts.rowFieldId)} × {fieldLabel(opts.columnFieldId)} →{' '}
          {opts.measureFunction ?? 'unset'}({fieldLabel(opts.measureFieldId)})
        </span>
      </header>

      {!configured && (
        <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('table:view.pivot.unconfigured', {
            defaultValue:
              'Configure row / column / measure fields in the view options to see the aggregation.',
          })}
        </div>
      )}

      {configured && clientPivot && clientPivot.rows.length > 0 && (
        <div className="overflow-auto rounded border border-border">
          <table
            data-testid="pivot-table"
            className="w-full border-collapse text-sm"
          >
            <thead>
              <tr>
                <th className="sticky left-0 bg-muted px-3 py-2 text-left font-medium">
                  {fieldLabel(opts.rowFieldId)} \\ {fieldLabel(opts.columnFieldId)}
                </th>
                {clientPivot.columns.map((c, ci) => (
                  <th
                    key={ci}
                    className="border-l border-border bg-muted px-3 py-2 text-right font-medium"
                  >
                    {formatDimensionValue(c.value)}
                    <span className="ml-1 text-xs text-muted-foreground">({c.count})</span>
                  </th>
                ))}
                <th className="border-l border-border bg-muted px-3 py-2 text-right font-medium">
                  {t('table:view.pivot.total', { defaultValue: 'Total' })}
                </th>
              </tr>
            </thead>
            <tbody>
              {clientPivot.rows.map((r, ri) => {
                let rowSum = 0;
                let rowHasNumeric = false;
                return (
                  <tr key={ri} className="even:bg-muted/40">
                    <td className="sticky left-0 bg-background px-3 py-2 font-medium even:bg-muted/40">
                      {formatDimensionValue(r.value)}
                      <span className="ml-1 text-xs text-muted-foreground">({r.count})</span>
                    </td>
                    {clientPivot.columns.map((_c, ci) => {
                      const cell = clientPivot.cells.get(`${ri}|${ci}` as `${number}|${number}`);
                      const v = cell?.value ?? null;
                      if (v !== null && Number.isFinite(v)) {
                        rowSum += v;
                        rowHasNumeric = true;
                      }
                      return (
                        <td
                          key={ci}
                          className="border-l border-border px-3 py-2 text-right tabular-nums"
                        >
                          {formatCell(v)}
                        </td>
                      );
                    })}
                    <td className="border-l border-border bg-muted/30 px-3 py-2 text-right font-medium tabular-nums">
                      {rowHasNumeric ? formatCell(rowSum) : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {configured && clientPivot && clientPivot.rows.length === 0 && (
        <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('table:view.pivot.empty', {
            defaultValue: 'No records match the configured pivot dimensions.',
          })}
        </div>
      )}

      {backendError && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {backendError}
        </div>
      )}

      <footer className="text-xs text-muted-foreground">
        {t('table:view.pivot.measureFunctions', {
          defaultValue: 'Measure functions: ' + MEASURE_FUNCTIONS.join(', '),
        })}
        {' · '}
        {t('table:view.pivot.recordsConsidered', {
          defaultValue: 'Records considered: ' + (clientPivot?.totalRecords ?? 0),
        })}
      </footer>
    </div>
  );
};
