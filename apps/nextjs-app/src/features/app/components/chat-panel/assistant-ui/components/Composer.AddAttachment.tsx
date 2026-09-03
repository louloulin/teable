/* SPDX-License-Identifier: AGPL-3.0-or-later */
import * as React from 'react';
import { ComposerPrimitive } from '@assistant-ui/react';

/**
 * The real assistant-ui attachment button. Uploading is handled by the
 * `AttachmentAdapter` registered in `ChatPanel.tsx`; this component only
 * provides a reusable local styling slot.
 */
export const ComposerAddAttachment: React.FC = () => (
  <ComposerPrimitive.AddAttachment multiple aria-label="Attach files" />
);
