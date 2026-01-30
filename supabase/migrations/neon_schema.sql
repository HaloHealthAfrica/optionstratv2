-- Neon-Compatible Trading System Schema
-- Simplified version without Supabase-specific features (RLS, roles, publications)

-- ============================================================================
-- SIGNALS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS refactored_signals (
  id VARCHAR(255) PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('CALL', 'PUT')),
  timeframe VARCHAR(10) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  validation_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT refactored_signals_source_check CHECK (source IN ('TRADINGVIEW', 'GEX', 'MTF', 'MANUAL'))
);

CREATE INDEX IF NOT EXISTS idx_refactored_signals_symbol ON refactored_signals(symbol);
CREATE INDEX IF NOT EXISTS idx_refactored_signals_timestamp ON refactored_signals(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_refactored_signals_source ON refactored_signals(source);

-- ============================================================================
-- POSITIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS refactored_positions (
  id VARCHAR(255) PRIMARY KEY,
  signal_id VARCHAR(255) NOT NULL REFERENCES refactored_signals(id),
  symbol VARCHAR(20) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('CALL', 'PUT')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  entry_price DECIMAL(10, 2) NOT NULL CHECK (entry_price > 0),
  entry_time TIMESTAMPTZ NOT NULL,
  current_price DECIMAL(10, 2),
  unrealized_pnl DECIMAL(10, 2),
  exit_price DECIMAL(10, 2),
  exit_time TIMESTAMPTZ,
  realized_pnl DECIMAL(10, 2),
  status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  underlying VARCHAR(20),
  strike DECIMAL(10, 2),
  expiration DATE,
  option_type VARCHAR(10) CHECK (option_type IN ('CALL', 'PUT')),
  timeframe VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_signal_position UNIQUE(signal_id)
);

CREATE INDEX IF NOT EXISTS idx_refactored_positions_symbol ON refactored_positions(symbol);
CREATE INDEX IF NOT EXISTS idx_refactored_positions_status ON refactored_positions(status);
CREATE INDEX IF NOT EXISTS idx_refactored_positions_entry_time ON refactored_positions(entry_time DESC);

-- ============================================================================
-- DECISIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS refactored_decisions (
  id VARCHAR(255) PRIMARY KEY,
  signal_id VARCHAR(255) NOT NULL REFERENCES refactored_signals(id),
  decision_type VARCHAR(20) NOT NULL CHECK (decision_type IN ('ENTRY', 'EXIT')),
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('ENTER', 'REJECT', 'EXIT', 'HOLD')),
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  position_size INTEGER CHECK (position_size >= 0),
  reasoning JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculations JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_data JSONB,
  gex_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refactored_decisions_signal_id ON refactored_decisions(signal_id);
CREATE INDEX IF NOT EXISTS idx_refactored_decisions_type ON refactored_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_refactored_decisions_decision ON refactored_decisions(decision);
CREATE INDEX IF NOT EXISTS idx_refactored_decisions_created_at ON refactored_decisions(created_at DESC);

-- ============================================================================
-- GEX SIGNALS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS refactored_gex_signals (
  id VARCHAR(255) PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL,
  strength DECIMAL(5, 2) NOT NULL CHECK (strength >= -1 AND strength <= 1),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('CALL', 'PUT')),
  timestamp TIMESTAMPTZ NOT NULL,
  age BIGINT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refactored_gex_signals_symbol_timeframe ON refactored_gex_signals(symbol, timeframe, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_refactored_gex_signals_timestamp ON refactored_gex_signals(timestamp DESC);

-- ============================================================================
-- CONTEXT SNAPSHOTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS refactored_context_snapshots (
  id VARCHAR(255) PRIMARY KEY,
  vix DECIMAL(5, 2) NOT NULL CHECK (vix >= 0),
  trend VARCHAR(20) NOT NULL CHECK (trend IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
  bias DECIMAL(5, 2) NOT NULL CHECK (bias >= -1 AND bias <= 1),
  regime VARCHAR(20) NOT NULL CHECK (regime IN ('LOW_VOL', 'HIGH_VOL', 'NORMAL')),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refactored_context_snapshots_timestamp ON refactored_context_snapshots(timestamp DESC);

-- ============================================================================
-- PIPELINE FAILURES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS refactored_pipeline_failures (
  id VARCHAR(255) PRIMARY KEY,
  tracking_id VARCHAR(255) NOT NULL,
  signal_id VARCHAR(255) REFERENCES refactored_signals(id),
  stage VARCHAR(20) NOT NULL CHECK (stage IN ('RECEPTION', 'NORMALIZATION', 'VALIDATION', 'DEDUPLICATION', 'DECISION', 'EXECUTION')),
  reason TEXT NOT NULL,
  signal_data JSONB,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refactored_pipeline_failures_tracking_id ON refactored_pipeline_failures(tracking_id);
CREATE INDEX IF NOT EXISTS idx_refactored_pipeline_failures_stage ON refactored_pipeline_failures(stage);
CREATE INDEX IF NOT EXISTS idx_refactored_pipeline_failures_timestamp ON refactored_pipeline_failures(timestamp DESC);

-- ============================================================================
-- PROCESSING ERRORS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS refactored_processing_errors (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  correlation_id VARCHAR(255) NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refactored_processing_errors_correlation_id ON refactored_processing_errors(correlation_id);
CREATE INDEX IF NOT EXISTS idx_refactored_processing_errors_created_at ON refactored_processing_errors(created_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE refactored_signals IS 'Incoming trading signals from various sources';
COMMENT ON TABLE refactored_positions IS 'Open and closed trading positions';
COMMENT ON TABLE refactored_decisions IS 'Audit trail of all entry and exit decisions';
COMMENT ON TABLE refactored_gex_signals IS 'Gamma exposure signals for market analysis';
COMMENT ON TABLE refactored_context_snapshots IS 'Market context data snapshots';
COMMENT ON TABLE refactored_pipeline_failures IS 'Signal processing pipeline failures';
COMMENT ON TABLE refactored_processing_errors IS 'System processing errors';
