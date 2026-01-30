# Backend Changes Summary

**Date**: January 29, 2026  
**Status**: Ready for Migration

---

## Overview

The backend has been updated with a new **refactored-exit-worker** function that automatically monitors open positions and executes exit orders based on the decision orchestrator logic.

---

## Key Changes

### 1. New Edge Function: `refactored-exit-worker`

**Location**: `supabase/functions/refactored-exit-worker/index.ts`

**Purpose**: Automated exit order execution for open positions

**Features**:
- Monitors all open positions in `refactored_positions` table
- Uses the refactored decision orchestrator to determine exit signals
- Supports partial exits (e.g., take profit on half position)
- Integrates with adapter factory for order execution
- Logs all decisions to `refactored_decisions` table
- Records orders in `orders` table with exit metadata
- Records trades in `trades` table

**Workflow**:
1. Fetches all open positions from database
2. Gets current market data for each position
3. Runs exit decision logic via orchestrator
4. If EXIT decision: submits sell-to-close order
5. Updates position status (partial or full close)
6. Logs all activity for audit trail

### 2. Database Client Wrapper

**Location**: `supabase/functions/_shared/db-client.ts`

**Purpose**: Provides Supabase-like interface for direct PostgreSQL connections

**Features**:
- Query builder that mimics Supabase syntax
- Direct connection to Neon.tech PostgreSQL
- Supports: select, insert, update, eq, gte, lte, order, limit, single
- Connection pooling via global client instance

### 3. Server Updates

**Location**: `server.ts`

**New Features**:
- Added `refactored-exit-worker` to available endpoints
- Cron job scheduling for automated exit monitoring
- Environment variables for configuration:
  - `EXIT_WORKER_ENABLED` (default: true)
  - `EXIT_WORKER_CRON` (default: "*/5 * * * 1-5" - every 5 min, weekdays)
  - `EXIT_WORKER_INTERVAL_SECONDS` (fallback if Deno.cron unavailable)

**Cron Schedule**:
- Runs every 5 minutes during market hours (Monday-Friday)
- Can be disabled by setting `EXIT_WORKER_ENABLED=false`
- Calls `/refactored-exit-worker` endpoint internally

---

## Database Migration Required

### New Migration File

**File**: `supabase/migrations/20260201090000_add_exit_order_metadata.sql`

**Changes**:
```sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refactored_position_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS exit_action TEXT CHECK (exit_action IN ('PARTIAL', 'FULL')),
  ADD COLUMN IF NOT EXISTS exit_quantity INTEGER;

CREATE INDEX IF NOT EXISTS idx_orders_refactored_position_id 
  ON orders(refactored_position_id);
```

**Purpose**:
- Links orders to refactored positions
- Tracks whether exit was partial or full
- Records quantity exited
- Enables efficient queries by position ID

---

## Migration Instructions

### Option 1: Using Node.js Script (Recommended)

```bash
# Set your Neon database URL
export DATABASE_URL="postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Run the migration
node scripts/run-single-migration.js
```

### Option 2: Using psql Directly

```bash
psql "postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  -f supabase/migrations/20260201090000_add_exit_order_metadata.sql
```

### Option 3: Using PowerShell

```powershell
$env:DATABASE_URL = "postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

node scripts/run-single-migration.js
```

---

## Verification

After running the migration, verify the changes:

```sql
-- Check new columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
AND column_name IN ('refactored_position_id', 'exit_action', 'exit_quantity');

-- Check index was created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'orders'
AND indexname = 'idx_orders_refactored_position_id';
```

Expected output:
- 3 new columns in orders table
- 1 new index on refactored_position_id

---

## Deployment

After migration is complete:

```bash
# Deploy backend to Fly.io
cd optionstrat-main
fly deploy

# Verify deployment
curl https://optionstrat-backend.fly.dev/health

# Test exit worker (dry run)
curl -X POST "https://optionstrat-backend.fly.dev/refactored-exit-worker?dry_run=true"
```

---

## Environment Variables

Ensure these are set in Fly.io:

```bash
# Database connection
fly secrets set DATABASE_URL="postgresql://..." -a optionstrat-backend

# Exit worker configuration (optional)
fly secrets set EXIT_WORKER_ENABLED="true" -a optionstrat-backend
fly secrets set EXIT_WORKER_CRON="*/5 * * * 1-5" -a optionstrat-backend

# API authentication (if needed)
fly secrets set API_AUTH_TOKEN="your-token" -a optionstrat-backend
```

---

## Testing

### 1. Test Exit Worker Endpoint

```bash
# Dry run (no actual orders)
curl -X POST "https://optionstrat-backend.fly.dev/refactored-exit-worker?dry_run=true"

# Live run (executes orders)
curl -X POST "https://optionstrat-backend.fly.dev/refactored-exit-worker"
```

### 2. Check Logs

```bash
# View Fly.io logs
fly logs -a optionstrat-backend

# Look for exit worker activity
fly logs -a optionstrat-backend | grep ExitWorker
```

### 3. Verify Database

```sql
-- Check for exit decisions
SELECT * FROM refactored_decisions 
WHERE decision_type = 'EXIT' 
ORDER BY created_at DESC 
LIMIT 10;

-- Check for exit orders
SELECT * FROM orders 
WHERE exit_action IS NOT NULL 
ORDER BY submitted_at DESC 
LIMIT 10;

-- Check position updates
SELECT * FROM refactored_positions 
WHERE status = 'CLOSED' 
ORDER BY exit_time DESC 
LIMIT 10;
```

---

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    CRON SCHEDULER                           │
│              (Every 5 minutes, weekdays)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              REFACTORED EXIT WORKER                         │
│         /refactored-exit-worker endpoint                    │
│                                                             │
│  1. Fetch open positions                                    │
│  2. Get market data for each                                │
│  3. Run decision orchestrator                               │
│  4. Execute exit orders if needed                           │
│  5. Update positions & log trades                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  DECISION ORCHESTRATOR                      │
│                                                             │
│  - Context Cache (VIX, trend, regime)                       │
│  - GEX Service (gamma exposure)                             │
│  - Position Manager                                         │
│  - Risk Manager                                             │
│  - Confluence Calculator                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   ADAPTER FACTORY                           │
│                                                             │
│  - Paper Trading Adapter (default)                          │
│  - Alpaca Adapter (if configured)                           │
│  - Tradier Adapter (if configured)                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  DATABASE UPDATES                           │
│                                                             │
│  - refactored_decisions (audit log)                         │
│  - orders (exit orders)                                     │
│  - trades (executions)                                      │
│  - refactored_positions (status updates)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Benefits

1. **Automated Exit Management**: No manual intervention needed for exits
2. **Partial Exits**: Can take profits on half position while letting rest run
3. **Full Audit Trail**: All decisions logged to database
4. **Flexible Scheduling**: Configurable cron schedule
5. **Dry Run Mode**: Test without executing real orders
6. **Integration**: Works with existing refactored architecture

---

## Next Steps

1. ✅ Review this summary
2. ⏳ Run database migration
3. ⏳ Deploy backend to Fly.io
4. ⏳ Test exit worker endpoint
5. ⏳ Monitor logs for activity
6. ⏳ Verify positions are being managed correctly

---

## Support Files

- Migration script: `scripts/run-single-migration.js`
- Migration SQL: `supabase/migrations/20260201090000_add_exit_order_metadata.sql`
- Exit worker: `supabase/functions/refactored-exit-worker/index.ts`
- DB client: `supabase/functions/_shared/db-client.ts`
- Server config: `server.ts`
