// Run all new migrations on Neon.tech
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL || process.argv[2];

if (!DATABASE_URL) {
  console.error('❌ No database URL provided!');
  console.error('');
  console.error('Usage:');
  console.error('  DATABASE_URL="postgresql://..." node scripts/run-all-new-migrations.js');
  process.exit(1);
}

const maskedUrl = DATABASE_URL.replace(/:[^:@]+@/, ':****@');

// New migrations to run
const MIGRATIONS = [
  '20260201090000_add_exit_order_metadata.sql',
  '20260201100000_create_app_users.sql',
];

console.log('');
console.log('🚀 Running All New Migrations');
console.log('=============================');
console.log('');
console.log(`📦 Database: ${maskedUrl}`);
console.log(`📄 Migrations: ${MIGRATIONS.length}`);
console.log('');

async function runMigrations() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!');
    console.log('');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const migrationFile of MIGRATIONS) {
      console.log(`📝 Running: ${migrationFile}`);
      
      const migrationPath = join(__dirname, '..', 'supabase', 'migrations', migrationFile);
      
      try {
        const sql = readFileSync(migrationPath, 'utf-8');
        await client.query(sql);
        console.log(`   ✅ Success`);
        successCount++;
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`   ⏭️  Already applied (skipped)`);
          skipCount++;
        } else {
          console.error(`   ❌ Error: ${error.message}`);
          errorCount++;
        }
      }
      console.log('');
    }

    console.log('=============================');
    console.log('📊 Migration Summary');
    console.log('=============================');
    console.log(`Total migrations: ${MIGRATIONS.length}`);
    console.log(`✅ Applied: ${successCount}`);
    console.log(`⏭️  Skipped: ${skipCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log('');

    if (errorCount === 0) {
      console.log('🎉 All migrations completed successfully!');
      console.log('');
      
      // Verify tables
      console.log('🔍 Verifying tables...');
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND (table_name LIKE 'refactored_%' OR table_name IN ('orders', 'trades', 'app_users'))
        ORDER BY table_name;
      `);

      console.log('');
      console.log('✅ Tables in database:');
      result.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
      console.log('');

      console.log('Next steps:');
      console.log('  1. Set Fly.io secrets (see PRODUCTION_LAUNCH_CHECKLIST.md)');
      console.log('  2. Deploy backend: fly deploy');
      console.log('  3. Run validation tests');
      console.log('');
    } else {
      console.log('⚠️  Some migrations failed. Please review errors above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
