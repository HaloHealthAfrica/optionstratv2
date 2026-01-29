/**
 * Signal Scoring Types
 * 
 * Unified signal scoring system that normalizes all inputs to 0-100 scale with freshness decay.
 */

export type SignalSource = 
  | 'TV_ULTIMATE_OPTIONS'
  | 'TV_TREND_ENGINE'
  | 'TV_MTF_DOTS'
  | 'TV_STRAT_ENGINE'
  | 'TV_ORB_BHCH'
  | 'TV_SATY_PHASE'
  | 'GEX_ANALYSIS'
  | 'CONTEXT_WEBHOOK'
  | 'POSITIONING';

export type SignalType = 
  | 'ENTRY'
  | 'EXIT'
  | 'REGIME'
  | 'TREND'
  | 'MOMENTUM'
  | 'SENTIMENT'
  | 'PATTERN';

export type Direction = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type DirectionConsensus = 
  | 'STRONG_BULL' 
  | 'WEAK_BULL' 
  | 'MIXED' 
  | 'WEAK_BEAR' 
  | 'STRONG_BEAR';

export type DecayType = 'LINEAR' | 'EXPONENTIAL';

/**
 * Normalized signal score (0-100 scale)
 */
export interface SignalScore {
  // Identification
  ticker: string;
  source: SignalSource;
  signalType: SignalType;
  
  // Raw input
  rawScore: number;
  rawScaleMin: number;
  rawScaleMax: number;
  
  // Normalized (0-100)
  normalizedScore: number;
  
  // Direction
  direction: Direction;
  directionStrength: number; // 0-100
  
  // Freshness
  signalTimestamp: Date;
  ageSeconds: number;
  decayFactor: number; // 0-1
  decayedScore: number; // normalizedScore * decayFactor
  
  // Metadata
  sourceData: unknown;
}

/**
 * Individual score detail for confluence calculation
 */
export interface ScoreDetail {
  source: SignalSource;
  score: number;
  weight: number;
  direction: Direction;
  isFresh: boolean;
}

/**
 * Confluence score combining multiple signal sources
 */
export interface ConfluenceScore {
  ticker: string;
  evaluationTimestamp: Date;
  
  // Individual scores
  scores: ScoreDetail[];
  
  // Weighted total
  weightedConfluence: number; // 0-100
  
  // Direction consensus
  bullishSources: number;
  bearishSources: number;
  neutralSources: number;
  directionConsensus: DirectionConsensus;
  
  // Conflicts
  hasConflict: boolean;
  conflictDetails?: string;
}

/**
 * Decay configuration for signal freshness
 */
export interface DecayConfig {
  halfLifeSeconds: number;  // Time for score to decay to 50%
  maxAgeSeconds: number;    // After this, score = 0
  decayType: DecayType;
}

/**
 * Default decay configurations per signal source
 * 
 * Faster-moving signals (TV indicators, context) decay quickly
 * Slower signals (GEX, positioning) have longer half-lives
 */
export const DEFAULT_DECAY_CONFIGS: Record<SignalSource, DecayConfig> = {
  TV_ULTIMATE_OPTIONS: { halfLifeSeconds: 300, maxAgeSeconds: 900, decayType: 'EXPONENTIAL' },
  TV_TREND_ENGINE: { halfLifeSeconds: 300, maxAgeSeconds: 900, decayType: 'EXPONENTIAL' },
  TV_MTF_DOTS: { halfLifeSeconds: 600, maxAgeSeconds: 1800, decayType: 'LINEAR' },
  TV_STRAT_ENGINE: { halfLifeSeconds: 300, maxAgeSeconds: 900, decayType: 'EXPONENTIAL' },
  TV_ORB_BHCH: { halfLifeSeconds: 300, maxAgeSeconds: 900, decayType: 'EXPONENTIAL' },
  TV_SATY_PHASE: { halfLifeSeconds: 600, maxAgeSeconds: 1800, decayType: 'LINEAR' },
  GEX_ANALYSIS: { halfLifeSeconds: 900, maxAgeSeconds: 3600, decayType: 'LINEAR' },
  CONTEXT_WEBHOOK: { halfLifeSeconds: 300, maxAgeSeconds: 600, decayType: 'EXPONENTIAL' },
  POSITIONING: { halfLifeSeconds: 1800, maxAgeSeconds: 7200, decayType: 'LINEAR' },
};

/**
 * Default source weights for confluence calculation (must sum to 1.0)
 * 
 * Weights based on historical signal accuracy from algorithm optimization
 */
export const DEFAULT_SOURCE_WEIGHTS: Record<SignalSource, number> = {
  TV_ULTIMATE_OPTIONS: 0.20,  // High weight - proven performer
  TV_TREND_ENGINE: 0.12,
  TV_MTF_DOTS: 0.10,
  TV_STRAT_ENGINE: 0.15,      // strat_engine_v6 weight: 1.4
  TV_ORB_BHCH: 0.08,          // orb_bhch_bhch penalized (0.4)
  TV_SATY_PHASE: 0.05,        // saty-phase weight: 0.8
  GEX_ANALYSIS: 0.15,         // Core institutional signal
  CONTEXT_WEBHOOK: 0.08,
  POSITIONING: 0.07,
};

/**
 * Scale definitions for known signal sources
 */
export interface ScaleDefinition {
  min: number;
  max: number;
  description: string;
}

export const KNOWN_SCALES: Record<string, ScaleDefinition> = {
  // TradingView indicators
  TV_AI_SCORE: { min: 0, max: 10.5, description: 'Ultimate Options AI Score' },
  TV_CONFIDENCE: { min: 0, max: 6, description: 'Trend Engine confidence' },
  TV_ALIGNMENT: { min: 0, max: 100, description: 'MTF alignment percentage' },
  
  // GEX signals
  GEX_REGIME_CONFIDENCE: { min: 0, max: 100, description: 'Regime confidence' },
  GEX_BIAS_STRENGTH: { min: -100, max: 100, description: 'Directional bias' },
  
  // Context
  CONTEXT_COMPOSITE: { min: 0, max: 100, description: 'Composite context score' },
  
  // Positioning
  POSITIONING_CONFIDENCE: { min: 0, max: 100, description: 'Positioning confidence' },
};

/**
 * Database row types for persistence
 */
export interface SignalScoreRow {
  id?: string;
  ticker: string;
  signal_source: string;
  signal_type: string;
  raw_score: number;
  raw_scale_min: number | null;
  raw_scale_max: number | null;
  normalized_score: number;
  direction: string | null;
  direction_strength: number | null;
  signal_timestamp: string;
  age_seconds: number | null;
  decay_factor: number;
  decayed_score: number | null;
  source_data: unknown;
  created_at?: string;
}

export interface ConfluenceScoreRow {
  id?: string;
  ticker: string;
  evaluation_timestamp?: string;
  tv_score: number | null;
  tv_weight: number;
  gex_score: number | null;
  gex_weight: number;
  context_score: number | null;
  context_weight: number;
  mtf_score: number | null;
  mtf_weight: number;
  positioning_score: number | null;
  positioning_weight: number;
  weighted_confluence: number | null;
  bullish_sources: number | null;
  bearish_sources: number | null;
  neutral_sources: number | null;
  direction_consensus: string | null;
  has_conflict: boolean;
  conflict_details: string | null;
  created_at?: string;
}

/**
 * Source credibility tracking for conflict resolution
 */
export interface SourceCredibility {
  source: SignalSource;
  
  // Accuracy stats
  totalSignals: number;
  correctSignals: number;
  accuracyRate: number;
  
  // Recent performance
  recentTotal: number;
  recentCorrect: number;
  recentAccuracy: number;
  
  // Credibility score (0-100)
  credibilityScore: number;
  
  // Weight adjustment
  baseWeight: number;
  adjustedWeight: number;
}

export interface SourceVote {
  source: SignalSource;
  weight: number;
  credibility: number;
}

export type ConflictResolutionType = 
  | 'NO_CONFLICT' 
  | 'MAJORITY_WINS' 
  | 'CREDIBILITY_OVERRIDE' 
  | 'CONFLICT_REJECTED';

/**
 * Result of conflict resolution
 */
export interface ConflictResolution {
  canTrade: boolean;
  resolution: ConflictResolutionType;
  
  // Voting breakdown
  bullishVotes: SourceVote[];
  bearishVotes: SourceVote[];
  
  // Weighted scores
  bullishWeightedScore: number;
  bearishWeightedScore: number;
  winningDirection: 'BULLISH' | 'BEARISH' | 'TIE';
  
  // Confidence
  confidence: number;
  confidenceReason: string;
  
  // Dissenting sources
  dissentingSources: SignalSource[];
  dissentImpact: string;
}

/**
 * Configuration for conflict resolution
 */
export interface ConflictResolutionConfig {
  minAgreeingSources: number;      // Need at least N sources to agree
  minWeightedAdvantage: number;    // Winning side needs X% advantage
  maxDissentingWeight: number;     // Dissenting sources can't exceed X% weight
  credibilityThreshold: number;    // High credibility = X+
}

export const DEFAULT_CONFLICT_CONFIG: ConflictResolutionConfig = {
  minAgreeingSources: 3,
  minWeightedAdvantage: 0.15,
  maxDissentingWeight: 0.30,
  credibilityThreshold: 60,
};
