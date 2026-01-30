# Neon.tech Database Migration Guide

Complete guide for running migrations on your Neon.tech PostgreSQL database for the Fly.io deployment.

## Architecture

- **Backend:** Fly.io (Deno server)
- **Database:** Neon.tech (PostgreSQL)
- **Frontend:** Vercel (React)

---

## Prerequisites

1. **Neon.tech Database**
   - Database created at neon.tech
   - Connection string available

2. **PostgreSQL Client**
   - Install `psql` (PostgreSQL command-line client)
   - Windows: Download from https://www.postgresql.org/download/windows/
   - Or use Neon's SQL Editor in their dashboard

3. **Fly.io Setup**
   - App deployed to Fly.io
   - Fly CLI installed and authenticated

---

## Step 1: Get Your Neon Connection String

1. Log into Neon.tech dashboard
2. Go to your project
3. Click "Connection Details"
4. Copy the connection string (it looks like):
   ```
   postgresql://[user]:[password]@[host]/[database]?sslmode=require
   ```

**Important:** Keep this secure! Never commit it to git.

---

## Step 2: Configure Fly.io with Neon Database

Set the DATABASE_URL secret in Fly.io:

```powershell
# Set the Neon database URL as a secret
flyctl secrets set DATABASE_URL="postgresql://[user]:[password]@[host]/[database]?sslmode=require" -a optionstrat-backend
```

Verify it's set:

```powershell
flyctl secrets list -a optionstrat-backend
```

---

## Step 3: Run Migrations

### Option A: Using PowerShell Script (Recommended)

```powershell
# Navigate to project directory
cd optionstrat-main

# Run migrations with your Neon connection string
.\scripts\run-all-migrations.ps1 -DatabaseUrl "postgresql://[user]:[password]@[host]/[database]?sslmode=require"
```

### Option B: Using psql Directly

```powershell
# Set environment variable
$env:DATABASE_URL = "postgresql://[user]:[password]@[host]/[database]?sslmode=require"

# Run each migration file
cd optionstrat-main\supabase\migrations

# Run migrations in order
psql $env:DATABASE_URL -f 20260123015929_6c56543d-bb81-413d-b142-dbea66bdbd09.sql
psql $env:DATABASE_URL -f 20260123015951_d8043680-479c-417e-9e63-43e1ec4c240a.sql
psql $env:DATABASE_URL -f 20260123035127_9627ef71-12e4-485e-9333-4737f533b651.sql
psql $env:DATABASE_URL -f 20260123040110_600bb8a6-96ad-4e8a-964e-43cc88f67fdf.sql
psql $env:DATABASE_URL -f 20260123135449_2eb0571d-f235-4174-af52-503bfee41ccf.sql
psql $env:DATABASE_URL -f 20260123141746_9e251afe-9b77-4cf4-87f3-8a0f0d17c31e.sql
psql $env:DATABASE_URL -f 20260123145013_9b6259cd-dbe1-42a5-a8f6-1f09ae0a2fc7.sql
psql $env:DATABASE_URL -f 20260126154602_afd142e9-b7b1-4803-8b2d-33bf048a6c1d.sql
psql $env:DATABASE_URL -f 20260128002104_442c4c0c-0829-4805-8e61-9817c874a6d0.sql
psql $env:DATABASE_URL -f 20260128003848_d0722402-0117-4053-9887-cb861cbabbaf.sql
psql $env:DATABASE_URL -f 20260128180945_23c62077-a9d5-4173-9ade-115875b5251c.sql
psql $env:DATABASE_URL -f 20260128181000_6903a7e7-ad91-4fb7-944a-71bd88994266.sql
psql $env:DATABASE_URL -f 20260128230120_0568e7b1-9326-4c3c-9eb7-c157531487d5.sql
psql $env:DATABASE_URL -f 20260129005202_61c1c883-d521-418a-b52e-ed10216741fb.sql
psql $env:DATABASE_URL -f 20260129005600_1e0e27be-29d4-4bce-8fa6-f946c95e49cf.sql
psql $env:DATABASE_URL -f 20260129011541_4d276a45-9f71-492c-82e6-11fde096bd35.sql
psql $env:DATABASE_URL -f 20260129012908_2942b736-aa10-4c53-b830-676161810c20.sql
psql $env:DATABASE_URL -f 20260130000000_refactored_schema_alignment.sql
```

### Option C: Using Neon SQL Editor

1. Go to Neon.tech dashboard
2. Click "SQL Editor"
3. Copy and paste each migration file content
4. Run them in order (by timestamp)

---

## Step 4: Verify Migrations

### Check Tables

```powershell
# List all tables
psql "postgresql://[user]:[password]@[host]/[database]?sslmode=require" -c "\dt"
```

Expected tables:
- `refactored_signals`
- `refactored_positions`
- `refactored_decisions`
- `refactored_gex_signals`
- `refactored_context_snapshots`
- `refactored_pipeline_failures`
- `refactored_processing_errors`

### Check Table Structure

```powershell
# Describe a specific table
psql "postgresql://[user]:[password]@[host]/[database]?sslmode=require" -c "\d refactored_signals"
```

### Test Connection from Fly.io

```powershell
# SSH into Fly.io machine
flyctl ssh console -a optionstrat-backend

# Inside the Fly.io machine, test database connection
deno eval "
import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';
const client = new Client(Deno.env.get('DATABASE_URL'));
await client.connect();
const result = await client.queryObject('SELECT COUNT(*) FROM refactored_signals');
console.log('Connection successful:', result.rows);
await client.end();
"
```

---

## Step 5: Configure Neon IP Allowlist

Neon.tech may require you to allowlist Fly.io IP addresses.

### Get Fly.io IP Addresses

```powershell
# Get your app's IP addresses
flyctl ips list -a optionstrat-backend
```

### Add to Neon Allowlist

1. Go to Neon.tech dashboard
2. Navigate to your project settings
3. Find "IP Allow" section
4. Add the Fly.io IP addresses
5. Save changes

**Note:** Neon's free tier may not support IP allowlisting. If you encounter connection issues, check your Neon plan.

---

## Step 6: Update Frontend (Vercel)

### Set Environment Variables in Vercel

```powershell
# Set API URL
vercel env add VITE_API_URL production
# Enter: https://optionstrat-backend.fly.dev
```

Or in Vercel dashboard:
1. Go to your project
2. Settings → Environment Variables
3. Add: `VITE_API_URL` = `https://optionstrat-backend.fly.dev`

### Redeploy Frontend

```powershell
vercel --prod
```

---

## Troubleshooting

### Issue: "psql: command not found"

**Solution:** Install PostgreSQL client

Windows:
1. Download from https://www.postgresql.org/download/windows/
2. Install (you only need the command-line tools)
3. Add to PATH: `C:\Program Files\PostgreSQL\16\bin`

Or use Neon SQL Editor instead.

### Issue: "connection refused" or "timeout"

**Solutions:**
1. Check Neon database is running (check dashboard)
2. Verify connection string is correct
3. Check if IP allowlist is configured (if required by your plan)
4. Ensure `?sslmode=require` is in connection string

### Issue: "relation already exists"

**Solution:** Migrations already ran. To reset:

```sql
-- Connect to database
psql "your-connection-string"

-- Drop all tables (CAUTION: This deletes all data!)
DROP TABLE IF EXISTS refactored_processing_errors CASCADE;
DROP TABLE IF EXISTS refactored_pipeline_failures CASCADE;
DROP TABLE IF EXISTS refactored_context_snapshots CASCADE;
DROP TABLE IF EXISTS refactored_gex_signals CASCADE;
DROP TABLE IF EXISTS refactored_decisions CASCADE;
DROP TABLE IF EXISTS refactored_positions CASCADE;
DROP TABLE IF EXISTS refactored_signals CASCADE;

-- Then re-run migrations
```

### Issue: Fly.io can't connect to Neon

**Solutions:**
1. Verify DATABASE_URL secret is set correctly
2. Check Neon IP allowlist includes Fly.io IPs
3. Verify SSL mode is enabled
4. Check Neon database is not paused (free tier auto-pauses)

---

## Migration Checklist

- [ ] Neon database created
- [ ] Connection string obtained
- [ ] DATABASE_URL set in Fly.io secrets
- [ ] psql installed (or using Neon SQL Editor)
- [ ] All 18 migrations run successfully
- [ ] Tables verified in database
- [ ] Fly.io can connect to database
- [ ] Fly.io IP addresses allowlisted in Neon (if required)
- [ ] Frontend environment variables set in Vercel
- [ ] Frontend redeployed

---

## Quick Reference

### Connection String Format
```
postgresql://[user]:[password]@[host]/[database]?sslmode=require
```

### Set Fly.io Secret
```powershell
flyctl secrets set DATABASE_URL="your-connection-string" -a optionstrat-backend
```

### Run Migrations
```powershell
.\scripts\run-all-migrations.ps1 -DatabaseUrl "your-connection-string"
```

### Verify Tables
```powershell
psql "your-connection-string" -c "\dt"
```

### Test Backend
```powershell
curl https://optionstrat-backend.fly.dev/health
```

---

## Next Steps After Migration

1. **Test the backend:**
   ```powershell
   curl https://optionstrat-backend.fly.dev/health
   curl https://optionstrat-backend.fly.dev/stats
   ```

2. **Test the frontend:**
   - Visit your Vercel URL
   - Login and verify dashboard loads

3. **Send a test webhook:**
   ```powershell
   curl -X POST https://optionstrat-backend.fly.dev/webhook `
     -H "Content-Type: application/json" `
     -d '{\"source\":\"test\",\"symbol\":\"SPY\",\"direction\":\"CALL\",\"timeframe\":\"5m\",\"timestamp\":\"2026-01-29T12:00:00Z\"}'
   ```

4. **Monitor logs:**
   ```powershell
   flyctl logs -a optionstrat-backend
   ```

---

**Last Updated:** January 29, 2026
