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
    console.log('1. Simple SELECT...');
    await sql`SELECT 1`.execute(db);
    console.log('   OK');

    console.log('2. createTable ifNotExists (test)...');
    await db.schema.createTable('test_kysely_xxx').ifNotExists().addColumn('id', 'text', c => c.primaryKey()).execute();
    console.log('   OK');
    
    console.log('3. drop test...');
    await sql`DROP TABLE test_kysely_xxx`.execute(db);
    console.log('   Dropped');

    console.log('4. createTable (with full schema, IF NOT EXISTS)...');
    await db.schema
      .createTable('table_query_observation_window')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('space_id', 'text')
      .addColumn('base_id', 'text', (col) => col.notNull())
      .execute();
    console.log('   OK');

    console.log('5. verify exists...');
    const r = await sql`SELECT to_regclass('public.table_query_observation_window') as t`.execute(db);
    console.log('   regclass:', r.rows);

    console.log('6. drop to retest from scratch...');
    await sql`DROP TABLE table_query_observation_window`.execute(db);
    console.log('   Dropped');
  } catch (e) {
    console.error('FAILURE:', e.message, 'code=', e.code);
    console.error('STACK:', e.stack?.split('\n').slice(0, 5).join('\n'));
  } finally {
    await db.destroy();
  }
})();
