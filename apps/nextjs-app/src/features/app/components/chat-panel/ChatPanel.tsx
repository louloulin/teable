/* SPDX-License-Identifier: AGPL-3.0-or-later */
/** R-AI-CHAT-UI — public ChatPanel barrel. */
export {
  ChatPanel,
  ChatPanel as default,
  createCuppyRuntime,
} from './assistant-ui/ChatPanel';
export { CuppyAdapter, buildCuppyAdapter } from './assistant-ui/Runtime';
export type { ChatPanelProps } from './assistant-ui/ChatPanel';
export { ChatPanelLegacy } from './ChatPanel.legacy';
