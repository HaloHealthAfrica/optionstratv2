/**
 * Conflict Resolution Service
 * Weighted voting with source credibility to allow trades when majority agrees
 */

import { createDbClient } from "../db-client.ts";
import type {
  SignalScore,
  SignalSource,
  Direction,
  SourceCredibility,
  SourceVote,
  ConflictResolution,
  ConflictResolutionConfig,
} from './types.ts';
import { DEFAULT_CONFLICT_CONFIG } from './types.ts';

/**
 * Get source credibility scores from database
 */
export async function getSourceCredibilities(): Promise<Map<SignalSource, SourceCredibility>> {
  const db = createDbClient();
  
  const { data, error } = await db
    .from('source_credibility')
    .select('*');
  
  if (error) {
    console.error('[ConflictResolution] Error fetching credibilities:', error);
    return new Map();
  }
  
  const credibilities = new Map<SignalSource, SourceCredibility>();
  
  data?.forEach(row => {
    credibilities.set(row.source as SignalSource, {
      source: row.source as SignalSource,
      totalSignals: row.total_signals ?? 0,
      correctSignals: row.correct_signals ?? 0,
      accuracyRate: row.accuracy_rate ?? 0,
      recentTotal: row.recent_total ?? 0,
      recentCorrect: row.recent_correct ?? 0,
      recentAccuracy: row.recent_accuracy ?? 0,
      credibilityScore: row.credibility_score ?? 50,
      baseWeight: row.base_weight ?? 0.1,
      adjustedWeight: row.adjusted_weight ?? row.base_weight ?? 0.1,
    });
  });
  
  return credibilities;
}

/**
 * Calculate weighted score for a direction
 */
function calculateWeightedScore(
  signals: SignalScore[],
  credibilities: Map<SignalSource, SourceCredibility>
): number {
  return signals.reduce((sum, s) => {
    const cred = credibilities.get(s.source);
    const weight = cred?.adjustedWeight ?? 0.1;
    const credMultiplier = (cred?.credibilityScore ?? 50) / 50; // 50 = neutral
    return sum + weight * credMultiplier * (s.decayedScore / 100);
  }, 0);
}

/**
 * Create vote entries for signals
 */
function createVotes(
  signals: SignalScore[],
  credibilities: Map<SignalSource, SourceCredibility>
): SourceVote[] {
  return signals.map(s => ({
    source: s.source,
    weight: credibilities.get(s.source)?.adjustedWeight ?? 0.1,
    credibility: credibilities.get(s.source)?.credibilityScore ?? 50,
  }));
}

/**
 * Resolve conflicts between signals using weighted voting
 */
export async function resolveConflicts(
  signals: SignalScore[],
  tradeDirection: Direction,
  config: ConflictResolutionConfig = DEFAULT_CONFLICT_CONFIG
): Promise<ConflictResolution> {
  const credibilities = await getSourceCredibilities();
  
  // Separate signals by direction
  const bullishSignals = signals.filter(s => s.direction === 'BULLISH');
  const bearishSignals = signals.filter(s => s.direction === 'BEARISH');
  
  const bullishVotes = createVotes(bullishSignals, credibilities);
  const bearishVotes = createVotes(bearishSignals, credibilities);
  
  const bullishWeighted = calculateWeightedScore(bullishSignals, credibilities);
  const bearishWeighted = calculateWeightedScore(bearishSignals, credibilities);
  
  // No conflict if all agree or neutral
  if (bullishSignals.length === 0 || bearishSignals.length === 0) {
    const winningDir = bullishSignals.length > 0 ? 'BULLISH' : 
                       bearishSignals.length > 0 ? 'BEARISH' : 'TIE';
    return {
      canTrade: true,
      resolution: 'NO_CONFLICT',
      bullishVotes,
      bearishVotes,
      bullishWeightedScore: bullishWeighted,
      bearishWeightedScore: bearishWeighted,
      winningDirection: winningDir,
      confidence: 0.8,
      confidenceReason: 'No conflicting signals',
      dissentingSources: [],
      dissentImpact: 'None',
    };
  }
  
  // Calculate advantage
  const totalWeighted = bullishWeighted + bearishWeighted;
  const bullishPct = totalWeighted > 0 ? bullishWeighted / totalWeighted : 0.5;
  const bearishPct = totalWeighted > 0 ? bearishWeighted / totalWeighted : 0.5;
  
  const winningDirection = bullishPct > bearishPct ? 'BULLISH' : 
                           bearishPct > bullishPct ? 'BEARISH' : 'TIE';
  const advantage = Math.abs(bullishPct - bearishPct);
  
  // Determine dissenting sources
  const dissentingSources = tradeDirection === 'BULLISH' 
    ? bearishSignals.map(s => s.source)
    : bullishSignals.map(s => s.source);
  
  const dissentingWeight = dissentingSources.reduce((sum, source) => 
    sum + (credibilities.get(source)?.adjustedWeight ?? 0.1), 0
  );
  
  // Resolution logic
  let canTrade = false;
  let resolution: ConflictResolution['resolution'] = 'CONFLICT_REJECTED';
  let confidence = 0.5;
  let confidenceReason = '';
  
  // Check if majority wins
  const agreeingSources = tradeDirection === 'BULLISH' 
    ? bullishSignals.length 
    : bearishSignals.length;
  
  if (agreeingSources >= config.minAgreeingSources &&
      advantage >= config.minWeightedAdvantage &&
      dissentingWeight <= config.maxDissentingWeight) {
    canTrade = true;
    resolution = 'MAJORITY_WINS';
    confidence = 0.5 + (advantage * 0.5);
    confidenceReason = `${agreeingSources} sources agree (${(advantage * 100).toFixed(0)}% advantage)`;
  } else {
    // Check if high-credibility sources override
    const agreeing = tradeDirection === 'BULLISH' ? bullishVotes : bearishVotes;
    const dissenting = tradeDirection === 'BULLISH' ? bearishVotes : bullishVotes;
    
    const highCredAgreeing = agreeing.filter(v => v.credibility >= config.credibilityThreshold);
    const highCredDissenting = dissenting.filter(v => v.credibility >= config.credibilityThreshold);
    
    if (highCredAgreeing.length >= 2 && highCredDissenting.length === 0) {
      canTrade = true;
      resolution = 'CREDIBILITY_OVERRIDE';
      confidence = 0.65;
      confidenceReason = `${highCredAgreeing.length} high-credibility sources agree, no high-cred dissent`;
    } else {
      confidenceReason = `Insufficient agreement: ${agreeingSources} sources, ${(advantage * 100).toFixed(0)}% advantage, ${(dissentingWeight * 100).toFixed(0)}% dissent weight`;
    }
  }
  
  // Describe dissent impact
  let dissentImpact = 'None';
  if (dissentingSources.length > 0) {
    if (!canTrade) {
      dissentImpact = `Trade blocked: ${dissentingSources.join(', ')} disagree`;
    } else {
      dissentImpact = `Confidence reduced: ${dissentingSources.join(', ')} disagree (${(dissentingWeight * 100).toFixed(0)}% weight)`;
    }
  }
  
  return {
    canTrade,
    resolution,
    bullishVotes,
    bearishVotes,
    bullishWeightedScore: bullishWeighted,
    bearishWeightedScore: bearishWeighted,
    winningDirection,
    confidence,
    confidenceReason,
    dissentingSources,
    dissentImpact,
  };
}

/**
 * Update source credibility after trade outcome
 */
export async function updateSourceCredibility(
  source: SignalSource,
  wasCorrect: boolean
): Promise<void> {
  const supabase = createDbClient();
  
  const { data: current } = await supabase
    .from('source_credibility')
    .select('*')
    .eq('source', source)
    .single();
  
  if (!current) {
    console.warn(`[ConflictResolution] Source ${source} not found in credibility table`);
    return;
  }
  
  const newTotal = (current.total_signals ?? 0) + 1;
  const newCorrect = (current.correct_signals ?? 0) + (wasCorrect ? 1 : 0);
  const newAccuracy = newCorrect / newTotal;
  
  // Recent accuracy (rolling window of ~50)
  const oldRecentTotal = current.recent_total ?? 0;
  const oldRecentCorrect = current.recent_correct ?? 0;
  
  const recentTotal = Math.min(50, oldRecentTotal + 1);
  const recentCorrect = wasCorrect 
    ? Math.min(oldRecentCorrect + 1, recentTotal)
    : Math.max(0, oldRecentCorrect - (oldRecentTotal >= 50 ? 1 : 0));
  const recentAccuracy = recentTotal > 0 ? recentCorrect / recentTotal : 0;
  
  // Credibility score (weighted toward recent)
  const credibilityScore = (newAccuracy * 30 + recentAccuracy * 70) * 100;
  
  // Adjust weight based on credibility
  const credibilityMultiplier = 0.5 + (credibilityScore / 100); // 0.5 to 1.5
  const adjustedWeight = (current.base_weight ?? 0.1) * credibilityMultiplier;
  
  const { error } = await supabase
    .from('source_credibility')
    .update({
      total_signals: newTotal,
      correct_signals: newCorrect,
      accuracy_rate: newAccuracy,
      recent_total: recentTotal,
      recent_correct: recentCorrect,
      recent_accuracy: recentAccuracy,
      credibility_score: credibilityScore,
      adjusted_weight: adjustedWeight,
      updated_at: new Date().toISOString(),
    })
    .eq('source', source);
  
  if (error) {
    console.error(`[ConflictResolution] Error updating credibility for ${source}:`, error);
  }
}

/**
 * Get credibility summary for all sources
 */
export async function getCredibilitySummary(): Promise<SourceCredibility[]> {
  const credibilities = await getSourceCredibilities();
  return Array.from(credibilities.values());
}
