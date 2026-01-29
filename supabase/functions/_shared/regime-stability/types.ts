/**
 * Regime Stability Types
 * 
 * Types for tracking market regime transitions and stability for entry gating.
 */

export type MarketRegime = 
  | 'TRENDING_UP' 
  | 'TRENDING_DOWN' 
  | 'RANGE_BOUND' 
  | 'BREAKOUT_IMMINENT' 
  | 'REVERSAL_UP' 
  | 'REVERSAL_DOWN'
  | 'UNKNOWN';

export type DealerPosition = 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL';

/**
 * Configuration for regime stability requirements
 */
export interface RegimeStabilityConfig {
  minConsecutiveChecks: number;        // Must see same regime N+ times
  minConfidence: number;               // Regime confidence must be X%+
  minTimeInRegimeSeconds: number;      // Must be in regime for X+ seconds
  flipCooldownSeconds: number;         // Wait X seconds after flip
  checkIntervalSeconds: number;        // Expected check interval
}

/**
 * Default configuration values
 */
export const DEFAULT_REGIME_STABILITY_CONFIG: RegimeStabilityConfig = {
  minConsecutiveChecks: 2,        // Must see same regime 2+ times
  minConfidence: 0.75,            // Regime confidence must be 75%+
  minTimeInRegimeSeconds: 300,    // Must be in regime 5+ minutes
  flipCooldownSeconds: 900,       // Wait 15 min after flip
  checkIntervalSeconds: 300,      // Check every 5 min
};

/**
 * Current regime stability state
 */
export interface RegimeStability {
  ticker: string;
  currentRegime: MarketRegime;
  regimeConfidence: number;
  consecutiveSameRegime: number;
  timeInRegimeSeconds: number;
  secondsSinceFlip: number;
  stabilityScore: number;
  isStable: boolean;
  canTrade: boolean;
  blockReason?: string;
}

/**
 * Regime observation for recording
 */
export interface RegimeObservation {
  ticker: string;
  expiration?: string;
  regime: MarketRegime;
  regimeConfidence: number;
  dealerPosition: DealerPosition;
  netGex: number;
  zeroGammaLevel: number | null;
}

/**
 * Database row format
 */
export interface RegimeHistoryRow {
  id?: string;
  ticker: string;
  expiration: string | null;
  regime: string;
  regime_confidence: number;
  dealer_position: string | null;
  net_gex: number | null;
  zero_gamma_level: number | null;
  consecutive_same_regime: number;
  time_in_regime_seconds: number;
  last_flip_timestamp: string | null;
  seconds_since_flip: number | null;
  stability_score: number | null;
  is_stable: boolean;
  checked_at?: string;
}

/**
 * Entry gate result
 */
export interface EntryGateResult {
  allowed: boolean;
  stability: RegimeStability;
  reason: string;
  recommendations?: string[];
}
