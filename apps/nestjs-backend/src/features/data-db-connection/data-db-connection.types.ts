/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Data DB connection — types (Round-INFRA-5).
 *
 * Surfaces the admin-configurable "data database" connection target
 * that an instance can read from / write to (separate from the meta
 * + main Postgres instances).
 *
 * License: AGPL-3.0
 */
export type DataDbConnectionKind = 'postgres';

export interface IDataDbConnection {
  id: string;
  provider: DataDbConnectionKind;
  displayHost: string | null;
  displayDatabase: string | null;
  internalSchema: string;
  status: string;
  schemaVersion: string | null;
  capabilities: unknown;
  lastValidatedAt: Date | null;
  lastError: string | null;
  createdBy: string;
  createdTime: Date;
  lastModifiedTime: Date | null;
}
