// Run Neon-compatible schema
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
  process.exit(1);
}

const maskedUrl = DATABASE_URL.replace(/:[^:@]+@/, ':****@');

console.log('');
console.log('🚀 Running Neon-Compatible Schema');
console.log('===================================');
console.log('');
console.log(`📦 Database: ${maskedUrl}`);
console.log('');

async function runSchema() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!');
    console.log('');

    const schemaPath = join(__dirname, '..', 'supabase', 'migrations', 'neon_schema.sql');
    const sql = readFileSync(schemaPath, 'utf-8');

    console.log('📝 Running schema...');
    await client.query(sql);
    console.log('✅ Schema created successfully!');
    console.log('');

    console.log('🔍 Verifying tables...');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'refactored_%'
      ORDER BY table_name;
    `);

    console.log('');
    console.log('✅ Tables created:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    console.log('');

    console.log('🎉 Database setup complete!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Set Fly.io secret:');
    console.log(`     flyctl secrets set DATABASE_URL="${DATABASE_URL}" -a optionstrat-backend`);
    console.log('');
    console.log('  2. Deploy backend:');
    console.log('     flyctl deploy');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSchema();
