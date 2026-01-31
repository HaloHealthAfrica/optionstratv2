-- Check Recent Signals (Last 1 Hour)
-- Run this in Neon SQL Editor: https://console.neon.tech

-- 1. Check signals table
SELECT 
    id,
    source,
    underlying,
    action,
    option_type,
    strike,
    status,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM signals
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 2. Check refactored_signals table
SELECT 
    id,
    source,
    symbol,
    direction,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
    metadata->>'correlation_id' as correlation_id,
    metadata->>'original_signal_id' as original_signal_id
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 3. Check if orders were created
SELECT 
    id,
    signal_id,
    underlying,
    side,
    quantity,
    status,
    mode,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
FROM orders
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 4. Quick summary
SELECT 
    'Signals (1h)' as metric,
    COUNT(*) as count
FROM signals
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
    'Refactored Signals (1h)' as metric,
    COUNT(*) as count
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
    'Orders (1h)' as metric,
    COUNT(*) as count
FROM orders
WHERE created_at > NOW() - INTERVAL '1 hour';
