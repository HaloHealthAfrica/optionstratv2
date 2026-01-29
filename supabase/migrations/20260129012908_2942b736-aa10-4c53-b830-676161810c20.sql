-- Source credibility tracking for conflict resolution
CREATE TABLE source_credibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  source VARCHAR(50) NOT NULL,
  
  -- Accuracy stats
  total_signals INTEGER DEFAULT 0,
  correct_signals INTEGER DEFAULT 0,
  accuracy_rate DECIMAL(5, 4),
  
  -- Recent performance (last 50 signals)
  recent_total INTEGER DEFAULT 0,
  recent_correct INTEGER DEFAULT 0,
  recent_accuracy DECIMAL(5, 4),
  
  -- Credibility score (0-100)
  credibility_score DECIMAL(5, 2) DEFAULT 50,
  
  -- Weight adjustment
  base_weight DECIMAL(5, 4) NOT NULL,
  adjusted_weight DECIMAL(5, 4), -- base_weight * credibility adjustment
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(source)
);

-- Decision log for full observability
CREATE TABLE decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Decision identification
  decision_type VARCHAR(20) NOT NULL, -- 'ENTRY', 'HOLD', 'EXIT'
  ticker VARCHAR(20) NOT NULL,
  
  -- Decision outcome
  action VARCHAR(30) NOT NULL, -- 'EXECUTE', 'REJECT', 'HOLD', 'CLOSE_PARTIAL', 'CLOSE_FULL'
  action_reason TEXT,
  
  -- Full context snapshot (for replay)
  context_snapshot JSONB NOT NULL,
  
  -- Individual inputs
  tv_signal JSONB,
  gex_signals JSONB,
  market_context JSONB,
  mtf_trend JSONB,
  positioning JSONB,
  
  -- Calculated scores
  confluence_score JSONB,
  conflict_resolution JSONB,
  regime_stability JSONB,
  
  -- Position sizing
  position_sizing JSONB,
  
  -- Final decision details
  confidence DECIMAL(5, 4),
  quantity INTEGER,
  price DECIMAL(12, 4),
  
  -- Rules that fired
  rules_triggered JSONB DEFAULT '[]'::jsonb,
  
  -- Outcome (filled in later)
  outcome_pnl DECIMAL(12, 4),
  outcome_correct BOOLEAN,
  outcome_timestamp TIMESTAMPTZ,
  
  -- Timestamps
  decision_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rule performance tracking
CREATE TABLE rule_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  rule_id VARCHAR(100) NOT NULL,
  rule_category VARCHAR(50),
  
  -- Hit stats
  times_triggered INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  accuracy_rate DECIMAL(5, 4),
  
  -- Impact stats
  avg_confidence_impact DECIMAL(5, 4),
  avg_pnl_when_triggered DECIMAL(12, 4),
  
  -- Current threshold
  current_threshold DECIMAL(12, 4),
  suggested_threshold DECIMAL(12, 4),
  
  -- Auto-tune recommendation
  tune_direction VARCHAR(10),
  tune_confidence DECIMAL(5, 4),
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(rule_id)
);

-- Create indexes
CREATE INDEX idx_source_credibility_source ON source_credibility(source);
CREATE INDEX idx_decision_log_ticker ON decision_log(ticker);
CREATE INDEX idx_decision_log_type ON decision_log(decision_type);
CREATE INDEX idx_decision_log_action ON decision_log(action);
CREATE INDEX idx_decision_log_timestamp ON decision_log(decision_timestamp DESC);
CREATE INDEX idx_rule_performance_rule_id ON rule_performance(rule_id);
CREATE INDEX idx_rule_performance_category ON rule_performance(rule_category);

-- Enable RLS
ALTER TABLE source_credibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_performance ENABLE ROW LEVEL SECURITY;

-- RLS policies for source_credibility
CREATE POLICY "Authenticated users can read source_credibility" 
ON source_credibility FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Service role full access to source_credibility" 
ON source_credibility FOR ALL 
TO service_role
USING (true) 
WITH CHECK (true);

-- RLS policies for decision_log
CREATE POLICY "Authenticated users can read decision_log" 
ON decision_log FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Service role full access to decision_log" 
ON decision_log FOR ALL 
TO service_role
USING (true) 
WITH CHECK (true);

-- RLS policies for rule_performance
CREATE POLICY "Authenticated users can read rule_performance" 
ON rule_performance FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Service role full access to rule_performance" 
ON rule_performance FOR ALL 
TO service_role
USING (true) 
WITH CHECK (true);

-- Initialize source credibility with base weights
INSERT INTO source_credibility (source, base_weight, credibility_score, adjusted_weight) VALUES
  ('TV_ULTIMATE_OPTIONS', 0.25, 50, 0.25),
  ('TV_TREND_ENGINE', 0.15, 50, 0.15),
  ('TV_MTF_DOTS', 0.10, 50, 0.10),
  ('GEX_ANALYSIS', 0.25, 50, 0.25),
  ('CONTEXT_WEBHOOK', 0.15, 50, 0.15),
  ('POSITIONING', 0.10, 50, 0.10);

-- Initialize common rules
INSERT INTO rule_performance (rule_id, rule_category, current_threshold) VALUES
  ('GEX_ALIGNED', 'ENTRY', 0.20),
  ('GEX_CONFLICT', 'ENTRY', 0.20),
  ('HIGH_VIX_REDUCTION', 'SIZING', 25),
  ('REGIME_BLOCK', 'ENTRY', 0.75),
  ('STOP_LOSS', 'EXIT', 0.15),
  ('TARGET_1', 'EXIT', 0.30),
  ('TRAILING_STOP', 'EXIT', 0.20),
  ('TIME_DECAY_URGENT', 'EXIT', 3),
  ('CONFLICT_MAJORITY', 'CONFLICT', 3);