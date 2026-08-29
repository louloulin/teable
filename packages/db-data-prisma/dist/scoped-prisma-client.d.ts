import { type IPgPoolLease } from '@teable/db-main-prisma';
import { Prisma, PrismaClient } from './generated/client';
type ScopedTransaction = <T>(fn: (prisma: Prisma.TransactionClient) => Promise<T>, options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
}) => Promise<T>;
export type ScopedDataPrismaClient = PrismaClient & {
    txClient(): Prisma.TransactionClient;
    $tx: ScopedTransaction;
};
/**
 * Creates a Prisma data client that never depends on PostgreSQL startup or
 * session-level `search_path` state. Generated queries use the adapter schema;
 * raw queries run with `SET LOCAL` inside the same transaction, which also
 * works through transaction poolers.
 */
export declare const createScopedDataPrismaClient: (poolLease: IPgPoolLease, schema: string) => ScopedDataPrismaClient;
export {};
