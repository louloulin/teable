"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScopedDataPrismaClient = void 0;
const db_main_prisma_1 = require("@teable/db-main-prisma");
const client_1 = require("./generated/client");
const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
/**
 * Creates a Prisma data client that never depends on PostgreSQL startup or
 * session-level `search_path` state. Generated queries use the adapter schema;
 * raw queries run with `SET LOCAL` inside the same transaction, which also
 * works through transaction poolers.
 */
const createScopedDataPrismaClient = (poolLease, schema) => {
    const client = new client_1.PrismaClient({ adapter: (0, db_main_prisma_1.createPrismaPgAdapter)(poolLease.pool, schema) });
    const setLocalSearchPath = `
    SELECT set_config(
      'search_path',
      format('%I, public', ${quoteLiteral(schema)}) || COALESCE((
        SELECT ', ' || quote_ident(n.nspname)
        FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = 'pg_trgm'
      ), ''),
      true
    )
  `;
    const scopedTransaction = (fn, options) => client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(setLocalSearchPath);
        return await fn(transaction);
    }, options);
    let proxy;
    let disconnected = false;
    proxy = new Proxy(client, {
        get(target, property, receiver) {
            if (property === 'txClient')
                return () => proxy;
            if (property === '$tx')
                return scopedTransaction;
            if (property === '$transaction') {
                return (input, options) => typeof input === 'function'
                    ? scopedTransaction(input, options)
                    : target.$transaction(input, options);
            }
            if (property === '$queryRawUnsafe') {
                return (query, ...values) => scopedTransaction((transaction) => transaction.$queryRawUnsafe(query, ...values));
            }
            if (property === '$executeRawUnsafe') {
                return (query, ...values) => scopedTransaction((transaction) => transaction.$executeRawUnsafe(query, ...values));
            }
            if (property === '$queryRaw') {
                return (...args) => scopedTransaction((transaction) => transaction.$queryRaw(...args));
            }
            if (property === '$executeRaw') {
                return (...args) => scopedTransaction((transaction) => transaction.$executeRaw(...args));
            }
            if (property === '$disconnect') {
                return async () => {
                    if (disconnected)
                        return;
                    disconnected = true;
                    try {
                        await target.$disconnect();
                    }
                    finally {
                        await poolLease.release();
                    }
                };
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    return proxy;
};
exports.createScopedDataPrismaClient = createScopedDataPrismaClient;
