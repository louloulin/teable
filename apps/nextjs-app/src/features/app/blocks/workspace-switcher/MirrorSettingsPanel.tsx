import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IMirrorConfig, IRegionEndpoint } from '@teable/openapi';
import { Button, Input, Label, Switch, cn } from '@teable/ui-lib/shadcn';
import { useMemo, useState, type FC, type FormEvent } from 'react';

import {
  createMirrorConfig,
  getMirrorLogs,
  getMirrorStatus,
  listMirrorConfigs,
  mirrorQueryKeys,
  pauseMirror,
  resumeMirror,
} from './mirrorApi';
import { MirrorStatusBadge } from './MirrorStatusBadge';

/**
 * Admin panel for workspace mirror config: create/edit a base's mirror, pause
 * or resume shipping, and read the promotion-readiness snapshot plus recent
 * log records.
 *
 * Every endpoint behind this panel requires `space|update` (space admin), so
 * this component is expected to be rendered only on an admin surface — it does
 * not gate itself.
 */

/** Standby regions are entered as `region@url[:priority]`, one per line. */
const parseStandbys = (raw: string): IRegionEndpoint[] =>
  raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const at = line.indexOf('@');
      const region = at === -1 ? line : line.slice(0, at);
      const rest = at === -1 ? '' : line.slice(at + 1);
      // Split priority off the end only — a URL contains colons of its own.
      const lastColon = rest.lastIndexOf(':');
      const tailIsPriority = lastColon > -1 && /^\d+$/.test(rest.slice(lastColon + 1));
      return {
        region: region.trim(),
        url: (tailIsPriority ? rest.slice(0, lastColon) : rest).trim(),
        priority: tailIsPriority ? Number(rest.slice(lastColon + 1)) : index + 1,
      };
    });

const serializeStandbys = (standbys: ReadonlyArray<IRegionEndpoint>): string =>
  standbys.map((s) => `${s.region}@${s.url}:${s.priority}`).join('\n');

interface IFormState {
  baseId: string;
  primaryRegion: string;
  primaryUrl: string;
  standbysRaw: string;
  maxLagSeconds: string;
  batchSize: string;
  enabled: boolean;
}

const emptyForm: IFormState = {
  baseId: '',
  primaryRegion: '',
  primaryUrl: '',
  standbysRaw: '',
  maxLagSeconds: '60',
  batchSize: '100',
  enabled: true,
};

const toFormState = (config: IMirrorConfig): IFormState => ({
  baseId: config.baseId,
  primaryRegion: config.primary.region,
  primaryUrl: config.primary.url,
  standbysRaw: serializeStandbys(config.standbys),
  maxLagSeconds: String(config.maxLagSeconds),
  batchSize: String(config.batchSize),
  enabled: config.enabled,
});

const toConfig = (form: IFormState): IMirrorConfig => ({
  baseId: form.baseId.trim(),
  primary: {
    region: form.primaryRegion.trim(),
    url: form.primaryUrl.trim(),
    priority: 0,
  },
  standbys: parseStandbys(form.standbysRaw),
  // Coerce here rather than in the input handlers so a half-typed number never
  // wipes the field. The server validates the result either way.
  maxLagSeconds: Number(form.maxLagSeconds) || 0,
  batchSize: Number(form.batchSize) || 0,
  enabled: form.enabled,
});

interface IMirrorSettingsPanelProps {
  className?: string;
}

export const MirrorSettingsPanel: FC<IMirrorSettingsPanelProps> = ({ className }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<IFormState>(emptyForm);
  const [selectedBaseId, setSelectedBaseId] = useState<string>();
  const [error, setError] = useState<string>();

  const { data: configs, isLoading } = useQuery({
    queryKey: mirrorQueryKeys.configs(),
    queryFn: listMirrorConfigs,
    retry: false,
  });

  const { data: status } = useQuery({
    queryKey: mirrorQueryKeys.status(selectedBaseId ?? ''),
    queryFn: () => getMirrorStatus(selectedBaseId as string),
    enabled: Boolean(selectedBaseId),
    retry: false,
  });

  const { data: logs } = useQuery({
    queryKey: mirrorQueryKeys.logs(selectedBaseId ?? ''),
    queryFn: () => getMirrorLogs(selectedBaseId as string),
    enabled: Boolean(selectedBaseId),
    retry: false,
  });

  const invalidateAll = async (baseId?: string) => {
    await queryClient.invalidateQueries({ queryKey: mirrorQueryKeys.configs() });
    if (baseId) {
      await queryClient.invalidateQueries({ queryKey: mirrorQueryKeys.status(baseId) });
      await queryClient.invalidateQueries({ queryKey: mirrorQueryKeys.lag(baseId) });
    }
  };

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: createMirrorConfig,
    onSuccess: async (saved) => {
      setError(undefined);
      setSelectedBaseId(saved.baseId);
      await invalidateAll(saved.baseId);
    },
    onError: (err: Error) => setError(err.message),
  });

  const { mutate: togglePause, isPending: toggling } = useMutation({
    mutationFn: ({ baseId, enabled }: { baseId: string; enabled: boolean }) =>
      enabled ? resumeMirror(baseId) : pauseMirror(baseId),
    onSuccess: async (saved) => {
      setError(undefined);
      // Keep an open edit form in sync with the paused/resumed value.
      setForm((prev) => (prev.baseId === saved.baseId ? toFormState(saved) : prev));
      await invalidateAll(saved.baseId);
    },
    onError: (err: Error) => setError(err.message),
  });

  const worstLag = useMemo(() => {
    if (!status?.standbys.length) return undefined;
    return [...status.standbys].sort(
      (a, b) => b.seqLag - a.seqLag || b.secondsLag - a.secondsLag
    )[0];
  }, [status]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    save(toConfig(form));
  };

  const handleEdit = (config: IMirrorConfig) => {
    setSelectedBaseId(config.baseId);
    setForm(toFormState(config));
    setError(undefined);
  };

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Mirror configurations</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : configs?.length ? (
          <ul className="flex flex-col divide-y rounded-md border">
            {configs.map((config) => (
              <li key={config.baseId} className="flex items-center justify-between gap-2 p-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{config.baseId}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {config.primary.region} → {config.standbys.map((s) => s.region).join(', ')}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {config.baseId === selectedBaseId && <MirrorStatusBadge lag={worstLag} />}
                  <Button size="xs" variant="outline" onClick={() => handleEdit(config)}>
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant={config.enabled ? 'outline' : 'default'}
                    disabled={toggling}
                    onClick={() => togglePause({ baseId: config.baseId, enabled: !config.enabled })}
                  >
                    {config.enabled ? 'Pause' : 'Resume'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No mirror configured yet.</p>
        )}
      </section>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <h3 className="text-base font-semibold">
          {configs?.some((c) => c.baseId === form.baseId.trim()) ? 'Edit mirror' : 'Create mirror'}
        </h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mirror-baseId">Base ID</Label>
          <Input
            id="mirror-baseId"
            value={form.baseId}
            onChange={(e) => setForm({ ...form, baseId: e.target.value })}
            placeholder="bseXXXXXXXX"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="mirror-primary-region">Primary region</Label>
            <Input
              id="mirror-primary-region"
              value={form.primaryRegion}
              onChange={(e) => setForm({ ...form, primaryRegion: e.target.value })}
              placeholder="eu-central-1"
            />
          </div>
          <div className="flex flex-[2] flex-col gap-1.5">
            <Label htmlFor="mirror-primary-url">Primary URL</Label>
            <Input
              id="mirror-primary-url"
              value={form.primaryUrl}
              onChange={(e) => setForm({ ...form, primaryUrl: e.target.value })}
              placeholder="https://eu.example.com"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mirror-standbys">Standbys</Label>
          <textarea
            id="mirror-standbys"
            className="min-h-[72px] rounded-md border bg-background p-2 text-sm"
            value={form.standbysRaw}
            onChange={(e) => setForm({ ...form, standbysRaw: e.target.value })}
            placeholder={'us-east-1@https://us.example.com:1'}
          />
          <span className="text-xs text-muted-foreground">
            One per line, as <code>region@url:priority</code>. Priority defaults to line order.
          </span>
        </div>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="mirror-max-lag">Max lag (seconds)</Label>
            <Input
              id="mirror-max-lag"
              inputMode="numeric"
              value={form.maxLagSeconds}
              onChange={(e) => setForm({ ...form, maxLagSeconds: e.target.value })}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="mirror-batch-size">Batch size (1–1000)</Label>
            <Input
              id="mirror-batch-size"
              inputMode="numeric"
              value={form.batchSize}
              onChange={(e) => setForm({ ...form, batchSize: e.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="mirror-enabled"
            checked={form.enabled}
            onCheckedChange={(enabled) => setForm({ ...form, enabled })}
          />
          <Label htmlFor="mirror-enabled" className="font-normal">
            Ship batches to standbys (off = capture only)
          </Label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setForm(emptyForm);
              setError(undefined);
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      {selectedBaseId && status && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">
            Replication status
            <span
              className={cn(
                'ml-2 text-xs font-normal',
                status.safeToPromote ? 'text-green-600' : 'text-muted-foreground'
              )}
            >
              {status.safeToPromote ? 'safe to promote' : 'not safe to promote'}
            </span>
          </h3>
          <ul className="flex flex-col gap-1">
            {status.standbys.map((lag) => (
              <li key={lag.region} className="flex items-center gap-2 text-sm">
                <MirrorStatusBadge lag={lag} showRegion />
                <span className="text-muted-foreground">
                  ack {lag.lastAckSeq} / primary {lag.primarySeq}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selectedBaseId && logs && logs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">Recent log records</h3>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
            {logs.map((record) => (
              <li key={record.id} className="flex gap-2 text-muted-foreground">
                <span className="w-16 shrink-0 tabular-nums">#{record.seq}</span>
                <span className="w-32 shrink-0 truncate">{record.region}</span>
                <span className="w-32 shrink-0 truncate">{record.kind}</span>
                <span className="truncate">{record.recordedAt}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
