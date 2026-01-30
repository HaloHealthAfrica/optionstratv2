// ============================================================================
// MULTI-TIMEFRAME ANALYSIS ENGINE
// ============================================================================
// Strategy: Swing Trading (1-3 days) with Multi-Timeframe Alignment
// - Higher timeframes must align for trade approval
// - Larger positions for higher timeframe confirmation
// - Entry on 15min-1H, filter with 4H-Daily, bias from Weekly
// ============================================================================

import { createDbClient } from './db-client.ts';
import {
  NormalizedSignal,
  SignalDirection,
  Timeframe,
  TIMEFRAME_HIERARCHY,
} from './multi-timeframe-adapter.ts';

export interface MultiTimeframeAnalysis {
  ticker: string;
  
  // Timeframe Bias
  weeklyBias: SignalDirection;      // 1W - Macro trend
  dailyBias: SignalDirection;       // 1D - Daily bias
  fourHourBias: SignalDirection;    // 4H - HTF confirmation
  entryBias: SignalDirection;       // 1H/30min - Entry timeframe
  
  // Alignment Status
  isAligned: boolean;               // All required timeframes agree
  alignmentScore: number;           // 0-100 weighted alignment
  confluenceCount: number;          // Number of agreeing timeframes
  
  // Signal Details
  entrySignals: NormalizedSignal[]; // Signals on entry timeframes
  confirmationSignals: NormalizedSignal[]; // Signals on filter timeframes
  allSignals: NormalizedSignal[];   // All recent signals
  
  // Trade Decision
  recommendation: TradeRecommendation;
  positionSizeMultiplier: number;   // 0.5 - 2.5x based on confluence
  confidence: number;                // Overall confidence 0-100
  
  // Risk Assessment
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  reasons: string[];                 // Why this recommendation
}

export type TradeRecommendation = 
  | 'STRONG_LONG'    // Perfect alignment, max size
  | 'LONG'           // Good alignment, normal size
  | 'WEAK_LONG'      // Partial alignment, reduced size
  | 'NO_TRADE'       // Insufficient alignment
  | 'WEAK_SHORT'     // Partial alignment, reduced size
  | 'SHORT'          // Good alignment, normal size
  | 'STRONG_SHORT';  // Perfect alignment, max size

// ============================================================================
// SIGNAL AGGREGATION WINDOWS
// ============================================================================

// How long signals remain valid for each timeframe (in minutes)
export const SIGNAL_VALIDITY_WINDOWS: Record<Timeframe, number> = {
  '3': 15,      // 3min signals valid for 15 min
  '5': 15,      // 5min signals valid for 15 min
  '15': 60,     // 15min signals valid for 1 hour
  '30': 120,    // 30min signals valid for 2 hours
  '60': 240,    // 1H signals valid for 4 hours
  '240': 960,   // 4H signals valid for 16 hours
  '1D': 1440,   // Daily signals valid for 24 hours
  '1W': 10080,  // Weekly signals valid for 1 week
};

// ============================================================================
// POSITION SIZING BY TIMEFRAME CONFLUENCE
// ============================================================================

export function calculatePositionSizeMultiplier(
  alignmentScore: number,
  confluenceCount: number,
  primaryTimeframe: Timeframe
): number {
  // Base multiplier by primary timeframe
  const baseMultipliers: Record<Timeframe, number> = {
    '3': 0.25,    // Don't trade 3min
    '5': 0.5,     // Half size for 5min scalps
    '15': 0.75,   // 75% for 15min
    '30': 1.0,    // Full size for 30min
    '60': 1.0,    // Full size for 1H
    '240': 1.25,  // 125% for 4H swings
    '1D': 1.5,    // 150% for daily swings
    '1W': 2.0,    // 200% for weekly positions
  };
  
  const baseMultiplier = baseMultipliers[primaryTimeframe] || 1.0;
  
  // Confluence bonus (more timeframes aligned = larger size)
  let confluenceBonus = 1.0;
  if (confluenceCount >= 6) {
    confluenceBonus = 1.5;        // 6+ timeframes = +50%
  } else if (confluenceCount >= 5) {
    confluenceBonus = 1.3;        // 5 timeframes = +30%
  } else if (confluenceCount >= 4) {
    confluenceBonus = 1.2;        // 4 timeframes = +20%
  } else if (confluenceCount >= 3) {
    confluenceBonus = 1.1;        // 3 timeframes = +10%
  }
  
  // Alignment score bonus
  let alignmentBonus = 1.0;
  if (alignmentScore >= 90) {
    alignmentBonus = 1.3;         // Perfect alignment = +30%
  } else if (alignmentScore >= 80) {
    alignmentBonus = 1.2;         // Strong alignment = +20%
  } else if (alignmentScore >= 70) {
    alignmentBonus = 1.1;         // Good alignment = +10%
  }
  
  // Calculate final multiplier
  const finalMultiplier = baseMultiplier * confluenceBonus * alignmentBonus;
  
  // Cap at 2.5x max, floor at 0.25x min
  return Math.min(2.5, Math.max(0.25, finalMultiplier));
}

// ============================================================================
// TIMEFRAME BIAS DETERMINATION
// ============================================================================

function determineTimeframeBias(
  signals: NormalizedSignal[],
  timeframe: Timeframe
): SignalDirection {
  const relevantSignals = signals.filter(s => s.timeframe === timeframe);
  
  if (relevantSignals.length === 0) {
    return 'NEUTRAL';
  }
  
  // Weight by confidence and recency
  let longScore = 0;
  let shortScore = 0;
  
  const now = Date.now();
  
  for (const signal of relevantSignals) {
    const ageMinutes = (now - signal.timestamp.getTime()) / 1000 / 60;
    const validityWindow = SIGNAL_VALIDITY_WINDOWS[timeframe];
    
    // Signals lose strength as they age
    const recencyFactor = Math.max(0, 1 - (ageMinutes / validityWindow));
    const weight = signal.confidence * recencyFactor;
    
    if (signal.direction === 'LONG') {
      longScore += weight;
    } else if (signal.direction === 'SHORT') {
      shortScore += weight;
    }
  }
  
  // Require at least 10% difference to declare bias
  const totalScore = longScore + shortScore;
  if (totalScore === 0) return 'NEUTRAL';
  
  const longPercent = longScore / totalScore;
  
  if (longPercent > 0.55) return 'LONG';
  if (longPercent < 0.45) return 'SHORT';
  return 'NEUTRAL';
}

// ============================================================================
// ALIGNMENT CHECKING
// ============================================================================

function checkTimeframeAlignment(
  weeklyBias: SignalDirection,
  dailyBias: SignalDirection,
  fourHourBias: SignalDirection,
  entryBias: SignalDirection
): { isAligned: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // For swing trading, we REQUIRE:
  // 1. Daily and 4H must agree (mandatory)
  // 2. Entry timeframe must agree with Daily/4H (mandatory)
  // 3. Weekly can disagree (acts as early warning of reversal)
  
  // Check if we have enough data
  if (dailyBias === 'NEUTRAL') {
    reasons.push('NO_DAILY_BIAS');
    return { isAligned: false, reasons };
  }
  
  if (fourHourBias === 'NEUTRAL') {
    reasons.push('NO_4H_BIAS');
    return { isAligned: false, reasons };
  }
  
  if (entryBias === 'NEUTRAL') {
    reasons.push('NO_ENTRY_SIGNAL');
    return { isAligned: false, reasons };
  }
  
  // Check Daily vs 4H alignment (CRITICAL)
  if (dailyBias !== fourHourBias) {
    reasons.push(`DAILY_${dailyBias}_vs_4H_${fourHourBias}_MISMATCH`);
    return { isAligned: false, reasons };
  }
  
  // Check Entry vs Daily alignment (CRITICAL)
  if (entryBias !== dailyBias) {
    reasons.push(`ENTRY_${entryBias}_vs_DAILY_${dailyBias}_MISMATCH`);
    return { isAligned: false, reasons };
  }
  
  // Check Weekly alignment (WARNING, not CRITICAL)
  if (weeklyBias !== 'NEUTRAL' && weeklyBias !== dailyBias) {
    reasons.push(`WEEKLY_${weeklyBias}_vs_DAILY_${dailyBias}_DIVERGENCE`);
    // Not a dealbreaker, but noted
  }
  
  // All critical timeframes aligned
  reasons.push(`ALIGNED_${dailyBias}`);
  return { isAligned: true, reasons };
}

// ============================================================================
// CONFLUENCE SCORE CALCULATION
// ============================================================================

function calculateConfluenceScore(
  signals: NormalizedSignal[],
  primaryDirection: SignalDirection
): { score: number; count: number } {
  if (primaryDirection === 'NEUTRAL') {
    return { score: 0, count: 0 };
  }
  
  let totalScore = 0;
  let count = 0;
  const now = Date.now();
  
  // Group signals by timeframe, take most recent
  const latestByTimeframe = new Map<Timeframe, NormalizedSignal>();
  
  for (const signal of signals) {
    if (signal.direction !== primaryDirection) continue;
    
    const existing = latestByTimeframe.get(signal.timeframe);
    if (!existing || signal.timestamp > existing.timestamp) {
      latestByTimeframe.set(signal.timeframe, signal);
    }
  }
  
  // Score each timeframe
  for (const [timeframe, signal] of latestByTimeframe) {
    const ageMinutes = (now - signal.timestamp.getTime()) / 1000 / 60;
    const validityWindow = SIGNAL_VALIDITY_WINDOWS[timeframe];
    
    // Ensure signal is still valid
    if (ageMinutes > validityWindow) continue;
    
    // Get timeframe weight
    const weight = TIMEFRAME_HIERARCHY[timeframe]?.weight || 0;
    
    // Calculate recency factor
    const recencyFactor = Math.max(0, 1 - (ageMinutes / validityWindow));
    
    // Confidence factor
    const confidenceFactor = signal.confidence / 100;
    
    // Add weighted score
    totalScore += weight * recencyFactor * confidenceFactor;
    count++;
  }
  
  // Normalize to 0-100
  const maxPossibleScore = Object.values(TIMEFRAME_HIERARCHY)
    .reduce((sum, config) => sum + config.weight, 0);
  
  const normalizedScore = (totalScore / maxPossibleScore) * 100;
  
  return { score: normalizedScore, count };
}

// ============================================================================
// TRADE RECOMMENDATION LOGIC
// ============================================================================

function determineRecommendation(
  isAligned: boolean,
  alignmentScore: number,
  confluenceCount: number,
  direction: SignalDirection
): { recommendation: TradeRecommendation; confidence: number; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' } {
  if (!isAligned || direction === 'NEUTRAL') {
    return {
      recommendation: 'NO_TRADE',
      confidence: 0,
      riskLevel: 'EXTREME'
    };
  }
  
  // Calculate overall confidence
  const confluenceBonus = Math.min(30, confluenceCount * 5); // Up to +30%
  const confidence = Math.min(100, alignmentScore + confluenceBonus);
  
  // Determine recommendation strength
  let recommendation: TradeRecommendation;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  
  if (direction === 'LONG') {
    if (alignmentScore >= 80 && confluenceCount >= 5) {
      recommendation = 'STRONG_LONG';
      riskLevel = 'LOW';
    } else if (alignmentScore >= 70 && confluenceCount >= 4) {
      recommendation = 'LONG';
      riskLevel = 'MEDIUM';
    } else if (alignmentScore >= 60 && confluenceCount >= 3) {
      recommendation = 'WEAK_LONG';
      riskLevel = 'HIGH';
    } else {
      recommendation = 'NO_TRADE';
      riskLevel = 'EXTREME';
    }
  } else {
    if (alignmentScore >= 80 && confluenceCount >= 5) {
      recommendation = 'STRONG_SHORT';
      riskLevel = 'LOW';
    } else if (alignmentScore >= 70 && confluenceCount >= 4) {
      recommendation = 'SHORT';
      riskLevel = 'MEDIUM';
    } else if (alignmentScore >= 60 && confluenceCount >= 3) {
      recommendation = 'WEAK_SHORT';
      riskLevel = 'HIGH';
    } else {
      recommendation = 'NO_TRADE';
      riskLevel = 'EXTREME';
    }
  }
  
  return { recommendation, confidence, riskLevel };
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

export async function analyzeMultiTimeframe(
  ticker: string,
  lookbackHours: number = 24
): Promise<MultiTimeframeAnalysis> {
  
  const supabase = createDbClient();
  
  // Fetch all recent COMPLETED signals for this ticker (exclude rejected)
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  
  const { data: rawSignals, error } = await supabase
    .from('signals')
    .select('*')
    .eq('underlying', ticker)
    .eq('status', 'COMPLETED')
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching signals:', error);
    throw error;
  }
  
  console.log(`Found ${rawSignals?.length || 0} completed signals for ${ticker}`);
  
  // Parse signals - map action (BUY/SELL) to direction (LONG/SHORT)
  const allSignals: NormalizedSignal[] = (rawSignals || []).map(s => {
    const rawPayload = s.raw_payload as Record<string, unknown> || {};
    const timeframe = extractTimeframeFromPayload(rawPayload);
    const direction = mapActionToDirection(s.action);
    const confidence = extractConfidenceFromPayload(rawPayload);
    
    console.log(`Signal ${s.id}: source=${s.source}, tf=${timeframe}, action=${s.action}, dir=${direction}, conf=${confidence.toFixed(1)}`);
    
    return {
      source: mapSourceName(s.source) as NormalizedSignal['source'],
      ticker: s.underlying || ticker,
      exchange: 'UNKNOWN',
      timeframe: timeframe as Timeframe,
      timestamp: new Date(s.created_at),
      direction,
      confidence,
      price: Number(s.strike) || 0,
      context: {},
      metadata: { originalPayload: rawPayload },
    };
  });
  
  if (allSignals.length === 0) {
    // No signals available
    return {
      ticker,
      weeklyBias: 'NEUTRAL',
      dailyBias: 'NEUTRAL',
      fourHourBias: 'NEUTRAL',
      entryBias: 'NEUTRAL',
      isAligned: false,
      alignmentScore: 0,
      confluenceCount: 0,
      entrySignals: [],
      confirmationSignals: [],
      allSignals: [],
      recommendation: 'NO_TRADE',
      positionSizeMultiplier: 0,
      confidence: 0,
      riskLevel: 'EXTREME',
      reasons: ['NO_SIGNALS_AVAILABLE'],
    };
  }
  
  // Determine bias for each key timeframe
  const weeklyBias = determineTimeframeBias(allSignals, '1W');
  const dailyBias = determineTimeframeBias(allSignals, '1D');
  const fourHourBias = determineTimeframeBias(allSignals, '240');
  
  // Entry bias: prefer 1H, fallback to 30min
  let entryBias = determineTimeframeBias(allSignals, '60');
  if (entryBias === 'NEUTRAL') {
    entryBias = determineTimeframeBias(allSignals, '30');
  }
  
  // Check alignment
  const { isAligned, reasons } = checkTimeframeAlignment(
    weeklyBias,
    dailyBias,
    fourHourBias,
    entryBias
  );
  
  // Determine primary direction (from daily bias)
  const primaryDirection = dailyBias;
  
  // Calculate confluence
  const { score: alignmentScore, count: confluenceCount } = calculateConfluenceScore(
    allSignals,
    primaryDirection
  );
  
  // Get entry and confirmation signals
  const entrySignals = allSignals.filter(s =>
    ['60', '30', '15'].includes(s.timeframe) &&
    s.direction === primaryDirection
  );
  
  const confirmationSignals = allSignals.filter(s =>
    ['240', '1D', '1W'].includes(s.timeframe) &&
    s.direction === primaryDirection
  );
  
  // Determine recommendation
  const { recommendation, confidence, riskLevel } = determineRecommendation(
    isAligned,
    alignmentScore,
    confluenceCount,
    primaryDirection
  );
  
  // Calculate position size multiplier
  const primaryTimeframe = entrySignals[0]?.timeframe || '60';
  const positionSizeMultiplier = recommendation === 'NO_TRADE' 
    ? 0 
    : calculatePositionSizeMultiplier(alignmentScore, confluenceCount, primaryTimeframe as Timeframe);
  
  return {
    ticker,
    weeklyBias,
    dailyBias,
    fourHourBias,
    entryBias,
    isAligned,
    alignmentScore,
    confluenceCount,
    entrySignals,
    confirmationSignals,
    allSignals,
    recommendation,
    positionSizeMultiplier,
    confidence,
    riskLevel,
    reasons,
  };
}

// ============================================================================
// HELPER: Extract timeframe from raw payload
// ============================================================================

function extractTimeframeFromPayload(payload: Record<string, unknown>): string {
  // Check various payload structures for timeframe
  const timeframe = payload.timeframe as Record<string, unknown> | string | undefined;
  if (typeof timeframe === 'string') return normalizeTimeframeString(timeframe);
  if (typeof timeframe === 'object' && timeframe?.chart_tf) {
    return normalizeTimeframeString(String(timeframe.chart_tf));
  }
  
  const market = payload.market as Record<string, unknown> | undefined;
  if (market?.timeframe) return normalizeTimeframeString(String(market.timeframe));
  
  return '60'; // Default to 1H
}

function normalizeTimeframeString(tf: string): Timeframe {
  // Check for daily/weekly FIRST before stripping letters
  if (tf.includes('D') || tf.includes('d') || tf === '1D' || tf === 'D') return '1D';
  if (tf.includes('W') || tf.includes('w') || tf === '1W' || tf === 'W') return '1W';
  
  // Now strip letters for numeric timeframes
  const normalized = tf.replace(/[mMhH]/gi, '').trim();
  if (normalized === '1' || normalized === '3') return '3';
  if (normalized === '5') return '5';
  if (normalized === '10' || normalized === '15') return '15';
  if (normalized === '30') return '30';
  if (normalized === '60') return '60';
  if (normalized === '120' || normalized === '180' || normalized === '240') return '240';
  
  return '15'; // Default fallback
}

function mapActionToDirection(action: string | null): SignalDirection {
  if (action === 'BUY') return 'LONG';
  if (action === 'SELL') return 'SHORT';
  return 'NEUTRAL';
}

function mapSourceName(source: string | null): string {
  if (!source) return 'SIGNALS';
  // Map database source names to SignalSource enum values
  if (source.includes('saty')) return 'SATY_PHASE';
  if (source.includes('strat')) return 'STRAT';
  if (source.includes('trend') || source.includes('mtf')) return 'TREND';
  if (source.includes('orb') || source.includes('bhch')) return 'ORB';
  return 'SIGNALS';
}

function extractConfidenceFromPayload(payload: Record<string, unknown>): number {
  // Check various confidence fields
  if (typeof payload.score === 'number') {
    return Math.min(100, Math.max(0, (payload.score / 10.5) * 100));
  }
  if (typeof payload.alignment_score === 'number') {
    return payload.alignment_score;
  }
  const confidence = payload.confidence as Record<string, unknown> | undefined;
  if (confidence?.confidence_score) {
    return Number(confidence.confidence_score);
  }
  const signal = payload.signal as Record<string, unknown> | undefined;
  if (signal?.confidence) {
    return Number(signal.confidence);
  }
  return 50; // Default
}

// ============================================================================
// HELPER: Get Primary Entry Signal
// ============================================================================

export function getPrimaryEntrySignal(analysis: MultiTimeframeAnalysis): NormalizedSignal | null {
  if (analysis.entrySignals.length === 0) return null;
  
  // Prefer signals in this order: 60min > 30min > 15min
  const preferredOrder: Timeframe[] = ['60', '30', '15'];
  
  for (const tf of preferredOrder) {
    const signal = analysis.entrySignals.find(s => s.timeframe === tf);
    if (signal) return signal;
  }
  
  // Fallback to first available
  return analysis.entrySignals[0];
}
