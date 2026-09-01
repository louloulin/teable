const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');

// Simulate the pg-pool-registry normalization
const normalizePoolConfig = (connectionString, options = {}) => {
  const url = new URL(connectionString);
  const prismaOnlySearchParams = ['connection_limit', 'pgbouncer', 'pool_timeout', 'schema', 'statement_cache_size'];
  for (const p of prismaOnlySearchParams) {
    url.searchParams.delete(p);
  }
  return url.toString();
};

// This is what the v2 container passes via dataDbDependencies: { pool: dataPoolLease.pool }
const normalizedConn = normalizePoolConfig('postgresql://teable:teable@127.0.0.1:42342/teable?schema=public&statement_cache_size=1');
console.log('Normalized:', normalizedConn);

const pool = new Pool({
  application_name: 'teable',
  connectionString: normalizedConn,
  max: 5,
});

// But how does Kysely use this pool?
// Per Kysely docs, PostgresDialect accepts pool config or pool instance
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: pool,  // <-- pool passed WITHOUT schema config
  }),
});

(async () => {
  try {
    console.log('Test 1: simple query');
    await sql`SELECT 1`.execute(db);
    console.log('  OK');
    
    console.log('Test 2: check search_path');
    const r = await sql`SHOW search_path`.execute(db);
    console.log('  search_path:', r.rows);
    
    console.log('Test 3: check table exists');
    const r2 = await sql`SELECT to_regclass('public.table_query_observation_window') as t`.execute(db);
    console.log('  regclass:', r2.rows);
    
    console.log('Test 4: Kysely createTable ifNotExists');
    await db.schema
      .createTable('test_v2_pool')
      .ifNotExists()
      .addColumn('id', 'text', c => c.primaryKey())
      .execute();
    console.log('  OK');
    await sql`DROP TABLE test_v2_pool`.execute(db);
  } catch (e) {
    console.error('FAIL:', e.message, 'code=', e.code);
  } finally {
    await db.destroy();
  }
})();
