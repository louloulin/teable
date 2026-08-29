import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import {
  getDatabaseUrl,
  type IPgPoolLease,
  PgPoolRegistry,
  PrismaModule,
} from '@teable/db-main-prisma';
import createKnex from 'knex';
import type { Knex } from 'knex';
import type { PoolClient } from 'pg';
export const META_KNEX = 'META_KNEX';
export const DATA_KNEX = 'DATA_KNEX';
export const CUSTOM_KNEX = 'CUSTOM_KNEX';

const getDatabaseSchema = (databaseUrl: string): string | undefined =>
  new URL(databaseUrl).searchParams.get('schema') ?? undefined;

const quoteIdentifier = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

export const createRegistryBackedKnex = (poolLease: IPgPoolLease, schema?: string): Knex => {
  const knex = createKnex({ client: 'postgresql', useNullAsDefault: true });
  knex.client.acquireConnection = async () => {
    const connection = await poolLease.pool.connect();
    if (schema) {
      await connection.query(`SET search_path TO ${quoteIdentifier(schema)}, public`);
    }
    return connection;
  };
  knex.client.releaseConnection = async (connection: PoolClient) => connection.release();
  return knex;
};

@Module({})
export class KnexModule {
  static register(): DynamicModule {
    return {
      module: KnexModule,
      imports: [PrismaModule],
      providers: [
        {
          provide: META_KNEX,
          useFactory: (poolRegistry: PgPoolRegistry) =>
            createRegistryBackedKnex(
              poolRegistry.acquire(getDatabaseUrl('meta')),
              getDatabaseSchema(getDatabaseUrl('meta'))
            ),
          inject: [PgPoolRegistry],
        },
        {
          provide: DATA_KNEX,
          useExisting: META_KNEX,
        },
        {
          provide: CUSTOM_KNEX,
          useExisting: META_KNEX,
        },
      ],
      exports: [META_KNEX, DATA_KNEX, CUSTOM_KNEX],
    };
  }
}
