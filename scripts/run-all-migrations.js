// Run all pending migrations on Neon.tech
import { readFileSync, readdirSync } from 'fs';
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
  console.error('  DATABASE_URL="postgresql://..." node scripts/run-all-migrations.js');
  process.exit(1);
}

const maskedUrl = DATABASE_URL.replace(/:[^:@]+@/, ':****@');

console.log('');
console.log('🚀 Running All Migrations');
console.log('========================');
console.log('');
console.log(`📦 Database: ${maskedUrl}`);
console.log('');

// Migrations to run (in order)
const MIGRATIONS = [
  '20260201090000_add_exit_order_metadata.sql',
  '20260201100000_create_app_users.sql',
];

async function runAllMigrations() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!');
    console.log('');

    const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    for (const migrationFile of MIGRATIONS) {
      console.log(`📄 Migration: ${migrationFile}`);
      console.log('---');

      const migrationPath = join(migrationsDir, migrationFile);
      const sql = readFileSync(migrationPath, 'utf-8');

      console.log(sql.trim());
      console.log('---');
      console.log('');

      try {
        console.log('⚡ Executing...');
        await client.query(sql);
        console.log('✅ Success!');
        successCount++;
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('⚠️  Already applied (skipped)');
          skipCount++;
        } else {
          console.error('❌ Failed:', error.message);
          failCount++;
        }
      }

      console.log('');
    }

    // Summary
    console.log('================================');
    console.log('📊 Migration Summary');
    console.log('================================');
    console.log(`Total: ${MIGRATIONS.length}`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`⚠️  Skipped: ${skipCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log('');

    // Verification
    console.log('🔍 Verifying database schema...');
    console.log('');

    // Check orders table columns
    const ordersResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'orders'
      AND column_name IN ('refactored_position_id', 'exit_action', 'exit_quantity')
      ORDER BY column_name;
    `);

    if (ordersResult.rows.length > 0) {
      console.log('✅ Orders table columns:');
      ordersResult.rows.forEach(row => {
        console.log(`   - ${row.column_name} (${row.data_type})`);
      });
      console.log('');
    }

    // Check app_users table
    const usersResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'app_users';
    `);

    if (usersResult.rows.length > 0) {
      console.log('✅ app_users table exists');
      
      // Check columns
      const columnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'app_users'
        ORDER BY ordinal_position;
      `);
      
      columnsResult.rows.forEach(row => {
        console.log(`   - ${row.column_name} (${row.data_type})`);
      });
      console.log('');
    }

    // Check indexes
    const indexResult = await client.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND (indexname = 'idx_orders_refactored_position_id' 
           OR indexname = 'idx_app_users_email')
      ORDER BY indexname;
    `);

    if (indexResult.rows.length > 0) {
      console.log('✅ Indexes created:');
      indexResult.rows.forEach(row => {
        console.log(`   - ${row.indexname} on ${row.tablename}`);
      });
      console.log('');
    }

    if (failCount === 0) {
      console.log('🎉 All migrations completed successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Set environment variables on Fly.io');
      console.log('  2. Deploy backend: fly deploy');
      console.log('  3. Run validation tests');
      console.log('');
    } else {
      console.log('⚠️  Some migrations failed. Please review errors above.');
      console.log('');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runAllMigrations();
