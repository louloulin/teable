import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminAnnouncement,
  listAdminAnnouncements,
  withdrawAdminAnnouncement,
  type AnnouncementAudience,
  type AnnouncementForm,
  type AnnouncementLevel,
  type ICreateAnnouncement,
} from '@teable/openapi';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useState } from 'react';

const initialForm: ICreateAnnouncement = {
  form: 'banner',
  level: 'info',
  title: '',
  body: '',
  linkText: '',
  linkUrl: '',
  audience: 'everyone',
  targetIds: [],
  startsAt: new Date().toISOString().slice(0, 16),
  endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
};

export const AnnouncementsPage = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ICreateAnnouncement>(initialForm);
  const query = useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: () => listAdminAnnouncements().then(({ data }) => data),
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
  const create = useMutation({
    mutationFn: createAdminAnnouncement,
    onSuccess: () => {
      toast.success('Announcement published');
      setForm(initialForm);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const withdraw = useMutation({
    mutationFn: withdrawAdminAnnouncement,
    onSuccess: () => {
      toast.success('Announcement withdrawn');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const setValue = <K extends keyof ICreateAnnouncement>(key: K, value: ICreateAnnouncement[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    void create.mutate({
      ...form,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      targetIds: form.targetIds,
    });
  };

  return (
    <div className="flex h-screen flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Publish scheduled notices to all users or selected audiences.
        </p>
      </div>
      <section className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={form.title} onChange={(event) => setValue('title', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Form</Label>
          <Select
            value={form.form}
            onValueChange={(value) => setValue('form', value as AnnouncementForm)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="banner">Banner</SelectItem>
              <SelectItem value="toast">Toast</SelectItem>
              <SelectItem value="modal">Modal</SelectItem>
              <SelectItem value="sidebar-card">Sidebar card</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Body</Label>
          <Textarea value={form.body} onChange={(event) => setValue('body', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Level</Label>
          <Select
            value={form.level}
            onValueChange={(value) => setValue('level', value as AnnouncementLevel)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Audience</Label>
          <Select
            value={form.audience}
            onValueChange={(value) => setValue('audience', value as AnnouncementAudience)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">Everyone</SelectItem>
              <SelectItem value="spaces">Spaces</SelectItem>
              <SelectItem value="users">Users</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.audience !== 'everyone' && (
          <div className="space-y-2 md:col-span-2">
            <Label>Target IDs (comma separated)</Label>
            <Input
              value={form.targetIds.join(', ')}
              onChange={(event) =>
                setValue(
                  'targetIds',
                  event.target.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean)
                )
              }
            />
          </div>
        )}
        <div className="space-y-2">
          <Label>Starts</Label>
          <Input
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => setValue('startsAt', event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Ends</Label>
          <Input
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) => setValue('endsAt', event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Link text</Label>
          <Input
            value={form.linkText ?? ''}
            onChange={(event) => setValue('linkText', event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Link URL</Label>
          <Input
            value={form.linkUrl ?? ''}
            onChange={(event) => setValue('linkUrl', event.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="md:col-span-2">
          <Button disabled={create.isPending} onClick={submit}>
            Publish announcement
          </Button>
        </div>
      </section>
      {query.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : query.error ? (
        <div className="text-sm text-destructive">Unable to load announcements.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Title</th>
                <th className="p-3">Audience</th>
                <th className="p-3">Schedule</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(query.data ?? []).map((announcement) => (
                <tr className="border-b last:border-0" key={announcement.id}>
                  <td className="p-3">
                    <div className="font-medium">{announcement.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {announcement.form} / {announcement.level}
                    </div>
                  </td>
                  <td className="p-3">{announcement.audience}</td>
                  <td className="p-3 text-xs">
                    {new Date(announcement.startsAt).toLocaleString()} –{' '}
                    {new Date(announcement.endsAt).toLocaleString()}
                  </td>
                  <td className="p-3">{announcement.status}</td>
                  <td className="p-3">
                    {announcement.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={withdraw.isPending}
                        onClick={() => void withdraw.mutate(announcement.id)}
                      >
                        Withdraw
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
