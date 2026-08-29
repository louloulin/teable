import { useQuery } from '@tanstack/react-query';
import { listNotionDatabases } from '@teable/openapi';
import { Button, Input, Label, cn } from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';
import React from 'react';

interface INotionDatabaseSummary {
  id: string;
  title: string;
}

interface IDatabasePickerProps {
  spaceId: string;
  value: string | null;
  onChange: (databaseId: string) => void;
  disabled?: boolean;
  className?: string;
}

const normalizeTitle = (title: string): string => {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : 'Untitled database';
};

/**
 * Searchable picker for a Notion database. The list is fetched lazily — the
 * caller is responsible for triggering a refetch (e.g. after the connect
 * flow completes) by passing a fresh `spaceId` or remounting the picker.
 */
export const DatabasePicker = (props: IDatabasePickerProps) => {
  const { spaceId, value, onChange, disabled, className } = props;
  const { t } = useTranslation(['common', 'space']);
  const [search, setSearch] = React.useState('');

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['notion-databases', spaceId],
    queryFn: () => listNotionDatabases({ spaceId }).then(({ data }) => data.databases),
    enabled: !!spaceId && !disabled,
    staleTime: 30 * 1000,
  });

  const items = React.useMemo<INotionDatabaseSummary[]>(() => {
    if (!data) return [];
    return data
      .map((database) => ({
        id: database.id,
        title: normalizeTitle(database.title),
      }))
      .filter((database) =>
        search.trim().length === 0
          ? true
          : database.title.toLowerCase().includes(search.trim().toLowerCase())
      );
  }, [data, search]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="notion-db-search">{t('common:admin.notion.selectDatabase')}</Label>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => refetch()}
          disabled={isFetching || disabled}
        >
          {isFetching ? t('common:actions.loading') : t('common:actions.refresh')}
        </Button>
      </div>
      <Input
        id="notion-db-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('common:admin.notion.selectDatabase')}
        disabled={disabled}
      />
      <div
        role="listbox"
        aria-label={t('common:admin.notion.selectDatabase')}
        className="max-h-56 overflow-y-auto rounded-md border bg-card"
      >
        {isFetching && items.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">{t('common:actions.loading')}</div>
        )}
        {!isFetching && items.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">
            {isError
              ? t('common:admin.notion.error.tokenExpired')
              : t('common:admin.notion.selectDatabase')}
          </div>
        )}
        {items.map((database) => {
          const selected = database.id === value;
          return (
            <button
              type="button"
              key={database.id}
              role="option"
              aria-selected={selected}
              onClick={() => onChange(database.id)}
              disabled={disabled}
              className={cn(
                'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                selected && 'bg-muted font-medium'
              )}
            >
              <span className="truncate">{database.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{database.id}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
