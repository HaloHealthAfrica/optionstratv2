/**
 * Confluence Engine - Cross-Signal Confirmation System
 * 
 * Requires multiple indicator sources to agree before executing trades.
 * Improves win rate by filtering out false signals.
 * 
 * Enhanced with TwelveData technical indicators (MACD, ADX, Supertrend)
 */

import type { IncomingSignal, OptionType, SignalAction } from "./types.ts";
import { createSupabaseClient } from "./supabase-client.ts";
import { getTechnicalAnalysisService, type TechnicalConfluenceResult } from "./market-data/index.ts";

// Signal source categories for confluence scoring
export type SignalSource = 
  | 'ultimate-option' 
  | 'saty-phase' 
  | 'mtf-trend-dots' 
  | 'orb_bhch_orb'
  | 'orb_bhch_stretch'
  | 'orb_bhch_bhch'
  | 'orb_bhch_ema'
  | 'strat_engine_v6'
  | 'strat-engine'
  | 'tradingview'
  | 'twelvedata-technical'; // New: TwelveData technical indicators

export type SignalDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface ConfluenceConfig {
  // Minimum number of agreeing sources required
  minAgreeSources: number;
  // Time window to look back for signals (minutes)
  lookbackMinutes: number;
  // Weight multipliers for different sources (higher = more trusted)
  sourceWeights: Record<SignalSource, number>;
  // Require specific high-weight sources to agree
  requirePrimarySources: boolean;
  // Primary sources that must agree if requirePrimarySources is true
  primarySources: SignalSource[];
  // Minimum weighted score (sum of agreeing weights)
  minWeightedScore: number;
  // Enable TwelveData technical indicator enhancement
  useTechnicalIndicators: boolean;
  // Timeframe for technical indicator analysis
  technicalTimeframe: '1min' | '5min' | '15min' | '1h' | '1day';
}

/**
 * SOURCE WEIGHTS - Data-Driven Optimization (Updated with 3,300+ signal analysis)
 * 
 * Latest analysis revealed:
 * - ultimate-option: 48% accept rate, balanced signal quality → weight 1.6
 * - mtf-trend-dots: 47% accept rate, strong trend confirmation → weight 1.5
 * - strat_engine_v6: 48.5% accept rate, precise patterns → weight 1.4 (↑)
 * - saty-phase: 21.7% accept rate, LOW - reduced weight → weight 0.8 (↓↓)
 * - orb_bhch_bhch: 27.3% accept rate, LOW - reduced weight → weight 0.4 (↓↓)
 * - orb_bhch_orb: 43.8% accept rate, moderate ORB signals → weight 1.0
 * - orb_bhch_stretch: 52.5% accept rate, BEST performer → weight 1.3 (↑↑)
 * - orb_bhch_ema: 30.2% accept rate, noisy EMA crossovers → weight 0.5 (↓)
 * - twelvedata-technical: MACD/ADX/Supertrend → weight 1.4
 */
export const DEFAULT_CONFLUENCE_CONFIG: ConfluenceConfig = {
  minAgreeSources: 2,
  lookbackMinutes: 20,
  sourceWeights: {
    'ultimate-option': 1.6,       // Strong - 48% accept rate
    'saty-phase': 0.8,            // REDUCED - 21.7% accept rate (was 1.4)
    'mtf-trend-dots': 1.5,        // Strong - 47% accept rate
    'orb_bhch_orb': 1.0,          // Moderate - 43.8% accept rate
    'orb_bhch_stretch': 1.3,      // BOOSTED - 52.5% accept rate (was 1.0)
    'orb_bhch_bhch': 0.4,         // REDUCED - 27.3% accept rate (was 0.85)
    'orb_bhch_ema': 0.5,          // REDUCED - 30.2% accept rate (was 0.6)
    'strat_engine_v6': 1.4,       // BOOSTED - 48.5% accept rate (was 1.3)
    'strat-engine': 1.4,
    'tradingview': 0.7,
    'twelvedata-technical': 1.4,
  },
  requirePrimarySources: false,
  primarySources: ['ultimate-option', 'mtf-trend-dots', 'strat_engine_v6', 'orb_bhch_stretch'],
  minWeightedScore: 1.8,
  useTechnicalIndicators: true,
  technicalTimeframe: '1h',
};

export interface RecentSignal {
  id: string;
  source: SignalSource;
  underlying: string;
  action: SignalAction | null;
  option_type: OptionType | null;
  direction: SignalDirection;
  score: number;
  created_at: string;
  raw_payload?: Record<string, unknown>;
}

export interface ConfluenceResult {
  approved: boolean;
  reason: string;
  agreeingSources: SignalSource[];
  conflictingSources: SignalSource[];
  neutralSources: SignalSource[];
  weightedScore: number;
  totalSources: number;
  primarySourcesAgree: boolean;
  direction: SignalDirection;
  confidenceBoost: number; // 0.0 to 1.0 boost based on confluence
  signals: RecentSignal[];
  // New: TwelveData technical analysis results
  technicalAnalysis?: TechnicalConfluenceResult;
}

/**
 * Determine the direction of a signal based on its action and option type
 */
function getSignalDirection(signal: {
  action?: SignalAction | null;
  option_type?: OptionType | null;
  raw_payload?: Record<string, unknown>;
}): SignalDirection {
  // Check raw payload for direction hints
  const payload = signal.raw_payload || {};
  
  // Check for explicit direction fields
  if (payload.direction === 'LONG' || payload.bias === 'BULLISH' || payload.trend === 'bullish') {
    return 'BULLISH';
  }
  if (payload.direction === 'SHORT' || payload.bias === 'BEARISH' || payload.trend === 'bearish') {
    return 'BEARISH';
  }
  
  // Derive from action and option type
  if (signal.action === 'BUY' && signal.option_type === 'CALL') return 'BULLISH';
  if (signal.action === 'BUY' && signal.option_type === 'PUT') return 'BEARISH';
  if (signal.action === 'SELL' && signal.option_type === 'CALL') return 'BEARISH';
  if (signal.action === 'SELL' && signal.option_type === 'PUT') return 'BULLISH';
  
  // Check nested payload structures
  if (payload.signal && typeof payload.signal === 'object') {
    const nested = payload.signal as Record<string, unknown>;
    if (nested.side === 'LONG') return 'BULLISH';
    if (nested.side === 'SHORT') return 'BEARISH';
  }
  
  return 'NEUTRAL';
}

/**
 * Calculate confidence score for a signal based on its payload
 */
function getSignalScore(signal: {
  source: string;
  raw_payload?: Record<string, unknown>;
}): number {
  const payload = signal.raw_payload || {};
  
  // Extract score from various payload formats
  if (typeof payload.score === 'number') return payload.score;
  if (typeof payload.confidence_score === 'number') return payload.confidence_score;
  if (typeof payload.confidence === 'number') return payload.confidence;
  if (typeof payload.alignment_score === 'number') return payload.alignment_score;
  
  // Check nested structures
  if (payload.signal && typeof payload.signal === 'object') {
    const nested = payload.signal as Record<string, unknown>;
    if (typeof nested.confidence === 'number') return nested.confidence;
  }
  
  // Default score based on successful parsing
  return 70;
}

/**
 * Evaluate cross-signal confluence for a given ticker
 */
export async function evaluateConfluence(
  ticker: string,
  currentSignal: IncomingSignal,
  currentSource: SignalSource,
  config: Partial<ConfluenceConfig> = {}
): Promise<ConfluenceResult> {
  const cfg = { ...DEFAULT_CONFLUENCE_CONFIG, ...config };
  const supabase = createSupabaseClient();
  
  // Calculate lookback timestamp
  const lookbackTime = new Date();
  lookbackTime.setMinutes(lookbackTime.getMinutes() - cfg.lookbackMinutes);
  
  // Fetch recent signals for this ticker
  const { data: recentSignals, error } = await supabase
    .from('signals')
    .select('id, source, underlying, action, option_type, raw_payload, created_at, status')
    .eq('underlying', ticker.toUpperCase())
    .gte('created_at', lookbackTime.toISOString())
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Confluence query error:', error);
    return {
      approved: true, // Fail open on error
      reason: 'Confluence check failed - proceeding with caution',
      agreeingSources: [currentSource],
      conflictingSources: [],
      neutralSources: [],
      weightedScore: cfg.sourceWeights[currentSource] || 1.0,
      totalSources: 1,
      primarySourcesAgree: false,
      direction: getSignalDirection(currentSignal),
      confidenceBoost: 0,
      signals: [],
    };
  }
  
  // Map and deduplicate signals by source (keep most recent per source)
  const signalsBySource = new Map<SignalSource, RecentSignal>();
  
  for (const sig of recentSignals || []) {
    const source = sig.source as SignalSource;
    if (!signalsBySource.has(source) && sig.status === 'COMPLETED') {
      signalsBySource.set(source, {
        id: sig.id,
        source,
        underlying: sig.underlying,
        action: sig.action as SignalAction | null,
        option_type: sig.option_type as OptionType | null,
        direction: getSignalDirection({
          action: sig.action as SignalAction,
          option_type: sig.option_type as OptionType,
          raw_payload: sig.raw_payload as Record<string, unknown>,
        }),
        score: getSignalScore({ source, raw_payload: sig.raw_payload as Record<string, unknown> }),
        created_at: sig.created_at,
        raw_payload: sig.raw_payload as Record<string, unknown>,
      });
    }
  }
  
  // Add current signal
  const currentDirection = getSignalDirection(currentSignal);
  const currentRecentSignal: RecentSignal = {
    id: 'current',
    source: currentSource,
    underlying: ticker,
    action: currentSignal.action,
    option_type: currentSignal.option_type,
    direction: currentDirection,
    score: getSignalScore({ source: currentSource, raw_payload: currentSignal.metadata }),
    created_at: new Date().toISOString(),
    raw_payload: currentSignal.metadata,
  };
  signalsBySource.set(currentSource, currentRecentSignal);
  
  // Categorize signals
  const agreeingSources: SignalSource[] = [];
  const conflictingSources: SignalSource[] = [];
  const neutralSources: SignalSource[] = [];
  
  for (const [source, signal] of signalsBySource) {
    if (signal.direction === currentDirection) {
      agreeingSources.push(source);
    } else if (signal.direction === 'NEUTRAL') {
      neutralSources.push(source);
    } else {
      conflictingSources.push(source);
    }
  }
  
  // Fetch TwelveData technical indicators if enabled
  let technicalAnalysis: TechnicalConfluenceResult | undefined;
  if (cfg.useTechnicalIndicators) {
    try {
      const technicalService = getTechnicalAnalysisService();
      if (technicalService.isAvailable()) {
        technicalAnalysis = await technicalService.getConfluenceAnalysis(ticker, cfg.technicalTimeframe);
        
        // Add technical indicators as a virtual source if they agree with direction
        if (technicalAnalysis.agreementScore >= 50) {
          const technicalDirection = technicalAnalysis.momentumBias !== 'NEUTRAL' 
            ? technicalAnalysis.momentumBias 
            : technicalAnalysis.trendBias;
          
          if (technicalDirection === currentDirection) {
            agreeingSources.push('twelvedata-technical');
            console.log(`[Confluence] TwelveData technical agrees: ${technicalDirection} (ADX: ${technicalAnalysis.adx?.adx || 'N/A'}, MACD: ${technicalAnalysis.macd?.trend || 'N/A'})`);
          } else if (technicalDirection !== 'NEUTRAL') {
            conflictingSources.push('twelvedata-technical');
            console.log(`[Confluence] TwelveData technical conflicts: ${technicalDirection} vs ${currentDirection}`);
          }
        }
      }
    } catch (error) {
      console.warn('[Confluence] Failed to fetch technical indicators:', error);
    }
  }
  
  // Calculate weighted score
  const weightedScore = agreeingSources.reduce(
    (sum, source) => sum + (cfg.sourceWeights[source] || 1.0),
    0
  );
  
  // Check primary sources agreement
  const primarySourcesAgree = cfg.primarySources.some(ps => agreeingSources.includes(ps));
  
  // Determine approval
  let approved = false;
  let reason = '';
  
  // Check for conflicts first
  if (conflictingSources.length > 0 && conflictingSources.length >= agreeingSources.length) {
    approved = false;
    reason = `Signal conflict detected: ${conflictingSources.join(', ')} disagree with direction`;
  }
  // Check minimum agreeing sources
  else if (agreeingSources.length < cfg.minAgreeSources) {
    approved = false;
    reason = `Insufficient confluence: ${agreeingSources.length}/${cfg.minAgreeSources} sources agree`;
  }
  // Check weighted score
  else if (weightedScore < cfg.minWeightedScore) {
    approved = false;
    reason = `Weighted score ${weightedScore.toFixed(2)} below minimum ${cfg.minWeightedScore}`;
  }
  // Check primary source requirement
  else if (cfg.requirePrimarySources && !primarySourcesAgree) {
    approved = false;
    reason = `No primary sources (${cfg.primarySources.join(', ')}) agree with signal`;
  }
  else {
    approved = true;
    reason = `Confluence confirmed: ${agreeingSources.length} sources agree (score: ${weightedScore.toFixed(2)})`;
  }
  
  /**
   * ENHANCED CONFLUENCE SCORING
   * Tiered confidence boost based on quality and quantity of agreement
   */
  let confidenceBoost = 0;
  
  // Tier 1: Basic confluence (2 sources)
  if (agreeingSources.length >= 2) {
    confidenceBoost = 0.15;
  }
  
  // Tier 2: Strong confluence (3+ sources)
  if (agreeingSources.length >= 3) {
    confidenceBoost = 0.30;
  }
  
  // Tier 3: Exceptional confluence (4+ sources)
  if (agreeingSources.length >= 4) {
    confidenceBoost = 0.50;
  }
  
  // Bonus: Primary source agreement (adds 0.10)
  if (primarySourcesAgree) {
    confidenceBoost += 0.10;
  }
  
  // Bonus: High weighted score (adds up to 0.15)
  if (weightedScore >= 4.0) {
    confidenceBoost += 0.15;
  } else if (weightedScore >= 3.0) {
    confidenceBoost += 0.08;
  }
  
  // NEW: Bonus from TwelveData technical indicators
  if (technicalAnalysis) {
    confidenceBoost += technicalAnalysis.confluenceBoost;
    
    // Extra boost if ADX shows strong trend
    if (technicalAnalysis.trendStrength === 'STRONG') {
      confidenceBoost += 0.10;
    }
  }
  
  // Penalty: Conflicts reduce boost
  if (conflictingSources.length > 0) {
    confidenceBoost *= Math.max(0.3, 1 - (conflictingSources.length * 0.25));
  }
  
  // Cap at 1.0
  confidenceBoost = Math.min(1.0, confidenceBoost);
  
  return {
    approved,
    reason,
    agreeingSources,
    conflictingSources,
    neutralSources,
    weightedScore,
    totalSources: signalsBySource.size,
    primarySourcesAgree,
    direction: currentDirection,
    confidenceBoost,
    signals: Array.from(signalsBySource.values()),
    technicalAnalysis,
  };
}

/**
 * Quick check for any recent conflicting signals
 */
export async function hasRecentConflict(
  ticker: string,
  direction: SignalDirection,
  lookbackMinutes: number = 10
): Promise<boolean> {
  const supabase = createSupabaseClient();
  
  const lookbackTime = new Date();
  lookbackTime.setMinutes(lookbackTime.getMinutes() - lookbackMinutes);
  
  const { data: recentSignals } = await supabase
    .from('signals')
    .select('raw_payload, action, option_type')
    .eq('underlying', ticker.toUpperCase())
    .eq('status', 'COMPLETED')
    .gte('created_at', lookbackTime.toISOString());
  
  if (!recentSignals || recentSignals.length === 0) return false;
  
  // Check for any signal with opposite direction
  for (const sig of recentSignals) {
    const sigDirection = getSignalDirection({
      action: sig.action as SignalAction,
      option_type: sig.option_type as OptionType,
      raw_payload: sig.raw_payload as Record<string, unknown>,
    });
    
    if (
      (direction === 'BULLISH' && sigDirection === 'BEARISH') ||
      (direction === 'BEARISH' && sigDirection === 'BULLISH')
    ) {
      return true;
    }
  }
  
  return false;
}
