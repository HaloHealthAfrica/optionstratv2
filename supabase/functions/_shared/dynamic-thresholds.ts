/**
 * Dynamic Thresholds - Adaptive Signal Filtering
 * 
 * Adjusts score thresholds based on:
 * - MTF alignment strength
 * - Cross-signal confluence
 * - Market conditions
 * - Time of day
 */

import type { MtfFilterResult } from "./mtf-filter.ts";
import type { ConfluenceResult } from "./confluence-engine.ts";
import type { MarketFilterResult, MarketSession } from "./market-filters.ts";
import { getCurrentMarketSession } from "./market-filters.ts";

export interface DynamicThresholdConfig {
  // Base threshold (normal conditions)
  baseScoreThreshold: number;
  
  // MTF alignment adjustments
  mtfAlignedReduction: number;      // Reduce threshold when MTF aligned
  mtfConflictIncrease: number;      // Increase threshold when MTF conflicting
  mtfStrongAlignmentReduction: number; // Extra reduction for 80%+ alignment
  
  // Confluence adjustments
  highConfluenceReduction: number;  // Reduce when 3+ sources agree
  conflictIncrease: number;         // Increase when sources conflict
  
  // Time-of-day adjustments
  openingIncrease: number;          // Increase during volatile open
  middayReduction: number;          // Reduce during quiet midday
  powerHourReduction: number;       // Reduce during power hour
  
  // Market condition adjustments
  highVixIncrease: number;          // Increase when VIX is elevated
  lowVixReduction: number;          // Reduce when VIX is low
  
  // Absolute limits
  minThreshold: number;
  maxThreshold: number;
}

/**
 * DYNAMIC THRESHOLD CONFIG - Optimized Based on 3,300+ Signal Analysis
 * 
 * Key findings:
 * - 3m timeframes (46.7%) underperform 15m (51.6%) and 5m (50.7%)
 * - Power hour has 85.7% acceptance rate
 * - Morning session (10-11am) has 93.5% acceptance rate
 * - Pre-market/after-hours signals blocked (good)
 */
export const DEFAULT_DYNAMIC_THRESHOLD_CONFIG: DynamicThresholdConfig = {
  baseScoreThreshold: 65,
  
  mtfAlignedReduction: 12,
  mtfConflictIncrease: 18,
  mtfStrongAlignmentReduction: 20,
  
  highConfluenceReduction: 18,
  conflictIncrease: 25,
  
  openingIncrease: 12,
  middayReduction: 8,
  powerHourReduction: 15,
  
  highVixIncrease: 12,
  lowVixReduction: 8,
  
  minThreshold: 35,
  maxThreshold: 85,
};

// Timeframe-specific threshold adjustments
// 3m signals require higher confluence to filter noise
export const TIMEFRAME_THRESHOLD_ADJUSTMENTS: Record<string, number> = {
  '3': 10,    // 3m signals: INCREASE threshold by 10 (filter noise)
  '5': 0,     // 5m signals: no adjustment
  '15': -5,   // 15m signals: DECREASE threshold (higher quality)
  '30': -3,   // 30m signals: slight decrease
  '60': -5,   // 60m signals: decrease
  '240': -8,  // 4h signals: decrease more (reliable)
  '1D': -10,  // Daily signals: most reliable
};

export interface ThresholdAdjustment {
  source: string;
  adjustment: number;
  reason: string;
}

export interface DynamicThresholdResult {
  finalThreshold: number;
  baseThreshold: number;
  adjustments: ThresholdAdjustment[];
  totalAdjustment: number;
  confidence: number; // 0-100 confidence in the adjusted threshold
  recommendation: 'STRONG' | 'NORMAL' | 'CAUTIOUS' | 'AVOID';
}

/**
 * Calculate dynamic threshold based on all available context
 * @param timeframe - Optional timeframe string (e.g., "3", "5", "15") for timeframe-specific adjustments
 */
export function calculateDynamicThreshold(
  mtfResult: MtfFilterResult | null,
  confluenceResult: ConfluenceResult | null,
  marketResult: MarketFilterResult | null,
  config: Partial<DynamicThresholdConfig> = {},
  timeframe?: string
): DynamicThresholdResult {
  const cfg = { ...DEFAULT_DYNAMIC_THRESHOLD_CONFIG, ...config };
  const adjustments: ThresholdAdjustment[] = [];
  let totalAdjustment = 0;
  
  // Start with base threshold
  let threshold = cfg.baseScoreThreshold;
  
  // 0. Timeframe-specific adjustments (BEFORE other adjustments)
  // 3m signals are noisier and require higher confluence
  if (timeframe) {
    const tfKey = timeframe.replace('m', '').replace('min', '');
    const tfAdjustment = TIMEFRAME_THRESHOLD_ADJUSTMENTS[tfKey];
    if (tfAdjustment !== undefined) {
      adjustments.push({
        source: 'Timeframe Adjustment',
        adjustment: tfAdjustment,
        reason: `${timeframe} timeframe quality factor`,
      });
      totalAdjustment += tfAdjustment;
    }
  }
  
  // 1. MTF Alignment adjustments
  if (mtfResult) {
    if (mtfResult.approved && mtfResult.alignmentScore >= 80) {
      // Strong MTF alignment - lower threshold significantly
      const adj = -cfg.mtfStrongAlignmentReduction;
      adjustments.push({
        source: 'MTF Strong Alignment',
        adjustment: adj,
        reason: `${mtfResult.alignmentScore.toFixed(0)}% alignment score`,
      });
      totalAdjustment += adj;
    } else if (mtfResult.approved && mtfResult.alignmentScore >= 60) {
      // Good MTF alignment - lower threshold moderately
      const adj = -cfg.mtfAlignedReduction;
      adjustments.push({
        source: 'MTF Alignment',
        adjustment: adj,
        reason: `${mtfResult.alignmentScore.toFixed(0)}% alignment score`,
      });
      totalAdjustment += adj;
    } else if (!mtfResult.approved) {
      // MTF conflict - raise threshold
      const adj = cfg.mtfConflictIncrease;
      adjustments.push({
        source: 'MTF Conflict',
        adjustment: adj,
        reason: mtfResult.reason,
      });
      totalAdjustment += adj;
    }
    
    // Confluence count bonus
    if (mtfResult.confluenceCount >= 4) {
      const adj = -5;
      adjustments.push({
        source: 'High Confluence Count',
        adjustment: adj,
        reason: `${mtfResult.confluenceCount} timeframes agree`,
      });
      totalAdjustment += adj;
    }
  }
  
  // 2. Cross-signal confluence adjustments
  if (confluenceResult) {
    if (confluenceResult.approved && confluenceResult.agreeingSources.length >= 3) {
      // High confluence - lower threshold
      const adj = -cfg.highConfluenceReduction;
      adjustments.push({
        source: 'Cross-Signal Confluence',
        adjustment: adj,
        reason: `${confluenceResult.agreeingSources.length} sources agree: ${confluenceResult.agreeingSources.join(', ')}`,
      });
      totalAdjustment += adj;
    } else if (confluenceResult.conflictingSources.length > 0) {
      // Signal conflict - raise threshold
      const adj = cfg.conflictIncrease;
      adjustments.push({
        source: 'Signal Conflict',
        adjustment: adj,
        reason: `${confluenceResult.conflictingSources.length} sources conflict`,
      });
      totalAdjustment += adj;
    }
    
    // Primary source bonus
    if (confluenceResult.primarySourcesAgree) {
      const adj = -5;
      adjustments.push({
        source: 'Primary Source Agreement',
        adjustment: adj,
        reason: 'High-weight indicators agree',
      });
      totalAdjustment += adj;
    }
  }
  
  // 3. Time-of-day adjustments
  const session = getCurrentMarketSession();
  switch (session) {
    case 'OPENING':
      adjustments.push({
        source: 'Market Opening',
        adjustment: cfg.openingIncrease,
        reason: 'Volatile opening period',
      });
      totalAdjustment += cfg.openingIncrease;
      break;
    case 'MIDDAY':
      adjustments.push({
        source: 'Midday Session',
        adjustment: -cfg.middayReduction,
        reason: 'Lower volatility midday',
      });
      totalAdjustment -= cfg.middayReduction;
      break;
    case 'POWER_HOUR':
      adjustments.push({
        source: 'Power Hour',
        adjustment: -cfg.powerHourReduction,
        reason: 'High-probability power hour',
      });
      totalAdjustment -= cfg.powerHourReduction;
      break;
    case 'CLOSING':
      adjustments.push({
        source: 'Market Closing',
        adjustment: cfg.openingIncrease,
        reason: 'Volatile closing period',
      });
      totalAdjustment += cfg.openingIncrease;
      break;
  }
  
  // 4. Market condition adjustments
  if (marketResult?.marketData?.vix) {
    const vix = marketResult.marketData.vix;
    if (vix > 25) {
      adjustments.push({
        source: 'High VIX',
        adjustment: cfg.highVixIncrease,
        reason: `VIX at ${vix.toFixed(1)}`,
      });
      totalAdjustment += cfg.highVixIncrease;
    } else if (vix < 15) {
      adjustments.push({
        source: 'Low VIX',
        adjustment: -cfg.lowVixReduction,
        reason: `VIX at ${vix.toFixed(1)}`,
      });
      totalAdjustment -= cfg.lowVixReduction;
    }
  }
  
  // Apply adjustments with limits
  threshold += totalAdjustment;
  threshold = Math.max(cfg.minThreshold, Math.min(cfg.maxThreshold, threshold));
  
  // Calculate confidence based on consistency of signals
  let confidence = 50; // Base confidence
  if (mtfResult?.approved) confidence += 15;
  if (confluenceResult?.approved) confidence += 20;
  if (marketResult?.approved) confidence += 15;
  if (confluenceResult?.conflictingSources?.length === 0) confidence += 10;
  if (mtfResult?.alignmentScore && mtfResult.alignmentScore >= 70) confidence += 10;
  confidence = Math.min(100, confidence);
  
  // Determine recommendation
  let recommendation: DynamicThresholdResult['recommendation'];
  if (threshold <= 50 && confidence >= 80) {
    recommendation = 'STRONG';
  } else if (threshold <= 60 && confidence >= 60) {
    recommendation = 'NORMAL';
  } else if (threshold <= 75) {
    recommendation = 'CAUTIOUS';
  } else {
    recommendation = 'AVOID';
  }
  
  return {
    finalThreshold: Math.round(threshold),
    baseThreshold: cfg.baseScoreThreshold,
    adjustments,
    totalAdjustment,
    confidence,
    recommendation,
  };
}

/**
 * Check if a signal score meets the dynamic threshold
 */
export function meetsThreshold(
  signalScore: number,
  thresholdResult: DynamicThresholdResult
): boolean {
  return signalScore >= thresholdResult.finalThreshold;
}

/**
 * Get position size multiplier based on threshold confidence
 */
export function getPositionMultiplier(
  thresholdResult: DynamicThresholdResult
): number {
  switch (thresholdResult.recommendation) {
    case 'STRONG':
      return 1.5; // Increase position on strong signals
    case 'NORMAL':
      return 1.0;
    case 'CAUTIOUS':
      return 0.5; // Half size on cautious signals
    case 'AVOID':
      return 0.0; // No position
  }
}

/**
 * Format threshold result for logging/display
 */
export function formatThresholdResult(result: DynamicThresholdResult): string {
  const lines = [
    `Threshold: ${result.finalThreshold} (base: ${result.baseThreshold}, adj: ${result.totalAdjustment > 0 ? '+' : ''}${result.totalAdjustment})`,
    `Confidence: ${result.confidence}%`,
    `Recommendation: ${result.recommendation}`,
    'Adjustments:',
    ...result.adjustments.map(a => 
      `  ${a.adjustment > 0 ? '+' : ''}${a.adjustment} ${a.source}: ${a.reason}`
    ),
  ];
  return lines.join('\n');
}
