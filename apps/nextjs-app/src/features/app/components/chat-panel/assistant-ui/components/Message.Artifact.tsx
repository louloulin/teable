/* SPDX-License-Identifier: AGPL-3.0-or-later */
import * as React from 'react';
import { MessagePrimitive } from '@assistant-ui/react';

/**
 * Artifact hook point. Tool/artifact parts are rendered by
 * `MessagePrimitive.Parts`; this slot is available for future custom
 * artifact registration without replacing assistant-ui's message runtime.
 */
export const MessageArtifact: React.FC = () => (
  <MessagePrimitive.Parts />
);
