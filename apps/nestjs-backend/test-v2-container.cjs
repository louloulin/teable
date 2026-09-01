const path = require('path');
const fs = require('fs');

// Use the v2 package from source via tsx-loaded path... but since it's compiled, use dist.
const adapterDist = path.resolve(__dirname, '../../packages/v2/adapter-table-query-ops-postgres/dist/index.cjs');
const containerDist = path.resolve(__dirname, '../../packages/v2/container-node/dist/index.cjs');

console.log('Loading from:', adapterDist);

const adapter = require(adapterDist);
console.log('ensureTableQueryOpsSchema:', typeof adapter.ensureTableQueryOpsSchema);
console.log('registerV2TableOpsPostgresAdapter:', typeof adapter.registerV2TableOpsPostgresAdapter);

const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');

const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: 'postgresql://teable:teable@127.0.0.1:42342/teable?schema=public',
    }),
  }),
});

(async () => {
  try {
    console.log('Calling ensureTableQueryOpsSchema(db)...');
    await adapter.ensureTableQueryOpsSchema(db);
    console.log('SUCCESS!');
    
    const r = await sql`SELECT to_regclass('public.table_query_observation_window') as t`.execute(db);
    console.log('Verify:', r.rows);
  } catch (e) {
    console.error('FAILURE:', e.message);
    console.error('Code:', e.code);
    console.error('Stack:', e.stack?.split('\n').slice(0, 8).join('\n'));
  } finally {
    await db.destroy();
  }
})();
