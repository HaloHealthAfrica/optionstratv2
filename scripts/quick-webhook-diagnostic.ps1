# Quick Webhook Diagnostic Script
# Run this to check if webhooks are working

Write-Host "`n🔍 WEBHOOK DIAGNOSTIC REPORT" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Blue
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-DD HH:mm:ss')`n" -ForegroundColor Gray

# Check if DATABASE_URL is set
if (-not $env:DATABASE_URL) {
    Write-Host "❌ DATABASE_URL not set!" -ForegroundColor Red
    Write-Host "`nPlease set it with:" -ForegroundColor Yellow
    Write-Host '  $env:DATABASE_URL = "your-neon-connection-string"' -ForegroundColor Cyan
    Write-Host "`nGet your connection string from: https://console.neon.tech" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ DATABASE_URL is configured`n" -ForegroundColor Green

# Instructions for checking Fly.io logs
Write-Host "=" * 70 -ForegroundColor Blue
Write-Host "STEP 1: Check Fly.io Logs (Manual)" -ForegroundColor Yellow
Write-Host "=" * 70 -ForegroundColor Blue
Write-Host "`n1. Go to: https://fly.io/dashboard" -ForegroundColor White
Write-Host "2. Select your app: optionstrat-backend" -ForegroundColor White
Write-Host "3. Click 'Monitoring' → 'Logs'" -ForegroundColor White
Write-Host "4. Look for recent webhook activity" -ForegroundColor White
Write-Host "`nWhat to look for:" -ForegroundColor Yellow
Write-Host "  ✅ Lines containing '[WEBHOOK]' or 'correlation_id'" -ForegroundColor Green
Write-Host "  ✅ HTTP POST requests to /webhook" -ForegroundColor Green
Write-Host "  ❌ 'Invalid signature' errors" -ForegroundColor Red
Write-Host "  ❌ 'Invalid JSON payload' errors" -ForegroundColor Red
Write-Host "  ❌ No webhook activity at all" -ForegroundColor Red

Write-Host "`n`nPress Enter to continue to database checks..." -ForegroundColor Yellow
Read-Host

# Database diagnostic queries
Write-Host "`n" -NoNewline
Write-Host "=" * 70 -ForegroundColor Blue
Write-Host "STEP 2: Database Diagnostic Queries" -ForegroundColor Yellow
Write-Host "=" * 70 -ForegroundColor Blue

$queries = @"
-- Copy and paste these queries into Neon SQL Editor
-- https://console.neon.tech → Your Project → SQL Editor

-- ============================================================
-- QUERY 1: Check if ANY signals exist (last 7 days)
-- ============================================================
SELECT 
    COUNT(*) as total_signals,
    MAX(created_at) as last_signal_time
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '7 days';

-- Expected: If count = 0, webhooks are NOT reaching the database
-- Expected: If count > 0, webhooks ARE working (check timestamp)


-- ============================================================
-- QUERY 2: Check recent signals (last 24 hours)
-- ============================================================
SELECT 
    id,
    source,
    symbol,
    direction,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 10;

-- Expected: Shows recent webhook activity
-- If empty: No webhooks in last 24 hours


-- ============================================================
-- QUERY 3: Check if signals table exists
-- ============================================================
SELECT 
    COUNT(*) as signal_count,
    MAX(created_at) as last_signal
FROM signals
WHERE created_at > NOW() - INTERVAL '7 days';

-- Expected: This is the OLD signals table
-- Should have entries if webhooks are being received


-- ============================================================
-- QUERY 4: Check orders (to see if signals convert)
-- ============================================================
SELECT 
    COUNT(*) as total_orders,
    MAX(created_at) as last_order_time
FROM orders
WHERE created_at > NOW() - INTERVAL '7 days';

-- Expected: If signals > 0 but orders = 0, check decision logic
-- Expected: If orders > 0, signals are converting to orders


-- ============================================================
-- QUERY 5: Check trades (to see if orders execute)
-- ============================================================
SELECT 
    COUNT(*) as total_trades,
    MAX(executed_at) as last_trade_time
FROM trades
WHERE executed_at > NOW() - INTERVAL '7 days';

-- Expected: If orders > 0 but trades = 0, check Alpaca connection
-- Expected: If trades > 0, end-to-end flow is working


-- ============================================================
-- QUERY 6: Quick Summary (Run this first!)
-- ============================================================
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

-- This gives you a quick overview of all activity
"@

Write-Host $queries -ForegroundColor Cyan

Write-Host "`n`n" -NoNewline
Write-Host "=" * 70 -ForegroundColor Blue
Write-Host "STEP 3: Interpret Results" -ForegroundColor Yellow
Write-Host "=" * 70 -ForegroundColor Blue

Write-Host "`n📊 DIAGNOSTIC DECISION TREE:" -ForegroundColor Cyan
Write-Host "`n1️⃣  Are there ANY entries in 'signals' or 'refactored_signals'?" -ForegroundColor White
Write-Host "    ❌ NO  → Webhooks are NOT reaching the backend" -ForegroundColor Red
Write-Host "              - Check TradingView webhook URL" -ForegroundColor Yellow
Write-Host "              - Check Fly.io logs for errors" -ForegroundColor Yellow
Write-Host "              - Try sending a test webhook manually" -ForegroundColor Yellow
Write-Host "    ✅ YES → Webhooks ARE reaching the backend" -ForegroundColor Green

Write-Host "`n2️⃣  Are there entries in 'orders'?" -ForegroundColor White
Write-Host "    ❌ NO  → Signals are NOT converting to orders" -ForegroundColor Red
Write-Host "              - Check decision logic (risk limits)" -ForegroundColor Yellow
Write-Host "              - Check if context data exists" -ForegroundColor Yellow
Write-Host "              - Check refactored_decisions table" -ForegroundColor Yellow
Write-Host "    ✅ YES → Signals ARE converting to orders" -ForegroundColor Green

Write-Host "`n3️⃣  Are there entries in 'trades'?" -ForegroundColor White
Write-Host "    ❌ NO  → Orders are NOT being executed" -ForegroundColor Red
Write-Host "              - Check Alpaca API keys" -ForegroundColor Yellow
Write-Host "              - Check if APP_MODE=PAPER" -ForegroundColor Yellow
Write-Host "              - Check adapter_logs table" -ForegroundColor Yellow
Write-Host "    ✅ YES → End-to-end flow is WORKING!" -ForegroundColor Green

Write-Host "`n`n" -NoNewline
Write-Host "=" * 70 -ForegroundColor Blue
Write-Host "STEP 4: Test Webhook Manually" -ForegroundColor Yellow
Write-Host "=" * 70 -ForegroundColor Blue

Write-Host "`nYou can test the webhook endpoint manually with curl:" -ForegroundColor White
Write-Host @"

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

"@ -ForegroundColor Cyan

Write-Host "Expected response:" -ForegroundColor Yellow
Write-Host '  {"signal_id":"...","status":"PROCESSING","correlation_id":"..."}' -ForegroundColor Green

Write-Host "`n`n" -NoNewline
Write-Host "=" * 70 -ForegroundColor Blue
Write-Host "STEP 5: Common Issues & Fixes" -ForegroundColor Yellow
Write-Host "=" * 70 -ForegroundColor Blue

Write-Host "`n🔧 ISSUE: HMAC signature failures" -ForegroundColor Red
Write-Host "   FIX: Temporarily disable HMAC to test:" -ForegroundColor Yellow
Write-Host "        fly secrets unset HMAC_SECRET --app optionstrat-backend" -ForegroundColor Cyan

Write-Host "`n🔧 ISSUE: TradingView webhook not configured" -ForegroundColor Red
Write-Host "   FIX: In TradingView alert, set:" -ForegroundColor Yellow
Write-Host "        URL: https://optionstrat-backend.fly.dev/webhook" -ForegroundColor Cyan
Write-Host "        Method: POST" -ForegroundColor Cyan
Write-Host "        Message: (see example above)" -ForegroundColor Cyan

Write-Host "`n🔧 ISSUE: No context data (decisions fail)" -ForegroundColor Red
Write-Host "   FIX: Send a context webhook first:" -ForegroundColor Yellow
Write-Host @"
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
"@ -ForegroundColor Cyan

Write-Host "`n`n✅ Diagnostic script complete!" -ForegroundColor Green
Write-Host "Run the SQL queries in Neon SQL Editor and report back the results.`n" -ForegroundColor Yellow
