/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Record undo/redo service placeholder.
 *
 * The undo/redo state is currently owned by record-open-api.service.ts
 * (in-memory stack keyed by client-generated opId). This file exists so
 * downstream barrels (`record/open-api/index.ts`) have a stable import
 * surface; full undo/redo extraction will land in a follow-up round once
 * the v2 record pipeline ships.
 */
export const RECORD_UNDO_REDO_SERVICE_PLACEHOLDER = true;
