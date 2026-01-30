// Node.js script to run migrations without psql
// Usage: node scripts/run-migrations-node.js

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
  console.error('  node scripts/run-migrations-node.js "postgresql://..."');
  console.error('');
  console.error('Or set environment variable:');
  console.error('  $env:DATABASE_URL = "postgresql://..."');
  console.error('  node scripts/run-migrations-node.js');
  process.exit(1);
}

// Mask password for display
const maskedUrl = DATABASE_URL.replace(/:[^:@]+@/, ':****@');

console.log('');
console.log('🚀 Neon.tech Database Migration Script');
console.log('=======================================');
console.log('');
console.log(`📦 Database: ${maskedUrl}`);
console.log('');

// Migration files in order
const migrations = [
  '20260123015929_6c56543d-bb81-413d-b142-dbea66bdbd09.sql',
  '20260123015951_d8043680-479c-417e-9e63-43e1ec4c240a.sql',
  '20260123035127_9627ef71-12e4-485e-9333-4737f533b651.sql',
  '20260123040110_600bb8a6-96ad-4e8a-964e-43cc88f67fdf.sql',
  '20260123135449_2eb0571d-f235-4174-af52-503bfee41ccf.sql',
  '20260123141746_9e251afe-9b77-4cf4-87f3-8a0f0d17c31e.sql',
  '20260123145013_9b6259cd-dbe1-42a5-a8f6-1f09ae0a2fc7.sql',
  '20260126154602_afd142e9-b7b1-4803-8b2d-33bf048a6c1d.sql',
  '20260128002104_442c4c0c-0829-4805-8e61-9817c874a6d0.sql',
  '20260128003848_d0722402-0117-4053-9887-cb861cbabbaf.sql',
  '20260128180945_23c62077-a9d5-4173-9ade-115875b5251c.sql',
  '20260128181000_6903a7e7-ad91-4fb7-944a-71bd88994266.sql',
  '20260128230120_0568e7b1-9326-4c3c-9eb7-c157531487d5.sql',
  '20260129005202_61c1c883-d521-418a-b52e-ed10216741fb.sql',
  '20260129005600_1e0e27be-29d4-4bce-8fa6-f946c95e49cf.sql',
  '20260129011541_4d276a45-9f71-492c-82e6-11fde096bd35.sql',
  '20260129012908_2942b736-aa10-4c53-b830-676161810c20.sql',
  '20260130000000_refactored_schema_alignment.sql',
];

async function runMigrations() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    // Test connection
    console.log('🔌 Testing database connection...');
    await client.connect();
    await client.query('SELECT 1');
    console.log('✅ Connection successful!');
    console.log('');
    console.log('🔄 Running migrations...');
    console.log('');

    let success = 0;
    let failed = 0;
    const total = migrations.length;

    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      const current = i + 1;
      
      console.log(`[${current}/${total}] ${migration}`);
      
      const migrationPath = join(__dirname, '..', 'supabase', 'migrations', migration);
      
      try {
        const sql = readFileSync(migrationPath, 'utf-8');
        await client.query(sql);
        console.log('  ✅ Success');
        success++;
      } catch (error) {
        console.log('  ❌ Failed');
        console.log(`  Error: ${error.message}`);
        
        // Check if it's a "relation already exists" error (safe to ignore)
        if (error.message.includes('already exists')) {
          console.log('  ℹ️  (Table already exists - safe to ignore)');
          success++;
        } else {
          failed++;
        }
      }
      
      console.log('');
    }

    console.log('=======================================');
    console.log('📊 Migration Summary');
    console.log('=======================================');
    console.log(`Total migrations: ${total}`);
    console.log(`✅ Successful: ${success}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('');

    if (failed === 0) {
      console.log('🎉 All migrations completed successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Set Fly.io secret:');
      console.log(`     flyctl secrets set DATABASE_URL="${DATABASE_URL}" -a optionstrat-backend`);
      console.log('');
      console.log('  2. Deploy backend:');
      console.log('     flyctl deploy');
      console.log('');
      console.log('  3. Test backend:');
      console.log('     curl https://optionstrat-backend.fly.dev/health');
      console.log('');
    } else {
      console.log('⚠️  Some migrations failed. Please review errors above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Connection failed!');
    console.error(`Error: ${error.message}`);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Check your connection string is correct');
    console.error('  2. Verify database is not paused (Neon free tier auto-pauses)');
    console.error('  3. Check if IP allowlist is configured in Neon dashboard');
    console.error('  4. Ensure connection string includes ?sslmode=require');
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
