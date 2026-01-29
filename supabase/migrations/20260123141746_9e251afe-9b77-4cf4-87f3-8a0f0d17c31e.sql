-- ============================================================================
-- SECURITY UPDATE: Change from anon-accessible to authenticated-only access
-- This migration updates all RLS policies to require authentication
-- ============================================================================

-- Drop existing overly permissive anon policies for all tables

-- adapter_logs
DROP POLICY IF EXISTS "Anon can read adapter_logs" ON public.adapter_logs;
CREATE POLICY "Authenticated users can read adapter_logs" 
ON public.adapter_logs FOR SELECT 
TO authenticated
USING (true);

-- market_data
DROP POLICY IF EXISTS "Anon can read market_data" ON public.market_data;
CREATE POLICY "Authenticated users can read market_data" 
ON public.market_data FOR SELECT 
TO authenticated
USING (true);

-- orders
DROP POLICY IF EXISTS "Anon can read orders" ON public.orders;
CREATE POLICY "Authenticated users can read orders" 
ON public.orders FOR SELECT 
TO authenticated
USING (true);

-- portfolio_snapshots
DROP POLICY IF EXISTS "Anon can read portfolio_snapshots" ON public.portfolio_snapshots;
CREATE POLICY "Authenticated users can read portfolio_snapshots" 
ON public.portfolio_snapshots FOR SELECT 
TO authenticated
USING (true);

-- positions
DROP POLICY IF EXISTS "Anon can read positions" ON public.positions;
CREATE POLICY "Authenticated users can read positions" 
ON public.positions FOR SELECT 
TO authenticated
USING (true);

-- risk_limits
DROP POLICY IF EXISTS "Anon can read risk_limits" ON public.risk_limits;
CREATE POLICY "Authenticated users can read risk_limits" 
ON public.risk_limits FOR SELECT 
TO authenticated
USING (true);

-- risk_violations
DROP POLICY IF EXISTS "Anon can read risk_violations" ON public.risk_violations;
CREATE POLICY "Authenticated users can read risk_violations" 
ON public.risk_violations FOR SELECT 
TO authenticated
USING (true);

-- signals
DROP POLICY IF EXISTS "Anon can read signals" ON public.signals;
CREATE POLICY "Authenticated users can read signals" 
ON public.signals FOR SELECT 
TO authenticated
USING (true);

-- strategies
DROP POLICY IF EXISTS "Anon can read strategies" ON public.strategies;
CREATE POLICY "Authenticated users can read strategies" 
ON public.strategies FOR SELECT 
TO authenticated
USING (true);

-- trades
DROP POLICY IF EXISTS "Anon can read trades" ON public.trades;
CREATE POLICY "Authenticated users can read trades" 
ON public.trades FOR SELECT 
TO authenticated
USING (true);