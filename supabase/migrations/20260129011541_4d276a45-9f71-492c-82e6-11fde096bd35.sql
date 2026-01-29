-- Historical performance by regime for Kelly calculations
CREATE TABLE regime_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  regime VARCHAR(30) NOT NULL,
  dealer_position VARCHAR(20),
  
  -- Performance stats
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 4),
  
  -- P&L stats
  total_pnl DECIMAL(12, 4) DEFAULT 0,
  average_win DECIMAL(12, 4),
  average_loss DECIMAL(12, 4),
  win_loss_ratio DECIMAL(8, 4),
  
  -- Kelly optimal
  kelly_fraction DECIMAL(5, 4),
  half_kelly DECIMAL(5, 4),
  
  -- Time period
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(regime, dealer_position)
);

-- VIX-based sizing rules
CREATE TABLE vix_sizing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  vix_min DECIMAL(8, 2) NOT NULL,
  vix_max DECIMAL(8, 2) NOT NULL,
  
  size_multiplier DECIMAL(5, 4) NOT NULL,
  max_positions INTEGER,
  
  notes TEXT,
  
  UNIQUE(vix_min, vix_max)
);

-- Enable RLS
ALTER TABLE regime_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE vix_sizing_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies for regime_performance
CREATE POLICY "Authenticated users can read regime_performance"
  ON regime_performance FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to regime_performance"
  ON regime_performance FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS policies for vix_sizing_rules
CREATE POLICY "Authenticated users can read vix_sizing_rules"
  ON vix_sizing_rules FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to vix_sizing_rules"
  ON vix_sizing_rules FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_regime_performance_lookup ON regime_performance(regime, dealer_position);
CREATE INDEX idx_vix_sizing_rules_range ON vix_sizing_rules(vix_min, vix_max);

-- Default VIX sizing rules
INSERT INTO vix_sizing_rules (vix_min, vix_max, size_multiplier, max_positions, notes) VALUES
  (0, 15, 1.2, 5, 'Low VIX - can be slightly more aggressive'),
  (15, 20, 1.0, 4, 'Normal VIX - standard sizing'),
  (20, 25, 0.75, 3, 'Elevated VIX - reduce size'),
  (25, 30, 0.5, 2, 'High VIX - half size'),
  (30, 40, 0.25, 1, 'Very high VIX - quarter size'),
  (40, 100, 0.1, 1, 'Extreme VIX - minimal exposure');