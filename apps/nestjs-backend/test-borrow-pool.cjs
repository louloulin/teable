const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');

const pool = new Pool({
  application_name: 'teable',
  connectionString: 'postgresql://teable:teable@127.0.0.1:42342/teable',
  max: 5,
});

// borrowPool from createDb.ts
const borrowPool = (pool) => ({
  connect: () => pool.connect(),
  end: () => Promise.resolve(),
});

const dialectPool = borrowPool(pool);

const baseDb = new Kysely({ dialect: new PostgresDialect({ pool: dialectPool }) });
const metaDb = baseDb.withSchema('meta');

const adapterDist = require.resolve('/Users/louloulin/appx/teable/packages/v2/adapter-table-query-ops-postgres/dist/index.cjs');
delete require.cache[adapterDist];
const adapter = require(adapterDist);

(async () => {
  try {
    console.log('Call ensureTableQueryOpsSchema with metaDb (borrowPool)...');
    await adapter.ensureTableQueryOpsSchema(metaDb);
    console.log('SUCCESS');
  } catch (e) {
    console.error('FAIL:', e.message, 'code=', e.code);
  } finally {
    await baseDb.destroy();
  }
})();
