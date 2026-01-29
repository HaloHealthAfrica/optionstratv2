-- Fix the security definer view issue by recreating with security_invoker
DROP VIEW IF EXISTS latest_market_context;

CREATE OR REPLACE VIEW latest_market_context 
WITH (security_invoker = on) AS
SELECT DISTINCT ON (ticker) *
FROM market_context
ORDER BY ticker, updated_at DESC;