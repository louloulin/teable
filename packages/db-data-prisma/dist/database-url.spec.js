"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const database_url_1 = require("./database-url");
(0, vitest_1.describe)('database URL resolution', () => {
    (0, vitest_1.it)('prefers the explicit data database URL for data clients', () => {
        const env = {
            PRISMA_META_DATABASE_URL: 'postgresql://meta/teable?schema=meta',
            PRISMA_DATA_DATABASE_URL: 'postgresql://data/teable?schema=public',
        };
        (0, vitest_1.expect)((0, database_url_1.getMetaDatabaseUrl)(env)).toBe(env.PRISMA_META_DATABASE_URL);
        (0, vitest_1.expect)((0, database_url_1.getDataDatabaseUrl)(env)).toBe(env.PRISMA_DATA_DATABASE_URL);
        (0, vitest_1.expect)((0, database_url_1.isSharedMetaDataDatabase)(env)).toBe(false);
    });
    (0, vitest_1.it)('falls back to the meta URL for shared database deployments', () => {
        const env = { PRISMA_META_DATABASE_URL: 'postgresql://shared/teable?schema=meta' };
        (0, vitest_1.expect)((0, database_url_1.getDataDatabaseUrl)(env)).toBe(env.PRISMA_META_DATABASE_URL);
        (0, vitest_1.expect)((0, database_url_1.isSharedMetaDataDatabase)(env)).toBe(true);
    });
});
