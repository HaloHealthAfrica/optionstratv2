# Webhook Troubleshooting Guide

This guide helps you diagnose and fix webhook integration issues in the trading system.

---

## Table of Contents

1. [Quick Diagnostic Steps](#quick-diagnostic-steps)
2. [Using Diagnostic Tools](#using-diagnostic-tools)
3. [Common Issues & Solutions](#common-issues--solutions)
4. [Interpreting Fly.io Logs](#interpreting-flyio-logs)
5. [Database Queries](#database-queries)
6. [Testing Webhooks Manually](#testing-webhooks-manually)

---

## Quick Diagnostic Steps

### Step 1: Check Fly.io Logs

```bash
# View recent logs
fly logs --app optionstrat-backend

# Filter for webhook activity
fly logs --app optionstrat-backend | grep "WEBHOOK"

# Follow logs in real-time
fly logs --app optionstrat-backend -f
```

**Or via web dashboard:**
1. Go to https://fly.io/dashboard
2. Click on `optionstrat-backend`
3. Click `Monitoring` → `Logs`

**What to look for:**
- `[correlation_id] Stage: RECEIPT` - Webhook received
- `[correlation_id] Stage: HMAC_VERIFICATION` - Signature check
- `[correlation_id] Stage: JSON_PARSING` - Payload parsing
- `[correlation_id] Stage: SIGNAL_STORAGE` - Signal saved to database

### Step 2: Check Database

Run this query in Neon SQL Editor (https://console.neon.tech):

```sql
SELECT 
    'Signals (7d)' as metric,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Orders (7d)' as metric,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM orders
WHERE created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Trades (7d)' as metric,
    COUNT(*) as count,
    MAX(executed_at) as last_activity
FROM trades
WHERE executed_at > NOW() - INTERVAL '7 days';
```

### Step 3: Test Webhook Manually

```powershell
# Run the test script
cd optionstrat-main/scripts
.\test-webhook.ps1
```

Or use curl:
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

---

## Using Diagnostic Tools

### PowerShell Diagnostic Script

```powershell
# Set your database URL
$env:DATABASE_URL = "your-neon-connection-string"

# Run diagnostic script
cd optionstrat-main/scripts
.\quick-webhook-diagnostic.ps1
```

This script will:
- Check Fly.io logs for webhook activity
- Query database for signals, orders, and trades
- Provide troubleshooting guidance based on findings

### SQL Diagnostic Queries

All diagnostic queries are in `scripts/check-webhook-activity.sql`. Run them in Neon SQL Editor to:
- Check recent signals
- Check signal-to-order conversion rate
- Check pipeline failures
- Check decision records

---

## Common Issues & Solutions

### Issue 1: No Webhooks in Fly.io Logs

**Symptoms:**
- No `[WEBHOOK]` entries in Fly.io logs
- Database shows 0 signals

**Diagnosis:** Webhooks are not reaching your backend.

**Solutions:**

1. **Verify TradingView webhook configuration:**
   - URL: `https://optionstrat-backend.fly.dev/webhook`
   - Method: `POST`
   - Content-Type: `application/json`

2. **Check TradingView alert is triggering:**
   - Open TradingView
   - Check alert history
   - Verify alert conditions are being met

3. **Test webhook endpoint manually:**
   ```powershell
   .\test-webhook.ps1
   ```
   
   If this succeeds but TradingView webhooks don't work, the issue is with TradingView configuration.

4. **Check Fly.io app is running:**
   ```bash
   fly status --app optionstrat-backend
   ```

---

### Issue 2: HMAC Signature Failures

**Symptoms:**
- Logs show: `Stage: HMAC_VERIFICATION, Status: FAILED`
- HTTP 401 responses
- No signals created in database

**Diagnosis:** HMAC signature mismatch between TradingView and backend.

**Solutions:**

1. **Temporarily disable HMAC (for testing):**
   ```bash
   fly secrets unset HMAC_SECRET --app optionstrat-backend
   ```

2. **Verify HMAC_SECRET matches TradingView:**
   ```bash
   fly secrets list --app optionstrat-backend
   ```
   
   The secret must match exactly what you configured in TradingView.

3. **Re-enable HMAC after testing:**
   ```bash
   fly secrets set HMAC_SECRET="your-secret" --app optionstrat-backend
   ```

---

### Issue 3: JSON Parsing Errors

**Symptoms:**
- Logs show: `Stage: JSON_PARSING, Status: FAILED`
- HTTP 400 responses
- Error: "Invalid JSON payload"

**Diagnosis:** Webhook payload is not valid JSON.

**Solutions:**

1. **Check TradingView alert message format:**
   
   Must be valid JSON:
   ```json
   {
     "action": "BUY",
     "ticker": "SPY",
     "strike": 580,
     "expiration": "2025-02-28",
     "type": "CALL",
     "qty": 1
   }
   ```

2. **Common JSON errors:**
   - Missing quotes around strings
   - Trailing commas
   - Single quotes instead of double quotes
   - Missing braces

3. **Test your JSON:**
   - Copy your TradingView alert message
   - Paste into https://jsonlint.com
   - Fix any validation errors

---

### Issue 4: Signal Parsing Errors

**Symptoms:**
- Logs show: `Stage: SIGNAL_PARSING, Status: FAILED`
- HTTP 400 responses with validation errors
- Signals not created in database

**Diagnosis:** Webhook payload is missing required fields or has invalid values.

**Solutions:**

1. **Check required fields:**
   - `action`: Must be "BUY", "SELL", or "CLOSE"
   - `ticker`: Underlying symbol (e.g., "SPY")
   - `strike`: Strike price (number)
   - `expiration`: Date in YYYY-MM-DD format
   - `type`: "CALL" or "PUT"
   - `qty`: Quantity (number)

2. **Check field formats:**
   - Strike must be a number, not a string
   - Expiration must be YYYY-MM-DD format
   - Quantity must be a positive integer

3. **Example valid payload:**
   ```json
   {
     "action": "BUY",
     "ticker": "SPY",
     "strike": 580,
     "expiration": "2025-02-28",
     "type": "CALL",
     "qty": 1
   }
   ```

---

### Issue 5: Signals Created But No Orders

**Symptoms:**
- Signals exist in database
- Orders table is empty
- Logs show: `Stage: ORDER_CREATION, Status: SKIPPED`

**Diagnosis:** Signals are not converting to orders due to decision logic.

**Solutions:**

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

2. **If no decisions exist, check pipeline failures:**
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

3. **If decisions = 'SKIP', check reasoning:**
   - Common reasons: Risk limits exceeded, position limits reached, no market context

4. **Check if context data exists:**
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

5. **If no context data, send a context webhook:**
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

6. **Check risk limits:**
   ```bash
   fly secrets list --app optionstrat-backend
   ```
   
   Look for:
   - `MAX_POSITION_SIZE`
   - `MAX_DAILY_LOSS`
   - `MAX_OPEN_POSITIONS`

---

### Issue 6: Orders Created But No Trades

**Symptoms:**
- Orders exist in database
- Trades table is empty
- Order status = 'PENDING' or 'REJECTED'

**Diagnosis:** Orders are not being executed by Alpaca.

**Solutions:**

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

4. **Verify Alpaca connection:**
   - Check Alpaca dashboard for order history
   - Verify API keys are valid
   - Verify PAPER trading is enabled

---

## Interpreting Fly.io Logs

### Log Format

All webhook logs follow this format:
```
[correlation_id] Stage: STAGE_NAME, Status: STATUS, Details: ...
```

### Webhook Flow Stages

1. **RECEIPT** - Webhook received
2. **HMAC_VERIFICATION** - Signature verification
3. **JSON_PARSING** - JSON parsing
4. **SIGNAL_PARSING** - Signal parsing
5. **SIGNAL_STORAGE** - Signal storage
6. **PIPELINE_PROCESSING** - Pipeline processing
7. **DECISION_MADE** - Decision made
8. **ORDER_CREATION** - Order creation
9. **ORDER_SUBMISSION** - Order submission
10. **TRADE_EXECUTION** - Trade execution

### Example Successful Flow

```
[abc123] Stage: RECEIPT, Status: RECEIVED, Method: POST
[abc123] Stage: HMAC_VERIFICATION, Status: SKIPPED, Reason: No secret configured
[abc123] Stage: JSON_PARSING, Status: SUCCESS
[abc123] Stage: SIGNAL_PARSING, Status: SUCCESS, Parser: TradingView
[abc123] Stage: SIGNAL_STORAGE, Status: SUCCESS, SignalId: xyz789
[abc123] Stage: PIPELINE_PROCESSING, Status: QUEUED
[abc123] Stage: PIPELINE_PROCESSING, Status: COMPLETED, Success: true
[abc123] Stage: DECISION_MADE, Status: SUCCESS, Decision: ENTER
[abc123] Stage: ORDER_CREATION, Status: PREPARING
[abc123] Stage: ORDER_SUBMISSION, Status: SUCCESS, OrderStatus: FILLED
[abc123] Stage: TRADE_EXECUTION, Status: FILLED, ExecutionPrice: 5.50
```

### Example Failed Flow (HMAC)

```
[abc123] Stage: RECEIPT, Status: RECEIVED, Method: POST
[abc123] Stage: HMAC_VERIFICATION, Status: FAILED
```

### Example Failed Flow (Parsing)

```
[abc123] Stage: RECEIPT, Status: RECEIVED, Method: POST
[abc123] Stage: HMAC_VERIFICATION, Status: SKIPPED
[abc123] Stage: JSON_PARSING, Status: FAILED, Error: Unexpected token
```

### Example Failed Flow (Decision)

```
[abc123] Stage: RECEIPT, Status: RECEIVED, Method: POST
[abc123] Stage: HMAC_VERIFICATION, Status: SKIPPED
[abc123] Stage: JSON_PARSING, Status: SUCCESS
[abc123] Stage: SIGNAL_PARSING, Status: SUCCESS
[abc123] Stage: SIGNAL_STORAGE, Status: SUCCESS
[abc123] Stage: PIPELINE_PROCESSING, Status: COMPLETED, Success: false
[abc123] Stage: PIPELINE_PROCESSING, Status: FAILED, Reason: Risk limit exceeded
```

---

## Database Queries

### Check Recent Signals

```sql
SELECT 
    id,
    source,
    symbol,
    direction,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;
```

### Check Signal-to-Order Conversion

```sql
SELECT 
    DATE(s.created_at) as date,
    COUNT(DISTINCT s.id) as total_signals,
    COUNT(DISTINCT o.id) as total_orders,
    ROUND(COUNT(DISTINCT o.id)::numeric / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 2) as conversion_rate
FROM refactored_signals s
LEFT JOIN orders o ON o.created_at > s.created_at - INTERVAL '5 minutes' 
    AND o.created_at < s.created_at + INTERVAL '5 minutes'
    AND o.underlying = s.symbol
WHERE s.created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(s.created_at)
ORDER BY date DESC;
```

### Check Pipeline Failures

```sql
SELECT 
    id,
    stage,
    reason,
    TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') as timestamp
FROM refactored_pipeline_failures
ORDER BY timestamp DESC
LIMIT 20;
```

### Check Recent Decisions

```sql
SELECT 
    id,
    decision,
    confidence,
    reasoning,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM refactored_decisions
ORDER BY created_at DESC
LIMIT 20;
```

### Check Active Positions

```sql
SELECT 
    id,
    underlying,
    quantity,
    entry_price,
    current_price,
    unrealized_pnl,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM refactored_positions
WHERE is_closed = false
ORDER BY created_at DESC;
```

---

## Testing Webhooks Manually

### Using PowerShell Script

```powershell
cd optionstrat-main/scripts
.\test-webhook.ps1
```

### Using curl

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

### Expected Response

**Success:**
```json
{
  "signal_id": "abc123...",
  "status": "PROCESSING",
  "correlation_id": "xyz789...",
  "processing_time_ms": 45,
  "system": "REFACTORED"
}
```

**HMAC Failure:**
```json
{
  "error": "Invalid signature"
}
```

**Parsing Failure:**
```json
{
  "status": "REJECTED",
  "validation_errors": [
    "Invalid action: \"INVALID\". Must be BUY, SELL, CLOSE, LONG, SHORT, EXIT"
  ]
}
```

---

## TradingView Alert Configuration

### Alert Message Format

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

### Using TradingView Variables

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

## Getting Help

If you're still stuck after following this guide:

1. **Collect diagnostic information:**
   - Run `.\quick-webhook-diagnostic.ps1`
   - Copy recent Fly.io logs (last 50 lines)
   - Run the SQL summary query
   - Note any error messages

2. **Check the correlation ID:**
   - Find the correlation ID from your test webhook
   - Search Fly.io logs for that correlation ID
   - This shows the complete flow for that webhook

3. **Share the following:**
   - SQL query results (signals, orders, trades counts)
   - Fly.io log entries for a specific correlation ID
   - TradingView alert configuration
   - Any error messages

This information will help identify the exact issue blocking your webhooks.
