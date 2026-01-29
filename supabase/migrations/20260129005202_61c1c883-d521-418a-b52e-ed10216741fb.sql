-- Signal scores table for unified scoring
CREATE TABLE signal_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  ticker VARCHAR(20) NOT NULL,
  signal_source VARCHAR(50) NOT NULL,
  signal_type VARCHAR(50) NOT NULL,
  
  -- Normalized score (0-100)
  raw_score DECIMAL(8, 4) NOT NULL,
  raw_scale_min DECIMAL(8, 4),
  raw_scale_max DECIMAL(8, 4),
  normalized_score DECIMAL(5, 2) NOT NULL,
  
  -- Direction and confidence
  direction VARCHAR(10),
  direction_strength DECIMAL(5, 2),
  
  -- Freshness decay
  signal_timestamp TIMESTAMPTZ NOT NULL,
  age_seconds INTEGER,
  decay_factor DECIMAL(5, 4) DEFAULT 1.0,
  decayed_score DECIMAL(5, 2),
  
  -- Source metadata
  source_data JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ticker, signal_source, signal_type, signal_timestamp)
);

-- Indexes for efficient querying
CREATE INDEX idx_signal_scores_ticker ON signal_scores(ticker);
CREATE INDEX idx_signal_scores_fresh ON signal_scores(ticker, created_at DESC);
CREATE INDEX idx_signal_scores_source ON signal_scores(signal_source);

-- Confluence scores table
CREATE TABLE confluence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  ticker VARCHAR(20) NOT NULL,
  evaluation_timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Individual source scores (all 0-100, decay-adjusted)
  tv_score DECIMAL(5, 2),
  tv_weight DECIMAL(5, 4) DEFAULT 0.25,
  
  gex_score DECIMAL(5, 2),
  gex_weight DECIMAL(5, 4) DEFAULT 0.25,
  
  context_score DECIMAL(5, 2),
  context_weight DECIMAL(5, 4) DEFAULT 0.20,
  
  mtf_score DECIMAL(5, 2),
  mtf_weight DECIMAL(5, 4) DEFAULT 0.15,
  
  positioning_score DECIMAL(5, 2),
  positioning_weight DECIMAL(5, 4) DEFAULT 0.15,
  
  -- Weighted confluence
  weighted_confluence DECIMAL(5, 2),
  
  -- Direction consensus
  bullish_sources INTEGER,
  bearish_sources INTEGER,
  neutral_sources INTEGER,
  direction_consensus VARCHAR(20),
  
  -- Conflict detection
  has_conflict BOOLEAN DEFAULT FALSE,
  conflict_details TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for confluence
CREATE INDEX idx_confluence_ticker ON confluence_scores(ticker);
CREATE INDEX idx_confluence_timestamp ON confluence_scores(evaluation_timestamp DESC);

-- Enable RLS
ALTER TABLE signal_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE confluence_scores ENABLE ROW LEVEL SECURITY;

-- RLS policies for signal_scores
CREATE POLICY "Authenticated users can read signal_scores"
ON signal_scores FOR SELECT
USING (true);

CREATE POLICY "Service role full access to signal_scores"
ON signal_scores FOR ALL
USING (true)
WITH CHECK (true);

-- RLS policies for confluence_scores
CREATE POLICY "Authenticated users can read confluence_scores"
ON confluence_scores FOR SELECT
USING (true);

CREATE POLICY "Service role full access to confluence_scores"
ON confluence_scores FOR ALL
USING (true)
WITH CHECK (true);