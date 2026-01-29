/**
 * Unified Decision Orchestrator Types
 * 
 * Central type system for the trading decision engine that coordinates
 * signal ingestion, validation, sizing, exits, and observability.
 */

import type { SignalScore, ConfluenceScore, ConflictResolution, Direction } from '../signal-scoring/types.ts';
import type { RegimeStability, MarketRegime, DealerPosition } from '../regime-stability/types.ts';
import type { PositionSizeCalculation, SizeAdjustment } from '../position-sizing/types.ts';
import type { VolatilityAdjustedLevels, TimeDecayResult, EnhancedExitResult } from '../enhanced-exit/types.ts';
import type { GEXSignalBundle, EntryDecision as GEXEntryDecision, HoldDecision, ExitDecision } from '../gex-signals/types.ts';

// =============================================================================
// ORCHESTRATOR CONFIGURATION
// =============================================================================

/**
 * Master configuration for the decision orchestrator
 */
export interface OrchestratorConfig {
  // Entry thresholds
  minConfidenceToExecute: number;       // Minimum 0-100 confidence to execute
  minConfluenceScore: number;           // Minimum weighted confluence score
  
  // Regime stability requirements
  requireStableRegime: boolean;         // Gate entries on regime stability
  regimeFlipCooldownSeconds: number;    // Cooldown after regime flip
  minRegimeConfidence: number;          // Minimum regime confidence (0-1)
  
  // Conflict resolution
  allowConflictOverride: boolean;       // Allow majority/credibility overrides
  minAgreeingSources: number;           // Minimum sources for override
  
  // Position sizing
  enableKellySizing: boolean;           // Use Kelly Criterion
  enableVixScaling: boolean;            // Scale by VIX
  maxRiskPerTradePercent: number;       // Max % of portfolio per trade
  
  // Exit configuration
  enableAtrStops: boolean;              // Use ATR-based stops
  enablePartialExits: boolean;          // Use tiered profit taking
  enableTimeDecayUrgency: boolean;      // Adjust targets by DTE
  
  // Observability
  logAllDecisions: boolean;             // Log every decision
  enableLearning: boolean;              // Update credibility/performance
  
  // Feature flags
  dryRun: boolean;                      // Log but don't execute
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  minConfidenceToExecute: 60,
  minConfluenceScore: 50,
  requireStableRegime: true,
  regimeFlipCooldownSeconds: 900,
  minRegimeConfidence: 0.75,
  allowConflictOverride: true,
  minAgreeingSources: 3,
  enableKellySizing: true,
  enableVixScaling: true,
  maxRiskPerTradePercent: 2,
  enableAtrStops: true,
  enablePartialExits: true,
  enableTimeDecayUrgency: true,
  logAllDecisions: true,
  enableLearning: true,
  dryRun: false,
};

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * TradingView signal input (normalized)
 */
export interface TVSignalInput {
  ticker: string;
  action: 'BUY' | 'SELL' | 'CLOSE';
  underlying: string;
  strike: number;
  expiration: string;
  optionType: 'CALL' | 'PUT';
  quantity: number;
  source: string;
  rawPayload: Record<string, unknown>;
}

/**
 * Market context input
 */
export interface MarketContextInput {
  ticker: string;
  vix: number;
  vixRegime: 'LOW_VOL' | 'NORMAL' | 'HIGH_VOL';
  atr: number;
  atrPercentile: number;
  spyTrend: string;
  marketBias: 'BULLISH' | 'BEARISH' | 'MIXED';
  orBreakout?: 'ABOVE' | 'BELOW' | null;
  isMarketOpen: boolean;
  timestamp: Date | string;
}

/**
 * MTF trend input
 */
export interface MTFTrendInput {
  ticker: string;
  bias: Direction;
  alignmentScore: number;
  confluenceCount: number;
  timeframeBias: Record<string, Direction>;
  recommendation: string;
}

/**
 * Positioning input
 */
export interface PositioningInput {
  ticker: string;
  maxPain: number;
  maxPainDistance: number;
  pcRatio: number;
  pcSentiment: string;
  dealerPosition: DealerPosition;
  confidence: number;
}

/**
 * Complete orchestrator input for entry decisions
 */
export interface OrchestratorEntryInput {
  // Signal
  tvSignal: TVSignalInput;
  
  // Context sources (may be null if not available)
  gexSignals?: GEXSignalBundle | null;
  marketContext?: MarketContextInput | null;
  mtfTrend?: MTFTrendInput | null;
  positioning?: PositioningInput | null;
  
  // Portfolio state
  portfolioValue: number;
  openPositionsCount: number;
  dailyPnl: number;
  
  // Optional overrides
  configOverrides?: Partial<OrchestratorConfig>;
}

/**
 * Input for hold decision evaluation
 */
export interface OrchestratorHoldInput {
  position: {
    id: string;
    symbol: string;
    ticker: string;
    optionType: 'CALL' | 'PUT';
    entryPrice: number;
    currentPrice: number;
    quantity: number;
    partialExitsTaken: number;
    highestPriceSinceEntry: number;
    dte: number;
    hoursInTrade: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
    entryMarketRegime?: MarketRegime;
    entryDealerPosition?: DealerPosition;
    plannedStopLoss?: number;
    plannedTarget1?: number;
    plannedTarget2?: number;
    trailingStopPct?: number;
  };
  
  gexSignals: GEXSignalBundle;
  marketContext?: MarketContextInput | null;
  
  configOverrides?: Partial<OrchestratorConfig>;
}

/**
 * Input for exit decision evaluation
 */
export interface OrchestratorExitInput {
  position: {
    id: string;
    symbol: string;
    ticker: string;
    optionType: 'CALL' | 'PUT';
    entryPrice: number;
    currentPrice: number;
    quantity: number;
    partialExitsTaken: number;
    highestPriceSinceEntry: number;
    dte: number;
    hoursInTrade: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
    entryMarketRegime?: MarketRegime;
    plannedStopLoss: number;
    plannedTarget1: number;
    plannedTarget2: number;
    trailingStopPct: number;
    partialExitDone: boolean;
  };
  
  gexSignals: GEXSignalBundle;
  volatility: {
    atr: number;
    atrPercentile: number;
  };
  greeks?: {
    delta?: number;
    theta?: number;
    thetaDecayPct?: number;
  };
  
  configOverrides?: Partial<OrchestratorConfig>;
}

// =============================================================================
// RULE TRIGGER TYPES
// =============================================================================

/**
 * Individual rule that was evaluated
 */
export interface RuleTrigger {
  ruleId: string;
  category: 'ENTRY' | 'EXIT' | 'SIZING' | 'CONFLICT' | 'REGIME' | 'RISK';
  condition: string;
  fired: boolean;
  impact: number;  // Confidence adjustment (-100 to +100)
  details?: string;
}

// =============================================================================
// OUTPUT TYPES
// =============================================================================

/**
 * Exit plan generated for new positions
 */
export interface ExitPlan {
  stopLoss: number;
  stopLossPercent: number;
  target1: number;
  target1Percent: number;
  target1ExitQuantity: number;
  target2: number;
  target2Percent: number;
  target2ExitQuantity: number;
  trailingStopPercent: number;
  maxHoldHours: number;
  reasoning: string;
}

/**
 * Confidence breakdown for transparency
 */
export interface ConfidenceBreakdown {
  baseConfidence: number;
  confluenceImpact: number;
  regimeImpact: number;
  conflictImpact: number;
  positioningImpact: number;
  contextImpact: number;
  mtfImpact: number;
  finalConfidence: number;
  clampedConfidence: number;
}

/**
 * Complete integrated entry decision
 */
export interface IntegratedEntryDecision {
  // Core decision
  action: 'EXECUTE' | 'REJECT';
  confidence: number;
  
  // Quantity
  baseQuantity: number;
  adjustedQuantity: number;
  
  // Exit plan (only if EXECUTE)
  exitPlan?: ExitPlan;
  
  // Alignment analysis
  gexAlignment: 'ALIGNED' | 'NEUTRAL' | 'CONFLICTING';
  regimeAlignment: 'ALIGNED' | 'NEUTRAL' | 'CONFLICTING';
  
  // Sub-decisions
  signalScores: SignalScore[];
  confluenceScore: ConfluenceScore;
  regimeStability: RegimeStability | null;
  conflictResolution: ConflictResolution;
  positionSizing: PositionSizeCalculation;
  
  // Confidence breakdown
  confidenceBreakdown: ConfidenceBreakdown;
  
  // Rules that fired
  rulesTriggered: RuleTrigger[];
  
  // Rejection details (if REJECT)
  rejectionReason?: string;
  rejectionDetails?: string;
  recommendations?: string[];
  
  // Metadata
  decisionId: string;
  timestamp: string;
  durationMs: number;
}

/**
 * Integrated hold decision
 */
export interface IntegratedHoldDecision {
  action: 'HOLD' | 'EXIT' | 'PARTIAL_EXIT' | 'TIGHTEN_STOP';
  confidence: number;
  
  // For partial exit
  exitQuantityPct?: number;
  exitQuantity?: number;
  
  // For tighten stop
  newStopLoss?: number;
  
  // Warnings
  warnings: {
    type: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    message: string;
  }[];
  
  // Regime analysis
  regimeChanged: boolean;
  previousRegime?: MarketRegime;
  currentRegime: MarketRegime;
  regimeChangeImpact: 'FAVORABLE' | 'NEUTRAL' | 'UNFAVORABLE';
  
  // Rules triggered
  rulesTriggered: RuleTrigger[];
  
  // Decision details
  reason: string;
  details: string;
  
  // Metadata
  decisionId: string;
  timestamp: string;
}

/**
 * Integrated exit decision
 */
export interface IntegratedExitDecision {
  action: 'CLOSE_FULL' | 'CLOSE_PARTIAL' | 'HOLD';
  urgency: 'IMMEDIATE' | 'SOON' | 'OPTIONAL';
  
  // Exit details
  trigger: string | null;
  exitQuantity: number;
  
  // P&L
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  
  // Enhanced exit analysis
  volatilityLevels?: VolatilityAdjustedLevels;
  timeDecay?: TimeDecayResult;
  
  // New stop if not exiting
  newStopLoss?: number;
  
  // Rules triggered
  rulesTriggered: RuleTrigger[];
  
  // Decision details
  reason: string;
  details: string;
  
  // Metadata
  decisionId: string;
  timestamp: string;
}

// =============================================================================
// CONTEXT SNAPSHOT FOR OBSERVABILITY
// =============================================================================

/**
 * Complete context snapshot for decision logging
 */
export interface DecisionContextSnapshot {
  // Input data
  tvSignal?: TVSignalInput;
  gexSignals?: GEXSignalBundle | null;
  marketContext?: MarketContextInput | null;
  mtfTrend?: MTFTrendInput | null;
  positioning?: PositioningInput | null;
  
  // Calculated scores
  signalScores?: SignalScore[];
  confluenceScore?: ConfluenceScore;
  conflictResolution?: ConflictResolution;
  regimeStability?: RegimeStability | null;
  positionSizing?: PositionSizeCalculation;
  
  // Exit planning
  exitPlan?: ExitPlan;
  enhancedExit?: EnhancedExitResult;
  
  // Portfolio state
  portfolioValue?: number;
  openPositionsCount?: number;
  
  // Config used
  config?: OrchestratorConfig;
}

/**
 * Decision log entry for persistence
 */
export interface OrchestratorDecisionLog {
  decisionType: 'ENTRY' | 'HOLD' | 'EXIT';
  ticker: string;
  action: string;
  actionReason: string;
  confidence: number;
  quantity?: number;
  price?: number;
  
  // Full context for replay
  contextSnapshot: DecisionContextSnapshot;
  
  // Rules
  rulesTriggered: RuleTrigger[];
}
