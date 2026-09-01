/**
 * V13 — Real Artifact renderers for Cloud §ai/ai-chat 'Artifact' feature.
 * Renders chart (SVG bar), report (markdown), card (stat), page/doc (text).
 *
 * License: AGPL-3.0
 */

import { ChevronDown, ChevronRight, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { axios } from '@teable/openapi';
import { Button } from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';

export interface IArtifactDetail {
  id: string;
  name: string;
  kind: 'chart' | 'report' | 'page' | 'card' | 'doc';
  content: string;
  versions: Array<{ version: number; content: string; createdAt: string }>;
  shared: boolean;
  createdAt: string;
}

interface IArtifactRow {
  id: string;
  name: string;
  kind: string;
  versions: number;
  createdAt: string;
  shared: boolean;
}

/* ─────────── Chart (pure SVG bar / line) ─────────── */
function ChartRenderer({ content }: { content: string }) {
  const [data, setData] = useState<{ type?: string; title?: string; data: Array<{ label: string; value: number }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.data)) throw new Error('missing data[]');
      setData(parsed);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [content]);

  if (error) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
        Chart parse error: {error}
      </div>
    );
  }
  if (!data || data.data.length === 0) {
    return <div className="text-xs text-muted-foreground">Empty chart data</div>;
  }

  const max = Math.max(...data.data.map((d) => d.value), 1);
  const W = 320, H = 160, pad = 24, barW = (W - pad * 2) / data.data.length - 6;
  const barH = (H - pad * 2);

  return (
    <div className="rounded border bg-card p-2" data-testid="artifact-chart">
      {data.title && (
        <div className="mb-1 text-xs font-medium text-foreground">{data.title}</div>
      )}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
        {data.data.map((d, i) => {
          const x = pad + i * (barW + 6);
          const h = (d.value / max) * barH;
          const y = H - pad - h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} rx={2}
                fill="hsl(217, 91%, 60%)" data-value={d.value} />
              <text x={x + barW / 2} y={H - 6} textAnchor="middle"
                fontSize="7" fill="hsl(0,0%,40%)">{d.label}</text>
              <text x={x + barW / 2} y={y - 2} textAnchor="middle"
                fontSize="7" fill="hsl(0,0%,30%)">{d.value}</text>
            </g>
          );
        })}
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad}
          stroke="hsl(0,0%,80%)" strokeWidth={0.5} />
      </svg>
    </div>
  );
}

/* ─────────── Report (markdown-ish plain text) ─────────── */
function ReportRenderer({ content }: { content: string }) {
  const renderLine = (line: string, i: number) => {
    if (line.startsWith('# ')) return <h3 key={i} className="text-sm font-semibold">{line.slice(2)}</h3>;
    if (line.startsWith('## ')) return <h4 key={i} className="text-xs font-semibold">{line.slice(3)}</h4>;
    if (line.startsWith('- ')) return <li key={i} className="ml-4 list-disc text-xs">{line.slice(2)}</li>;
    if (line.trim() === '') return <div key={i} className="h-1" />;
    return <p key={i} className="text-xs leading-relaxed">{line}</p>;
  };
  return (
    <div className="rounded border bg-card p-2 text-foreground" data-testid="artifact-report">
      {content.split('\n').map(renderLine)}
    </div>
  );
}

/* ─────────── Card (stat-style) ─────────── */
function CardRenderer({ content }: { content: string }) {
  const [data, setData] = useState<{ title?: string; value?: string; delta?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setData(JSON.parse(content));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [content]);

  if (error) return <div className="text-xs text-destructive">{error}</div>;
  if (!data) return null;

  return (
    <div className="rounded border bg-gradient-to-br from-blue-50 to-indigo-50 p-3 dark:from-blue-950/30 dark:to-indigo-950/30" data-testid="artifact-card">
      {data.title && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{data.title}</div>}
      <div className="mt-1 text-2xl font-bold">{data.value ?? '—'}</div>
      {data.delta && (
        <div className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {data.delta}
        </div>
      )}
    </div>
  );
}

/* ─────────── Page / Doc (plain text) ─────────── */
function TextRenderer({ kind, content }: { kind: string; content: string }) {
  return (
    <div className="rounded border bg-card p-2" data-testid={`artifact-${kind}`}>
      <pre className="whitespace-pre-wrap text-xs leading-relaxed">{content}</pre>
    </div>
  );
}

/* ─────────── Main: ArtifactPanel ─────────── */
export function ArtifactPanel({
  row,
  conversationId,
  onChanged,
}: {
  row: IArtifactRow;
  conversationId: string;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<IArtifactDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDetail = async () => {
    if (detail) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get<IArtifactDetail>(
        `/api/cuppy/conversations/${conversationId}/artifacts/${row.id}`
      );
      setDetail(res.data);
      setExpanded(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleShare = async () => {
    try {
      await axios.post(
        `/api/cuppy/conversations/${conversationId}/artifacts/${row.id}/share`,
        { on: !row.shared }
      );
      onChanged();
      toast.success(row.shared ? 'Unshared' : 'Shared');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async () => {
    try {
      await axios.delete(`/api/cuppy/conversations/${conversationId}/artifacts/${row.id}`);
      onChanged();
      toast.success('Deleted');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const renderer = (() => {
    if (!detail) return null;
    if (row.kind === 'chart') return <ChartRenderer content={detail.content} />;
    if (row.kind === 'report') return <ReportRenderer content={detail.content} />;
    if (row.kind === 'card') return <CardRenderer content={detail.content} />;
    return <TextRenderer kind={row.kind} content={detail.content} />;
  })();

  return (
    <div className="rounded border bg-background/50 p-2" data-testid={`artifact-row-${row.id}`}>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={loadDetail}
          className="flex flex-1 items-center gap-1 text-left"
          data-testid={`artifact-toggle-${row.id}`}
        >
          {loading ? (
            <span className="text-xs text-muted-foreground">…</span>
          ) : expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <div className="flex-1">
            <div className="text-xs font-medium">{row.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {row.kind} · v{row.versions} {row.shared && '· shared'}
            </div>
          </div>
        </button>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleShare}
            disabled={loading}
            title={row.shared ? 'Unshare' : 'Share'}
            data-testid={`artifact-share-${row.id}`}
          >
            {row.shared ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={remove}
            disabled={loading}
            title="Delete"
            data-testid={`artifact-delete-${row.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {expanded && renderer && <div className="mt-2">{renderer}</div>}
    </div>
  );
}
