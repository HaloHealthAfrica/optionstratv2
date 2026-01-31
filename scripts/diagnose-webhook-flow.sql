-- Diagnose Webhook Flow
-- Run this in Neon SQL Editor to see where webhooks are getting stuck

-- 1. Check if signals are being created
SELECT 
    'Step 1: Signals Created' as checkpoint,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM signals
WHERE created_at > NOW() - INTERVAL '1 hour';

-- 2. Check signal status distribution
SELECT 
    'Step 2: Signal Status' as checkpoint,
    status,
    COUNT(*) as count
FROM signals
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;

-- 3. Check if refactored signals are created
SELECT 
    'Step 3: Refactored Signals' as checkpoint,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '1 hour';

-- 4. Check if decisions are being made
SELECT 
    'Step 4: Decisions Made' as checkpoint,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM refactored_decisions
WHERE created_at > NOW() - INTERVAL '1 hour';

-- 5. Check decision types
SELECT 
    'Step 5: Decision Types' as checkpoint,
    decision,
    COUNT(*) as count
FROM refactored_decisions
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY decision;

-- 6. Check if orders are created
SELECT 
    'Step 6: Orders Created' as checkpoint,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM orders
WHERE created_at > NOW() - INTERVAL '1 hour';

-- 7. Check if context data exists
SELECT 
    'Step 7: Context Data' as checkpoint,
    COUNT(*) as count,
    MAX(timestamp) as last_update
FROM refactored_context_snapshots;

-- 8. Check pipeline failures
SELECT 
    'Step 8: Pipeline Failures' as checkpoint,
    stage,
    reason,
    COUNT(*) as count
FROM refactored_pipeline_failures
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY stage, reason;

-- 9. Show recent signal details
SELECT 
    id,
    underlying,
    action,
    status,
    TO_CHAR(created_at, 'HH24:MI:SS') as time
FROM signals
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;

-- 10. Show recent decision details (if any)
SELECT 
    decision,
    confidence,
    reasoning,
    TO_CHAR(created_at, 'HH24:MI:SS') as time
FROM refactored_decisions
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;
