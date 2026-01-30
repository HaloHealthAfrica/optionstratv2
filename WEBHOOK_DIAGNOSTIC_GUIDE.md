# 🔍 Webhook Diagnostic Guide

**Goal:** Identify why TradingView webhooks aren't showing activity on your website.

---

## Quick Start (5 minutes)

### Step 1: Check Fly.io Logs (Are webhooks reaching the backend?)

1. Go to: **https://fly.io/dashboard**
2. Click on: **optionstrat-backend**
3. Click: **Monitoring** → **Logs**
4. Look for recent activity (last 1 hour)

**What to look for:**
- ✅ **GOOD:** Lines with `[WEBHOOK]` or `correlation_id` → Webhooks ARE reaching backend
- ❌ **BAD:** No webhook activity → Webhooks NOT reaching backend
- ❌ **BAD:** `Invalid signature` errors → HMAC issue
- ❌ **BAD:** `Invalid JSON payload` → Format issue

**If you see NO webhook activity in logs:**
- TradingView webhook is not configured correctly
- URL might be wrong
- TradingView alert might not be triggering

---

### Step 2: Check Database (Are webhooks creating signals?)

1. Go to: **https://console.neon.tech**
2. Select your project
3. Click: **SQL Editor**
4. Run this query:

```sql
-- Quick Summary (Run this FIRST!)
SELECT 
    'Signals (7d)' as metric,
    COUNT(*)::text as count,
    TO_CHAR(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') as last_activity
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Old Signals (7d)' as metric,
    COUNT(*)::text as count,
    TO_CHAR(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') as last_activity
FROM signals
WHERE created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Orders (7d)' as metric,
    COUNT(*)::text as count,
    TO_CHAR(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') as last_activity
FROM orders
WHERE created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Trades (7d)' as metric,
    COUNT(*)::text as count,
    TO_CHAR(MAX(executed_at), 'YYYY-MM-DD HH24:MI:SS') as last_activity
FROM trades
WHERE executed_at > NOW() - INTERVAL '7 days';
```

**Interpret Results:**

| Signals | Orders | Trades | Diagnosis |
|---------|--------|--------|-----------|
| 0 | 0 | 0 | ❌ Webhooks NOT reaching backend |
| >0 | 0 | 0 | ⚠️ Signals not converting to orders (decision logic issue) |
| >0 | >0 | 0 | ⚠️ Orders not executing (Alpaca issue) |
| >0 | >0 | >0 | ✅ Everything working! |

---

## Diagnostic Decision Tree

```
┌─────────────────────────────────────────────────────────┐
│ START: Are webhooks showing in Fly.io logs?            │
└─────────────────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
       NO                      YES
        │                       │
        ▼                       ▼
┌──────────────────┐   ┌──────────────────┐
│ FIX: TradingView │   │ Are signals in   │
│ webhook config   │   │ database?        │
└──────────────────┘   └──────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                   NO                      YES
                    │                       │
                    ▼                       ▼
            ┌──────────────────┐   ┌──────────────────┐
            │ FIX: HMAC or     │   │ Are orders in    │
            │ parsing issue    │   │ database?        │
            └──────────────────┘   └──────────────────┘
                                            │
                                ┌───────────┴───────────┐
                                │                       │
                               NO                      YES
                                │                       │
                                ▼                       ▼
                        ┌──────────────────┐   ┌──────────────────┐
                        │ FIX: Decision    │   │ Are trades in    │
                        │ logic/risk       │   │ database?        │
                        └──────────────────┘   └──────────────────┘
                                                        │
                                            ┌───────────┴───────────┐
                                            │                       │
                                           NO                      YES
                                            │                       │
                                            ▼                       ▼
                                    ┌──────────────────┐   ┌──────────────────┐
                                    │ FIX: Alpaca      │   │ ✅ WORKING!      │
                                    │ connection       │   │                  │
                                    └──────────────────┘   └──────────────────┘
```

---

## Common Issues & Fixes

### Issue 1: No webhooks in Fly.io logs (Signals = 0)

**Diagnosis:** TradingView webhooks are not reaching your backend.

**Fix:**

1. **Check TradingView Alert Configuration:**
   - Open TradingView
   - Edit your alert
   - Check webhook settings:
     - URL: `https://optionstrat-backend.fly.dev/webhook`
     - Method: `POST` (not GET)
     - Message format: JSON (see below)

2. **Test webhook manually:**
   ```bash
   curl -X POST https://optionstrat-backend.fly.dev/webhook \
     -H "Content-Type: application/json" \
     -d '{
       "action": "BUY",
       "ticker": "SPY",
       "strike": 580,
       "expiration": "2025-02-28",
       "type": "CALL",
       "qty": 1
     }'
   ```

   **Expected response:**
   ```json
   {
     "signal_id": "...",
     "status": "PROCESSING",
     "correlation_id": "..."
   }
   ```

3. **Check Fly.io logs immediately after test:**
   - Should see `[WEBHOOK]` log entries
   - Should see correlation ID

---

### Issue 2: Webhooks in logs but no signals in database

**Diagnosis:** Webhooks are reaching backend but failing validation.

**Possible causes:**
- HMAC signature mismatch
- Invalid JSON format
- Missing required fields

**Fix:**

1. **Check Fly.io logs for error messages:**
   - Look for: `Invalid signature`
   - Look for: `Invalid JSON payload`
   - Look for: `validation_errors`

2. **Temporarily disable HMAC (for testing):**
   ```bash
   fly secrets unset HMAC_SECRET --app optionstrat-backend
   ```

3. **Verify JSON format matches expected structure:**
   ```json
   {
     "action": "BUY",        // Required: BUY, SELL, CLOSE
     "ticker": "SPY",        // Required: Underlying symbol
     "strike": 580,          // Required: Strike price (number)
     "expiration": "2025-02-28",  // Required: YYYY-MM-DD format
     "type": "CALL",         // Required: CALL or PUT
     "qty": 1                // Required: Quantity (number)
   }
   ```

4. **Check for parsing errors in database:**
   ```sql
   SELECT 
       id,
       source,
       status,
       validation_errors,
       created_at
   FROM signals
   WHERE status = 'REJECTED'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

---

### Issue 3: Signals in database but no orders (Signals > 0, Orders = 0)

**Diagnosis:** Signals are being created but not converting to orders.

**Possible causes:**
- Decision logic rejecting signals (risk limits, position limits)
- No market context data
- GEX data missing
- Signal validation failing in pipeline

**Fix:**

1. **Check decision records:**
   ```sql
   SELECT 
       id,
       decision,
       confidence,
       reasoning,
       created_at
   FROM refactored_decisions
   ORDER BY created_at DESC
   LIMIT 10;
   ```

   - If no decisions: Pipeline is rejecting signals before decision stage
   - If decisions = 'SKIP': Check reasoning field for why

2. **Check pipeline failures:**
   ```sql
   SELECT 
       id,
       stage,
       reason,
       timestamp
   FROM refactored_pipeline_failures
   ORDER BY timestamp DESC
   LIMIT 10;
   ```

3. **Check if context data exists:**
   ```sql
   SELECT 
       id,
       vix,
       trend,
       regime,
       timestamp
   FROM refactored_context_snapshots
   ORDER BY timestamp DESC
   LIMIT 1;
   ```

   **If no context data, send a context webhook:**
   ```bash
   curl -X POST https://optionstrat-backend.fly.dev/webhook \
     -H "Content-Type: application/json" \
     -d '{
       "type": "CONTEXT",
       "ticker": "SPY",
       "price": 580.50,
       "timestamp": "2025-01-30T12:00:00Z",
       "volatility": {"vix": 15.5, "vix_regime": "NORMAL"},
       "market": {"spy_trend": "BULLISH", "market_bias": "BULLISH"}
     }'
   ```

4. **Check risk limits in Fly.io secrets:**
   ```bash
   fly secrets list --app optionstrat-backend
   ```

   Look for:
   - `MAX_POSITION_SIZE`
   - `MAX_DAILY_LOSS`
   - `MAX_OPEN_POSITIONS`

---

### Issue 4: Orders in database but no trades (Orders > 0, Trades = 0)

**Diagnosis:** Orders are being created but not executing.

**Possible causes:**
- Alpaca API keys not configured
- Alpaca connection failing
- Orders stuck in PENDING status

**Fix:**

1. **Check order status:**
   ```sql
   SELECT 
       id,
       underlying,
       side,
       quantity,
       status,
       mode,
       created_at
   FROM orders
   ORDER BY created_at DESC
   LIMIT 10;
   ```

   - If status = 'PENDING': Orders not being submitted to Alpaca
   - If status = 'REJECTED': Check Alpaca logs

2. **Check Alpaca API keys:**
   ```bash
   fly secrets list --app optionstrat-backend
   ```

   Required:
   - `ALPACA_API_KEY`
   - `ALPACA_SECRET_KEY`
   - `APP_MODE=PAPER`

3. **Check adapter logs:**
   ```sql
   SELECT 
       id,
       adapter_name,
       operation,
       status,
       response_payload,
       created_at
   FROM adapter_logs
   ORDER BY created_at DESC
   LIMIT 10;
   ```

4. **Test Alpaca connection manually:**
   - Check if Alpaca API keys are valid
   - Check if PAPER trading is enabled
   - Check Alpaca dashboard for order history

---

## TradingView Webhook Configuration

### Correct Alert Message Format

In TradingView alert, use this JSON format:

```json
{
  "action": "BUY",
  "ticker": "{{ticker}}",
  "strike": 580,
  "expiration": "2025-02-28",
  "type": "CALL",
  "qty": 1
}
```

### Alert Settings

- **Webhook URL:** `https://optionstrat-backend.fly.dev/webhook`
- **Method:** POST
- **Content-Type:** application/json

### Dynamic Values (Optional)

You can use TradingView placeholders:

```json
{
  "action": "{{strategy.order.action}}",
  "ticker": "{{ticker}}",
  "strike": {{plot("strike")}},
  "expiration": "{{plot("expiry")}}",
  "type": "CALL",
  "qty": {{strategy.order.contracts}},
  "price": {{close}}
}
```

---

## Next Steps

1. **Run Step 1:** Check Fly.io logs
2. **Run Step 2:** Check database with SQL query
3. **Identify issue** using the decision tree
4. **Apply fix** from the common issues section
5. **Test again** with manual webhook or TradingView alert

---

## Need Help?

If you're still stuck after following this guide:

1. Share the results of the SQL query (Step 2)
2. Share any error messages from Fly.io logs (Step 1)
3. Share your TradingView alert configuration

This will help identify the exact issue blocking your webhooks.
