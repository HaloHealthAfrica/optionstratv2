/**
 * Context-Based Decision Adjustments
 * Applies market context and MTF trend data to enhance trading decisions
 */

import type { 
  RiskViolation, 
  IncomingSignal, 
  OrderSide,
  ContextRiskLimits,
  MTFTrendForDecision,
  ContextSummary,
  MTFSummary,
} from "./types.ts";
import type { MarketContextForDecision } from "./market-context-types.ts";

export interface ContextAdjustmentResult {
  quantityMultiplier: number;
  confidenceAdjustment: number;
  violations: RiskViolation[];
  shouldReject: boolean;
  rejectReason?: string;
  adjustmentsApplied: string[];
}

// Default limits
const DEFAULT_LIMITS: Required<ContextRiskLimits> = {
  max_vix_for_new_positions: 40,
  reduce_size_vix_threshold: 25,
  reduce_size_vix_factor: 0.5,
  allow_first_30min_trades: true,
  first_30min_confidence_penalty: 0.1,
  require_market_open: true,
  require_market_alignment: false,
  market_divergence_penalty: 0.15,
  min_distance_to_resistance_pct: 0.5,
  min_distance_to_support_pct: 0.5,
  require_or_breakout_confirmation: false,
  or_breakout_confidence_boost: 0.1,
  min_mtf_alignment_score: 50,
  min_bullish_timeframes: 4,
  min_bearish_timeframes: 4,
  max_context_age_seconds: 300,
  max_trend_age_seconds: 300,
  stale_data_confidence_penalty: 0.1,
};

/**
 * Determine if signal is bullish based on side and option type
 */
export function isBullishSignal(side: OrderSide, optionType: string): boolean {
  return (side === 'BUY_TO_OPEN' && optionType === 'CALL') ||
         (side === 'SELL_TO_OPEN' && optionType === 'PUT');
}

/**
 * Determine if signal is bearish based on side and option type
 */
export function isBearishSignal(side: OrderSide, optionType: string): boolean {
  return (side === 'BUY_TO_OPEN' && optionType === 'PUT') ||
         (side === 'SELL_TO_OPEN' && optionType === 'CALL');
}

/**
 * Apply context-based adjustments to a trading decision
 */
export function applyContextAdjustments(
  signal: IncomingSignal,
  side: OrderSide,
  context: MarketContextForDecision | null,
  trend: MTFTrendForDecision | null,
  customLimits?: ContextRiskLimits
): ContextAdjustmentResult {
  const limits = { ...DEFAULT_LIMITS, ...customLimits };
  const violations: RiskViolation[] = [];
  const adjustmentsApplied: string[] = [];
  
  let quantityMultiplier = 1;
  let confidenceAdjustment = 0;

  const isOpening = side === 'BUY_TO_OPEN' || side === 'SELL_TO_OPEN';
  const bullish = isBullishSignal(side, signal.option_type);
  const bearish = isBearishSignal(side, signal.option_type);

  // ========================================================================
  // NO CONTEXT AVAILABLE
  // ========================================================================
  
  if (!context) {
    violations.push({
      violation_type: 'NO_CONTEXT',
      rule_violated: 'market_context_available',
      current_value: 0,
      limit_value: 1,
      severity: 'WARNING',
    });
    adjustmentsApplied.push('NO_CONTEXT: -5% confidence');
    confidenceAdjustment -= 0.05;
    
    // Still apply trend adjustments if available
    if (trend) {
      const trendResult = applyTrendAdjustments(trend, bullish, bearish, limits);
      violations.push(...trendResult.violations);
      adjustmentsApplied.push(...trendResult.adjustmentsApplied);
      quantityMultiplier *= trendResult.quantityMultiplier;
      confidenceAdjustment += trendResult.confidenceAdjustment;
      
      if (trendResult.shouldReject) {
        return {
          quantityMultiplier,
          confidenceAdjustment,
          violations,
          shouldReject: true,
          rejectReason: trendResult.rejectReason,
          adjustmentsApplied,
        };
      }
    }
    
    return {
      quantityMultiplier: Math.max(0.25, quantityMultiplier),
      confidenceAdjustment,
      violations,
      shouldReject: false,
      adjustmentsApplied,
    };
  }

  // ========================================================================
  // SESSION CHECKS (CRITICAL)
  // ========================================================================
  
  // Market closed: Reject
  if (limits.require_market_open && !context.session.isMarketOpen) {
    return {
      quantityMultiplier: 0,
      confidenceAdjustment: 0,
      violations,
      shouldReject: true,
      rejectReason: 'Market is closed',
      adjustmentsApplied: ['MARKET_CLOSED: rejected'],
    };
  }

  // First 30 minutes caution
  if (context.session.isFirst30Min) {
    if (!limits.allow_first_30min_trades && isOpening) {
      return {
        quantityMultiplier: 0,
        confidenceAdjustment: 0,
        violations,
        shouldReject: true,
        rejectReason: 'Trading in first 30 minutes is disabled',
        adjustmentsApplied: ['FIRST_30MIN: rejected'],
      };
    }
    
    violations.push({
      violation_type: 'EARLY_SESSION',
      rule_violated: 'first_30min_caution',
      current_value: 1,
      limit_value: 0,
      severity: 'WARNING',
    });
    confidenceAdjustment -= limits.first_30min_confidence_penalty;
    adjustmentsApplied.push(`FIRST_30MIN: -${limits.first_30min_confidence_penalty * 100}% confidence`);
  }

  // ========================================================================
  // STALENESS CHECK
  // ========================================================================
  
  if (context.isStale) {
    const staleMinutes = Math.round((Date.now() - context.updatedAt.getTime()) / 1000 / 60);
    violations.push({
      violation_type: 'STALE_CONTEXT',
      rule_violated: 'context_freshness',
      current_value: staleMinutes * 60,
      limit_value: limits.max_context_age_seconds,
      severity: 'WARNING',
    });
    confidenceAdjustment -= limits.stale_data_confidence_penalty;
    adjustmentsApplied.push(`STALE_CONTEXT (${staleMinutes}m): -${limits.stale_data_confidence_penalty * 100}% confidence`);
  }

  // ========================================================================
  // VIX REGIME CHECKS
  // ========================================================================
  
  // VIX too high for new positions
  if (isOpening && limits.max_vix_for_new_positions && context.volatility.vix > limits.max_vix_for_new_positions) {
    return {
      quantityMultiplier: 0,
      confidenceAdjustment: 0,
      violations,
      shouldReject: true,
      rejectReason: `VIX (${context.volatility.vix.toFixed(1)}) exceeds maximum (${limits.max_vix_for_new_positions}) for new positions`,
      adjustmentsApplied: [`VIX_TOO_HIGH: rejected (${context.volatility.vix.toFixed(1)} > ${limits.max_vix_for_new_positions})`],
    };
  }

  // High VIX regime: Reduce position size
  if (context.volatility.vixRegime === 'HIGH_VOL') {
    quantityMultiplier *= limits.reduce_size_vix_factor;
    violations.push({
      violation_type: 'HIGH_VIX',
      rule_violated: 'vix_regime',
      current_value: context.volatility.vix,
      limit_value: limits.reduce_size_vix_threshold,
      severity: 'WARNING',
    });
    confidenceAdjustment -= 0.15;
    adjustmentsApplied.push(`HIGH_VIX (${context.volatility.vix.toFixed(1)}): ${limits.reduce_size_vix_factor}x size, -15% confidence`);
  }

  // VIX rising + buying options: Extra caution
  if (context.volatility.vixTrend === 'RISING' && side === 'BUY_TO_OPEN') {
    confidenceAdjustment -= 0.1;
    adjustmentsApplied.push('VIX_RISING + BUY: -10% confidence');
  }

  // ========================================================================
  // MARKET CORRELATION CHECKS
  // ========================================================================
  
  // Moving against market: Require stronger signal
  if (!context.market.movingWithMarket) {
    violations.push({
      violation_type: 'MARKET_DIVERGENCE',
      rule_violated: 'moving_with_market',
      current_value: 0,
      limit_value: 1,
      severity: 'WARNING',
    });
    confidenceAdjustment -= limits.market_divergence_penalty;
    adjustmentsApplied.push(`MARKET_DIVERGENCE: -${limits.market_divergence_penalty * 100}% confidence`);
  }

  // Signal direction vs market bias
  if (bullish && context.market.marketBias === 'BEARISH') {
    if (limits.require_market_alignment && isOpening) {
      return {
        quantityMultiplier: 0,
        confidenceAdjustment: 0,
        violations,
        shouldReject: true,
        rejectReason: 'Bullish signal conflicts with bearish market bias',
        adjustmentsApplied: ['BULLISH_vs_BEARISH_BIAS: rejected'],
      };
    }
    violations.push({
      violation_type: 'AGAINST_MARKET_BIAS',
      rule_violated: 'market_bias_alignment',
      current_value: -1,
      limit_value: 0,
      severity: 'WARNING',
    });
    confidenceAdjustment -= 0.2;
    adjustmentsApplied.push('BULLISH_vs_BEARISH_BIAS: -20% confidence');
  }
  
  if (bearish && context.market.marketBias === 'BULLISH') {
    if (limits.require_market_alignment && isOpening) {
      return {
        quantityMultiplier: 0,
        confidenceAdjustment: 0,
        violations,
        shouldReject: true,
        rejectReason: 'Bearish signal conflicts with bullish market bias',
        adjustmentsApplied: ['BEARISH_vs_BULLISH_BIAS: rejected'],
      };
    }
    violations.push({
      violation_type: 'AGAINST_MARKET_BIAS',
      rule_violated: 'market_bias_alignment',
      current_value: 1,
      limit_value: 0,
      severity: 'WARNING',
    });
    confidenceAdjustment -= 0.2;
    adjustmentsApplied.push('BEARISH_vs_BULLISH_BIAS: -20% confidence');
  }

  // ========================================================================
  // SUPPORT/RESISTANCE CHECKS
  // ========================================================================
  
  // Buying calls near resistance: Warning
  if (bullish && isOpening && context.levels.distToResistancePct < limits.min_distance_to_resistance_pct) {
    violations.push({
      violation_type: 'NEAR_RESISTANCE',
      rule_violated: 'distance_to_resistance',
      current_value: context.levels.distToResistancePct,
      limit_value: limits.min_distance_to_resistance_pct,
      severity: 'WARNING',
    });
    confidenceAdjustment -= 0.1;
    adjustmentsApplied.push(`NEAR_RESISTANCE (${context.levels.distToResistancePct.toFixed(2)}%): -10% confidence`);
  }

  // Buying puts near support: Warning
  if (bearish && isOpening && context.levels.distToSupportPct < limits.min_distance_to_support_pct) {
    violations.push({
      violation_type: 'NEAR_SUPPORT',
      rule_violated: 'distance_to_support',
      current_value: context.levels.distToSupportPct,
      limit_value: limits.min_distance_to_support_pct,
      severity: 'WARNING',
    });
    confidenceAdjustment -= 0.1;
    adjustmentsApplied.push(`NEAR_SUPPORT (${context.levels.distToSupportPct.toFixed(2)}%): -10% confidence`);
  }

  // ========================================================================
  // OPENING RANGE CHECKS
  // ========================================================================
  
  if (context.levels.orComplete) {
    // OR breakout confirmation boosts confidence
    if (bullish && context.levels.orBreakout === 'ABOVE') {
      confidenceAdjustment += limits.or_breakout_confidence_boost;
      adjustmentsApplied.push(`OR_BREAKOUT_ABOVE + BULLISH: +${limits.or_breakout_confidence_boost * 100}% confidence`);
    }
    if (bearish && context.levels.orBreakout === 'BELOW') {
      confidenceAdjustment += limits.or_breakout_confidence_boost;
      adjustmentsApplied.push(`OR_BREAKOUT_BELOW + BEARISH: +${limits.or_breakout_confidence_boost * 100}% confidence`);
    }
    
    // Trading against OR breakout: Caution
    if (bullish && context.levels.orBreakout === 'BELOW') {
      if (limits.require_or_breakout_confirmation && isOpening) {
        return {
          quantityMultiplier: 0,
          confidenceAdjustment: 0,
          violations,
          shouldReject: true,
          rejectReason: 'Bullish signal conflicts with bearish OR breakout',
          adjustmentsApplied: ['BULLISH_vs_OR_BELOW: rejected'],
        };
      }
      violations.push({
        violation_type: 'AGAINST_OR_BREAKOUT',
        rule_violated: 'or_breakout_alignment',
        current_value: -1,
        limit_value: 0,
        severity: 'WARNING',
      });
      confidenceAdjustment -= 0.15;
      adjustmentsApplied.push('BULLISH_vs_OR_BELOW: -15% confidence');
    }
    if (bearish && context.levels.orBreakout === 'ABOVE') {
      if (limits.require_or_breakout_confirmation && isOpening) {
        return {
          quantityMultiplier: 0,
          confidenceAdjustment: 0,
          violations,
          shouldReject: true,
          rejectReason: 'Bearish signal conflicts with bullish OR breakout',
          adjustmentsApplied: ['BEARISH_vs_OR_ABOVE: rejected'],
        };
      }
      violations.push({
        violation_type: 'AGAINST_OR_BREAKOUT',
        rule_violated: 'or_breakout_alignment',
        current_value: 1,
        limit_value: 0,
        severity: 'WARNING',
      });
      confidenceAdjustment -= 0.15;
      adjustmentsApplied.push('BEARISH_vs_OR_ABOVE: -15% confidence');
    }
  }

  // ========================================================================
  // CANDLE PATTERN CONFIRMATION
  // ========================================================================
  
  // Bullish pattern + bullish signal: Boost
  if (bullish && context.candle.patternBias === 'BULLISH') {
    confidenceAdjustment += 0.05;
    adjustmentsApplied.push(`BULLISH_CANDLE (${context.candle.pattern}): +5% confidence`);
  }
  
  // Bearish pattern + bearish signal: Boost
  if (bearish && context.candle.patternBias === 'BEARISH') {
    confidenceAdjustment += 0.05;
    adjustmentsApplied.push(`BEARISH_CANDLE (${context.candle.pattern}): +5% confidence`);
  }

  // Strong candle quality bonus
  if (context.candle.strength > 75) {
    confidenceAdjustment += 0.03;
    adjustmentsApplied.push(`STRONG_CANDLE (${context.candle.strength}): +3% confidence`);
  }

  // ========================================================================
  // ATR PERCENTILE CHECK
  // ========================================================================
  
  // Very high ATR (volatile): Reduce size
  if (context.volatility.atrPercentile > 80) {
    violations.push({
      violation_type: 'HIGH_VOLATILITY',
      rule_violated: 'atr_percentile',
      current_value: context.volatility.atrPercentile,
      limit_value: 80,
      severity: 'WARNING',
    });
    quantityMultiplier *= 0.75;
    adjustmentsApplied.push(`HIGH_ATR (${context.volatility.atrPercentile}%ile): 0.75x size`);
  }

  // ========================================================================
  // BOLLINGER BAND POSITION
  // ========================================================================
  
  // Buying calls at upper BB: Overbought warning
  if (bullish && isOpening && context.volatility.bbPosition > 90) {
    violations.push({
      violation_type: 'OVERBOUGHT',
      rule_violated: 'bb_position_high',
      current_value: context.volatility.bbPosition,
      limit_value: 90,
      severity: 'WARNING',
    });
    confidenceAdjustment -= 0.1;
    adjustmentsApplied.push(`OVERBOUGHT (BB ${context.volatility.bbPosition}): -10% confidence`);
  }

  // Buying puts at lower BB: Oversold warning
  if (bearish && isOpening && context.volatility.bbPosition < 10) {
    violations.push({
      violation_type: 'OVERSOLD',
      rule_violated: 'bb_position_low',
      current_value: context.volatility.bbPosition,
      limit_value: 10,
      severity: 'WARNING',
    });
    confidenceAdjustment -= 0.1;
    adjustmentsApplied.push(`OVERSOLD (BB ${context.volatility.bbPosition}): -10% confidence`);
  }

  // ========================================================================
  // MTF TREND ADJUSTMENTS
  // ========================================================================
  
  if (trend) {
    const trendResult = applyTrendAdjustments(trend, bullish, bearish, limits);
    violations.push(...trendResult.violations);
    adjustmentsApplied.push(...trendResult.adjustmentsApplied);
    quantityMultiplier *= trendResult.quantityMultiplier;
    confidenceAdjustment += trendResult.confidenceAdjustment;
    
    if (trendResult.shouldReject) {
      return {
        quantityMultiplier,
        confidenceAdjustment,
        violations,
        shouldReject: true,
        rejectReason: trendResult.rejectReason,
        adjustmentsApplied,
      };
    }
  }

  // ========================================================================
  // FINAL RESULT
  // ========================================================================

  return {
    quantityMultiplier: Math.max(0.25, quantityMultiplier), // Minimum 25% of original size
    confidenceAdjustment,
    violations,
    shouldReject: false,
    adjustmentsApplied,
  };
}

/**
 * Apply MTF trend-specific adjustments
 */
function applyTrendAdjustments(
  trend: MTFTrendForDecision,
  bullish: boolean,
  bearish: boolean,
  limits: Required<ContextRiskLimits>
): ContextAdjustmentResult {
  const violations: RiskViolation[] = [];
  const adjustmentsApplied: string[] = [];
  let quantityMultiplier = 1;
  let confidenceAdjustment = 0;

  // Staleness check
  if (trend.isStale) {
    const staleMinutes = Math.round((Date.now() - trend.updatedAt.getTime()) / 1000 / 60);
    violations.push({
      violation_type: 'STALE_TREND',
      rule_violated: 'trend_freshness',
      current_value: staleMinutes * 60,
      limit_value: limits.max_trend_age_seconds,
      severity: 'WARNING',
    });
    confidenceAdjustment -= limits.stale_data_confidence_penalty;
    adjustmentsApplied.push(`STALE_TREND (${staleMinutes}m): -${limits.stale_data_confidence_penalty * 100}% confidence`);
  }

  // Check alignment score
  if (trend.alignmentScore < limits.min_mtf_alignment_score) {
    violations.push({
      violation_type: 'LOW_MTF_ALIGNMENT',
      rule_violated: 'mtf_alignment_score',
      current_value: trend.alignmentScore,
      limit_value: limits.min_mtf_alignment_score,
      severity: 'WARNING',
    });
    confidenceAdjustment -= 0.1;
    adjustmentsApplied.push(`LOW_MTF_ALIGNMENT (${trend.alignmentScore}%): -10% confidence`);
  }

  // Bullish signal vs trend bias
  if (bullish) {
    if (trend.bias === 'BEARISH') {
      violations.push({
        violation_type: 'MTF_CONFLICT',
        rule_violated: 'mtf_bias_alignment',
        current_value: -1,
        limit_value: 0,
        severity: 'WARNING',
      });
      confidenceAdjustment -= 0.2;
      quantityMultiplier *= 0.75;
      adjustmentsApplied.push('BULLISH_vs_MTF_BEARISH: -20% confidence, 0.75x size');
    } else if (trend.bias === 'BULLISH') {
      confidenceAdjustment += 0.1;
      adjustmentsApplied.push('BULLISH + MTF_BULLISH: +10% confidence');
    }
    
    // Check bullish timeframe count
    if (trend.bullishCount < limits.min_bullish_timeframes) {
      violations.push({
        violation_type: 'LOW_BULLISH_TF',
        rule_violated: 'min_bullish_timeframes',
        current_value: trend.bullishCount,
        limit_value: limits.min_bullish_timeframes,
        severity: 'WARNING',
      });
      adjustmentsApplied.push(`LOW_BULLISH_TF (${trend.bullishCount}/${limits.min_bullish_timeframes}): warning`);
    }
  }

  // Bearish signal vs trend bias
  if (bearish) {
    if (trend.bias === 'BULLISH') {
      violations.push({
        violation_type: 'MTF_CONFLICT',
        rule_violated: 'mtf_bias_alignment',
        current_value: 1,
        limit_value: 0,
        severity: 'WARNING',
      });
      confidenceAdjustment -= 0.2;
      quantityMultiplier *= 0.75;
      adjustmentsApplied.push('BEARISH_vs_MTF_BULLISH: -20% confidence, 0.75x size');
    } else if (trend.bias === 'BEARISH') {
      confidenceAdjustment += 0.1;
      adjustmentsApplied.push('BEARISH + MTF_BEARISH: +10% confidence');
    }
    
    // Check bearish timeframe count
    if (trend.bearishCount < limits.min_bearish_timeframes) {
      violations.push({
        violation_type: 'LOW_BEARISH_TF',
        rule_violated: 'min_bearish_timeframes',
        current_value: trend.bearishCount,
        limit_value: limits.min_bearish_timeframes,
        severity: 'WARNING',
      });
      adjustmentsApplied.push(`LOW_BEARISH_TF (${trend.bearishCount}/${limits.min_bearish_timeframes}): warning`);
    }
  }

  // Strong alignment bonus
  if (trend.alignmentScore >= 80) {
    confidenceAdjustment += 0.1;
    quantityMultiplier *= 1.25;
    adjustmentsApplied.push(`STRONG_MTF_ALIGNMENT (${trend.alignmentScore}%): +10% confidence, 1.25x size`);
  }

  return {
    quantityMultiplier,
    confidenceAdjustment,
    violations,
    shouldReject: false,
    adjustmentsApplied,
  };
}

/**
 * Build context summary for decision response
 */
export function buildContextSummary(context: MarketContextForDecision | null): ContextSummary | undefined {
  if (!context) return undefined;
  
  const ageSeconds = Math.round((Date.now() - context.updatedAt.getTime()) / 1000);
  
  return {
    vix_regime: context.volatility.vixRegime,
    vix_trend: context.volatility.vixTrend,
    market_bias: context.market.marketBias,
    or_breakout: context.levels.orBreakout,
    moving_with_market: context.market.movingWithMarket,
    spy_trend: context.market.spyTrend,
    candle_pattern: context.candle.pattern,
    is_stale: context.isStale,
    data_age_seconds: ageSeconds,
  };
}

/**
 * Build MTF summary for decision response
 */
export function buildMTFSummary(trend: MTFTrendForDecision | null): MTFSummary | undefined {
  if (!trend) return undefined;
  
  return {
    bias: trend.bias,
    alignment_score: trend.alignmentScore,
    bullish_count: trend.bullishCount,
    bearish_count: trend.bearishCount,
    is_stale: trend.isStale,
  };
}
