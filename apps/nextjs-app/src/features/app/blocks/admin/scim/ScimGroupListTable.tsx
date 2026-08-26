import { useQuery } from '@tanstack/react-query';
import type { IScimListGroupsVo } from '@teable/openapi';
import { listScimGroups } from '@teable/openapi';
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

export const ScimGroupListTable = () => {
  const { t } = useTranslation('common');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'scim', 'groups'],
    queryFn: () => listScimGroups().then((r) => r.data as IScimListGroupsVo),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-1/2" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
        {t('admin.scim.groups.loadError')}
      </div>
    );
  }

  const groups = data?.groups ?? [];

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        {t('admin.scim.groups.empty')}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.scim.groups.headers.name')}</TableHead>
            <TableHead>{t('admin.scim.groups.headers.members')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.id}>
              <TableCell className="font-medium">{group.displayName}</TableCell>
              <TableCell className="text-muted-foreground">
                {(group.members ?? []).length}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
