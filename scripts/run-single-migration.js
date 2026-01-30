// Run a single migration file on Neon.tech
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL || process.argv[2];
const MIGRATION_FILE = process.argv[3] || '20260201090000_add_exit_order_metadata.sql';

if (!DATABASE_URL) {
  console.error('❌ No database URL provided!');
  console.error('');
  console.error('Usage:');
  console.error('  node scripts/run-single-migration.js "postgresql://..." migration.sql');
  console.error('  or');
  console.error('  DATABASE_URL="postgresql://..." node scripts/run-single-migration.js migration.sql');
  process.exit(1);
}

const maskedUrl = DATABASE_URL.replace(/:[^:@]+@/, ':****@');

console.log('');
console.log('🚀 Running Single Migration');
console.log('===========================');
console.log('');
console.log(`📦 Database: ${maskedUrl}`);
console.log(`📄 Migration: ${MIGRATION_FILE}`);
console.log('');

async function runMigration() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!');
    console.log('');

    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', MIGRATION_FILE);
    
    console.log(`📝 Reading migration file: ${MIGRATION_FILE}`);
    const sql = readFileSync(migrationPath, 'utf-8');
    console.log('');
    console.log('SQL to execute:');
    console.log('---');
    console.log(sql);
    console.log('---');
    console.log('');

    console.log('⚡ Executing migration...');
    await client.query(sql);
    console.log('✅ Migration executed successfully!');
    console.log('');

    // Verify the changes
    console.log('🔍 Verifying changes...');
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'orders'
      AND column_name IN ('refactored_position_id', 'exit_action', 'exit_quantity')
      ORDER BY column_name;
    `);

    if (result.rows.length > 0) {
      console.log('');
      console.log('✅ New columns added to orders table:');
      result.rows.forEach(row => {
        console.log(`   - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
      });
    }

    // Check indexes
    const indexResult = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'orders'
      AND indexname = 'idx_orders_refactored_position_id';
    `);

    if (indexResult.rows.length > 0) {
      console.log('');
      console.log('✅ Index created:');
      indexResult.rows.forEach(row => {
        console.log(`   - ${row.indexname}`);
      });
    }

    console.log('');
    console.log('🎉 Migration complete!');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    if (error.message.includes('already exists')) {
      console.log('ℹ️  This migration may have already been applied.');
      console.log('   This is safe to ignore if the columns already exist.');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
