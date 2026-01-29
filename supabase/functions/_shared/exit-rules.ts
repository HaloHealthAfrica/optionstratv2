/**
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use DecisionOrchestrator.orchestrateExitDecision() from refactored/orchestrator/decision-orchestrator.ts instead.
 * 
 * Automated Exit Rules Engine
 * Evaluates positions against configurable exit criteria
 * 
 * Enhanced with:
 * - ATR-based volatility-adjusted stops
 * - Time-decay urgency scaling
 * - Partial profit taking (25% at T1, 50% at T2, trail rest)
 */

import type { Position } from "./types.ts";
import type { OptionsQuote } from "./market-data/types.ts";
import {
  type EnhancedExitConfig,
  type VolatilityAdjustedLevels,
  type TimeDecayResult,
  DEFAULT_EXIT_CONFIG,
  calculateExitLevels,
  calculateTimeDecayUrgency,
  calculateVolatilityAdjustedStop,
  evaluateEnhancedExit,
} from "./enhanced-exit/index.ts";

export type ExitReason = 
  | 'PROFIT_TARGET'
  | 'STOP_LOSS'
  | 'TRAILING_STOP'
  | 'TIME_DECAY'
  | 'EXPIRATION_APPROACHING'
  | 'DELTA_THRESHOLD'
  | 'IV_CRUSH'
  | 'PARTIAL_T1'
  | 'PARTIAL_T2'
  | 'ATR_STOP'
  | 'TIME_URGENCY'
  | 'MANUAL';

export interface ExitRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number; // Lower = higher priority
}

export interface ExitRuleConfig {
  // Profit/Loss Rules
  profit_target_percent?: number;      // e.g., 50 = exit at 50% profit
  stop_loss_percent?: number;          // e.g., 30 = exit at 30% loss
  trailing_stop_percent?: number;      // e.g., 20 = trail by 20% from high
  
  // Time-based Rules
  min_days_to_expiration?: number;     // e.g., 5 = close if DTE <= 5
  max_days_in_trade?: number;          // e.g., 21 = close after 21 days
  
  // Greeks-based Rules
  delta_exit_threshold?: number;       // e.g., 0.8 = exit if |delta| > 0.8
  theta_decay_threshold?: number;      // e.g., 0.05 = exit if theta > 5% of position value
  
  // Volatility Rules
  iv_crush_threshold?: number;         // e.g., 0.3 = exit if IV drops 30% from entry
  
  // Enhanced Exit (ATR-based)
  use_enhanced_exits?: boolean;        // Enable ATR-based stops and partial exits
  enhanced_config?: EnhancedExitConfig;
  
  // Position-specific overrides
  position_overrides?: Record<string, Partial<ExitRuleConfig>>;
}

export interface ExitEvaluation {
  should_exit: boolean;
  reason: ExitReason | null;
  urgency: 'IMMEDIATE' | 'END_OF_DAY' | 'NEXT_SESSION';
  details: string;
  current_value: number;
  threshold_value: number;
  suggested_order_type: 'MARKET' | 'LIMIT';
  suggested_limit_price?: number;
  exit_quantity?: number;              // For partial exits
  new_stop_loss?: number;              // Updated stop after partial exit
  volatility_levels?: VolatilityAdjustedLevels;
  time_decay?: TimeDecayResult;
}

export interface PositionWithMarketData extends Position {
  market_data?: OptionsQuote;
  entry_iv?: number;           // IV at entry for IV crush detection
  high_water_mark?: number;    // Highest unrealized P&L for trailing stop
  days_in_trade?: number;
  partial_exits_taken?: number; // Number of contracts already exited
  atr?: number;                // ATR for volatility-adjusted stops
  atr_percentile?: number;     // ATR percentile (0-100)
}

/**
 * EXIT RULES - Tuned Based on Trade Performance Analysis
 * 
 * Analysis of 523 trades (96.6% win rate) suggests:
 * - Profit targets can be more aggressive (current 50% works well)
 * - Stop losses need tighter management (reduce losses on the 3.4% losers)
 * - Trailing stops should be enabled to lock in profits
 * - DTE threshold working well at 5 days
 */
const DEFAULT_EXIT_RULES: ExitRuleConfig = {
  profit_target_percent: 50,          // Keep - proven effective
  stop_loss_percent: 75,              // Reduced from 100 - limit max loss earlier
  trailing_stop_percent: 25,          // ENABLED - lock in profits after 25% runup
  min_days_to_expiration: 5,          // Keep - working well
  max_days_in_trade: 14,              // ENABLED - close stale positions after 2 weeks
  delta_exit_threshold: 0.82,         // Reduced from 0.85 - exit deep ITM earlier
  theta_decay_threshold: 0.04,        // Reduced from 0.05 - earlier theta exit
  iv_crush_threshold: 0.20,           // Reduced from 0.25 - exit IV crush earlier
  use_enhanced_exits: true,           // Enable ATR-based exits
  enhanced_config: DEFAULT_EXIT_CONFIG,
};

/**
 * Calculate days to expiration
 */
function calculateDTE(expiration: string): number {
  const expDate = new Date(expiration);
  const now = new Date();
  const diffTime = expDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate days since position was opened
 */
function calculateDaysInTrade(openedAt: string): number {
  const openDate = new Date(openedAt);
  const now = new Date();
  const diffTime = now.getTime() - openDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Evaluate enhanced exits with ATR-based stops and partial profit taking
 */
function evaluateEnhancedExits(
  position: PositionWithMarketData,
  config: ExitRuleConfig
): ExitEvaluation | null {
  if (!config.use_enhanced_exits) return null;
  
  const enhancedConfig = config.enhanced_config ?? DEFAULT_EXIT_CONFIG;
  const dte = calculateDTE(position.expiration);
  
  // Need ATR data for volatility-adjusted exits
  const atr = position.atr ?? 0;
  const atrPercentile = position.atr_percentile ?? 50;
  
  // Skip enhanced exit if no ATR data available
  if (atr === 0) return null;
  
  const enhancedResult = evaluateEnhancedExit(
    {
      entryPrice: position.avg_open_price,
      currentPrice: position.current_price ?? position.avg_open_price,
      quantity: position.quantity,
      partialExitsTaken: position.partial_exits_taken ?? 0,
      highestPriceSinceEntry: position.high_water_mark ?? position.avg_open_price,
      dte,
      unrealizedPnlPercent: position.unrealized_pnl_percent ?? 0,
    },
    { atr, atrPercentile },
    enhancedConfig
  );
  
  if (enhancedResult.action === 'HOLD') return null;
  
  // Map enhanced result to ExitEvaluation
  let reason: ExitReason;
  if (enhancedResult.action === 'CLOSE_PARTIAL') {
    reason = enhancedResult.reason.includes('Target 1') ? 'PARTIAL_T1' : 'PARTIAL_T2';
  } else if (enhancedResult.reason.includes('Stop loss') || enhancedResult.reason.includes('ATR')) {
    reason = 'ATR_STOP';
  } else if (enhancedResult.reason.includes('Trailing')) {
    reason = 'TRAILING_STOP';
  } else if (enhancedResult.timeDecay.urgency === 'CRITICAL') {
    reason = 'TIME_URGENCY';
  } else {
    reason = 'TIME_DECAY';
  }
  
  return {
    should_exit: true,
    reason,
    urgency: enhancedResult.urgency === 'IMMEDIATE' ? 'IMMEDIATE' : 
             enhancedResult.urgency === 'SOON' ? 'END_OF_DAY' : 'NEXT_SESSION',
    details: enhancedResult.reason,
    current_value: position.unrealized_pnl_percent ?? 0,
    threshold_value: enhancedResult.volatilityLevels.stopLossPercent,
    suggested_order_type: enhancedResult.urgency === 'IMMEDIATE' ? 'MARKET' : 'LIMIT',
    suggested_limit_price: position.market_data?.bid,
    exit_quantity: enhancedResult.quantity,
    new_stop_loss: enhancedResult.newStopLoss,
    volatility_levels: enhancedResult.volatilityLevels,
    time_decay: enhancedResult.timeDecay,
  };
}

/**
 * Evaluate a single position against all exit rules
 */
export function evaluateExitRules(
  position: PositionWithMarketData,
  config: ExitRuleConfig = DEFAULT_EXIT_RULES
): ExitEvaluation {
  // Merge position-specific overrides
  const positionConfig = {
    ...config,
    ...(config.position_overrides?.[position.id] || {}),
  };

  const evaluations: ExitEvaluation[] = [];

  // 0. Enhanced ATR-based exits (highest priority when enabled)
  const enhancedEval = evaluateEnhancedExits(position, positionConfig);
  if (enhancedEval) {
    evaluations.push(enhancedEval);
  }

  // 1. Profit Target Check
  if (positionConfig.profit_target_percent !== undefined && position.unrealized_pnl_percent !== null) {
    if (position.unrealized_pnl_percent >= positionConfig.profit_target_percent) {
      evaluations.push({
        should_exit: true,
        reason: 'PROFIT_TARGET',
        urgency: 'IMMEDIATE',
        details: `Profit target reached: ${position.unrealized_pnl_percent.toFixed(1)}% >= ${positionConfig.profit_target_percent}%`,
        current_value: position.unrealized_pnl_percent,
        threshold_value: positionConfig.profit_target_percent,
        suggested_order_type: 'LIMIT',
        suggested_limit_price: position.market_data?.bid,
      });
    }
  }

  // 2. Stop Loss Check
  if (positionConfig.stop_loss_percent !== undefined && position.unrealized_pnl_percent !== null) {
    if (position.unrealized_pnl_percent <= -positionConfig.stop_loss_percent) {
      evaluations.push({
        should_exit: true,
        reason: 'STOP_LOSS',
        urgency: 'IMMEDIATE',
        details: `Stop loss triggered: ${position.unrealized_pnl_percent.toFixed(1)}% <= -${positionConfig.stop_loss_percent}%`,
        current_value: position.unrealized_pnl_percent,
        threshold_value: -positionConfig.stop_loss_percent,
        suggested_order_type: 'MARKET', // Urgent exit
      });
    }
  }

  // 3. Trailing Stop Check
  if (positionConfig.trailing_stop_percent !== undefined && 
      position.high_water_mark !== undefined && 
      position.unrealized_pnl !== null) {
    const drawdown = position.high_water_mark - position.unrealized_pnl;
    const drawdownPercent = (drawdown / Math.abs(position.total_cost)) * 100;
    
    if (drawdownPercent >= positionConfig.trailing_stop_percent && position.high_water_mark > 0) {
      evaluations.push({
        should_exit: true,
        reason: 'TRAILING_STOP',
        urgency: 'IMMEDIATE',
        details: `Trailing stop triggered: ${drawdownPercent.toFixed(1)}% drawdown from high`,
        current_value: drawdownPercent,
        threshold_value: positionConfig.trailing_stop_percent,
        suggested_order_type: 'MARKET',
      });
    }
  }

  // 4. Time Decay / DTE Check
  if (positionConfig.min_days_to_expiration !== undefined) {
    const dte = calculateDTE(position.expiration);
    if (dte <= positionConfig.min_days_to_expiration) {
      evaluations.push({
        should_exit: true,
        reason: 'EXPIRATION_APPROACHING',
        urgency: dte <= 1 ? 'IMMEDIATE' : 'END_OF_DAY',
        details: `Expiration approaching: ${dte} DTE <= ${positionConfig.min_days_to_expiration} DTE`,
        current_value: dte,
        threshold_value: positionConfig.min_days_to_expiration,
        suggested_order_type: dte <= 1 ? 'MARKET' : 'LIMIT',
        suggested_limit_price: position.market_data?.bid,
      });
    }
  }

  // 5. Max Days in Trade Check
  if (positionConfig.max_days_in_trade !== undefined) {
    const daysInTrade = position.days_in_trade ?? calculateDaysInTrade(position.opened_at);
    if (daysInTrade >= positionConfig.max_days_in_trade) {
      evaluations.push({
        should_exit: true,
        reason: 'TIME_DECAY',
        urgency: 'END_OF_DAY',
        details: `Max hold time reached: ${daysInTrade} days >= ${positionConfig.max_days_in_trade} days`,
        current_value: daysInTrade,
        threshold_value: positionConfig.max_days_in_trade,
        suggested_order_type: 'LIMIT',
        suggested_limit_price: position.market_data?.bid,
      });
    }
  }

  // 6. Delta Threshold Check (deep ITM/OTM)
  if (positionConfig.delta_exit_threshold !== undefined && position.delta !== null) {
    const absDelta = Math.abs(position.delta);
    if (absDelta >= positionConfig.delta_exit_threshold) {
      evaluations.push({
        should_exit: true,
        reason: 'DELTA_THRESHOLD',
        urgency: 'END_OF_DAY',
        details: `Delta threshold breached: |${position.delta.toFixed(3)}| >= ${positionConfig.delta_exit_threshold}`,
        current_value: absDelta,
        threshold_value: positionConfig.delta_exit_threshold,
        suggested_order_type: 'LIMIT',
        suggested_limit_price: position.market_data?.bid,
      });
    }
  }

  // 7. Theta Decay Check (rapid time decay)
  if (positionConfig.theta_decay_threshold !== undefined && 
      position.theta !== null && 
      position.market_value !== null) {
    const thetaPercent = Math.abs(position.theta * position.quantity * 100) / Math.abs(position.market_value);
    if (thetaPercent >= positionConfig.theta_decay_threshold) {
      evaluations.push({
        should_exit: true,
        reason: 'TIME_DECAY',
        urgency: 'END_OF_DAY',
        details: `Theta decay excessive: ${(thetaPercent * 100).toFixed(1)}% daily >= ${(positionConfig.theta_decay_threshold * 100).toFixed(1)}%`,
        current_value: thetaPercent,
        threshold_value: positionConfig.theta_decay_threshold,
        suggested_order_type: 'LIMIT',
        suggested_limit_price: position.market_data?.bid,
      });
    }
  }

  // 8. IV Crush Check
  if (positionConfig.iv_crush_threshold !== undefined && 
      position.entry_iv !== undefined && 
      position.implied_volatility !== null) {
    const ivChange = (position.entry_iv - position.implied_volatility) / position.entry_iv;
    if (ivChange >= positionConfig.iv_crush_threshold) {
      evaluations.push({
        should_exit: true,
        reason: 'IV_CRUSH',
        urgency: 'NEXT_SESSION',
        details: `IV crush detected: ${(ivChange * 100).toFixed(1)}% drop >= ${(positionConfig.iv_crush_threshold * 100).toFixed(1)}%`,
        current_value: ivChange,
        threshold_value: positionConfig.iv_crush_threshold,
        suggested_order_type: 'LIMIT',
        suggested_limit_price: position.market_data?.bid,
      });
    }
  }

  // Return highest priority exit (IMMEDIATE > END_OF_DAY > NEXT_SESSION)
  if (evaluations.length === 0) {
    return {
      should_exit: false,
      reason: null,
      urgency: 'NEXT_SESSION',
      details: 'No exit conditions met',
      current_value: 0,
      threshold_value: 0,
      suggested_order_type: 'LIMIT',
    };
  }

  // Sort by urgency priority
  const urgencyOrder = { 'IMMEDIATE': 0, 'END_OF_DAY': 1, 'NEXT_SESSION': 2 };
  evaluations.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return evaluations[0];
}

/**
 * Evaluate all positions and return those that should be exited
 */
export function evaluateAllPositions(
  positions: PositionWithMarketData[],
  config: ExitRuleConfig = DEFAULT_EXIT_RULES
): { position: PositionWithMarketData; evaluation: ExitEvaluation }[] {
  return positions
    .map(position => ({
      position,
      evaluation: evaluateExitRules(position, config),
    }))
    .filter(({ evaluation }) => evaluation.should_exit);
}

/**
 * Get default exit rule configuration
 */
export function getDefaultExitRules(): ExitRuleConfig {
  return { ...DEFAULT_EXIT_RULES };
}

/**
 * Get volatility-adjusted exit levels for a position
 */
export function getVolatilityAdjustedLevels(
  entryPrice: number,
  atr: number,
  atrPercentile: number,
  config: EnhancedExitConfig = DEFAULT_EXIT_CONFIG
): VolatilityAdjustedLevels {
  return calculateExitLevels(entryPrice, atr, atrPercentile, config);
}

/**
 * Get time decay urgency for a position
 */
export function getTimeDecayUrgency(
  dte: number,
  unrealizedPnlPercent: number,
  config: EnhancedExitConfig = DEFAULT_EXIT_CONFIG
): TimeDecayResult {
  return calculateTimeDecayUrgency(dte, unrealizedPnlPercent, config);
}

// Re-export enhanced exit types and config
export { DEFAULT_EXIT_CONFIG } from "./enhanced-exit/index.ts";
export type { EnhancedExitConfig, VolatilityAdjustedLevels, TimeDecayResult } from "./enhanced-exit/index.ts";
