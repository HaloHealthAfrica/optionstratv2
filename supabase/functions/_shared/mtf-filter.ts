// ============================================================================
// MTF FILTER - Multi-Timeframe Alignment Check for Trade Execution
// ============================================================================
// Integrates MTF analysis into the trade execution path
// Supports two modes: STRICT (requires full alignment) and WEIGHTED (flexible)
// ============================================================================

import { 
  analyzeMultiTimeframe, 
  MultiTimeframeAnalysis,
  TradeRecommendation 
} from './multi-timeframe-analysis.ts';

export type MtfMode = 'DISABLED' | 'STRICT' | 'WEIGHTED';

export interface MtfFilterConfig {
  mode: MtfMode;
  lookbackHours: number;
  
  // STRICT mode settings
  strictRequireDaily: boolean;      // Must have daily bias
  strictRequire4H: boolean;         // Must have 4H confirmation
  strictRequireEntry: boolean;      // Must have entry signal
  
  // WEIGHTED mode settings
  weightedMinScore: number;         // Minimum alignment score (0-100)
  weightedMinConfluence: number;    // Minimum confluence count
  weightedAllowWeakSignals: boolean; // Allow WEAK_LONG/WEAK_SHORT
  
  // Position sizing
  applyPositionMultiplier: boolean; // Use MTF position size multiplier
  minPositionMultiplier: number;    // Floor for position multiplier
  maxPositionMultiplier: number;    // Cap for position multiplier
}

export const DEFAULT_MTF_CONFIG: MtfFilterConfig = {
  mode: 'WEIGHTED',
  lookbackHours: 24,
  
  // STRICT mode - requires all timeframes aligned
  strictRequireDaily: true,
  strictRequire4H: true,
  strictRequireEntry: true,
  
  // WEIGHTED mode - more flexible
  weightedMinScore: 50,
  weightedMinConfluence: 2,
  weightedAllowWeakSignals: true,
  
  // Position sizing
  applyPositionMultiplier: true,
  minPositionMultiplier: 0.5,
  maxPositionMultiplier: 2.0,
};

export interface MtfFilterResult {
  approved: boolean;
  reason: string;
  mode: MtfMode;
  analysis: MultiTimeframeAnalysis | null;
  
  // Position adjustment
  originalQuantity: number;
  adjustedQuantity: number;
  positionMultiplier: number;
  
  // For logging/debugging
  timeframeBias: {
    weekly: string;
    daily: string;
    fourHour: string;
    entry: string;
  } | null;
  alignmentScore: number;
  confluenceCount: number;
  recommendation: TradeRecommendation | null;
}

// ============================================================================
// STRICT MODE - Requires full timeframe alignment
// ============================================================================

function evaluateStrictMode(
  analysis: MultiTimeframeAnalysis,
  config: MtfFilterConfig,
  originalQuantity: number
): MtfFilterResult {
  const baseResult: Omit<MtfFilterResult, 'approved' | 'reason' | 'adjustedQuantity' | 'positionMultiplier'> = {
    mode: 'STRICT',
    analysis,
    originalQuantity,
    timeframeBias: {
      weekly: analysis.weeklyBias,
      daily: analysis.dailyBias,
      fourHour: analysis.fourHourBias,
      entry: analysis.entryBias,
    },
    alignmentScore: analysis.alignmentScore,
    confluenceCount: analysis.confluenceCount,
    recommendation: analysis.recommendation,
  };

  // Check required timeframes
  if (config.strictRequireDaily && analysis.dailyBias === 'NEUTRAL') {
    return {
      ...baseResult,
      approved: false,
      reason: 'STRICT_MODE_NO_DAILY_BIAS',
      adjustedQuantity: 0,
      positionMultiplier: 0,
    };
  }

  if (config.strictRequire4H && analysis.fourHourBias === 'NEUTRAL') {
    return {
      ...baseResult,
      approved: false,
      reason: 'STRICT_MODE_NO_4H_CONFIRMATION',
      adjustedQuantity: 0,
      positionMultiplier: 0,
    };
  }

  if (config.strictRequireEntry && analysis.entryBias === 'NEUTRAL') {
    return {
      ...baseResult,
      approved: false,
      reason: 'STRICT_MODE_NO_ENTRY_SIGNAL',
      adjustedQuantity: 0,
      positionMultiplier: 0,
    };
  }

  // Must be fully aligned
  if (!analysis.isAligned) {
    return {
      ...baseResult,
      approved: false,
      reason: `STRICT_MODE_NOT_ALIGNED: ${analysis.reasons.join(', ')}`,
      adjustedQuantity: 0,
      positionMultiplier: 0,
    };
  }

  // Only accept STRONG or normal recommendations
  const allowedRecommendations: TradeRecommendation[] = [
    'STRONG_LONG', 'LONG', 'STRONG_SHORT', 'SHORT'
  ];
  
  if (!allowedRecommendations.includes(analysis.recommendation)) {
    return {
      ...baseResult,
      approved: false,
      reason: `STRICT_MODE_WEAK_RECOMMENDATION: ${analysis.recommendation}`,
      adjustedQuantity: 0,
      positionMultiplier: 0,
    };
  }

  // Calculate position multiplier
  let positionMultiplier = config.applyPositionMultiplier 
    ? analysis.positionSizeMultiplier 
    : 1.0;
  
  positionMultiplier = Math.max(config.minPositionMultiplier, 
    Math.min(config.maxPositionMultiplier, positionMultiplier));

  const adjustedQuantity = Math.max(1, Math.round(originalQuantity * positionMultiplier));

  return {
    ...baseResult,
    approved: true,
    reason: `STRICT_MODE_ALIGNED: ${analysis.recommendation}`,
    adjustedQuantity,
    positionMultiplier,
  };
}

// ============================================================================
// CONFLICT DETECTION - Check for opposing timeframe biases
// ============================================================================

function checkForTimeframeConflict(analysis: MultiTimeframeAnalysis): { conflict: boolean; reason: string } {
  const biases = [
    { name: 'weekly', bias: analysis.weeklyBias },
    { name: 'daily', bias: analysis.dailyBias },
    { name: '4H', bias: analysis.fourHourBias },
    { name: 'entry', bias: analysis.entryBias },
  ].filter(b => b.bias !== 'NEUTRAL');

  if (biases.length < 2) {
    return { conflict: false, reason: '' };
  }

  // Check if any timeframe disagrees with others
  const longBiases = biases.filter(b => b.bias === 'LONG');
  const shortBiases = biases.filter(b => b.bias === 'SHORT');

  if (longBiases.length > 0 && shortBiases.length > 0) {
    const longNames = longBiases.map(b => b.name).join(',');
    const shortNames = shortBiases.map(b => b.name).join(',');
    return {
      conflict: true,
      reason: `LONG(${longNames}) vs SHORT(${shortNames})`,
    };
  }

  return { conflict: false, reason: '' };
}

// ============================================================================
// WEIGHTED MODE - Flexible alignment with position sizing
// ============================================================================

function evaluateWeightedMode(
  analysis: MultiTimeframeAnalysis,
  config: MtfFilterConfig,
  originalQuantity: number
): MtfFilterResult {
  const baseResult: Omit<MtfFilterResult, 'approved' | 'reason' | 'adjustedQuantity' | 'positionMultiplier'> = {
    mode: 'WEIGHTED',
    analysis,
    originalQuantity,
    timeframeBias: {
      weekly: analysis.weeklyBias,
      daily: analysis.dailyBias,
      fourHour: analysis.fourHourBias,
      entry: analysis.entryBias,
    },
    alignmentScore: analysis.alignmentScore,
    confluenceCount: analysis.confluenceCount,
    recommendation: analysis.recommendation,
  };

  // Check for conflicting timeframes (this is a hard reject)
  const hasConflict = checkForTimeframeConflict(analysis);
  if (hasConflict.conflict) {
    return {
      ...baseResult,
      approved: false,
      reason: `WEIGHTED_CONFLICT: ${hasConflict.reason}`,
      adjustedQuantity: 0,
      positionMultiplier: 0,
    };
  }

  // If below minimum thresholds but no conflict, allow with heavily reduced size
  // This allows building up signal history for new tickers
  const belowMinScore = analysis.alignmentScore < config.weightedMinScore;
  const belowMinConfluence = analysis.confluenceCount < config.weightedMinConfluence;
  
  if (belowMinScore || belowMinConfluence) {
    // Calculate a reduced multiplier based on how far below threshold
    let reductionFactor = 0.5;
    
    if (analysis.alignmentScore > 0) {
      // Scale based on actual score vs minimum
      reductionFactor = Math.max(0.25, analysis.alignmentScore / config.weightedMinScore * 0.5);
    } else if (analysis.confluenceCount > 0) {
      // At least one timeframe agrees
      reductionFactor = 0.5;
    } else {
      // No data - use minimum size
      reductionFactor = config.minPositionMultiplier;
    }

    const adjustedQuantity = Math.max(1, Math.round(originalQuantity * reductionFactor));
    
    return {
      ...baseResult,
      approved: true,
      reason: `WEIGHTED_LOW_CONFLUENCE_APPROVED: score=${analysis.alignmentScore.toFixed(1)}%, confluence=${analysis.confluenceCount}, no conflict`,
      adjustedQuantity,
      positionMultiplier: reductionFactor,
    };
  }

  // Check recommendation
  const strongRecommendations: TradeRecommendation[] = [
    'STRONG_LONG', 'LONG', 'STRONG_SHORT', 'SHORT'
  ];
  const weakRecommendations: TradeRecommendation[] = [
    'WEAK_LONG', 'WEAK_SHORT'
  ];

  const isStrong = strongRecommendations.includes(analysis.recommendation);
  const isWeak = weakRecommendations.includes(analysis.recommendation);

  if (analysis.recommendation === 'NO_TRADE' && !config.weightedAllowWeakSignals) {
    return {
      ...baseResult,
      approved: false,
      reason: `WEIGHTED_NO_TRADE_RECOMMENDATION: ${analysis.reasons.join(', ')}`,
      adjustedQuantity: 0,
      positionMultiplier: 0,
    };
  }
  if (isWeak && !config.weightedAllowWeakSignals) {
    return {
      ...baseResult,
      approved: false,
      reason: `WEIGHTED_WEAK_NOT_ALLOWED: ${analysis.recommendation}`,
      adjustedQuantity: 0,
      positionMultiplier: 0,
    };
  }

  // Calculate position multiplier based on alignment strength
  let positionMultiplier = 1.0;

  if (config.applyPositionMultiplier) {
    // Use the MTF-calculated multiplier
    positionMultiplier = analysis.positionSizeMultiplier;

    // Apply weak signal penalty
    if (isWeak) {
      positionMultiplier *= 0.5; // 50% reduction for weak signals
    }

    // Apply alignment score bonus/penalty
    if (analysis.alignmentScore >= 80) {
      positionMultiplier *= 1.2; // +20% for strong alignment
    } else if (analysis.alignmentScore >= 70) {
      positionMultiplier *= 1.1; // +10% for good alignment
    } else if (analysis.alignmentScore < 60) {
      positionMultiplier *= 0.8; // -20% for weak alignment
    }
  }

  // Apply limits
  positionMultiplier = Math.max(config.minPositionMultiplier, 
    Math.min(config.maxPositionMultiplier, positionMultiplier));

  const adjustedQuantity = Math.max(1, Math.round(originalQuantity * positionMultiplier));

  return {
    ...baseResult,
    approved: true,
    reason: `WEIGHTED_APPROVED: ${analysis.recommendation} (${analysis.alignmentScore.toFixed(1)}%, ${analysis.confluenceCount} TF)`,
    adjustedQuantity,
    positionMultiplier,
  };
}

// ============================================================================
// MAIN MTF FILTER FUNCTION
// ============================================================================

export async function evaluateMtfAlignment(
  ticker: string,
  originalQuantity: number,
  config: Partial<MtfFilterConfig> = {}
): Promise<MtfFilterResult> {
  const finalConfig: MtfFilterConfig = { ...DEFAULT_MTF_CONFIG, ...config };

  // If disabled, approve everything
  if (finalConfig.mode === 'DISABLED') {
    return {
      approved: true,
      reason: 'MTF_DISABLED',
      mode: 'DISABLED',
      analysis: null,
      originalQuantity,
      adjustedQuantity: originalQuantity,
      positionMultiplier: 1.0,
      timeframeBias: null,
      alignmentScore: 0,
      confluenceCount: 0,
      recommendation: null,
    };
  }

  try {
    // Run MTF analysis
    const analysis = await analyzeMultiTimeframe(
      ticker,
      finalConfig.lookbackHours
    );

    // Handle no signals case
    if (analysis.allSignals.length === 0) {
      // In STRICT mode, reject. In WEIGHTED mode, allow with reduced size
      if (finalConfig.mode === 'STRICT') {
        return {
          approved: false,
          reason: 'NO_HISTORICAL_SIGNALS',
          mode: 'STRICT',
          analysis,
          originalQuantity,
          adjustedQuantity: 0,
          positionMultiplier: 0,
          timeframeBias: null,
          alignmentScore: 0,
          confluenceCount: 0,
          recommendation: 'NO_TRADE',
        };
      } else {
        // WEIGHTED mode allows trading with minimum size
        return {
          approved: true,
          reason: 'NO_SIGNALS_MINIMUM_SIZE',
          mode: 'WEIGHTED',
          analysis,
          originalQuantity,
          adjustedQuantity: Math.max(1, Math.round(originalQuantity * finalConfig.minPositionMultiplier)),
          positionMultiplier: finalConfig.minPositionMultiplier,
          timeframeBias: null,
          alignmentScore: 0,
          confluenceCount: 0,
          recommendation: 'NO_TRADE',
        };
      }
    }

    // Evaluate based on mode
    if (finalConfig.mode === 'STRICT') {
      return evaluateStrictMode(analysis, finalConfig, originalQuantity);
    } else {
      return evaluateWeightedMode(analysis, finalConfig, originalQuantity);
    }
  } catch (error) {
    console.error('MTF analysis error:', error);
    
    // On error, fail safe based on mode
    if (finalConfig.mode === 'STRICT') {
      return {
        approved: false,
        reason: `MTF_ANALYSIS_ERROR: ${error instanceof Error ? error.message : 'Unknown'}`,
        mode: 'STRICT',
        analysis: null,
        originalQuantity,
        adjustedQuantity: 0,
        positionMultiplier: 0,
        timeframeBias: null,
        alignmentScore: 0,
        confluenceCount: 0,
        recommendation: null,
      };
    } else {
      // WEIGHTED mode - allow with minimum size on error
      return {
        approved: true,
        reason: `MTF_ERROR_FALLBACK: ${error instanceof Error ? error.message : 'Unknown'}`,
        mode: 'WEIGHTED',
        analysis: null,
        originalQuantity,
        adjustedQuantity: Math.max(1, Math.round(originalQuantity * finalConfig.minPositionMultiplier)),
        positionMultiplier: finalConfig.minPositionMultiplier,
        timeframeBias: null,
        alignmentScore: 0,
        confluenceCount: 0,
        recommendation: null,
      };
    }
  }
}

// ============================================================================
// HELPER: Get MTF config from risk_limits table
// ============================================================================

export interface MtfSettings {
  mtf_mode: MtfMode;
  mtf_min_alignment_score: number;
  mtf_min_confluence: number;
  mtf_allow_weak_signals: boolean;
  mtf_apply_position_sizing: boolean;
}

export function parseMtfSettingsFromRiskLimits(riskLimits: Record<string, unknown> | null): Partial<MtfFilterConfig> {
  if (!riskLimits) return {};

  const mtfMode = riskLimits.mtf_mode as string | undefined;
  
  return {
    mode: (mtfMode === 'STRICT' || mtfMode === 'WEIGHTED' || mtfMode === 'DISABLED') 
      ? mtfMode 
      : 'WEIGHTED',
    weightedMinScore: Number(riskLimits.mtf_min_alignment_score) || 50,
    weightedMinConfluence: Number(riskLimits.mtf_min_confluence) || 2,
    weightedAllowWeakSignals: Boolean(riskLimits.mtf_allow_weak_signals ?? true),
    applyPositionMultiplier: Boolean(riskLimits.mtf_apply_position_sizing ?? true),
  };
}
