-- ============================================================================
-- SIGNALS & WEBHOOK INGESTION
-- ============================================================================

CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  signal_hash TEXT UNIQUE NOT NULL,
  raw_payload JSONB NOT NULL,
  signature_verified BOOLEAN DEFAULT false,
  
  action TEXT CHECK (action IN ('BUY', 'SELL', 'CLOSE')),
  underlying TEXT,
  strike DECIMAL,
  expiration DATE,
  option_type TEXT CHECK (option_type IN ('CALL', 'PUT')),
  quantity INTEGER,
  strategy_type TEXT,
  
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALIDATED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED')),
  validation_errors JSONB,
  processed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_created_at ON signals(created_at DESC);
CREATE INDEX idx_signals_hash ON signals(signal_hash);

-- ============================================================================
-- ORDERS
-- ============================================================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES signals(id),
  
  broker_order_id TEXT,
  client_order_id TEXT UNIQUE,
  
  underlying TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strike DECIMAL NOT NULL,
  expiration DATE NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('CALL', 'PUT')),
  
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL', 'BUY_TO_OPEN', 'BUY_TO_CLOSE', 'SELL_TO_OPEN', 'SELL_TO_CLOSE')),
  quantity INTEGER NOT NULL,
  order_type TEXT DEFAULT 'MARKET' CHECK (order_type IN ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT')),
  limit_price DECIMAL,
  stop_price DECIMAL,
  time_in_force TEXT DEFAULT 'DAY' CHECK (time_in_force IN ('DAY', 'GTC', 'IOC', 'FOK')),
  
  mode TEXT NOT NULL CHECK (mode IN ('PAPER', 'LIVE')),
  status TEXT DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'SUBMITTED', 'ACCEPTED', 'PARTIAL_FILL', 
    'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'
  )),
  filled_quantity INTEGER DEFAULT 0,
  avg_fill_price DECIMAL,
  
  strategy_id UUID,
  leg_number INTEGER,
  
  rejection_reason TEXT,
  error_message TEXT,
  broker_response JSONB,
  
  submitted_at TIMESTAMPTZ,
  filled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_signal_id ON orders(signal_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_broker_order_id ON orders(broker_order_id);
CREATE INDEX idx_orders_strategy_id ON orders(strategy_id);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- ============================================================================
-- TRADES (FILLS)
-- ============================================================================

CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  
  broker_trade_id TEXT,
  execution_price DECIMAL NOT NULL,
  quantity INTEGER NOT NULL,
  
  commission DECIMAL DEFAULT 0,
  fees DECIMAL DEFAULT 0,
  total_cost DECIMAL NOT NULL,
  
  underlying TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strike DECIMAL NOT NULL,
  expiration DATE NOT NULL,
  option_type TEXT NOT NULL,
  
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_order_id ON trades(order_id);
CREATE INDEX idx_trades_executed_at ON trades(executed_at DESC);
CREATE INDEX idx_trades_symbol ON trades(symbol);

-- ============================================================================
-- POSITIONS
-- ============================================================================

CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  symbol TEXT NOT NULL UNIQUE,
  underlying TEXT NOT NULL,
  strike DECIMAL NOT NULL,
  expiration DATE NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('CALL', 'PUT')),
  
  quantity INTEGER NOT NULL,
  avg_open_price DECIMAL NOT NULL,
  total_cost DECIMAL NOT NULL,
  
  current_price DECIMAL,
  market_value DECIMAL,
  unrealized_pnl DECIMAL,
  unrealized_pnl_percent DECIMAL,
  
  realized_pnl DECIMAL DEFAULT 0,
  
  delta DECIMAL,
  gamma DECIMAL,
  theta DECIMAL,
  vega DECIMAL,
  implied_volatility DECIMAL,
  
  is_closed BOOLEAN DEFAULT false,
  closed_at TIMESTAMPTZ,
  
  opened_at TIMESTAMPTZ NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positions_underlying ON positions(underlying);
CREATE INDEX idx_positions_expiration ON positions(expiration);
CREATE INDEX idx_positions_is_closed ON positions(is_closed);
CREATE INDEX idx_positions_symbol ON positions(symbol);

-- ============================================================================
-- PORTFOLIO SNAPSHOTS
-- ============================================================================

CREATE TABLE portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  total_value DECIMAL NOT NULL,
  cash_balance DECIMAL NOT NULL,
  buying_power DECIMAL NOT NULL,
  margin_used DECIMAL,
  
  day_pnl DECIMAL,
  day_pnl_percent DECIMAL,
  total_pnl DECIMAL,
  total_pnl_percent DECIMAL,
  
  total_delta DECIMAL,
  total_gamma DECIMAL,
  total_theta DECIMAL,
  total_vega DECIMAL,
  
  open_positions_count INTEGER,
  total_positions_value DECIMAL,
  
  mode TEXT NOT NULL CHECK (mode IN ('PAPER', 'LIVE')),
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portfolio_snapshots_mode ON portfolio_snapshots(mode);
CREATE INDEX idx_portfolio_snapshots_snapshot_at ON portfolio_snapshots(snapshot_at DESC);

-- ============================================================================
-- RISK LIMITS
-- ============================================================================

CREATE TABLE risk_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  max_position_size INTEGER,
  max_position_value DECIMAL,
  max_total_positions INTEGER,
  
  max_daily_loss DECIMAL,
  max_weekly_loss DECIMAL,
  max_total_portfolio_loss DECIMAL,
  
  max_underlying_exposure DECIMAL,
  max_expiration_concentration DECIMAL,
  
  max_portfolio_delta DECIMAL,
  max_portfolio_gamma DECIMAL,
  max_portfolio_vega DECIMAL,
  
  mode TEXT NOT NULL CHECK (mode IN ('PAPER', 'LIVE')),
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RISK VIOLATIONS
-- ============================================================================

CREATE TABLE risk_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  signal_id UUID REFERENCES signals(id),
  order_id UUID REFERENCES orders(id),
  
  violation_type TEXT NOT NULL,
  rule_violated TEXT NOT NULL,
  current_value DECIMAL,
  limit_value DECIMAL,
  severity TEXT CHECK (severity IN ('WARNING', 'CRITICAL')),
  
  action_taken TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_violations_signal_id ON risk_violations(signal_id);
CREATE INDEX idx_risk_violations_created_at ON risk_violations(created_at DESC);

-- ============================================================================
-- ADAPTER LOGS (Broker API Interactions)
-- ============================================================================

CREATE TABLE adapter_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  correlation_id UUID,
  order_id UUID REFERENCES orders(id),
  
  adapter_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  
  status TEXT CHECK (status IN ('SUCCESS', 'FAILURE', 'TIMEOUT')),
  error_message TEXT,
  http_status_code INTEGER,
  
  duration_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_adapter_logs_correlation_id ON adapter_logs(correlation_id);
CREATE INDEX idx_adapter_logs_order_id ON adapter_logs(order_id);
CREATE INDEX idx_adapter_logs_created_at ON adapter_logs(created_at DESC);
CREATE INDEX idx_adapter_logs_status ON adapter_logs(status);

-- ============================================================================
-- STRATEGIES (Multi-leg Strategy Definitions)
-- ============================================================================

CREATE TABLE strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES signals(id),
  
  strategy_type TEXT NOT NULL,
  underlying TEXT NOT NULL,
  
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'FILLED', 'CLOSED', 'FAILED')),
  
  total_cost DECIMAL,
  total_credit DECIMAL,
  max_profit DECIMAL,
  max_loss DECIMAL,
  current_value DECIMAL,
  unrealized_pnl DECIMAL,
  
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_strategies_signal_id ON strategies(signal_id);
CREATE INDEX idx_strategies_underlying ON strategies(underlying);
CREATE INDEX idx_strategies_status ON strategies(status);

-- ============================================================================
-- MARKET DATA CACHE
-- ============================================================================

CREATE TABLE market_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  symbol TEXT NOT NULL,
  underlying TEXT NOT NULL,
  
  bid DECIMAL,
  ask DECIMAL,
  last DECIMAL,
  mark DECIMAL,
  
  delta DECIMAL,
  gamma DECIMAL,
  theta DECIMAL,
  vega DECIMAL,
  rho DECIMAL,
  implied_volatility DECIMAL,
  
  volume INTEGER,
  open_interest INTEGER,
  
  exchange TEXT,
  quote_time TIMESTAMPTZ NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_market_data_symbol_time ON market_data(symbol, quote_time DESC);
CREATE INDEX idx_market_data_underlying ON market_data(underlying);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_signals_updated_at BEFORE UPDATE ON signals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_risk_limits_updated_at BEFORE UPDATE ON risk_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INSERT DEFAULT RISK LIMITS FOR PAPER MODE
-- ============================================================================

INSERT INTO risk_limits (
  max_position_size,
  max_position_value,
  max_total_positions,
  max_daily_loss,
  max_weekly_loss,
  max_total_portfolio_loss,
  max_underlying_exposure,
  max_expiration_concentration,
  max_portfolio_delta,
  max_portfolio_gamma,
  max_portfolio_vega,
  mode,
  is_active
) VALUES (
  100,
  10000,
  20,
  1000,
  5000,
  25000,
  25,
  50,
  500,
  100,
  1000,
  'PAPER',
  true
);