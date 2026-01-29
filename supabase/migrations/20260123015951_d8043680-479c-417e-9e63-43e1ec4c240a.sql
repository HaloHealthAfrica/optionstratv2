-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- Since this is a single-user, API-key-only system accessed via edge functions,
-- we enable RLS and create service_role policies for backend access
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE adapter_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CREATE POLICIES FOR SERVICE ROLE ACCESS (Edge Functions use service_role)
-- These allow full CRUD for service_role (used by edge functions)
-- ============================================================================

-- SIGNALS
CREATE POLICY "Service role full access to signals"
ON signals FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Read-only for anon (dashboard can read stats)
CREATE POLICY "Anon can read signals"
ON signals FOR SELECT
TO anon
USING (true);

-- ORDERS
CREATE POLICY "Service role full access to orders"
ON orders FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Anon can read orders"
ON orders FOR SELECT
TO anon
USING (true);

-- TRADES
CREATE POLICY "Service role full access to trades"
ON trades FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Anon can read trades"
ON trades FOR SELECT
TO anon
USING (true);

-- POSITIONS
CREATE POLICY "Service role full access to positions"
ON positions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Anon can read positions"
ON positions FOR SELECT
TO anon
USING (true);

-- PORTFOLIO_SNAPSHOTS
CREATE POLICY "Service role full access to portfolio_snapshots"
ON portfolio_snapshots FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Anon can read portfolio_snapshots"
ON portfolio_snapshots FOR SELECT
TO anon
USING (true);

-- RISK_LIMITS
CREATE POLICY "Service role full access to risk_limits"
ON risk_limits FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Anon can read risk_limits"
ON risk_limits FOR SELECT
TO anon
USING (true);

-- RISK_VIOLATIONS
CREATE POLICY "Service role full access to risk_violations"
ON risk_violations FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Anon can read risk_violations"
ON risk_violations FOR SELECT
TO anon
USING (true);

-- ADAPTER_LOGS
CREATE POLICY "Service role full access to adapter_logs"
ON adapter_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Anon can read adapter_logs"
ON adapter_logs FOR SELECT
TO anon
USING (true);

-- STRATEGIES
CREATE POLICY "Service role full access to strategies"
ON strategies FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Anon can read strategies"
ON strategies FOR SELECT
TO anon
USING (true);

-- MARKET_DATA
CREATE POLICY "Service role full access to market_data"
ON market_data FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Anon can read market_data"
ON market_data FOR SELECT
TO anon
USING (true);

-- ============================================================================
-- FIX FUNCTION SEARCH PATH
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;