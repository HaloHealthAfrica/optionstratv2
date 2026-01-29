/**
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use DecisionOrchestrator.orchestrateExitDecision() from refactored/orchestrator/decision-orchestrator.ts instead.
 * 
 * Enhanced Exit Service
 * 
 * Provides volatility-adjusted stops, time-decay urgency, and partial profit taking
 */

import type {
  EnhancedExitConfig,
  VolatilityAdjustedLevels,
  TimeDecayResult,
  PartialExitPlan,
  EnhancedExitResult,
  PositionForExit,
  VolatilityData,
} from './types.ts';
import { DEFAULT_EXIT_CONFIG } from './types.ts';

/**
 * Calculate volatility-adjusted stop loss based on ATR
 */
export function calculateVolatilityAdjustedStop(
  entryPrice: number,
  atr: number,
  atrPercentile: number,
  config: EnhancedExitConfig = DEFAULT_EXIT_CONFIG
): { stopPrice: number; stopPercent: number; reasoning: string } {
  
  // Base stop distance from ATR
  const stopDistance = atr * config.atrMultiplierForStop;
  let stopPercent = (stopDistance / entryPrice) * 100;
  
  // Adjust based on ATR percentile (higher ATR = wider stops)
  if (atrPercentile > 80) {
    // Very high volatility - widen stop
    stopPercent *= 1.3;
  } else if (atrPercentile > 60) {
    // Above average volatility
    stopPercent *= 1.15;
  } else if (atrPercentile < 20) {
    // Low volatility - can tighten
    stopPercent *= 0.85;
  }
  
  // Clamp to min/max
  stopPercent = Math.max(config.minStopPercent, Math.min(config.maxStopPercent, stopPercent));
  
  const stopPrice = entryPrice * (1 - stopPercent / 100);
  
  return {
    stopPrice,
    stopPercent,
    reasoning: `ATR-based stop: ${stopPercent.toFixed(1)}% (ATR percentile: ${atrPercentile})`,
  };
}

/**
 * Calculate all exit levels based on volatility
 */
export function calculateExitLevels(
  entryPrice: number,
  atr: number,
  atrPercentile: number,
  config: EnhancedExitConfig = DEFAULT_EXIT_CONFIG
): VolatilityAdjustedLevels {
  
  const stop = calculateVolatilityAdjustedStop(entryPrice, atr, atrPercentile, config);
  
  // Scale targets based on stop distance (maintain R:R)
  const baseRR = 2.0; // Target 2:1 reward:risk
  
  const target1Percent = stop.stopPercent * (baseRR * 0.75); // T1 = 1.5R
  const target2Percent = stop.stopPercent * (baseRR * 1.5);  // T2 = 3R
  
  // Adjust targets for volatility
  let adjustedT1 = target1Percent;
  let adjustedT2 = target2Percent;
  
  if (atrPercentile > 80) {
    // High vol = larger moves possible
    adjustedT1 *= 1.2;
    adjustedT2 *= 1.3;
  } else if (atrPercentile < 20) {
    // Low vol = expect smaller moves
    adjustedT1 *= 0.8;
    adjustedT2 *= 0.75;
  }
  
  // Trailing stop widens with volatility
  let trailingPercent = config.trailPercent;
  if (atrPercentile > 70) trailingPercent *= 1.25;
  if (atrPercentile < 30) trailingPercent *= 0.85;
  
  return {
    stopLoss: entryPrice * (1 - stop.stopPercent / 100),
    stopLossPercent: stop.stopPercent,
    target1: entryPrice * (1 + adjustedT1 / 100),
    target1Percent: adjustedT1,
    target2: entryPrice * (1 + adjustedT2 / 100),
    target2Percent: adjustedT2,
    trailingStopPercent: trailingPercent,
    reasoning: stop.reasoning,
  };
}

/**
 * Calculate time-decay urgency factor
 */
export function calculateTimeDecayUrgency(
  dte: number,
  unrealizedPnlPercent: number,
  config: EnhancedExitConfig = DEFAULT_EXIT_CONFIG
): TimeDecayResult {
  
  if (dte > config.urgentDTE) {
    return {
      urgency: 'NONE',
      action: 'Normal management',
      adjustedTargets: { target1Multiplier: 1, target2Multiplier: 1 },
    };
  }
  
  if (dte > config.criticalDTE) {
    // Urgent: Lower targets by 20%
    return {
      urgency: unrealizedPnlPercent < 0 ? 'HIGH' : 'MEDIUM',
      action: unrealizedPnlPercent < 0 
        ? 'Consider closing losing position before theta accelerates'
        : 'Lower profit targets, theta decay accelerating',
      adjustedTargets: { target1Multiplier: 0.8, target2Multiplier: 0.7 },
    };
  }
  
  // Critical: 1 DTE or less
  if (unrealizedPnlPercent > 10) {
    return {
      urgency: 'HIGH',
      action: 'Take profits immediately - expiration risk',
      adjustedTargets: { target1Multiplier: 0.5, target2Multiplier: 0.5 },
    };
  } else if (unrealizedPnlPercent > 0) {
    return {
      urgency: 'CRITICAL',
      action: 'Close position - any profit is good with 1 DTE',
      adjustedTargets: { target1Multiplier: 0.3, target2Multiplier: 0.3 },
    };
  } else {
    return {
      urgency: 'CRITICAL',
      action: 'Close losing position immediately - will likely expire worthless',
      adjustedTargets: { target1Multiplier: 0, target2Multiplier: 0 },
    };
  }
}

/**
 * Calculate partial exit schedule
 */
export function calculatePartialExitPlan(
  originalQuantity: number,
  config: EnhancedExitConfig = DEFAULT_EXIT_CONFIG
): PartialExitPlan {
  
  const t1ExitQty = Math.ceil(originalQuantity * config.target1ExitPercent / 100);
  const t2ExitQty = Math.ceil(originalQuantity * config.target2ExitPercent / 100);
  
  const exits = [
    {
      triggerPercent: config.target1Percent,
      exitPercent: config.target1ExitPercent,
      remainingPercent: 100 - config.target1ExitPercent,
      action: `At +${config.target1Percent}%: Exit ${config.target1ExitPercent}% (${t1ExitQty} contracts)`,
    },
    {
      triggerPercent: config.target2Percent,
      exitPercent: config.target2ExitPercent,
      remainingPercent: 100 - config.target1ExitPercent - config.target2ExitPercent,
      action: `At +${config.target2Percent}%: Exit ${config.target2ExitPercent}% (${t2ExitQty} contracts)`,
    },
  ];
  
  return {
    exits,
    trailingStopForRemainder: config.trailPercent,
  };
}

/**
 * Enhanced exit decision incorporating all improvements
 */
export function evaluateEnhancedExit(
  position: PositionForExit,
  volatility: VolatilityData,
  config: EnhancedExitConfig = DEFAULT_EXIT_CONFIG
): EnhancedExitResult {
  
  // Calculate volatility-adjusted levels
  const levels = calculateExitLevels(
    position.entryPrice,
    volatility.atr,
    volatility.atrPercentile,
    config
  );
  
  // Check time decay urgency
  const timeUrgency = calculateTimeDecayUrgency(
    position.dte,
    position.unrealizedPnlPercent,
    config
  );
  
  // Adjust targets based on time urgency
  const adjustedT1 = levels.target1Percent * timeUrgency.adjustedTargets.target1Multiplier;
  const adjustedT2 = levels.target2Percent * timeUrgency.adjustedTargets.target2Multiplier;
  
  // Calculate remaining quantity
  const remainingQty = position.quantity - position.partialExitsTaken;
  
  // 1. Check stop loss (highest priority)
  if (position.currentPrice <= levels.stopLoss) {
    return {
      action: 'CLOSE_FULL',
      quantity: remainingQty,
      reason: `Stop loss hit at ${levels.stopLossPercent.toFixed(1)}% (ATR-adjusted)`,
      urgency: 'IMMEDIATE',
      volatilityLevels: levels,
      timeDecay: timeUrgency,
    };
  }
  
  // 2. Check critical time urgency (close immediately)
  if (timeUrgency.urgency === 'CRITICAL') {
    return {
      action: 'CLOSE_FULL',
      quantity: remainingQty,
      reason: timeUrgency.action,
      urgency: 'IMMEDIATE',
      volatilityLevels: levels,
      timeDecay: timeUrgency,
    };
  }
  
  // 3. Check trailing stop (for positions that have taken partial exits)
  if (position.partialExitsTaken > 0 && position.highestPriceSinceEntry > position.entryPrice) {
    const trailingStopPrice = position.highestPriceSinceEntry * (1 - levels.trailingStopPercent / 100);
    
    if (position.currentPrice <= trailingStopPrice) {
      return {
        action: 'CLOSE_FULL',
        quantity: remainingQty,
        reason: `Trailing stop hit (${levels.trailingStopPercent.toFixed(1)}% from high of ${position.highestPriceSinceEntry.toFixed(2)})`,
        urgency: 'IMMEDIATE',
        volatilityLevels: levels,
        timeDecay: timeUrgency,
      };
    }
  }
  
  // 4. Check T1 (first partial exit - 25%)
  if (position.unrealizedPnlPercent >= adjustedT1 && position.partialExitsTaken === 0) {
    const exitQty = Math.ceil(position.quantity * config.target1ExitPercent / 100);
    return {
      action: 'CLOSE_PARTIAL',
      quantity: Math.min(exitQty, remainingQty),
      reason: `Target 1 hit (+${adjustedT1.toFixed(1)}%) - taking ${config.target1ExitPercent}% off`,
      urgency: timeUrgency.urgency === 'HIGH' ? 'IMMEDIATE' : 'SOON',
      newStopLoss: position.entryPrice, // Move stop to breakeven
      volatilityLevels: levels,
      timeDecay: timeUrgency,
    };
  }
  
  // 5. Check T2 (second partial exit - 50% of original)
  const t1ExitQty = Math.ceil(position.quantity * config.target1ExitPercent / 100);
  if (position.unrealizedPnlPercent >= adjustedT2 && position.partialExitsTaken >= t1ExitQty) {
    // Exit 2/3 of remainder (which is 50% of original when at T2)
    const exitQty = Math.ceil(remainingQty * 0.67);
    return {
      action: 'CLOSE_PARTIAL',
      quantity: Math.min(exitQty, remainingQty),
      reason: `Target 2 hit (+${adjustedT2.toFixed(1)}%) - taking more off, trailing rest`,
      urgency: 'SOON',
      newStopLoss: position.entryPrice * (1 + adjustedT1 / 100 * 0.5), // Stop at half of T1
      volatilityLevels: levels,
      timeDecay: timeUrgency,
    };
  }
  
  // No exit triggered - HOLD
  return {
    action: 'HOLD',
    quantity: 0,
    reason: `No exit conditions met. P&L: ${position.unrealizedPnlPercent.toFixed(1)}%, DTE: ${position.dte}`,
    urgency: timeUrgency.urgency,
    newStopLoss: levels.stopLoss,
    volatilityLevels: levels,
    timeDecay: timeUrgency,
  };
}

/**
 * Get exit plan summary for a position
 */
export function getExitPlanSummary(
  entryPrice: number,
  quantity: number,
  atr: number,
  atrPercentile: number,
  config: EnhancedExitConfig = DEFAULT_EXIT_CONFIG
): {
  levels: VolatilityAdjustedLevels;
  partialPlan: PartialExitPlan;
  summary: string;
} {
  const levels = calculateExitLevels(entryPrice, atr, atrPercentile, config);
  const partialPlan = calculatePartialExitPlan(quantity, config);
  
  const summary = [
    `Entry: $${entryPrice.toFixed(2)}`,
    `Stop Loss: $${levels.stopLoss.toFixed(2)} (-${levels.stopLossPercent.toFixed(1)}%)`,
    `Target 1: $${levels.target1.toFixed(2)} (+${levels.target1Percent.toFixed(1)}%) → Exit ${config.target1ExitPercent}%`,
    `Target 2: $${levels.target2.toFixed(2)} (+${levels.target2Percent.toFixed(1)}%) → Exit ${config.target2ExitPercent}%`,
    `Trailing Stop: ${levels.trailingStopPercent.toFixed(1)}% for remainder`,
    levels.reasoning,
  ].join(' | ');
  
  return { levels, partialPlan, summary };
}
