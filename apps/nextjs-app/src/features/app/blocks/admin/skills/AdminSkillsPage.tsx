import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteAdminInstanceSkill,
  downloadAdminInstanceSkill,
  importAdminInstanceSkillFile,
  importAdminInstanceSkillGithub,
  listAdminInstanceSkills,
  refreshAdminInstanceSkill,
  updateAdminInstanceSkill,
} from '@teable/openapi';
import { Button, Input, Label, Skeleton, Textarea } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useState } from 'react';

export const AdminSkillsPage = () => {
  const queryClient = useQueryClient();
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [content, setContent] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'skills'],
    queryFn: () => listAdminInstanceSkills().then(({ data }) => data),
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'skills'] });
  const importGithub = useMutation({
    mutationFn: importAdminInstanceSkillGithub,
    onSuccess: () => {
      toast.success('Skill imported from GitHub');
      setSourceUrl('');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const importFile = useMutation({
    mutationFn: importAdminInstanceSkillFile,
    onSuccess: () => {
      toast.success('Skill imported');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof updateAdminInstanceSkill>[1];
    }) => updateAdminInstanceSkill(id, patch),
    onSuccess: () => {
      toast.success('Skill updated');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: deleteAdminInstanceSkill,
    onSuccess: () => {
      toast.success('Skill deleted');
      setSelectedId(undefined);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const refresh = useMutation({
    mutationFn: refreshAdminInstanceSkill,
    onSuccess: () => {
      toast.success('Skill refreshed');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const detail = useQuery({
    queryKey: ['admin', 'skills', selectedId],
    queryFn: () => getDetail(selectedId!),
    enabled: Boolean(selectedId),
  });
  if (query.isLoading) return <Skeleton className="m-8 h-48 flex-1" />;
  if (query.error)
    return (
      <div className="flex-1 p-8 text-sm text-destructive">Unable to load instance skills.</div>
    );
  return (
    <div className="flex h-screen flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Skills</h1>
        <p className="text-sm text-muted-foreground">
          Publish skills for every AI agent in this instance.
        </p>
      </div>
      <section className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="skill-source-url">GitHub skill URL</Label>
          <Input
            id="skill-source-url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://github.com/owner/repo/tree/main/skills/example"
          />
        </div>
        <Button
          disabled={!sourceUrl.trim() || importGithub.isPending}
          onClick={() => void importGithub.mutate(sourceUrl.trim())}
        >
          Import GitHub
        </Button>
        <Label className="cursor-pointer">
          <span className="inline-flex h-9 items-center rounded-md border px-4 text-sm">
            Upload ZIP / .skill
          </span>
          <input
            className="sr-only"
            type="file"
            accept=".zip,.skill"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile.mutate(file);
              event.currentTarget.value = '';
            }}
          />
        </Label>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Published skills ({query.data?.length ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Source</th>
                <th className="p-3">Enabled</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((skill) => (
                <tr className="border-b last:border-0" key={skill.id}>
                  <td className="p-3">
                    <button
                      className="text-left font-medium underline-offset-4 hover:underline"
                      onClick={() => {
                        setSelectedId(skill.id);
                        setContent('');
                      }}
                    >
                      {skill.name}
                      <div className="text-xs font-normal text-muted-foreground">
                        {skill.description}
                      </div>
                    </button>
                  </td>
                  <td className="p-3">{skill.source}</td>
                  <td className="p-3">{skill.enabled ? 'Enabled' : 'Disabled'}</td>
                  <td className="flex flex-wrap gap-2 p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void update.mutate({ id: skill.id, patch: { enabled: !skill.enabled } })
                      }
                    >
                      {skill.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    {skill.source === 'github' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void refresh.mutate(skill.id)}
                      >
                        Refresh
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(downloadAdminInstanceSkill(skill.id), '_blank')}
                    >
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (window.confirm(`Delete ${skill.name}?`)) void remove.mutate(skill.id);
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selectedId && detail.data && (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-lg font-medium">Edit skill</h2>
          <Textarea
            value={content || detail.data.content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-80 font-mono text-xs"
          />
          <Button
            disabled={!content.trim() || update.isPending}
            onClick={() => void update.mutate({ id: selectedId, patch: { content } })}
          >
            Save content
          </Button>
        </section>
      )}
    </div>
  );
};

const getDetail = async (id: string) =>
  (await import('@teable/openapi')).getAdminInstanceSkill(id).then(({ data }) => data);
