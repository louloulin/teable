import { useQuery } from '@tanstack/react-query';
import type { IScimListUsersVo } from '@teable/openapi';
import { listScimUsers } from '@teable/openapi';
import { Skeleton } from '@teable/ui-lib/shadcn';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@teable/ui-lib/shadcn/ui/table';
import { useTranslation } from 'next-i18next';
import { Fragment } from 'react';

/**
 * Mirrors the look of the SettingPage tables — sticks to the existing
 * shadcn `Table` primitives plus a Skeleton fallback (no new deps), so it
 * reads as part of the admin panel without pulling in a data-grid lib.
 */
export const ScimUserListTable = () => {
  const { t } = useTranslation('common');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'scim', 'users'],
    queryFn: () => listScimUsers().then((r) => r.data as IScimListUsersVo),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
        {t('admin.scim.users.loadError')}
      </div>
    );
  }

  const users = data?.users ?? [];

  if (users.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        {t('admin.scim.users.empty')}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.scim.users.headers.displayName')}</TableHead>
            <TableHead>{t('admin.scim.users.headers.email')}</TableHead>
            <TableHead>{t('admin.scim.users.headers.externalId')}</TableHead>
            <TableHead>{t('admin.scim.users.headers.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <Fragment key={user.id}>
              <TableRow>
                <TableCell className="font-medium">{user.displayName ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {user.email ?? user.userName}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {user.externalId ?? user.id}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      user.active
                        ? 'inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                    }
                  >
                    {user.active ? t('admin.scim.users.active') : t('admin.scim.users.deactivated')}
                  </span>
                </TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
