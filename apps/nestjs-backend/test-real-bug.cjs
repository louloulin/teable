const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');

const pool = new Pool({
  application_name: 'teable',
  connectionString: 'postgresql://teable:teable@127.0.0.1:42342/teable',
  max: 5,
});

const baseDb = new Kysely({ dialect: new PostgresDialect({ pool }) });
const metaDb = baseDb.withSchema('meta');

const adapterDist = require.resolve('/Users/louloulin/appx/teable/packages/v2/adapter-table-query-ops-postgres/dist/index.cjs');
delete require.cache[adapterDist];
const adapter = require(adapterDist);

(async () => {
  try {
    console.log('Call ensureTableQueryOpsSchema with metaDb (withSchema meta)...');
    await adapter.ensureTableQueryOpsSchema(metaDb);
    console.log('SUCCESS!');
    
    console.log('Verify location of tables:');
    const r = await sql`SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE 'table_query%'`.execute(baseDb);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error('FAIL:', e.message);
    console.error('Code:', e.code);
    console.error('Stack:', e.stack?.split('\n').slice(0, 8).join('\n'));
  } finally {
    await baseDb.destroy();
  }
})();
