/**
 * V51 — Artifact Viewer for Cloud §ai/ai-chat 'Artifact' feature.
 *
 * Lightweight viewer that consumes the V50 backend endpoints:
 *   GET    /api/chat/sessions/:sessionId/artifacts
 *   GET    /api/chat/artifacts/:artifactId
 *   PUT    /api/chat/artifacts/:artifactId
 *   DELETE /api/chat/artifacts/:artifactId
 *
 * Renderers (pure browser, no extra deps):
 *   - 'markdown'  → <pre> with monospaced text
 *   - 'table'     → parse markdown table → <table>
 *   - 'mermaid'   → render via dynamic mermaid import (if available)
 *   - 'html'      → <iframe sandbox> with srcdoc
 *   - 'chart'     → <pre> JSON passthrough
 *
 * Designed to be drop-in compatible with the existing ChatPanel.
 * License: AGPL-3.0
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronDownIcon, Download, Eye, Loader2, RefreshCcw, Trash2, X } from 'lucide-react';
import { axios } from '@teable/openapi';
import { Button } from '@teable/ui-lib';

export interface IV51Artifact {
  id: string;
  sessionId: string;
  messageId: string | null;
  format: 'markdown' | 'html' | 'chart' | 'table' | 'mermaid';
  title: string;
  content: string;
  version: number;
  createdTime: string;
  updatedTime: string;
}

interface IV51ArtifactViewerProps {
  sessionId: string;
  /** When true the panel renders collapsed by default. */
  defaultCollapsed?: boolean;
}

/**
 * Markdown table → <table> renderer. Tolerates leading/trailing pipes.
 */
function MarkdownTableView({ markdown }: { markdown: string }) {
  const lines = markdown
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'));
  if (lines.length < 3) {
    return <pre className="whitespace-pre-wrap text-xs">{markdown}</pre>;
  }
  const split = (line: string) => line.slice(1, -1).split('|').map((c) => c.trim());
  const headers = split(lines[0] ?? '');
  const rows = lines.slice(2).map(split);
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} className="border bg-muted/40 px-2 py-1 text-left font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className="border px-2 py-1 align-top">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Mermaid renderer — tries to dynamically import a global mermaid lib if present. */
function MermaidView({ source }: { source: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const globalScope = globalThis as unknown as { mermaid?: { render: (id: string, src: string) => Promise<{ svg: string }> } };
    if (globalScope.mermaid) {
      globalScope.mermaid
        .render(`v51-${Date.now()}`, source)
        .then((res) => {
          if (!cancelled) setSvg(res.svg);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError((e as Error).message);
        });
      return;
    }
    setError('mermaid library not loaded; showing source.');
    return () => {
      cancelled = true;
    };
  }, [source]);
  if (svg) {
    return <div className="overflow-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  if (error) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">{error}</div>
        <pre className="whitespace-pre-wrap rounded bg-muted/30 p-2 text-xs">{source}</pre>
      </div>
    );
  }
  return <Loader2 className="h-4 w-4 animate-spin" />;
}

/** Pick the right renderer for the artifact format. */
function ArtifactBody({ artifact }: { artifact: IV51Artifact }) {
  switch (artifact.format) {
    case 'table':
      return <MarkdownTableView markdown={artifact.content} />;
    case 'mermaid':
      return <MermaidView source={artifact.content} />;
    case 'html':
      return (
        <iframe
          sandbox=""
          srcDoc={artifact.content}
          title={artifact.title}
          className="h-64 w-full rounded border bg-white"
        />
      );
    case 'chart':
      return <pre className="whitespace-pre-wrap rounded bg-muted/30 p-2 text-xs">{artifact.content}</pre>;
    case 'markdown':
    default:
      return <pre className="whitespace-pre-wrap rounded bg-muted/30 p-2 text-xs">{artifact.content}</pre>;
  }
}

function formatBadge(format: IV51Artifact['format']) {
  const colors: Record<IV51Artifact['format'], string> = {
    markdown: 'bg-slate-100 text-slate-700',
    table: 'bg-emerald-100 text-emerald-700',
    mermaid: 'bg-purple-100 text-purple-700',
    html: 'bg-amber-100 text-amber-700',
    chart: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[format]}`}>
      {format}
    </span>
  );
}

export function V51ArtifactViewer({ sessionId, defaultCollapsed = false }: IV51ArtifactViewerProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [artifacts, setArtifacts] = useState<IV51Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<IV51Artifact | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<IV51Artifact[]>(`/api/chat/sessions/${sessionId}/artifacts`);
      setArtifacts(res.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleOpen = useCallback(
    async (artifact: IV51Artifact) => {
      if (openId === artifact.id) {
        setOpenId(null);
        setOpenDetail(null);
        return;
      }
      setOpenId(artifact.id);
      try {
        const res = await axios.get<IV51Artifact>(`/api/chat/artifacts/${artifact.id}`);
        setOpenDetail(res.data);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [openId]
  );

  const handleDelete = useCallback(
    async (artifact: IV51Artifact) => {
      try {
        await axios.delete(`/api/chat/artifacts/${artifact.id}`);
        setArtifacts((prev) => prev.filter((a) => a.id !== artifact.id));
        if (openId === artifact.id) {
          setOpenId(null);
          setOpenDetail(null);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [openId]
  );

  const handleDownload = useCallback((artifact: IV51Artifact) => {
    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/[^a-z0-9-]+/gi, '-')}.${artifact.format === 'mermaid' ? 'mmd' : artifact.format === 'html' ? 'html' : 'md'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div
      className="rounded-lg border bg-card text-card-foreground shadow-sm"
      data-testid={`v51-artifact-viewer-${sessionId}`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/30"
        data-testid="v51-artifact-toggle"
      >
        <span className="flex items-center gap-2">
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4 rotate-180" />}
          Artifacts
          <span className="rounded-full bg-muted px-1.5 text-xs">{artifacts.length}</span>
        </span>
        <RefreshCcw
          className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            refresh();
          }}
        />
      </button>

      {!collapsed && (
        <div className="space-y-2 px-3 pb-3 text-sm">
          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {artifacts.length === 0 && !loading && (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No artifacts yet. Ask the AI to generate a chart, table, or HTML page.
            </div>
          )}
          {artifacts.map((a) => (
            <div key={a.id} className="rounded border bg-background/50" data-testid={`v51-artifact-row-${a.id}`}>
              <div className="flex items-center justify-between gap-2 p-2">
                <button
                  type="button"
                  onClick={() => toggleOpen(a)}
                  className="flex flex-1 items-center gap-2 text-left"
                  data-testid={`v51-artifact-open-${a.id}`}
                >
                  <span className="text-xs font-medium">{a.title}</span>
                  {formatBadge(a.format)}
                  <span className="text-[10px] text-muted-foreground">v{a.version}</span>
                </button>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(a)}
                    title="Download"
                    data-testid={`v51-artifact-download-${a.id}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(a)}
                    title="Delete"
                    data-testid={`v51-artifact-delete-${a.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {openId === a.id && openDetail && (
                <div className="border-t p-2" data-testid={`v51-artifact-detail-${a.id}`}>
                  <ArtifactBody artifact={openDetail} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
