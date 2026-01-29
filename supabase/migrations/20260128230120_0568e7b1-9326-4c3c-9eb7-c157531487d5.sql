-- GEX Signals Table - stores calculated GEX signals for each ticker/expiration
CREATE TABLE public.gex_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(20) NOT NULL,
  expiration DATE NOT NULL,
  current_price DECIMAL(12, 4) NOT NULL,
  
  -- GEX Data
  net_gex DECIMAL(20, 4),
  dealer_position VARCHAR(20),
  zero_gamma_level DECIMAL(12, 4),
  gex_flip_detected BOOLEAN DEFAULT FALSE,
  gex_flip_direction VARCHAR(20),
  previous_dealer_position VARCHAR(20),
  
  -- GEX Walls
  nearest_call_wall DECIMAL(12, 4),
  nearest_call_wall_strength VARCHAR(10),
  nearest_put_wall DECIMAL(12, 4),
  nearest_put_wall_strength VARCHAR(10),
  call_walls JSONB DEFAULT '[]',
  put_walls JSONB DEFAULT '[]',
  
  -- Max Pain
  max_pain_strike DECIMAL(12, 4),
  max_pain_distance_pct DECIMAL(8, 4),
  max_pain_magnet_strength VARCHAR(10),
  max_pain_expected_direction VARCHAR(10),
  
  -- Put/Call Ratio
  pc_volume_ratio DECIMAL(8, 4),
  pc_oi_ratio DECIMAL(8, 4),
  pc_combined_ratio DECIMAL(8, 4),
  pc_sentiment VARCHAR(20),
  pc_contrarian_signal VARCHAR(10),
  pc_contrarian_conviction VARCHAR(10),
  
  -- Market Regime
  market_regime VARCHAR(30),
  regime_confidence DECIMAL(5, 4),
  regime_primary_driver TEXT,
  regime_strategy VARCHAR(30),
  
  -- Recommended action
  recommended_action VARCHAR(20),
  action_conviction VARCHAR(10),
  action_reasoning TEXT,
  
  -- Key levels
  key_support DECIMAL(12, 4),
  key_resistance DECIMAL(12, 4),
  
  -- Summary
  overall_bias VARCHAR(20),
  bias_strength VARCHAR(10),
  
  -- Timestamps
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ticker, expiration, calculated_at)
);

CREATE INDEX idx_gex_signals_ticker ON public.gex_signals(ticker);
CREATE INDEX idx_gex_signals_ticker_latest ON public.gex_signals(ticker, calculated_at DESC);
CREATE INDEX idx_gex_signals_expiration ON public.gex_signals(expiration);

ALTER TABLE public.gex_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read gex_signals"
ON public.gex_signals FOR SELECT USING (true);

CREATE POLICY "Service role full access to gex_signals"
ON public.gex_signals FOR ALL USING (true) WITH CHECK (true);

-- Paper Trades Table
CREATE TABLE public.paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(20) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  strike DECIMAL(12, 4) NOT NULL,
  expiration DATE NOT NULL,
  option_type VARCHAR(4) NOT NULL,
  side VARCHAR(20) NOT NULL,
  quantity INTEGER NOT NULL,
  entry_price DECIMAL(12, 4) NOT NULL,
  entry_underlying_price DECIMAL(12, 4),
  entry_timestamp TIMESTAMPTZ DEFAULT NOW(),
  signal_id UUID REFERENCES public.signals(id),
  entry_market_regime VARCHAR(30),
  entry_dealer_position VARCHAR(20),
  entry_zero_gamma DECIMAL(12, 4),
  entry_max_pain DECIMAL(12, 4),
  entry_pc_ratio DECIMAL(8, 4),
  entry_vix DECIMAL(8, 2),
  entry_context JSONB,
  planned_stop_loss DECIMAL(12, 4),
  planned_target_1 DECIMAL(12, 4),
  planned_target_2 DECIMAL(12, 4),
  trailing_stop_enabled BOOLEAN DEFAULT FALSE,
  trailing_stop_pct DECIMAL(5, 2) DEFAULT 25,
  max_hold_hours INTEGER DEFAULT 168,
  status VARCHAR(20) DEFAULT 'OPEN',
  current_price DECIMAL(12, 4),
  current_underlying_price DECIMAL(12, 4),
  highest_price_since_entry DECIMAL(12, 4),
  lowest_price_since_entry DECIMAL(12, 4),
  entry_delta DECIMAL(8, 4),
  entry_gamma DECIMAL(8, 6),
  entry_theta DECIMAL(8, 4),
  entry_iv DECIMAL(8, 4),
  current_delta DECIMAL(8, 4),
  current_gamma DECIMAL(8, 6),
  current_theta DECIMAL(8, 4),
  current_iv DECIMAL(8, 4),
  unrealized_pnl DECIMAL(12, 4),
  unrealized_pnl_pct DECIMAL(8, 4),
  realized_pnl DECIMAL(12, 4) DEFAULT 0,
  total_pnl DECIMAL(12, 4) DEFAULT 0,
  partial_exit_quantity INTEGER DEFAULT 0,
  partial_exit_price DECIMAL(12, 4),
  partial_exit_timestamp TIMESTAMPTZ,
  partial_exit_reason TEXT,
  exit_price DECIMAL(12, 4),
  exit_timestamp TIMESTAMPTZ,
  exit_reason TEXT,
  exit_signal_type VARCHAR(50),
  exit_market_regime VARCHAR(30),
  exit_underlying_price DECIMAL(12, 4),
  entry_decision_log JSONB,
  exit_decision_log JSONB,
  hold_decisions_log JSONB DEFAULT '[]',
  warnings_log JSONB DEFAULT '[]',
  time_in_trade_hours DECIMAL(10, 2),
  max_favorable_excursion DECIMAL(12, 4),
  max_adverse_excursion DECIMAL(12, 4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_paper_trades_status ON public.paper_trades(status);
CREATE INDEX idx_paper_trades_open ON public.paper_trades(status) WHERE status = 'OPEN';
CREATE INDEX idx_paper_trades_ticker ON public.paper_trades(ticker);
CREATE INDEX idx_paper_trades_created ON public.paper_trades(created_at DESC);

ALTER TABLE public.paper_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read paper_trades"
ON public.paper_trades FOR SELECT USING (true);

CREATE POLICY "Service role full access to paper_trades"
ON public.paper_trades FOR ALL USING (true) WITH CHECK (true);

-- Paper Trading Account Table
CREATE TABLE public.paper_trading_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name VARCHAR(100) DEFAULT 'Default Paper Account',
  mode VARCHAR(10) DEFAULT 'PAPER',
  starting_balance DECIMAL(12, 4) DEFAULT 10000,
  current_balance DECIMAL(12, 4) DEFAULT 10000,
  max_position_size INTEGER DEFAULT 10,
  max_positions INTEGER DEFAULT 5,
  max_daily_loss DECIMAL(12, 4) DEFAULT 500,
  max_weekly_loss DECIMAL(12, 4) DEFAULT 1500,
  risk_per_trade_pct DECIMAL(5, 2) DEFAULT 2.0,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 4) DEFAULT 0,
  total_pnl DECIMAL(12, 4) DEFAULT 0,
  profit_factor DECIMAL(8, 4),
  average_winner DECIMAL(12, 4),
  average_loser DECIMAL(12, 4),
  best_trade_pnl DECIMAL(12, 4),
  worst_trade_pnl DECIMAL(12, 4),
  max_drawdown DECIMAL(12, 4) DEFAULT 0,
  max_drawdown_pct DECIMAL(8, 4) DEFAULT 0,
  trending_up_trades INTEGER DEFAULT 0,
  trending_up_win_rate DECIMAL(5, 4),
  trending_down_trades INTEGER DEFAULT 0,
  trending_down_win_rate DECIMAL(5, 4),
  range_bound_trades INTEGER DEFAULT 0,
  range_bound_win_rate DECIMAL(5, 4),
  breakout_trades INTEGER DEFAULT 0,
  breakout_win_rate DECIMAL(5, 4),
  reversal_trades INTEGER DEFAULT 0,
  reversal_win_rate DECIMAL(5, 4),
  gex_flip_trades INTEGER DEFAULT 0,
  gex_flip_win_rate DECIMAL(5, 4),
  zero_gamma_trades INTEGER DEFAULT 0,
  zero_gamma_win_rate DECIMAL(5, 4),
  max_pain_trades INTEGER DEFAULT 0,
  max_pain_win_rate DECIMAL(5, 4),
  pc_extreme_trades INTEGER DEFAULT 0,
  pc_extreme_win_rate DECIMAL(5, 4),
  daily_pnl DECIMAL(12, 4) DEFAULT 0,
  daily_trades INTEGER DEFAULT 0,
  daily_reset_at TIMESTAMPTZ DEFAULT NOW(),
  weekly_pnl DECIMAL(12, 4) DEFAULT 0,
  weekly_trades INTEGER DEFAULT 0,
  weekly_reset_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.paper_trading_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read paper_trading_account"
ON public.paper_trading_account FOR SELECT USING (true);

CREATE POLICY "Service role full access to paper_trading_account"
ON public.paper_trading_account FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.paper_trading_account (account_name, mode, starting_balance, current_balance)
VALUES ('Default Paper Account', 'PAPER', 10000, 10000);

CREATE TRIGGER update_paper_trades_updated_at
BEFORE UPDATE ON public.paper_trades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_paper_trading_account_updated_at
BEFORE UPDATE ON public.paper_trading_account
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();