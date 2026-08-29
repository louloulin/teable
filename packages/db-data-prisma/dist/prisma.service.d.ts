import type { OnModuleInit } from '@nestjs/common';
import { type IPgPoolLease } from '@teable/db-main-prisma';
import type { ClsService } from 'nestjs-cls';
import { Prisma, PrismaClient } from './generated/client';
interface IDataTxStore {
    client?: Prisma.TransactionClient;
    timeStr?: string;
    id?: string;
    rawOpMaps?: unknown;
}
export declare class DataPrismaService extends PrismaClient<Prisma.PrismaClientOptions, 'query'> implements OnModuleInit {
    private readonly cls;
    private readonly poolLease;
    private readonly logger;
    private readonly sharedMetaDataDatabase;
    private afterTxCb?;
    private readonly defaultTxTimeout;
    private readonly defaultTxMaxWait;
    constructor(cls: ClsService<Record<'dataTx', IDataTxStore>>, poolLease: IPgPoolLease, schema?: string);
    bindAfterTransaction(fn: () => void): void;
    private getMetaTxClient;
    $tx<R = unknown>(fn: (prisma: Prisma.TransactionClient) => Promise<R>, options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: Prisma.TransactionIsolationLevel;
    }): Promise<R>;
    txClient(): Prisma.TransactionClient;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
export {};
