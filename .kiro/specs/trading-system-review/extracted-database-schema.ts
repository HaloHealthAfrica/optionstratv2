/**
 * Database Schema Type Definitions
 * 
 * Auto-generated from Supabase migration files
 * Task: 2.1 Extract database schema from Supabase
 * Requirements: 3.1, 3.2, 3.3, 3.4
 * 
 * Generated: 2026-01-29T23:11:49.622Z
 */

// ============================================================================
// ENUM TYPES
// ============================================================================

export type RefactoredSignalsDirection = 'CALL' | 'PUT';

export type RefactoredPositionsDirection = 'CALL' | 'PUT';

export type RefactoredPositionsStatus = 'OPEN' | 'CLOSED';

export type RefactoredDecisionsDecisionType = 'ENTRY' | 'EXIT';

export type RefactoredDecisionsDecision = 'ENTER' | 'REJECT' | 'EXIT' | 'HOLD';

export type RefactoredGexSignalsDirection = 'CALL' | 'PUT';

export type RefactoredContextSnapshotsTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type RefactoredContextSnapshotsRegime = 'LOW_VOL' | 'HIGH_VOL' | 'NORMAL';

export type RefactoredPipelineFailuresStage = 'RECEPTION' | 'NORMALIZATION' | 'VALIDATION' | 'DEDUPLICATION' | 'DECISION' | 'EXECUTION';

// ============================================================================
// TABLE INTERFACES
// ============================================================================

/**
 * Incoming trading signals from various sources
 */
export interface RefactoredSignals {
  id: string | null;
  source: string;
  symbol: string;
  direction: 'CALL' | 'PUT';
  timeframe: string;
  timestamp: Date;
  metadata: Record<string, any> | null;
  validationResult: Record<string, any> | null;
  createdAt: Date | null;
}

/**
 * Open and closed trading positions
 */
export interface RefactoredPositions {
  id: string | null;
  /** Foreign key to refactored_signals.id */
  signalId: string;
  symbol: string;
  direction: 'CALL' | 'PUT';
  quantity: number;
  entryPrice: number;
  entryTime: Date;
  currentPrice: number | null;
  unrealizedPnl: number | null;
  exitPrice: number | null;
  exitTime: Date | null;
  realizedPnl: number | null;
  status: 'OPEN' | 'CLOSED';
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Audit trail of all entry and exit decisions
 */
export interface RefactoredDecisions {
  id: string | null;
  /** Foreign key to refactored_signals.id */
  signalId: string;
  decisionType: 'ENTRY' | 'EXIT';
  decision: 'ENTER' | 'REJECT' | 'EXIT' | 'HOLD';
  confidence: number | null;
  positionSize: number | null;
  reasoning: Record<string, any>;
  calculations: Record<string, any>;
  contextData: Record<string, any> | null;
  gexData: Record<string, any> | null;
  createdAt: Date | null;
}

/**
 * Gamma exposure signals for market analysis
 */
export interface RefactoredGexSignals {
  id: string | null;
  symbol: string;
  timeframe: string;
  strength: number;
  direction: 'CALL' | 'PUT';
  timestamp: Date;
  age: number | null;
  metadata: Record<string, any> | null;
  createdAt: Date | null;
}

/**
 * Market context data snapshots
 */
export interface RefactoredContextSnapshots {
  id: string | null;
  vix: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bias: number;
  regime: 'LOW_VOL' | 'HIGH_VOL' | 'NORMAL';
  timestamp: Date;
  createdAt: Date | null;
}

/**
 * Signal processing pipeline failures
 */
export interface RefactoredPipelineFailures {
  id: string | null;
  trackingId: string;
  /** Foreign key to refactored_signals.id */
  signalId: string | null;
  stage: 'RECEPTION' | 'NORMALIZATION' | 'VALIDATION' | 'DEDUPLICATION' | 'DECISION' | 'EXECUTION';
  reason: string;
  signalData: Record<string, any> | null;
  timestamp: Date;
  createdAt: Date | null;
}

/**
 * System processing errors
 */
export interface RefactoredProcessingErrors {
  id: string | null;
  correlationId: string;
  errorMessage: string;
  errorStack: string | null;
  rawPayload: Record<string, any> | null;
  createdAt: Date | null;
}

// ============================================================================
// SCHEMA SUMMARY
// ============================================================================

// Total tables: 7
// Total enums: 9
// Tables:
//   - refactored_signals (9 columns, 3 indexes)
//   - refactored_positions (15 columns, 3 indexes)
//   - refactored_decisions (11 columns, 4 indexes)
//   - refactored_gex_signals (9 columns, 2 indexes)
//   - refactored_context_snapshots (7 columns, 1 indexes)
//   - refactored_pipeline_failures (8 columns, 3 indexes)
//   - refactored_processing_errors (6 columns, 2 indexes)
