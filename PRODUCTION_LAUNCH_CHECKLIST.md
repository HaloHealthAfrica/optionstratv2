# Production Launch Checklist

**Date**: January 30, 2026  
**Status**: Pre-Launch Preparation

---

## 🔴 CRITICAL (Must-Do Before Launch)

### 1. Database Migrations ✅

- [x] Apply `20260201090000_add_exit_order_metadata.sql` (COMPLETED)
- [ ] Apply `20260201100000_create_app_users.sql` (NEW - for authentication)
- [ ] Apply `20260130000000_refactored_schema_alignment.sql` (if not already applied)
- [ ] Verify all refactored_* tables exist

**Run Migrations**:
```bash
# Set database URL
export DATABASE_URL="postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Run all new migrations
node scripts/run-all-new-migrations.js
```

### 2. Fly.io Environment Variables

**Required Secrets**:
```bash
# Database
fly secrets set DATABASE_URL="postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require" -a optionstrat-backend

# Authentication
fly secrets set JWT_SECRET="your-secure-random-string-here" -a optionstrat-backend

# Application Mode
fly secrets set APP_MODE="LIVE" -a optionstrat-backend
fly secrets set ALLOW_LIVE_EXECUTION="true" -a optionstrat-backend

# Broker Keys (Choose ONE)
# Option A: Tradier
fly secrets set TRADIER_API_KEY="your-tradier-api-key" -a optionstrat-backend
fly secrets set TRADIER_ACCOUNT_ID="your-tradier-account-id" -a optionstrat-backend

# Option B: Alpaca
fly secrets set ALPACA_API_KEY="your-alpaca-api-key" -a optionstrat-backend
fly secrets set ALPACA_SECRET_KEY="your-alpaca-secret-key" -a optionstrat-backend

# Broker Selection
fly secrets set PREFERRED_BROKER="TRADIER" -a optionstrat-backend  # or "ALPACA"
```

### 3. Authentication Smoke Test

**Test Flow**:
```bash
# 1. Register new user
curl -X POST https://optionstrat-backend.fly.dev/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "register",
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'

# 2. Login
curl -X POST https://optionstrat-backend.fly.dev/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "login",
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'
# Save the token from response

# 3. Verify token
curl https://optionstrat-backend.fly.dev/auth?action=me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected Results**:
- [ ] Register returns success with user ID
- [ ] Login returns JWT token
- [ ] /auth?action=me returns user details

### 4. Broker Configuration

**Enable Live Broker**:
```bash
# Set preferred broker in adapter factory
fly secrets set PREFERRED_BROKER="TRADIER" -a optionstrat-backend

# Verify broker credentials are set
fly secrets list -a optionstrat-backend
```

**Verify**:
- [ ] Broker API keys are set
- [ ] Broker account ID is set (for Tradier)
- [ ] PREFERRED_BROKER matches your broker
- [ ] ALLOW_LIVE_EXECUTION is "true"

### 5. Webhook Endpoint Configuration

**TradingView Webhook URL**:
```
https://optionstrat-backend.fly.dev/webhook
```

**Test Webhook**:
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
    "timestamp": "2026-01-30T10:30:00Z"
  }'
```

**Expected**:
- [ ] Webhook returns 200 OK
- [ ] Signal is created in refactored_signals table
- [ ] Decision is logged in refactored_decisions table

---

## 🟡 OPERATIONAL (Strongly Recommended)

### 6. Exit Worker Configuration

**Set Schedule**:
```bash
# Option A: Cron schedule (preferred)
fly secrets set EXIT_WORKER_CRON="*/5 * * * 1-5" -a optionstrat-backend

# Option B: Interval in seconds (fallback)
fly secrets set EXIT_WORKER_INTERVAL_SECONDS="300" -a optionstrat-backend

# Enable/disable
fly secrets set EXIT_WORKER_ENABLED="true" -a optionstrat-backend
```

**Verify**:
```bash
# Check logs for cron scheduling
fly logs -a optionstrat-backend | grep ExitWorker

# Should see:
# [ExitWorkerCron] Scheduled with Deno.cron: */5 * * * 1-5
```

### 7. Order Polling Configuration

**If using external cron**:
```bash
# Set up external cron to call:
curl -X POST https://optionstrat-backend.fly.dev/poll-orders
```

**If using Deno.cron** (add to server.ts):
```typescript
Deno.cron("poll-orders", "*/2 * * * 1-5", async () => {
  await fetch("http://127.0.0.1:8080/poll-orders", { method: "POST" });
});
```

### 8. Database Access Verification

**Check Neon Connection**:
```bash
# Test from Fly.io
fly ssh console -a optionstrat-backend

# Inside container:
curl -X GET http://localhost:8080/health
```

**Neon Configuration**:
- [ ] Fly.io IP is in Neon allow-list (if applicable)
- [ ] SSL mode is set to "require" or "verify-full"
- [ ] Connection pooling is enabled

### 9. Rate Limits & Monitoring

**Set Rate Limits** (if not already):
```bash
fly secrets set RATE_LIMIT_PER_MINUTE="60" -a optionstrat-backend
fly secrets set RATE_LIMIT_PER_HOUR="1000" -a optionstrat-backend
```

**Enable Monitoring**:
```bash
# Check Fly.io metrics
fly dashboard -a optionstrat-backend

# Set up alerts (optional)
fly alerts create -a optionstrat-backend
```

---

## 🔵 VALIDATION (Before Live Capital)

### 10. Test Webhook Flow

**Send Test Signal**:
```bash
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "source": "test_source",
    "symbol": "SPY",
    "direction": "CALL",
    "timeframe": "5m",
    "action": "BUY",
    "price": 450.50,
    "timestamp": "2026-01-30T10:30:00Z",
    "metadata": {
      "strike": 450,
      "expiration": "2026-02-07",
      "option_type": "CALL"
    }
  }'
```

**Verify Database**:
```sql
-- Check signal was created
SELECT * FROM refactored_signals 
WHERE source = 'test_source' 
ORDER BY created_at DESC LIMIT 1;

-- Check decision was made
SELECT * FROM refactored_decisions 
ORDER BY created_at DESC LIMIT 1;

-- Check order was created (if decision was ENTER)
SELECT * FROM orders 
ORDER BY submitted_at DESC LIMIT 1;

-- Check trade was recorded (if order filled)
SELECT * FROM trades 
ORDER BY executed_at DESC LIMIT 1;

-- Check position was created/updated
SELECT * FROM refactored_positions 
ORDER BY entry_time DESC LIMIT 1;
```

**Checklist**:
- [ ] Signal created in refactored_signals
- [ ] Decision logged in refactored_decisions
- [ ] Order inserted in orders table
- [ ] Trade recorded in trades table
- [ ] Position created/updated in refactored_positions

### 11. Paper Trading Day

**Run in Paper Mode First**:
```bash
# Set to paper mode
fly secrets set APP_MODE="PAPER" -a optionstrat-backend
fly secrets set ALLOW_LIVE_EXECUTION="false" -a optionstrat-backend

# Deploy
fly deploy

# Monitor for 1 full trading day
fly logs -a optionstrat-backend -f
```

**Verify**:
- [ ] Signals are processed correctly
- [ ] Decisions are made appropriately
- [ ] Orders are simulated (paper mode)
- [ ] Positions are tracked accurately
- [ ] Exit worker closes positions correctly
- [ ] No errors in logs

### 12. Live Mode Activation

**Switch to Live Mode**:
```bash
# Enable live execution
fly secrets set APP_MODE="LIVE" -a optionstrat-backend
fly secrets set ALLOW_LIVE_EXECUTION="true" -a optionstrat-backend

# Deploy
fly deploy

# Monitor closely
fly logs -a optionstrat-backend -f
```

**Start Small**:
- [ ] Use minimum position sizes
- [ ] Test with 1-2 signals first
- [ ] Verify orders execute correctly
- [ ] Check broker account for fills
- [ ] Monitor P&L closely

---

## 📋 Deployment Commands

### Full Deployment Sequence

```bash
# 1. Run migrations
export DATABASE_URL="postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
node scripts/run-all-new-migrations.js

# 2. Set all environment variables (see section 2 above)

# 3. Deploy backend
cd optionstrat-main
fly deploy

# 4. Verify health
curl https://optionstrat-backend.fly.dev/health

# 5. Run auth smoke test (see section 3 above)

# 6. Test webhook (see section 10 above)

# 7. Monitor logs
fly logs -a optionstrat-backend -f
```

---

## 🔍 Validation Script

I can generate a comprehensive validation script that checks:
- ✅ All migrations applied
- ✅ All environment variables set
- ✅ Health endpoint responding
- ✅ Auth flow working
- ✅ Webhook processing
- ✅ Database connectivity
- ✅ Broker connection

Would you like me to create this script?

---

## 📊 Monitoring Checklist

### Daily Checks
- [ ] Check Fly.io logs for errors
- [ ] Verify exit worker is running
- [ ] Check order execution success rate
- [ ] Monitor position P&L
- [ ] Verify database connections

### Weekly Checks
- [ ] Review decision accuracy
- [ ] Analyze signal performance by source
- [ ] Check broker account reconciliation
- [ ] Review rate limit usage
- [ ] Database performance metrics

---

## 🚨 Emergency Procedures

### Stop All Trading
```bash
# Disable live execution immediately
fly secrets set ALLOW_LIVE_EXECUTION="false" -a optionstrat-backend

# Disable exit worker
fly secrets set EXIT_WORKER_ENABLED="false" -a optionstrat-backend

# Deploy changes
fly deploy
```

### Close All Positions
```bash
# Call exit worker with force flag
curl -X POST "https://optionstrat-backend.fly.dev/refactored-exit-worker?force_close=true"
```

### Rollback Deployment
```bash
# List recent deployments
fly releases -a optionstrat-backend

# Rollback to previous version
fly releases rollback <version> -a optionstrat-backend
```

---

## ✅ Pre-Launch Sign-Off

Before going live with real capital:

- [ ] All critical items completed
- [ ] All operational items completed
- [ ] All validation tests passed
- [ ] Paper trading day successful
- [ ] Emergency procedures documented
- [ ] Team trained on monitoring
- [ ] Broker account funded appropriately
- [ ] Risk limits configured correctly

**Signed Off By**: _______________  
**Date**: _______________

---

## 📞 Support Contacts

- **Fly.io Support**: https://fly.io/docs/about/support/
- **Neon Support**: https://neon.tech/docs/introduction/support
- **Tradier API**: https://documentation.tradier.com/
- **Alpaca API**: https://alpaca.markets/docs/

---

**Status**: Ready for deployment after completing checklist items above.
