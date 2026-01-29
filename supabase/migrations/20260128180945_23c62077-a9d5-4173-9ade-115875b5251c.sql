-- Market Context table for caching latest context per ticker
CREATE TABLE market_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identifiers
  ticker VARCHAR(20) NOT NULL,
  exchange VARCHAR(20),
  timeframe VARCHAR(10),
  
  -- Price data
  price DECIMAL(12, 4) NOT NULL,
  
  -- Volatility regime
  vix DECIMAL(8, 2),
  vix_sma20 DECIMAL(8, 2),
  vix_regime VARCHAR(20),
  vix_trend VARCHAR(20),
  atr DECIMAL(12, 6),
  atr_percentile INTEGER,
  bb_position INTEGER,
  vol_expansion_pct DECIMAL(8, 2),
  
  -- Support/Resistance levels
  pivot DECIMAL(12, 4),
  r1 DECIMAL(12, 4),
  r2 DECIMAL(12, 4),
  r3 DECIMAL(12, 4),
  s1 DECIMAL(12, 4),
  s2 DECIMAL(12, 4),
  s3 DECIMAL(12, 4),
  nearest_resistance DECIMAL(12, 4),
  nearest_support DECIMAL(12, 4),
  dist_to_r1_pct DECIMAL(8, 4),
  dist_to_s1_pct DECIMAL(8, 4),
  dist_to_nearest_res_pct DECIMAL(8, 4),
  dist_to_nearest_sup_pct DECIMAL(8, 4),
  prior_day_high DECIMAL(12, 4),
  prior_day_low DECIMAL(12, 4),
  prior_day_close DECIMAL(12, 4),
  
  -- Opening range
  or_high DECIMAL(12, 4),
  or_low DECIMAL(12, 4),
  or_midpoint DECIMAL(12, 4),
  or_range DECIMAL(12, 4),
  or_breakout VARCHAR(20),
  or_complete BOOLEAN DEFAULT FALSE,
  
  -- Market correlation
  spy_price DECIMAL(12, 4),
  spy_trend VARCHAR(20),
  spy_rsi DECIMAL(8, 2),
  spy_day_change_pct DECIMAL(8, 4),
  qqq_price DECIMAL(12, 4),
  qqq_trend VARCHAR(20),
  market_bias VARCHAR(20),
  moving_with_market BOOLEAN,
  self_day_change_pct DECIMAL(8, 4),
  
  -- Candle quality
  candle_body_ratio INTEGER,
  candle_wick_ratio INTEGER,
  candle_close_position INTEGER,
  candle_strength INTEGER,
  candle_pattern VARCHAR(30),
  candle_pattern_bias VARCHAR(20),
  is_inside_bar BOOLEAN DEFAULT FALSE,
  is_outside_bar BOOLEAN DEFAULT FALSE,
  
  -- Session info
  is_market_open BOOLEAN DEFAULT FALSE,
  is_first_30min BOOLEAN DEFAULT FALSE,
  ny_hour INTEGER,
  ny_minute INTEGER,
  
  -- Change flags
  vix_changed BOOLEAN DEFAULT FALSE,
  regime_changed BOOLEAN DEFAULT FALSE,
  or_breakout_changed BOOLEAN DEFAULT FALSE,
  market_bias_changed BOOLEAN DEFAULT FALSE,
  pattern_detected BOOLEAN DEFAULT FALSE,
  significant_change BOOLEAN DEFAULT FALSE,
  
  -- Event metadata
  event_type VARCHAR(30),
  
  -- Timestamps
  signal_timestamp BIGINT,
  bar_time TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_market_context_ticker ON market_context(ticker);
CREATE INDEX idx_market_context_ticker_updated ON market_context(ticker, updated_at DESC);
CREATE INDEX idx_market_context_received ON market_context(received_at DESC);

-- Enable RLS
ALTER TABLE market_context ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as other tables)
CREATE POLICY "Authenticated users can read market_context"
  ON market_context FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to market_context"
  ON market_context FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create a view for latest context per ticker
CREATE OR REPLACE VIEW latest_market_context AS
SELECT DISTINCT ON (ticker) *
FROM market_context
ORDER BY ticker, updated_at DESC;