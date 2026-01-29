-- Regime stability tracking table
CREATE TABLE regime_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(20) NOT NULL,
  expiration DATE,
  
  -- Regime data
  regime VARCHAR(30) NOT NULL,
  regime_confidence DECIMAL(5, 4) NOT NULL,
  dealer_position VARCHAR(20),
  net_gex DECIMAL(20, 4),
  zero_gamma_level DECIMAL(12, 4),
  
  -- Stability tracking
  consecutive_same_regime INTEGER DEFAULT 1,
  time_in_regime_seconds INTEGER DEFAULT 0,
  last_flip_timestamp TIMESTAMPTZ,
  seconds_since_flip INTEGER,
  
  -- Stability score
  stability_score DECIMAL(5, 2),
  is_stable BOOLEAN DEFAULT FALSE,
  
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_regime_history_ticker ON regime_history(ticker, checked_at DESC);
CREATE INDEX idx_regime_history_stable ON regime_history(ticker, is_stable, checked_at DESC);
CREATE INDEX idx_regime_history_flip ON regime_history(ticker, last_flip_timestamp DESC);

-- Enable RLS
ALTER TABLE regime_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read regime_history"
ON regime_history FOR SELECT
USING (true);

CREATE POLICY "Service role full access to regime_history"
ON regime_history FOR ALL
USING (true)
WITH CHECK (true);