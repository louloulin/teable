const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');

const pool = new Pool({
  application_name: 'teable',
  connectionString: 'postgresql://teable:teable@127.0.0.1:42342/teable',
  max: 5,
});

const baseDb = new Kysely({ dialect: new PostgresDialect({ pool }) });
const metaDb = baseDb.withSchema('meta');

// Drop ALL table_query_* tables first
(async () => {
  try {
    console.log('Drop all table_query_* from public and meta...');
    await sql`DROP TABLE IF EXISTS public.table_query_observation_window CASCADE`.execute(baseDb);
    await sql`DROP TABLE IF EXISTS meta.table_query_observation_window CASCADE`.execute(baseDb);
    await sql`DROP TABLE IF EXISTS public.table_query_recommendation CASCADE`.execute(baseDb);
    await sql`DROP TABLE IF EXISTS meta.table_query_recommendation CASCADE`.execute(baseDb);
    await sql`DROP TABLE IF EXISTS public.table_query_remediation_task CASCADE`.execute(baseDb);
    await sql`DROP TABLE IF EXISTS meta.table_query_remediation_task CASCADE`.execute(baseDb);
    await sql`DROP TABLE IF EXISTS public.table_query_ops_lease CASCADE`.execute(baseDb);
    await sql`DROP TABLE IF EXISTS meta.table_query_ops_lease CASCADE`.execute(baseDb);
    await sql`DROP TABLE IF EXISTS public.table_query_search_vector_config CASCADE`.execute(baseDb);
    await sql`DROP TABLE IF EXISTS meta.table_query_search_vector_config CASCADE`.execute(baseDb);
    console.log('  Dropped');
    
    const adapterDist = require.resolve('/Users/louloulin/appx/teable/packages/v2/adapter-table-query-ops-postgres/dist/index.cjs');
    delete require.cache[adapterDist];
    const adapter = require(adapterDist);
    
    console.log('Call ensureTableQueryOpsSchema with metaDb (withSchema meta)...');
    await adapter.ensureTableQueryOpsSchema(metaDb);
    console.log('SUCCESS!');
  } catch (e) {
    console.error('FAIL:', e.message, 'code=', e.code);
  } finally {
    await baseDb.destroy();
  }
})();
