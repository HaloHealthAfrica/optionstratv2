-- Webhook Activity Diagnostic Queries
-- Run these in Neon SQL Editor to check if webhooks are being received

-- ============================================================
-- 1. Check Recent Signals (Last 24 hours)
-- ============================================================
SELECT 
    id,
    underlying,
    action,
    strategy,
    source,
    status,
    signal_strength,
    created_at,
    updated_at
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- Expected: Should see signals if webhooks are working
-- If empty: Webhooks not reaching backend or failing validation


-- ============================================================
-- 2. Count Signals by Hour (Last 24 hours)
-- ============================================================
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as signal_count,
    COUNT(DISTINCT underlying) as unique_tickers,
    COUNT(DISTINCT strategy) as unique_strategies
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- Expected: Shows webhook activity by hour
-- If empty: No webhooks received in last 24 hours


-- ============================================================
-- 3. Check Signals by Source
-- ============================================================
SELECT 
    source,
    COUNT(*) as total_signals,
    COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
    COUNT(CASE WHEN status = 'PROCESSED' THEN 1 END) as processed,
    COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected,
    MAX(created_at) as last_signal_at
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY source
ORDER BY total_signals DESC;

-- Expected: Shows which sources are sending webhooks
-- Look for: 'tradingview', 'manual-test', etc.


-- ============================================================
-- 4. Check Recent Orders (Last 24 hours)
-- ============================================================
SELECT 
    id,
    underlying,
    symbol,
    side,
    quantity,
    status,
    mode,
    created_at,
    submitted_at,
    filled_at
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- Expected: Should see orders if signals triggered trades
-- If empty: Signals not triggering orders (check decision logic)


-- ============================================================
-- 5. Check Signal-to-Order Conversion
-- ============================================================
SELECT 
    DATE(s.created_at) as date,
    COUNT(DISTINCT s.id) as total_signals,
    COUNT(DISTINCT o.id) as total_orders,
    ROUND(COUNT(DISTINCT o.id)::numeric / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 2) as conversion_rate
FROM refactored_signals s
LEFT JOIN orders o ON o.created_at > s.created_at - INTERVAL '5 minutes' 
    AND o.created_at < s.created_at + INTERVAL '5 minutes'
    AND o.underlying = s.underlying
WHERE s.created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(s.created_at)
ORDER BY date DESC;

-- Expected: Shows how many signals convert to orders
-- Low conversion: Check entry criteria, risk limits


-- ============================================================
-- 6. Check Active Positions
-- ============================================================
SELECT 
    id,
    underlying,
    quantity,
    entry_price,
    current_price,
    unrealized_pnl,
    created_at,
    is_closed
FROM refactored_positions
WHERE is_closed = false
ORDER BY created_at DESC;

-- Expected: Shows currently open positions
-- If empty: No active positions (normal if no trades executed)


-- ============================================================
-- 7. Check Recent Trades (Last 24 hours)
-- ============================================================
SELECT 
    id,
    underlying,
    symbol,
    side,
    quantity,
    execution_price,
    total_cost,
    mode,
    executed_at
FROM trades
WHERE executed_at > NOW() - INTERVAL '24 hours'
ORDER BY executed_at DESC
LIMIT 20;

-- Expected: Shows executed trades
-- If empty: Orders not being filled (check broker connection)


-- ============================================================
-- 8. Check Signal Processing Errors
-- ============================================================
SELECT 
    id,
    underlying,
    action,
    strategy,
    status,
    rejection_reason,
    created_at
FROM refactored_signals
WHERE status = 'REJECTED'
    AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 20;

-- Expected: Shows why signals were rejected
-- Common reasons: Risk limits, duplicate signals, invalid data


-- ============================================================
-- 9. Check All Tables for Recent Activity
-- ============================================================
SELECT 
    'signals' as table_name,
    COUNT(*) as total_records,
    MAX(created_at) as last_activity
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'orders' as table_name,
    COUNT(*) as total_records,
    MAX(created_at) as last_activity
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'trades' as table_name,
    COUNT(*) as total_records,
    MAX(executed_at) as last_activity
FROM trades
WHERE executed_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'positions' as table_name,
    COUNT(*) as total_records,
    MAX(created_at) as last_activity
FROM refactored_positions
WHERE created_at > NOW() - INTERVAL '24 hours'

ORDER BY table_name;

-- Expected: Shows activity across all tables
-- All zeros: No webhook activity at all


-- ============================================================
-- 10. Check App Users (Verify auth is working)
-- ============================================================
SELECT 
    id,
    email,
    created_at,
    last_login_at
FROM app_users
ORDER BY created_at DESC
LIMIT 10;

-- Expected: Shows registered users
-- If empty: Auth not working, run migration


-- ============================================================
-- QUICK DIAGNOSTIC SUMMARY
-- ============================================================
SELECT 
    'Total Signals (24h)' as metric,
    COUNT(*)::text as value
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Total Orders (24h)' as metric,
    COUNT(*)::text as value
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Total Trades (24h)' as metric,
    COUNT(*)::text as value
FROM trades
WHERE executed_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Active Positions' as metric,
    COUNT(*)::text as value
FROM refactored_positions
WHERE is_closed = false

UNION ALL

SELECT 
    'Last Signal Received' as metric,
    TO_CHAR(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') as value
FROM refactored_signals

UNION ALL

SELECT 
    'Last Order Created' as metric,
    TO_CHAR(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') as value
FROM orders

UNION ALL

SELECT 
    'App Mode' as metric,
    'Check Fly.io secrets' as value;

-- Expected: Quick overview of system activity
