# Production Deployment Checklist

**Date**: January 30, 2026  
**Target**: Live Trading Environment

---

## 🔴 CRITICAL (Must-Do Before Live Trading)

### 1. Database Migrations ✅

Run all pending migrations:

```bash
# Set database URL
export DATABASE_URL="postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Run all new migrations
node optionstrat-main/scripts/run-all-new-migrations.js
```

**Migrations to apply**:
- ✅ `20260201090000_add_exit_order_metadata.sql` - Exit order tracking
- ⏳ `20260201100000_create_app_users.sql` - User authentication

**Verification**:
```sql
-- Check app_users table exists
SELECT * FROM app_users LIMIT 1;

-- Check orders has exit metadata
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('refactored_position_id', 'exit_action', 'exit_quantity');

-- Check refactored tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE 'refactored_%';
```

---

### 2. Fly.io Environment Variables

Set all required secrets:

```bash
# Database connection
fly secrets set DATABASE_URL="postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require" -a optionstrat-backend

# Authentication
fly secrets set JWT_SECRET="$(openssl rand -base64 32)" -a optionstrat-backend

# Application mode
fly secrets set APP_MODE="LIVE" -a optionstrat-backend
fly secrets set ALLOW_LIVE_EXECUTION="true" -a optionstrat-backend

# Broker credentials (choose one)
# Option A: Tradier
fly secrets set TRADIER_API_KEY="your-tradier-api-key" -a optionstrat-backend
fly secrets set TRADIER_ACCOUNT_ID="your-tradier-account-id" -a optionstrat-backend

# Option B: Alpaca
fly secrets set ALPACA_API_KEY="your-alpaca-api-key" -a optionstrat-backend
fly secrets set ALPACA_SECRET_KEY="your-alpaca-secret-key" -a optionstrat-backend

# Broker selection
fly secrets set PREFERRED_BROKER="TRADIER" -a optionstrat-backend
# or
fly secrets set PREFERRED_BROKER="ALPACA" -a optionstrat-backend
```

**Verify secrets are set**:
```bash
fly secrets list -a optionstrat-backend
```

---

### 3. Authentication Smoke Test

Test the auth system before going live:

```bash
# 1. Register a test user
curl -X POST https://optionstrat-backend.fly.dev/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "register",
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'

# Expected: { "success": true, "token": "..." }

# 2. Login
curl -X POST https://optionstrat-backend.fly.dev/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "login",
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'

# Expected: { "success": true, "token": "..." }

# 3. Get user info (use token from login)
curl https://optionstrat-backend.fly.dev/auth?action=me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Expected: { "id": "...", "email": "test@example.com" }
```

**Success Criteria**:
- [ ] User registration works
- [ ] User login works
- [ ] Token validation works
- [ ] User info retrieval works

---

### 4. Broker Configuration

Enable live broker in adapter selection:

**Check current adapter configuration**:
```bash
# View adapter factory code
cat optionstrat-main/supabase/functions/_shared/adapter-factory.ts
```

**Verify broker selection logic**:
- [ ] `PREFERRED_BROKER` environment variable is checked
- [ ] Live mode uses real broker (not paper trading)
- [ ] Broker credentials are loaded from environment
- [ ] Fallback to paper trading if credentials missing

---

### 5. Webhook Endpoint Verification

Confirm TradingView webhook configuration:

**Webhook URL**: `https://optionstrat-backend.fly.dev/webhook`

**Test webhook**:
```bash
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "source": "strat_engine_v6",
    "symbol": "SPY",
    "direction": "CALL",
    "timeframe": "5m",
    "action": "BUY",
    "price": 450.50,
    "timestamp": "2026-01-30T12:00:00Z"
  }'

# Expected: { "success": true, "signal_id": "..." }
```

**TradingView Configuration**:
1. Go to TradingView alert settings
2. Set webhook URL: `https://optionstrat-backend.fly.dev/webhook`
3. Set message format (JSON)
4. Test alert delivery

**Success Criteria**:
- [ ] Webhook endpoint responds
- [ ] Signal is created in database
- [ ] Decision is made
- [ ] Order is submitted (if conditions met)

---

## 🟡 OPERATIONAL (Strongly Recommended)

### 6. Exit Worker Schedule

Configure automated exit monitoring:

```bash
# Option A: Cron schedule (preferred)
fly secrets set EXIT_WORKER_CRON="*/5 * * * 1-5" -a optionstrat-backend
fly secrets set EXIT_WORKER_ENABLED="true" -a optionstrat-backend

# Option B: Interval (fallback)
fly secrets set EXIT_WORKER_INTERVAL_SECONDS="300" -a optionstrat-backend
```

**Verify exit worker is running**:
```bash
# Check logs for cron scheduling
fly logs -a optionstrat-backend | grep ExitWorker

# Expected: "[ExitWorkerCron] Scheduled with Deno.cron: */5 * * * 1-5"
```

**Test exit worker manually**:
```bash
# Dry run (no actual orders)
curl -X POST "https://optionstrat-backend.fly.dev/refactored-exit-worker?dry_run=true"

# Expected: { "success": true, "dry_run": true, "processed": X }
```

---

### 7. Order Polling

Enable order status polling:

**Check if poll-orders function exists**:
```bash
ls optionstrat-main/supabase/functions/poll-orders/
```

**Set up external cron (if needed)**:
- Use cron-job.org or similar service
- Schedule: Every 1 minute during market hours
- URL: `https://optionstrat-backend.fly.dev/poll-orders`
- Method: POST

**Or enable internal polling**:
```bash
fly secrets set POLL_ORDERS_ENABLED="true" -a optionstrat-backend
fly secrets set POLL_ORDERS_INTERVAL_SECONDS="60" -a optionstrat-backend
```

---

### 8. Database Access Verification

Verify Fly.io can access Neon database:

```bash
# Test database connection from Fly.io
fly ssh console -a optionstrat-backend

# Inside Fly.io console:
curl -X GET https://optionstrat-backend.fly.dev/health

# Expected: { "status": "healthy", "database": "connected" }
```

**Neon Configuration**:
- [ ] Check IP allowlist (if enabled)
- [ ] Verify SSL certificates
- [ ] Test connection pooling
- [ ] Check connection limits

---

### 9. Rate Limits & Monitoring

Set up rate limiting and monitoring:

```bash
# Rate limits (optional)
fly secrets set RATE_LIMIT_WEBHOOK="100" -a optionstrat-backend
fly secrets set RATE_LIMIT_API="1000" -a optionstrat-backend

# Monitoring
fly secrets set SENTRY_DSN="your-sentry-dsn" -a optionstrat-backend
```

**Set up monitoring**:
- [ ] Fly.io metrics dashboard
- [ ] Neon database monitoring
- [ ] Error tracking (Sentry/similar)
- [ ] Alert notifications

---

## 🟢 VALIDATION (Before Live Capital)

### 10. End-to-End Testing

Run complete validation before using real money:

#### Test 1: Webhook → Decision → Order Flow

```bash
# Send test webhook
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "source": "strat_engine_v6",
    "symbol": "SPY",
    "direction": "CALL",
    "timeframe": "5m",
    "action": "BUY",
    "price": 450.50,
    "timestamp": "2026-01-30T12:00:00Z"
  }'

# Verify in database
psql $DATABASE_URL -c "SELECT * FROM refactored_signals ORDER BY created_at DESC LIMIT 1;"
psql $DATABASE_URL -c "SELECT * FROM refactored_decisions ORDER BY created_at DESC LIMIT 1;"
psql $DATABASE_URL -c "SELECT * FROM orders ORDER BY submitted_at DESC LIMIT 1;"
```

**Success Criteria**:
- [ ] Signal created in `refactored_signals`
- [ ] Decision logged in `refactored_decisions`
- [ ] Order created in `orders` (if decision was ENTER)
- [ ] Trade recorded in `trades` (if order filled)

#### Test 2: Position Management

```bash
# Check open positions
psql $DATABASE_URL -c "SELECT * FROM refactored_positions WHERE status = 'OPEN';"

# Trigger exit worker
curl -X POST "https://optionstrat-backend.fly.dev/refactored-exit-worker?dry_run=true"

# Verify exit logic
psql $DATABASE_URL -c "SELECT * FROM refactored_decisions WHERE decision_type = 'EXIT' ORDER BY created_at DESC LIMIT 5;"
```

**Success Criteria**:
- [ ] Positions are tracked correctly
- [ ] Exit decisions are made
- [ ] Positions are updated/closed
- [ ] P&L is calculated

#### Test 3: Paper Trading Day

Run in paper trading mode for one full trading day:

```bash
# Temporarily set to paper mode
fly secrets set APP_MODE="PAPER" -a optionstrat-backend
fly secrets set ALLOW_LIVE_EXECUTION="false" -a optionstrat-backend

# Deploy
fly deploy

# Monitor for one day
fly logs -a optionstrat-backend --follow

# After one day, review results
psql $DATABASE_URL -c "
  SELECT 
    COUNT(*) as total_signals,
    SUM(CASE WHEN decision = 'ENTER' THEN 1 ELSE 0 END) as entries,
    SUM(CASE WHEN decision = 'EXIT' THEN 1 ELSE 0 END) as exits
  FROM refactored_decisions
  WHERE created_at > NOW() - INTERVAL '1 day';
"
```

**Success Criteria**:
- [ ] Signals are received
- [ ] Decisions are made
- [ ] Orders are submitted (paper)
- [ ] Positions are managed
- [ ] No errors in logs
- [ ] Performance is acceptable

---

## 📋 Pre-Launch Checklist

Before switching to live trading:

### Database
- [ ] All migrations applied
- [ ] Tables verified
- [ ] Indexes created
- [ ] Backup strategy in place

### Environment Variables
- [ ] DATABASE_URL set
- [ ] JWT_SECRET set
- [ ] APP_MODE=LIVE
- [ ] ALLOW_LIVE_EXECUTION=true
- [ ] Broker credentials set
- [ ] PREFERRED_BROKER set

### Authentication
- [ ] User registration works
- [ ] User login works
- [ ] Token validation works
- [ ] Password hashing secure

### Broker Integration
- [ ] Broker credentials valid
- [ ] Live mode enabled
- [ ] Order submission works
- [ ] Position tracking works

### Webhooks
- [ ] Endpoint accessible
- [ ] TradingView configured
- [ ] Test signals work
- [ ] Error handling tested

### Automation
- [ ] Exit worker scheduled
- [ ] Order polling enabled
- [ ] Cron jobs verified
- [ ] Logs are clean

### Monitoring
- [ ] Health checks passing
- [ ] Metrics dashboard set up
- [ ] Error tracking enabled
- [ ] Alerts configured

### Testing
- [ ] End-to-end test passed
- [ ] Paper trading day completed
- [ ] All flows validated
- [ ] Edge cases tested

---

## 🚀 Launch Script

Run this script to validate everything before going live:

```bash
#!/bin/bash

echo "🚀 Pre-Launch Validation Script"
echo "================================"
echo ""

# 1. Check database
echo "1️⃣ Checking database..."
psql $DATABASE_URL -c "SELECT 'Database connected' as status;" || exit 1

# 2. Check health endpoint
echo "2️⃣ Checking health endpoint..."
curl -f https://optionstrat-backend.fly.dev/health || exit 1

# 3. Test auth
echo "3️⃣ Testing authentication..."
TOKEN=$(curl -s -X POST https://optionstrat-backend.fly.dev/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"login","email":"test@example.com","password":"TestPassword123!"}' \
  | jq -r '.token')

if [ "$TOKEN" = "null" ]; then
  echo "❌ Auth failed"
  exit 1
fi

# 4. Test webhook
echo "4️⃣ Testing webhook..."
curl -f -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{"source":"test","symbol":"SPY","direction":"CALL","timeframe":"5m"}' || exit 1

# 5. Test exit worker
echo "5️⃣ Testing exit worker..."
curl -f -X POST "https://optionstrat-backend.fly.dev/refactored-exit-worker?dry_run=true" || exit 1

echo ""
echo "✅ All checks passed!"
echo "🎉 Ready for live trading!"
```

---

## 🆘 Rollback Plan

If issues arise after going live:

```bash
# 1. Immediately switch to paper mode
fly secrets set APP_MODE="PAPER" -a optionstrat-backend
fly secrets set ALLOW_LIVE_EXECUTION="false" -a optionstrat-backend

# 2. Deploy immediately
fly deploy

# 3. Cancel any pending orders manually via broker dashboard

# 4. Review logs
fly logs -a optionstrat-backend > rollback-logs.txt

# 5. Check database for issues
psql $DATABASE_URL -c "SELECT * FROM orders WHERE status = 'PENDING';"
```

---

## 📞 Support Contacts

- **Fly.io Support**: https://fly.io/docs/about/support/
- **Neon Support**: https://neon.tech/docs/introduction/support
- **Broker Support**: [Your broker's support contact]

---

**Status**: Ready for deployment  
**Next Step**: Run migrations → Set environment variables → Test → Go live
