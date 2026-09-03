/* SPDX-License-Identifier: AGPL-3.0-or-later */
import * as React from 'react';
import { AtNodePicker, type IAtNodeRef } from '../../AtNodePicker';

/**
 * `Composer.AddAtNode` — wraps the existing `AtNodePicker` so the
 * assistant-ui composer can inject @node references into the user
 * message. The picker only renders the picker toolbar; the actual
 * text-injection happens via the parent composing flow.
 */
export interface ComposerAddAtNodeProps {
  conversationId: string;
  nodes?: IAtNodeRef[];
  onChanged?: () => void;
}

export const ComposerAddAtNode: React.FC<ComposerAddAtNodeProps> = ({
  conversationId,
  nodes,
  onChanged,
}) => (
  <AtNodePicker
    conversationId={conversationId}
    nodes={nodes ?? []}
    onChanged={onChanged ?? (() => undefined)}
  />
);
