/**
 * Signal Scoring Service
 * 
 * Normalizes signals from various sources to unified 0-100 scale with freshness decay.
 */

import type { 
  SignalScore, 
  SignalSource, 
  SignalType, 
  ConfluenceScore,
  DecayConfig,
  Direction,
  DirectionConsensus,
  SignalScoreRow,
  ConfluenceScoreRow,
} from './types.ts';
import { DEFAULT_DECAY_CONFIGS, DEFAULT_SOURCE_WEIGHTS } from './types.ts';

/**
 * Normalize any score to 0-100 scale
 */
export function normalizeScore(
  rawScore: number,
  rawMin: number,
  rawMax: number
): number {
  if (rawMax === rawMin) return 50; // Avoid division by zero
  const normalized = ((rawScore - rawMin) / (rawMax - rawMin)) * 100;
  return Math.max(0, Math.min(100, normalized));
}

/**
 * Calculate decay factor based on signal age
 */
export function calculateDecayFactor(
  ageSeconds: number,
  config: DecayConfig
): number {
  if (ageSeconds >= config.maxAgeSeconds) return 0;
  if (ageSeconds <= 0) return 1;
  
  if (config.decayType === 'EXPONENTIAL') {
    // Exponential decay: factor = 0.5^(age/halfLife)
    return Math.pow(0.5, ageSeconds / config.halfLifeSeconds);
  } else {
    // Linear decay: factor = 1 - (age/maxAge)
    return 1 - (ageSeconds / config.maxAgeSeconds);
  }
}

/**
 * Create a normalized signal score from any source
 */
export function createSignalScore(
  ticker: string,
  source: SignalSource,
  signalType: SignalType,
  rawScore: number,
  rawMin: number,
  rawMax: number,
  direction: Direction,
  signalTimestamp: Date,
  sourceData: unknown
): SignalScore {
  const normalizedScore = normalizeScore(rawScore, rawMin, rawMax);
  const ageSeconds = Math.floor((Date.now() - signalTimestamp.getTime()) / 1000);
  const decayConfig = DEFAULT_DECAY_CONFIGS[source];
  const decayFactor = calculateDecayFactor(ageSeconds, decayConfig);
  
  // Direction strength based on how far from 50 (neutral)
  const directionStrength = Math.abs(normalizedScore - 50) * 2;
  
  return {
    ticker,
    source,
    signalType,
    rawScore,
    rawScaleMin: rawMin,
    rawScaleMax: rawMax,
    normalizedScore,
    direction,
    directionStrength,
    signalTimestamp,
    ageSeconds,
    decayFactor,
    decayedScore: normalizedScore * decayFactor,
    sourceData,
  };
}

/**
 * Normalize TradingView Ultimate Options signal
 */
export function normalizeTVUltimateOptions(signal: Record<string, unknown>): SignalScore {
  const direction: Direction = signal.trend === 'BULLISH' ? 'BULLISH' : 
                    signal.trend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
  
  return createSignalScore(
    signal.ticker as string || 'UNKNOWN',
    'TV_ULTIMATE_OPTIONS',
    'ENTRY',
    (signal.ai_score as number) || (signal.score as number) || 5,
    0,
    10.5,
    direction,
    new Date((signal.timestamp as string) || Date.now()),
    signal
  );
}

/**
 * Normalize TradingView Trend Engine / STRAT Engine signal
 */
export function normalizeTVTrendEngine(signal: Record<string, unknown>): SignalScore {
  const direction: Direction = signal.trend === 'BULLISH' ? 'BULLISH' : 
                    signal.trend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
  
  return createSignalScore(
    signal.ticker as string || 'UNKNOWN',
    'TV_TREND_ENGINE',
    'ENTRY',
    (signal.confidence as number) || 3,
    0,
    6,
    direction,
    new Date((signal.timestamp as string) || Date.now()),
    signal
  );
}

/**
 * Normalize STRAT Engine signal
 */
export function normalizeTVStratEngine(signal: Record<string, unknown>): SignalScore {
  const direction: Direction = signal.trend === 'BULLISH' || signal.direction === 'UP' ? 'BULLISH' : 
                    signal.trend === 'BEARISH' || signal.direction === 'DOWN' ? 'BEARISH' : 'NEUTRAL';
  
  return createSignalScore(
    signal.ticker as string || 'UNKNOWN',
    'TV_STRAT_ENGINE',
    'PATTERN',
    (signal.confidence as number) || 3,
    0,
    6,
    direction,
    new Date((signal.timestamp as string) || Date.now()),
    signal
  );
}

/**
 * Normalize ORB BHCH signal
 */
export function normalizeTVOrbBhch(signal: Record<string, unknown>): SignalScore {
  // Breakout = bullish, breakdown = bearish
  let direction: Direction = 'NEUTRAL';
  if (signal.type === 'BHCH' || signal.breakout === 'ABOVE') direction = 'BULLISH';
  if (signal.type === 'BLCH' || signal.breakout === 'BELOW') direction = 'BEARISH';
  
  return createSignalScore(
    signal.ticker as string || 'UNKNOWN',
    'TV_ORB_BHCH',
    'ENTRY',
    (signal.confidence as number) || 50,
    0,
    100,
    direction,
    new Date((signal.timestamp as string) || Date.now()),
    signal
  );
}

/**
 * Normalize SATY Phase signal
 */
export function normalizeTVSatyPhase(signal: Record<string, unknown>): SignalScore {
  // Phase determines direction
  const phase = signal.phase as string;
  let direction: Direction = 'NEUTRAL';
  if (phase === 'MARKUP' || phase === 'ACCUMULATION') direction = 'BULLISH';
  if (phase === 'MARKDOWN' || phase === 'DISTRIBUTION') direction = 'BEARISH';
  
  return createSignalScore(
    signal.ticker as string || 'UNKNOWN',
    'TV_SATY_PHASE',
    'REGIME',
    (signal.strength as number) || 50,
    0,
    100,
    direction,
    new Date((signal.timestamp as string) || Date.now()),
    signal
  );
}

/**
 * Normalize MTF Dots signal
 */
export function normalizeTVMtfDots(signal: Record<string, unknown>): SignalScore {
  const direction: Direction = signal.bias === 'BULLISH' ? 'BULLISH' : 
                    signal.bias === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
  
  return createSignalScore(
    signal.ticker as string || 'UNKNOWN',
    'TV_MTF_DOTS',
    'TREND',
    (signal.alignment_score as number) || 50,
    0,
    100,
    direction,
    new Date((signal.timestamp as string) || Date.now()),
    signal
  );
}

/**
 * Normalize GEX Analysis signal
 */
export function normalizeGEXAnalysis(gexSignals: Record<string, unknown>): SignalScore {
  // Determine direction from overall bias or regime
  const overallBias = gexSignals.overall_bias as string;
  const direction: Direction = overallBias === 'BULLISH' ? 'BULLISH' : 
                    overallBias === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
  
  // Confidence from regime analysis
  const regimeConfidence = (gexSignals.regime_confidence as number) || 50;
  
  return createSignalScore(
    gexSignals.ticker as string || 'UNKNOWN',
    'GEX_ANALYSIS',
    'REGIME',
    regimeConfidence,
    0,
    100,
    direction,
    new Date((gexSignals.calculated_at as string) || Date.now()),
    gexSignals
  );
}

/**
 * Normalize Context Webhook signal
 */
export function normalizeContextWebhook(context: Record<string, unknown>): SignalScore {
  // Create composite score from multiple factors
  let score = 50; // Start neutral
  
  // VIX regime adjustment
  const vixRegime = context.vix_regime as string;
  if (vixRegime === 'LOW_VOL') score += 10;
  if (vixRegime === 'HIGH_VOL') score -= 10;
  
  // Market bias
  const marketBias = context.market_bias as string;
  if (marketBias === 'BULLISH') score += 15;
  if (marketBias === 'BEARISH') score -= 15;
  
  // Opening range breakout
  const orBreakout = context.or_breakout as string;
  if (orBreakout === 'ABOVE') score += 10;
  if (orBreakout === 'BELOW') score -= 10;
  
  // SPY trend
  const spyTrend = context.spy_trend as string;
  if (spyTrend === 'BULLISH' || spyTrend === 'UP') score += 5;
  if (spyTrend === 'BEARISH' || spyTrend === 'DOWN') score -= 5;
  
  score = Math.max(0, Math.min(100, score));
  
  const direction: Direction = score > 60 ? 'BULLISH' : score < 40 ? 'BEARISH' : 'NEUTRAL';
  
  return createSignalScore(
    context.ticker as string || 'UNKNOWN',
    'CONTEXT_WEBHOOK',
    'REGIME',
    score,
    0,
    100,
    direction,
    new Date((context.timestamp as string) || (context.updated_at as string) || Date.now()),
    context
  );
}

/**
 * Normalize Positioning signal (P/C Ratio, Max Pain, etc.)
 */
export function normalizePositioning(positioning: Record<string, unknown>): SignalScore {
  // Convert positioning bias to score
  let score = 50;
  const bias = positioning.positioning_bias as string;
  
  if (bias === 'STRONGLY_BULLISH') score = 85;
  else if (bias === 'BULLISH') score = 65;
  else if (bias === 'NEUTRAL') score = 50;
  else if (bias === 'BEARISH') score = 35;
  else if (bias === 'STRONGLY_BEARISH') score = 15;
  
  // Adjust by confidence
  const confidence = (positioning.confidence as number) || 50;
  score = 50 + ((score - 50) * (confidence / 100));
  
  const direction: Direction = score > 55 ? 'BULLISH' : score < 45 ? 'BEARISH' : 'NEUTRAL';
  
  return createSignalScore(
    positioning.ticker as string || positioning.underlying as string || 'UNKNOWN',
    'POSITIONING',
    'SENTIMENT',
    score,
    0,
    100,
    direction,
    new Date((positioning.calculated_at as string) || Date.now()),
    positioning
  );
}

/**
 * Calculate confluence score from multiple signal sources
 */
export function calculateConfluence(
  scores: SignalScore[],
  weights: Record<SignalSource, number> = DEFAULT_SOURCE_WEIGHTS
): ConfluenceScore {
  if (scores.length === 0) {
    return {
      ticker: '',
      evaluationTimestamp: new Date(),
      scores: [],
      weightedConfluence: 50,
      bullishSources: 0,
      bearishSources: 0,
      neutralSources: 0,
      directionConsensus: 'MIXED',
      hasConflict: false,
    };
  }
  
  const ticker = scores[0].ticker;
  let totalWeight = 0;
  let weightedSum = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  
  const scoreDetails = scores.map(score => {
    const weight = weights[score.source] || 0.1;
    const isFresh = score.decayFactor > 0.5;
    
    // Only count fresh signals toward confluence
    if (isFresh) {
      totalWeight += weight;
      weightedSum += score.decayedScore * weight;
      
      if (score.direction === 'BULLISH') bullishCount++;
      else if (score.direction === 'BEARISH') bearishCount++;
      else neutralCount++;
    }
    
    return {
      source: score.source,
      score: score.decayedScore,
      weight,
      direction: score.direction,
      isFresh,
    };
  });
  
  const weightedConfluence = totalWeight > 0 ? weightedSum / totalWeight : 50;
  
  // Determine consensus
  let directionConsensus: DirectionConsensus;
  
  if (bullishCount >= 4 && bearishCount === 0) directionConsensus = 'STRONG_BULL';
  else if (bullishCount >= 3 && bearishCount <= 1) directionConsensus = 'WEAK_BULL';
  else if (bearishCount >= 4 && bullishCount === 0) directionConsensus = 'STRONG_BEAR';
  else if (bearishCount >= 3 && bullishCount <= 1) directionConsensus = 'WEAK_BEAR';
  else directionConsensus = 'MIXED';
  
  // Detect conflicts (strong signals in opposite directions)
  const hasStrongBullish = scores.some(s => s.direction === 'BULLISH' && s.normalizedScore > 70);
  const hasStrongBearish = scores.some(s => s.direction === 'BEARISH' && s.normalizedScore < 30);
  const hasConflict = hasStrongBullish && hasStrongBearish;
  
  return {
    ticker,
    evaluationTimestamp: new Date(),
    scores: scoreDetails,
    weightedConfluence,
    bullishSources: bullishCount,
    bearishSources: bearishCount,
    neutralSources: neutralCount,
    directionConsensus,
    hasConflict,
    conflictDetails: hasConflict 
      ? `Strong bullish and bearish signals detected simultaneously` 
      : undefined,
  };
}

/**
 * Convert SignalScore to database row format
 */
export function toSignalScoreRow(score: SignalScore): SignalScoreRow {
  return {
    ticker: score.ticker,
    signal_source: score.source,
    signal_type: score.signalType,
    raw_score: score.rawScore,
    raw_scale_min: score.rawScaleMin,
    raw_scale_max: score.rawScaleMax,
    normalized_score: score.normalizedScore,
    direction: score.direction,
    direction_strength: score.directionStrength,
    signal_timestamp: score.signalTimestamp.toISOString(),
    age_seconds: score.ageSeconds,
    decay_factor: score.decayFactor,
    decayed_score: score.decayedScore,
    source_data: score.sourceData,
  };
}

/**
 * Convert ConfluenceScore to database row format
 */
export function toConfluenceScoreRow(confluence: ConfluenceScore): ConfluenceScoreRow {
  // Extract individual source scores
  const tvScore = confluence.scores.find(s => 
    s.source.startsWith('TV_'))?.score ?? null;
  const gexScore = confluence.scores.find(s => 
    s.source === 'GEX_ANALYSIS')?.score ?? null;
  const contextScore = confluence.scores.find(s => 
    s.source === 'CONTEXT_WEBHOOK')?.score ?? null;
  const mtfScore = confluence.scores.find(s => 
    s.source === 'TV_MTF_DOTS')?.score ?? null;
  const positioningScore = confluence.scores.find(s => 
    s.source === 'POSITIONING')?.score ?? null;

  return {
    ticker: confluence.ticker,
    evaluation_timestamp: confluence.evaluationTimestamp.toISOString(),
    tv_score: tvScore,
    tv_weight: 0.25,
    gex_score: gexScore,
    gex_weight: 0.25,
    context_score: contextScore,
    context_weight: 0.20,
    mtf_score: mtfScore,
    mtf_weight: 0.15,
    positioning_score: positioningScore,
    positioning_weight: 0.15,
    weighted_confluence: confluence.weightedConfluence,
    bullish_sources: confluence.bullishSources,
    bearish_sources: confluence.bearishSources,
    neutral_sources: confluence.neutralSources,
    direction_consensus: confluence.directionConsensus,
    has_conflict: confluence.hasConflict,
    conflict_details: confluence.conflictDetails ?? null,
  };
}
