const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');

// Mirror v2 createDb exactly
const pool = new Pool({
  application_name: 'teable',
  connectionString: 'postgresql://teable:teable@127.0.0.1:42342/teable',
  max: 5,
});

const baseDb = new Kysely({ dialect: new PostgresDialect({ pool }) });
const metaDb = baseDb.withSchema('meta');

(async () => {
  try {
    console.log('1. Test metaDb withSchema...');
    const r = await sql`SELECT current_schema() as s`.execute(metaDb);
    console.log('  current_schema:', r.rows);
    
    console.log('2. Test createTable in metaDb...');
    await metaDb.schema
      .createTable('test_withschema')
      .ifNotExists()
      .addColumn('id', 'text', c => c.primaryKey())
      .execute();
    console.log('  OK in meta');
    
    console.log('3. Verify location...');
    const r2 = await sql`SELECT table_schema, table_name FROM information_schema.tables WHERE table_name='test_withschema'`.execute(baseDb);
    console.log('  rows:', r2.rows);
    
    await sql`DROP TABLE IF EXISTS meta.test_withschema`.execute(metaDb);
    console.log('  Dropped');
  } catch (e) {
    console.error('FAIL:', e.message, 'code=', e.code);
  } finally {
    await baseDb.destroy();
  }
})();
