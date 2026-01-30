/**
 * Regime Stability Service
 * 
 * Tracks market regime transitions and gates entries during unstable periods.
 */

import { createDbClient } from '../db-client.ts';
import type {
  MarketRegime,
  DealerPosition,
  RegimeStability,
  RegimeStabilityConfig,
  RegimeObservation,
  RegimeHistoryRow,
  EntryGateResult,
} from './types.ts';
import { DEFAULT_REGIME_STABILITY_CONFIG } from './types.ts';

/**
 * Get Supabase client for regime operations
 */
function getSupabaseClient() {
  return createDbClient();
}

/**
 * Calculate stability score based on regime consistency
 * 
 * Score breakdown:
 * - Consecutive checks: max 30 points (10 per check, capped at 3)
 * - Time in regime: max 30 points (scaled over 10 minutes)
 * - Confidence: max 40 points (direct mapping)
 * - Penalty: up to -30 points for recent flip
 */
export function calculateStabilityScore(
  consecutiveSameRegime: number,
  timeInRegimeSeconds: number,
  regimeConfidence: number,
  secondsSinceFlip: number,
  config: RegimeStabilityConfig = DEFAULT_REGIME_STABILITY_CONFIG
): number {
  let score = 0;
  
  // Consecutive checks contribution (max 30 points)
  score += Math.min(30, consecutiveSameRegime * 10);
  
  // Time in regime contribution (max 30 points, full at 10 min)
  score += Math.min(30, (timeInRegimeSeconds / 600) * 30);
  
  // Confidence contribution (max 40 points)
  score += regimeConfidence * 40;
  
  // Penalty for recent flip (linear decay over cooldown period)
  if (secondsSinceFlip < config.flipCooldownSeconds) {
    const flipPenalty = (1 - (secondsSinceFlip / config.flipCooldownSeconds)) * 30;
    score -= flipPenalty;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Determine if regime is stable based on criteria
 */
export function isRegimeStable(
  consecutiveSameRegime: number,
  regimeConfidence: number,
  timeInRegimeSeconds: number,
  config: RegimeStabilityConfig = DEFAULT_REGIME_STABILITY_CONFIG
): boolean {
  return (
    consecutiveSameRegime >= config.minConsecutiveChecks &&
    regimeConfidence >= config.minConfidence &&
    timeInRegimeSeconds >= config.minTimeInRegimeSeconds
  );
}

/**
 * Get block reason if entry is not allowed
 */
export function getBlockReason(
  secondsSinceFlip: number,
  consecutiveSameRegime: number,
  regimeConfidence: number,
  config: RegimeStabilityConfig = DEFAULT_REGIME_STABILITY_CONFIG
): string | undefined {
  if (secondsSinceFlip < config.flipCooldownSeconds) {
    const minutesAgo = Math.floor(secondsSinceFlip / 60);
    const waitMinutes = Math.ceil((config.flipCooldownSeconds - secondsSinceFlip) / 60);
    return `Regime flip detected ${minutesAgo} min ago. Wait ${waitMinutes} more min.`;
  }
  
  if (consecutiveSameRegime < config.minConsecutiveChecks) {
    const needed = config.minConsecutiveChecks - consecutiveSameRegime;
    return `Regime not confirmed. Need ${needed} more consecutive check${needed > 1 ? 's' : ''}.`;
  }
  
  if (regimeConfidence < config.minConfidence) {
    return `Regime confidence too low (${(regimeConfidence * 100).toFixed(0)}% < ${config.minConfidence * 100}%)`;
  }
  
  return undefined;
}

/**
 * Record a regime observation and calculate stability
 */
export async function recordRegimeObservation(
  observation: RegimeObservation,
  config: RegimeStabilityConfig = DEFAULT_REGIME_STABILITY_CONFIG
): Promise<RegimeStability> {
  const supabase = getSupabaseClient();
  const { ticker, expiration, regime, regimeConfidence, dealerPosition, netGex, zeroGammaLevel } = observation;
  
  // Get last observation for this ticker
  const { data: lastObs } = await supabase
    .from('regime_history')
    .select('*')
    .eq('ticker', ticker)
    .order('checked_at', { ascending: false })
    .limit(1)
    .single();
  
  let consecutiveSameRegime = 1;
  let timeInRegimeSeconds = 0;
  let lastFlipTimestamp = new Date();
  let secondsSinceFlip = 0;
  
  if (lastObs) {
    const timeSinceLastCheck = (Date.now() - new Date(lastObs.checked_at).getTime()) / 1000;
    
    if (lastObs.regime === regime) {
      // Same regime - increment counters
      consecutiveSameRegime = (lastObs.consecutive_same_regime || 0) + 1;
      timeInRegimeSeconds = Math.floor((lastObs.time_in_regime_seconds || 0) + timeSinceLastCheck);
      lastFlipTimestamp = lastObs.last_flip_timestamp 
        ? new Date(lastObs.last_flip_timestamp) 
        : new Date(lastObs.checked_at);
    } else {
      // Regime changed - reset counters, record flip
      consecutiveSameRegime = 1;
      timeInRegimeSeconds = 0;
      lastFlipTimestamp = new Date();
      
      console.log(`[RegimeStability] Regime flip detected for ${ticker}: ${lastObs.regime} → ${regime}`);
    }
    
    secondsSinceFlip = Math.floor((Date.now() - lastFlipTimestamp.getTime()) / 1000);
  }
  
  // Calculate stability metrics
  const stabilityScore = calculateStabilityScore(
    consecutiveSameRegime,
    timeInRegimeSeconds,
    regimeConfidence,
    secondsSinceFlip,
    config
  );
  
  const isStable = isRegimeStable(
    consecutiveSameRegime,
    regimeConfidence,
    timeInRegimeSeconds,
    config
  );
  
  // Determine if can trade
  const blockReason = getBlockReason(
    secondsSinceFlip,
    consecutiveSameRegime,
    regimeConfidence,
    config
  );
  const canTrade = !blockReason;
  
  // Store observation
  const row: RegimeHistoryRow = {
    ticker,
    expiration: expiration || null,
    regime,
    regime_confidence: regimeConfidence,
    dealer_position: dealerPosition,
    net_gex: netGex,
    zero_gamma_level: zeroGammaLevel,
    consecutive_same_regime: consecutiveSameRegime,
    time_in_regime_seconds: timeInRegimeSeconds,
    last_flip_timestamp: lastFlipTimestamp.toISOString(),
    seconds_since_flip: secondsSinceFlip,
    stability_score: stabilityScore,
    is_stable: isStable,
  };
  
  const { error } = await supabase.from('regime_history').insert(row);
  if (error) {
    console.error('[RegimeStability] Failed to record observation:', error);
  }
  
  return {
    ticker,
    currentRegime: regime as MarketRegime,
    regimeConfidence,
    consecutiveSameRegime,
    timeInRegimeSeconds,
    secondsSinceFlip,
    stabilityScore,
    isStable,
    canTrade,
    blockReason,
  };
}

/**
 * Get current regime stability for a ticker
 */
export async function getRegimeStability(
  ticker: string,
  config: RegimeStabilityConfig = DEFAULT_REGIME_STABILITY_CONFIG
): Promise<RegimeStability | null> {
  const supabase = getSupabaseClient();
  
  const { data } = await supabase
    .from('regime_history')
    .select('*')
    .eq('ticker', ticker)
    .order('checked_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!data) return null;
  
  // Recalculate secondsSinceFlip based on current time
  const secondsSinceFlip = data.last_flip_timestamp 
    ? Math.floor((Date.now() - new Date(data.last_flip_timestamp).getTime()) / 1000)
    : 999999;
  
  // Recalculate canTrade with current time
  const blockReason = getBlockReason(
    secondsSinceFlip,
    data.consecutive_same_regime,
    data.regime_confidence,
    config
  );
  
  return {
    ticker,
    currentRegime: data.regime as MarketRegime,
    regimeConfidence: data.regime_confidence,
    consecutiveSameRegime: data.consecutive_same_regime,
    timeInRegimeSeconds: data.time_in_regime_seconds,
    secondsSinceFlip,
    stabilityScore: data.stability_score || 0,
    isStable: data.is_stable,
    canTrade: !blockReason,
    blockReason,
  };
}

/**
 * Check if entry is allowed based on regime stability
 * 
 * This is the main entry point for the decision engine to gate trades.
 */
export async function checkEntryGate(
  ticker: string,
  config: RegimeStabilityConfig = DEFAULT_REGIME_STABILITY_CONFIG
): Promise<EntryGateResult> {
  const stability = await getRegimeStability(ticker, config);
  
  if (!stability) {
    // No regime data - allow but with warning
    return {
      allowed: true,
      stability: {
        ticker,
        currentRegime: 'UNKNOWN',
        regimeConfidence: 0,
        consecutiveSameRegime: 0,
        timeInRegimeSeconds: 0,
        secondsSinceFlip: 999999,
        stabilityScore: 0,
        isStable: false,
        canTrade: true,
      },
      reason: 'No regime data available. Proceeding with caution.',
      recommendations: ['Run refresh-gex-signals to populate regime data'],
    };
  }
  
  if (!stability.canTrade) {
    return {
      allowed: false,
      stability,
      reason: stability.blockReason || 'Regime unstable',
      recommendations: getRecommendations(stability, config),
    };
  }
  
  return {
    allowed: true,
    stability,
    reason: `Regime stable: ${stability.currentRegime} (${(stability.regimeConfidence * 100).toFixed(0)}% confidence)`,
  };
}

/**
 * Get recommendations based on stability state
 */
function getRecommendations(
  stability: RegimeStability,
  config: RegimeStabilityConfig
): string[] {
  const recommendations: string[] = [];
  
  if (stability.secondsSinceFlip < config.flipCooldownSeconds) {
    const waitMinutes = Math.ceil((config.flipCooldownSeconds - stability.secondsSinceFlip) / 60);
    recommendations.push(`Wait ${waitMinutes} minutes for flip cooldown to expire`);
  }
  
  if (stability.consecutiveSameRegime < config.minConsecutiveChecks) {
    recommendations.push('Wait for next GEX refresh to confirm regime');
  }
  
  if (stability.regimeConfidence < config.minConfidence) {
    recommendations.push('Consider reducing position size due to low regime confidence');
  }
  
  if (stability.currentRegime === 'BREAKOUT_IMMINENT') {
    recommendations.push('Breakout detected - consider waiting for direction confirmation');
  }
  
  return recommendations;
}

/**
 * Update regime from GEX signal data
 * 
 * Called by refresh-gex-signals to update regime tracking.
 */
export async function updateRegimeFromGexSignal(
  gexSignal: {
    ticker: string;
    expiration: string;
    market_regime: string;
    regime_confidence: number;
    dealer_position: string;
    net_gex: number;
    zero_gamma_level: number | null;
  }
): Promise<RegimeStability> {
  return recordRegimeObservation({
    ticker: gexSignal.ticker,
    expiration: gexSignal.expiration,
    regime: gexSignal.market_regime as MarketRegime,
    regimeConfidence: gexSignal.regime_confidence / 100, // Convert to 0-1
    dealerPosition: gexSignal.dealer_position as DealerPosition,
    netGex: gexSignal.net_gex,
    zeroGammaLevel: gexSignal.zero_gamma_level,
  });
}
