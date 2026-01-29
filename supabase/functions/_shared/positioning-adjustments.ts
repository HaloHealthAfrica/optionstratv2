/**
 * Positioning-Based Decision Adjustments
 * 
 * Integrates market positioning data (GEX, Max Pain, P/C Ratio) into trading decisions.
 * Uses data from MarketPositioningService to:
 * - Adjust position sizes based on dealer gamma regime
 * - Apply confidence penalties/boosts based on positioning alignment
 * - Reduce size when price is near max pain close to expiration
 */

import type { RiskViolation, OrderSide } from "./types.ts";
import type { MarketPositioningResult } from "./market-data/positioning-types.ts";

export interface PositioningAdjustmentResult {
  quantityMultiplier: number;
  confidenceAdjustment: number;
  violations: RiskViolation[];
  shouldReject: boolean;
  rejectReason?: string;
  adjustmentsApplied: string[];
  strategyHints: StrategyHint[];
}

export interface StrategyHint {
  type: 'FAVOR_REVERSION' | 'FAVOR_BREAKOUT' | 'FAVOR_THETA' | 'WIDER_STOPS' | 'TIGHTER_TARGETS';
  reason: string;
  confidence: number;
}

export interface PositioningAdjustmentConfig {
  // GEX-based adjustments
  short_gamma_size_reduction: number;        // Default 0.75 (25% reduction in short gamma)
  long_gamma_confidence_boost: number;       // Default 0.05 (5% confidence boost)
  short_gamma_confidence_penalty: number;    // Default 0.10 (10% penalty)
  
  // Max Pain adjustments
  max_pain_proximity_threshold_pct: number;  // Default 2.0 (within 2% of max pain)
  max_pain_dte_threshold: number;            // Default 3 (days to expiration)
  max_pain_size_reduction: number;           // Default 0.50 (50% reduction near expiry)
  max_pain_general_penalty: number;          // Default 0.05 (5% confidence penalty)
  
  // P/C Ratio adjustments
  extreme_pc_ratio_high: number;             // Default 1.5 (very bearish sentiment)
  extreme_pc_ratio_low: number;              // Default 0.6 (very bullish sentiment)
  pc_alignment_boost: number;                // Default 0.08 (8% boost when aligned)
  pc_conflict_penalty: number;               // Default 0.12 (12% penalty when conflicting)
  
  // Positioning bias thresholds
  strong_bias_conflict_reject: boolean;      // Default false (reject on STRONG conflicts)
  bias_conflict_size_reduction: number;      // Default 0.60 (40% reduction on conflict)
  bias_alignment_size_boost: number;         // Default 1.20 (20% boost on strong alignment)
  
  // Zero GEX level usage
  use_zero_gex_as_pivot: boolean;            // Default true
  zero_gex_proximity_threshold_pct: number;  // Default 1.0 (within 1%)
}

const DEFAULT_CONFIG: PositioningAdjustmentConfig = {
  short_gamma_size_reduction: 0.75,
  long_gamma_confidence_boost: 0.05,
  short_gamma_confidence_penalty: 0.10,
  
  max_pain_proximity_threshold_pct: 2.0,
  max_pain_dte_threshold: 3,
  max_pain_size_reduction: 0.50,
  max_pain_general_penalty: 0.05,
  
  extreme_pc_ratio_high: 1.5,
  extreme_pc_ratio_low: 0.6,
  pc_alignment_boost: 0.08,
  pc_conflict_penalty: 0.12,
  
  strong_bias_conflict_reject: false,
  bias_conflict_size_reduction: 0.60,
  bias_alignment_size_boost: 1.20,
  
  use_zero_gex_as_pivot: true,
  zero_gex_proximity_threshold_pct: 1.0,
};

/**
 * Determine if a trade direction is bullish
 */
function isBullishTrade(side: OrderSide, optionType: string): boolean {
  return (side === 'BUY_TO_OPEN' && optionType === 'CALL') ||
         (side === 'SELL_TO_OPEN' && optionType === 'PUT');
}

/**
 * Determine if a trade direction is bearish
 */
function isBearishTrade(side: OrderSide, optionType: string): boolean {
  return (side === 'BUY_TO_OPEN' && optionType === 'PUT') ||
         (side === 'SELL_TO_OPEN' && optionType === 'CALL');
}

/**
 * Calculate days to expiration from expiration date string
 */
function calculateDTE(expiration: string): number {
  const expDate = new Date(expiration);
  const now = new Date();
  const diffTime = expDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Apply positioning-based adjustments to a trading decision
 */
export function applyPositioningAdjustments(
  positioning: MarketPositioningResult,
  side: OrderSide,
  optionType: string,
  expiration: string,
  currentPrice: number,
  customConfig?: Partial<PositioningAdjustmentConfig>
): PositioningAdjustmentResult {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  const violations: RiskViolation[] = [];
  const adjustmentsApplied: string[] = [];
  const strategyHints: StrategyHint[] = [];
  
  let quantityMultiplier = 1;
  let confidenceAdjustment = 0;

  const bullish = isBullishTrade(side, optionType);
  const bearish = isBearishTrade(side, optionType);
  const isOpening = side === 'BUY_TO_OPEN' || side === 'SELL_TO_OPEN';
  const dte = calculateDTE(expiration);

  // ========================================================================
  // GEX REGIME ADJUSTMENTS
  // ========================================================================
  
  if (positioning.gamma_exposure) {
    const gex = positioning.gamma_exposure;
    
    if (gex.dealer_position === 'SHORT_GAMMA') {
      // Short gamma = dealers sell into rallies, buy into dips = amplified moves
      quantityMultiplier *= config.short_gamma_size_reduction;
      confidenceAdjustment -= config.short_gamma_confidence_penalty;
      
      violations.push({
        violation_type: 'SHORT_GAMMA_ENVIRONMENT',
        rule_violated: 'gex_regime',
        current_value: gex.net_gex,
        limit_value: 0,
        severity: 'WARNING',
      });
      
      adjustmentsApplied.push(
        `SHORT_GAMMA: ${config.short_gamma_size_reduction}x size, -${config.short_gamma_confidence_penalty * 100}% confidence`
      );
      
      // Strategy hint: favor breakouts, use wider stops
      strategyHints.push({
        type: 'FAVOR_BREAKOUT',
        reason: 'Dealers are short gamma - moves will be amplified',
        confidence: 0.7,
      });
      strategyHints.push({
        type: 'WIDER_STOPS',
        reason: 'Increased volatility expected in short gamma regime',
        confidence: 0.8,
      });
      
    } else if (gex.dealer_position === 'LONG_GAMMA') {
      // Long gamma = dealers buy into rallies, sell into dips = mean reversion
      confidenceAdjustment += config.long_gamma_confidence_boost;
      
      adjustmentsApplied.push(
        `LONG_GAMMA: +${config.long_gamma_confidence_boost * 100}% confidence (volatility suppressed)`
      );
      
      // Strategy hint: favor reversions, tighter targets
      strategyHints.push({
        type: 'FAVOR_REVERSION',
        reason: 'Dealers are long gamma - volatility suppressed, mean reversion likely',
        confidence: 0.75,
      });
      strategyHints.push({
        type: 'TIGHTER_TARGETS',
        reason: 'Reduced volatility in long gamma regime - take profits faster',
        confidence: 0.7,
      });
    }
    
    // Zero GEX level as pivot
    if (config.use_zero_gex_as_pivot && gex.zero_gamma_level && currentPrice > 0) {
      const distanceToZeroGex = Math.abs(currentPrice - gex.zero_gamma_level) / currentPrice * 100;
      
      if (distanceToZeroGex < config.zero_gex_proximity_threshold_pct) {
        violations.push({
          violation_type: 'NEAR_ZERO_GEX',
          rule_violated: 'zero_gex_proximity',
          current_value: distanceToZeroGex,
          limit_value: config.zero_gex_proximity_threshold_pct,
          severity: 'WARNING',
        });
        
        adjustmentsApplied.push(
          `NEAR_ZERO_GEX ($${gex.zero_gamma_level}): volatility flip zone`
        );
      }
    }
  }

  // ========================================================================
  // MAX PAIN PROXIMITY ADJUSTMENTS
  // ========================================================================
  
  if (positioning.max_pain) {
    const maxPain = positioning.max_pain;
    const distancePct = Math.abs(maxPain.distance_percent);
    
    // Near max pain + close to expiration = expect pinning
    if (distancePct < config.max_pain_proximity_threshold_pct) {
      if (dte <= config.max_pain_dte_threshold) {
        // Critical: Near max pain and close to expiry
        quantityMultiplier *= config.max_pain_size_reduction;
        
        violations.push({
          violation_type: 'MAX_PAIN_PINNING',
          rule_violated: 'max_pain_proximity_expiry',
          current_value: distancePct,
          limit_value: config.max_pain_proximity_threshold_pct,
          severity: 'WARNING',
        });
        
        adjustmentsApplied.push(
          `MAX_PAIN_PINNING (${distancePct.toFixed(1)}% away, ${dte} DTE): ${config.max_pain_size_reduction}x size`
        );
        
        // Strategy hint: favor theta decay
        strategyHints.push({
          type: 'FAVOR_THETA',
          reason: `Price near max pain ($${maxPain.max_pain_strike}) with ${dte} DTE - expect pinning`,
          confidence: 0.8,
        });
        
      } else {
        // Near max pain but not close to expiry - smaller penalty
        confidenceAdjustment -= config.max_pain_general_penalty;
        
        adjustmentsApplied.push(
          `NEAR_MAX_PAIN (${distancePct.toFixed(1)}% from $${maxPain.max_pain_strike}): -${config.max_pain_general_penalty * 100}% confidence`
        );
      }
    }
    
    // Check if signal direction aligns with max pain magnet effect
    if (bullish && maxPain.bias === 'BEARISH') {
      // Bullish trade but max pain is pulling price down
      confidenceAdjustment -= 0.05;
      adjustmentsApplied.push('BULLISH_vs_MAX_PAIN_BEARISH: -5% confidence');
    }
    if (bearish && maxPain.bias === 'BULLISH') {
      // Bearish trade but max pain is pulling price up
      confidenceAdjustment -= 0.05;
      adjustmentsApplied.push('BEARISH_vs_MAX_PAIN_BULLISH: -5% confidence');
    }
  }

  // ========================================================================
  // PUT/CALL RATIO ADJUSTMENTS
  // ========================================================================
  
  if (positioning.put_call_ratio) {
    const pcRatio = positioning.put_call_ratio;
    
    // Extreme P/C ratio alignment
    if (bullish && pcRatio.volume_ratio < config.extreme_pc_ratio_low) {
      // Very bullish sentiment + bullish trade = aligned
      confidenceAdjustment += config.pc_alignment_boost;
      adjustmentsApplied.push(
        `PC_RATIO_ALIGNED (${pcRatio.volume_ratio.toFixed(2)} bullish): +${config.pc_alignment_boost * 100}% confidence`
      );
    } else if (bullish && pcRatio.volume_ratio > config.extreme_pc_ratio_high) {
      // Very bearish sentiment + bullish trade = contrarian (risky)
      confidenceAdjustment -= config.pc_conflict_penalty;
      violations.push({
        violation_type: 'PC_RATIO_CONFLICT',
        rule_violated: 'pc_ratio_alignment',
        current_value: pcRatio.volume_ratio,
        limit_value: config.extreme_pc_ratio_high,
        severity: 'WARNING',
      });
      adjustmentsApplied.push(
        `PC_RATIO_CONFLICT (${pcRatio.volume_ratio.toFixed(2)} bearish vs bullish trade): -${config.pc_conflict_penalty * 100}% confidence`
      );
    }
    
    if (bearish && pcRatio.volume_ratio > config.extreme_pc_ratio_high) {
      // Very bearish sentiment + bearish trade = aligned
      confidenceAdjustment += config.pc_alignment_boost;
      adjustmentsApplied.push(
        `PC_RATIO_ALIGNED (${pcRatio.volume_ratio.toFixed(2)} bearish): +${config.pc_alignment_boost * 100}% confidence`
      );
    } else if (bearish && pcRatio.volume_ratio < config.extreme_pc_ratio_low) {
      // Very bullish sentiment + bearish trade = contrarian (risky)
      confidenceAdjustment -= config.pc_conflict_penalty;
      violations.push({
        violation_type: 'PC_RATIO_CONFLICT',
        rule_violated: 'pc_ratio_alignment',
        current_value: pcRatio.volume_ratio,
        limit_value: config.extreme_pc_ratio_low,
        severity: 'WARNING',
      });
      adjustmentsApplied.push(
        `PC_RATIO_CONFLICT (${pcRatio.volume_ratio.toFixed(2)} bullish vs bearish trade): -${config.pc_conflict_penalty * 100}% confidence`
      );
    }
  }

  // ========================================================================
  // COMBINED POSITIONING BIAS
  // ========================================================================
  
  const bias = positioning.positioning_bias;
  const biasConfidence = positioning.confidence;
  
  // Strong bias conflicts
  if (bullish && (bias === 'STRONGLY_BEARISH' || bias === 'BEARISH')) {
    if (config.strong_bias_conflict_reject && bias === 'STRONGLY_BEARISH' && biasConfidence > 70 && isOpening) {
      return {
        quantityMultiplier: 0,
        confidenceAdjustment: 0,
        violations,
        shouldReject: true,
        rejectReason: `Bullish signal conflicts with STRONGLY_BEARISH positioning (${biasConfidence}% confidence)`,
        adjustmentsApplied: ['POSITIONING_CONFLICT: rejected'],
        strategyHints,
      };
    }
    
    quantityMultiplier *= config.bias_conflict_size_reduction;
    violations.push({
      violation_type: 'POSITIONING_CONFLICT',
      rule_violated: 'positioning_bias_alignment',
      current_value: -biasConfidence,
      limit_value: 0,
      severity: bias === 'STRONGLY_BEARISH' ? 'CRITICAL' : 'WARNING',
    });
    adjustmentsApplied.push(
      `BULLISH_vs_${bias}: ${config.bias_conflict_size_reduction}x size`
    );
  }
  
  if (bearish && (bias === 'STRONGLY_BULLISH' || bias === 'BULLISH')) {
    if (config.strong_bias_conflict_reject && bias === 'STRONGLY_BULLISH' && biasConfidence > 70 && isOpening) {
      return {
        quantityMultiplier: 0,
        confidenceAdjustment: 0,
        violations,
        shouldReject: true,
        rejectReason: `Bearish signal conflicts with STRONGLY_BULLISH positioning (${biasConfidence}% confidence)`,
        adjustmentsApplied: ['POSITIONING_CONFLICT: rejected'],
        strategyHints,
      };
    }
    
    quantityMultiplier *= config.bias_conflict_size_reduction;
    violations.push({
      violation_type: 'POSITIONING_CONFLICT',
      rule_violated: 'positioning_bias_alignment',
      current_value: biasConfidence,
      limit_value: 0,
      severity: bias === 'STRONGLY_BULLISH' ? 'CRITICAL' : 'WARNING',
    });
    adjustmentsApplied.push(
      `BEARISH_vs_${bias}: ${config.bias_conflict_size_reduction}x size`
    );
  }
  
  // Strong alignment boosts
  if (bullish && (bias === 'STRONGLY_BULLISH' || bias === 'BULLISH')) {
    if (biasConfidence > 60) {
      quantityMultiplier *= config.bias_alignment_size_boost;
      adjustmentsApplied.push(
        `BULLISH_ALIGNED_${bias} (${biasConfidence}%): ${config.bias_alignment_size_boost}x size`
      );
    }
  }
  
  if (bearish && (bias === 'STRONGLY_BEARISH' || bias === 'BEARISH')) {
    if (biasConfidence > 60) {
      quantityMultiplier *= config.bias_alignment_size_boost;
      adjustmentsApplied.push(
        `BEARISH_ALIGNED_${bias} (${biasConfidence}%): ${config.bias_alignment_size_boost}x size`
      );
    }
  }

  // ========================================================================
  // OPTIONS FLOW INSIGHTS
  // ========================================================================
  
  if (positioning.recent_flow.length > 0) {
    const goldenSweeps = positioning.recent_flow.filter(f => f.is_golden_sweep);
    
    if (goldenSweeps.length >= 3) {
      const bullishSweeps = goldenSweeps.filter(s => s.sentiment === 'BULLISH');
      const bearishSweeps = goldenSweeps.filter(s => s.sentiment === 'BEARISH');
      
      if (bullish && bullishSweeps.length > bearishSweeps.length) {
        confidenceAdjustment += 0.05;
        adjustmentsApplied.push(`GOLDEN_SWEEPS_ALIGNED (${bullishSweeps.length} bullish): +5% confidence`);
      }
      if (bearish && bearishSweeps.length > bullishSweeps.length) {
        confidenceAdjustment += 0.05;
        adjustmentsApplied.push(`GOLDEN_SWEEPS_ALIGNED (${bearishSweeps.length} bearish): +5% confidence`);
      }
    }
  }

  // ========================================================================
  // FINAL RESULT
  // ========================================================================

  return {
    quantityMultiplier: Math.max(0.25, Math.min(2.0, quantityMultiplier)),
    confidenceAdjustment,
    violations,
    shouldReject: false,
    adjustmentsApplied,
    strategyHints,
  };
}

/**
 * Get a quick summary of positioning adjustments for logging
 */
export function summarizePositioningAdjustments(result: PositioningAdjustmentResult): string {
  const parts: string[] = [];
  
  if (result.quantityMultiplier !== 1) {
    parts.push(`qty=${result.quantityMultiplier.toFixed(2)}x`);
  }
  if (result.confidenceAdjustment !== 0) {
    const sign = result.confidenceAdjustment > 0 ? '+' : '';
    parts.push(`conf=${sign}${(result.confidenceAdjustment * 100).toFixed(0)}%`);
  }
  if (result.strategyHints.length > 0) {
    parts.push(`hints=${result.strategyHints.map(h => h.type).join(',')}`);
  }
  
  return parts.length > 0 ? parts.join(' ') : 'no adjustments';
}
