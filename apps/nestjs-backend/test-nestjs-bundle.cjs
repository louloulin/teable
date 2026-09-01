// Simulate exactly what the nestjs backend does
const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');

const pool = new Pool({
  application_name: 'teable',
  connectionString: 'postgresql://teable:teable@127.0.0.1:42342/teable',
  max: 20,
});

// Use a slightly different code path - the way registerV2PostgresDataDb does it
const db = new Kysely({
  dialect: new PostgresDialect({ pool }),
});

(async () => {
  try {
    // First drop the table to simulate missing
    await sql`DROP TABLE IF EXISTS table_query_observation_window CASCADE`.execute(db);
    console.log('Dropped table (simulating missing)');
    
    // Now try to call ensureTableQueryOpsSchema (from dist bundle)
    const adapterDist = require.resolve('/Users/louloulin/appx/teable/packages/v2/adapter-table-query-ops-postgres/dist/index.cjs');
    delete require.cache[adapterDist];  // force re-load
    const adapter = require(adapterDist);
    console.log('Calling ensureTableQueryOpsSchema...');
    await adapter.ensureTableQueryOpsSchema(db);
    console.log('SUCCESS!');
  } catch (e) {
    console.error('FAIL:', e.message);
    console.error('Code:', e.code);
  } finally {
    await db.destroy();
  }
})();
