/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-8 — ChatContainer wrapper
 *
 * Reads `useChatPanelStore` to decide visibility:
 *   - 'close'    → renders nothing
 *   - 'open'     → renders <ChatPanel> at side width
 *   - 'expanded' → renders <ChatPanel> at full width
 */
import { useEffect } from 'react';
import { useChatPanelStore } from '../sidebar/useChatPanelStore';
import { ChatPanel } from './ChatPanel';

export interface ChatContainerProps {
  baseId?: string;
}

export const ChatContainer = ({ baseId }: ChatContainerProps) => {
  const status = useChatPanelStore((s) => s.status);
  const panelType = useChatPanelStore((s) => s.panelType);
  const setPanelType = useChatPanelStore((s) => s.setPanelType);

  // R-AI-8: default the panel to 'general' on mount; App Builder mode is set
  // by app-builder pages explicitly.
  useEffect(() => {
    if (panelType !== 'general') setPanelType('general');
  }, [panelType, setPanelType]);

  if (status === 'close') return null;

  const widthClass =
    status === 'expanded' ? 'w-full max-w-3xl' : 'w-[360px] shrink-0';

  return (
    <aside
      data-panel-type={panelType}
      data-chat-status={status}
      className={`flex h-full ${widthClass} flex-col border-l bg-background`}
    >
      <ChatPanel baseId={baseId} />
    </aside>
  );
};
