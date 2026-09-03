/**
 * V14 — AtNodePicker for Cloud §ai/ai-chat '@' feature.
 * Insert @ in the chat composer to attach table/view/app/automation/folder refs
 * to the conversation. Persisted via /api/cuppy/conversations/:id/nodes.
 *
 * License: AGPL-3.0
 */

import { AtSign, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { axios } from '@teable/openapi';
import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';

export type AtNodeKind = 'table' | 'view' | 'app' | 'automation' | 'folder';

export interface IAtNodeRef {
  nodeId: string;
  kind: AtNodeKind;
  refId: string;
  label: string;
  addedAt: string;
}

const KIND_BADGE: Record<AtNodeKind, string> = {
  table: 'bg-blue-100 text-blue-700',
  view: 'bg-emerald-100 text-emerald-700',
  app: 'bg-purple-100 text-purple-700',
  automation: 'bg-amber-100 text-amber-700',
  folder: 'bg-slate-100 text-slate-700',
};

/* ─────────── main picker panel ─────────── */
export function AtNodePicker({
  conversationId,
  nodes,
  onChanged,
  endpointBase = '/api/cuppy/conversations',
}: {
  conversationId: string;
  nodes: IAtNodeRef[];
  onChanged: () => void;
  endpointBase?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AtNodeKind>('table');
  const [refId, setRefId] = useState('');
  const [label, setLabel] = useState('');

  const add = async () => {
    if (!refId.trim()) {
      toast.error('refId required');
      return;
    }
    try {
      await axios.post(`${endpointBase}/${conversationId}/nodes`, {
        kind,
        refId: refId.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setRefId('');
      setLabel('');
      onChanged();
      toast.success(`@${kind} attached`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (nodeId: string) => {
    try {
      await axios.delete(`${endpointBase}/${conversationId}/nodes/${nodeId}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="border-b" data-testid="at-node-picker">
      <div className="flex items-center gap-2 px-3 py-2">
        <AtSign className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium">@-nodes</span>
        <Badge variant="outline" className="ml-1 text-[10px]">
          {nodes.length}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2 text-xs"
          onClick={() => setOpen(!open)}
          data-testid="at-node-toggle"
        >
          {open ? <X className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
          {open ? 'Close' : 'Attach'}
        </Button>
      </div>

      {nodes.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2" data-testid="at-node-list">
          {nodes.map((n) => (
            <div
              key={n.nodeId}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${KIND_BADGE[n.kind]}`}
              data-testid={`at-node-chip-${n.nodeId}`}
            >
              <span className="font-medium">@{n.kind}</span>
              <span className="font-mono">{n.label}</span>
              <button
                onClick={() => remove(n.nodeId)}
                className="ml-1 opacity-60 hover:opacity-100"
                title="Remove"
                data-testid={`at-node-remove-${n.nodeId}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-2 border-t bg-muted/30 px-3 py-2" data-testid="at-node-form">
          <div className="flex gap-2">
            <Select value={kind} onValueChange={(v) => setKind(v as AtNodeKind)}>
              <SelectTrigger className="h-8 w-32 text-xs" data-testid="at-node-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="table">table</SelectItem>
                <SelectItem value="view">view</SelectItem>
                <SelectItem value="app">app</SelectItem>
                <SelectItem value="automation">automation</SelectItem>
                <SelectItem value="folder">folder</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="refId"
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              className="h-8 text-xs"
              data-testid="at-node-refid"
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="display label（可选）"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-8 text-xs"
              data-testid="at-node-label"
            />
            <Button size="sm" className="h-8" onClick={add} data-testid="at-node-add">
              <AtSign className="mr-1 h-3 w-3" />
              Attach
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
