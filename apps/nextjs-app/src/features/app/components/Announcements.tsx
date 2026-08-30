import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dismissAnnouncement, listActiveAnnouncements, type IAnnouncement } from '@teable/openapi';
import { Button } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

const toneClass: Record<IAnnouncement['level'], string> = {
  info: 'border-blue-300 bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100',
  maintenance:
    'border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100',
  critical: 'border-red-300 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100',
  resolved: 'border-green-300 bg-green-50 text-green-950 dark:bg-green-950/40 dark:text-green-100',
};

export const Announcements = () => {
  const queryClient = useQueryClient();
  const shownToasts = useRef(new Set<string>());
  const query = useQuery({
    queryKey: ['announcements', 'active'],
    queryFn: () => listActiveAnnouncements().then(({ data }) => data),
    refetchInterval: 60_000,
  });
  const dismiss = useMutation({
    mutationFn: dismissAnnouncement,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['announcements', 'active'] }),
    onError: (error: Error) => toast.error(error.message),
  });
  useEffect(() => {
    for (const announcement of query.data ?? []) {
      if (announcement.form === 'toast' && !shownToasts.current.has(announcement.id)) {
        shownToasts.current.add(announcement.id);
        toast(announcement.title, { description: announcement.body });
      }
    }
  }, [query.data]);
  if (!query.data?.length) return null;
  const dismissible = (announcement: IAnnouncement) => (
    <Button size="xs" variant="ghost" onClick={() => void dismiss.mutate(announcement.id)}>
      Dismiss
    </Button>
  );
  const link = (announcement: IAnnouncement) =>
    announcement.linkUrl && (
      <Link className="underline" href={announcement.linkUrl}>
        {announcement.linkText || 'Learn more'}
      </Link>
    );
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex flex-col gap-2 p-2">
        {query.data
          .filter((announcement) => announcement.form === 'banner')
          .map((announcement) => (
            <div
              className={`mx-auto flex w-full max-w-5xl items-center justify-between gap-3 rounded border px-4 py-2 text-sm shadow ${toneClass[announcement.level]}`}
              key={announcement.id}
            >
              <div>
                <strong>{announcement.title}</strong>
                <span className="ml-2">{announcement.body}</span>
                {announcement.linkUrl && <span className="ml-2">{link(announcement)}</span>}
              </div>
              {dismissible(announcement)}
            </div>
          ))}
      </div>
      {query.data
        .filter((announcement) => announcement.form === 'modal')
        .slice(0, 1)
        .map((announcement) => (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
            key={announcement.id}
          >
            <div
              className={`w-full max-w-lg rounded-lg border p-6 shadow-xl ${toneClass[announcement.level]}`}
            >
              <h2 className="text-lg font-semibold">{announcement.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{announcement.body}</p>
              <div className="mt-4 flex items-center justify-end gap-2">
                {link(announcement)}
                {dismissible(announcement)}
              </div>
            </div>
          </div>
        ))}
      {query.data
        .filter((announcement) => announcement.form === 'sidebar-card')
        .map((announcement) => (
          <div
            className={`fixed bottom-4 right-4 z-40 w-80 rounded-lg border p-4 shadow-lg ${toneClass[announcement.level]}`}
            key={announcement.id}
          >
            <h2 className="font-semibold">{announcement.title}</h2>
            <p className="mt-1 text-sm">{announcement.body}</p>
            <div className="mt-3 flex items-center justify-between text-sm">
              {link(announcement)}
              {dismissible(announcement)}
            </div>
          </div>
        ))}
    </>
  );
};
