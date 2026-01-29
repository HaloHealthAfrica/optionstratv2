/**
 * Observability Service
 * Decision logging and rule performance tracking for learning
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  DecisionLog,
  RuleTrigger,
  TuningRecommendation,
  TuneDirection,
} from './types.ts';

const createSupabaseClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseServiceKey);
};

/**
 * Log a decision with full context for replay
 */
export async function logDecision(log: DecisionLog): Promise<string> {
  const supabase = createSupabaseClient();
  
  const { data, error } = await supabase
    .from('decision_log')
    .insert({
      decision_type: log.decisionType,
      ticker: log.ticker,
      action: log.action,
      action_reason: log.actionReason,
      context_snapshot: log.contextSnapshot,
      tv_signal: log.tvSignal ?? null,
      gex_signals: log.gexSignals ?? null,
      market_context: log.marketContext ?? null,
      mtf_trend: log.mtfTrend ?? null,
      positioning: log.positioning ?? null,
      confluence_score: log.confluenceScore ?? null,
      conflict_resolution: log.conflictResolution ?? null,
      regime_stability: log.regimeStability ?? null,
      position_sizing: log.positionSizing ?? null,
      confidence: log.confidence,
      quantity: log.quantity ?? null,
      price: log.price ?? null,
      rules_triggered: log.rulesTriggered,
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('[Observability] Error logging decision:', error);
    return '';
  }
  
  // Update rule hit counts
  for (const rule of log.rulesTriggered) {
    await incrementRuleHit(rule.ruleId);
  }
  
  return data.id;
}

/**
 * Update decision outcome after trade closes
 */
export async function updateDecisionOutcome(
  decisionId: string,
  pnl: number,
  wasCorrect: boolean
): Promise<void> {
  const supabase = createSupabaseClient();
  
  // Update the decision outcome
  await supabase
    .from('decision_log')
    .update({
      outcome_pnl: pnl,
      outcome_correct: wasCorrect,
      outcome_timestamp: new Date().toISOString(),
    })
    .eq('id', decisionId);
  
  // Get rules that were triggered and update their accuracy
  const { data: decision } = await supabase
    .from('decision_log')
    .select('rules_triggered')
    .eq('id', decisionId)
    .maybeSingle();
  
  if (decision?.rules_triggered && Array.isArray(decision.rules_triggered)) {
    for (const rule of decision.rules_triggered as RuleTrigger[]) {
      await updateRuleAccuracy(rule.ruleId, wasCorrect, pnl);
    }
  }
}

/**
 * Increment rule hit count
 */
async function incrementRuleHit(ruleId: string): Promise<void> {
  const supabase = createSupabaseClient();
  
  const { data: current } = await supabase
    .from('rule_performance')
    .select('times_triggered')
    .eq('rule_id', ruleId)
    .maybeSingle();
  
  if (current) {
    await supabase
      .from('rule_performance')
      .update({ 
        times_triggered: (current.times_triggered ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('rule_id', ruleId);
  } else {
    await supabase.from('rule_performance').insert({
      rule_id: ruleId,
      times_triggered: 1,
    });
  }
}

/**
 * Update rule accuracy after outcome
 */
async function updateRuleAccuracy(
  ruleId: string,
  wasCorrect: boolean,
  pnl: number
): Promise<void> {
  const supabase = createSupabaseClient();
  
  const { data: current } = await supabase
    .from('rule_performance')
    .select('*')
    .eq('rule_id', ruleId)
    .maybeSingle();
  
  if (!current) return;
  
  const timesTriggered = current.times_triggered ?? 1;
  const newTimesCorrect = (current.times_correct ?? 0) + (wasCorrect ? 1 : 0);
  const newAccuracy = timesTriggered > 0 ? newTimesCorrect / timesTriggered : 0;
  
  // Running average for PnL
  const oldAvgPnl = current.avg_pnl_when_triggered ?? 0;
  const newAvgPnl = timesTriggered > 1 
    ? (oldAvgPnl * (timesTriggered - 1) + pnl) / timesTriggered
    : pnl;
  
  // Determine tune direction
  let tuneDirection: TuneDirection = 'KEEP';
  let tuneConfidence = 0.5;
  
  if (timesTriggered >= 30) { // Need enough data
    if (newAccuracy < 0.45) {
      tuneDirection = 'LOOSEN'; // Rule is too strict, missing good trades
      tuneConfidence = 0.6 + (0.45 - newAccuracy);
    } else if (newAccuracy > 0.65 && newAvgPnl < 0) {
      tuneDirection = 'TIGHTEN'; // Rule lets through bad trades
      tuneConfidence = 0.6 + (newAccuracy - 0.65);
    }
  }
  
  // Calculate suggested threshold
  const currentThreshold = current.current_threshold ?? 0;
  const suggestedThreshold = tuneDirection === 'TIGHTEN' 
    ? currentThreshold * 1.2 
    : tuneDirection === 'LOOSEN'
      ? currentThreshold * 0.8
      : currentThreshold;
  
  await supabase
    .from('rule_performance')
    .update({
      times_correct: newTimesCorrect,
      accuracy_rate: newAccuracy,
      avg_pnl_when_triggered: newAvgPnl,
      tune_direction: tuneDirection,
      tune_confidence: Math.min(1, tuneConfidence),
      suggested_threshold: suggestedThreshold,
      updated_at: new Date().toISOString(),
    })
    .eq('rule_id', ruleId);
}

/**
 * Get tuning recommendations for all rules
 */
export async function getRuleTuningRecommendations(): Promise<TuningRecommendation[]> {
  const supabase = createSupabaseClient();
  
  const { data } = await supabase
    .from('rule_performance')
    .select('*')
    .gte('times_triggered', 20) // Only rules with enough data
    .order('tune_confidence', { ascending: false });
  
  return (data || [])
    .filter(r => r.tune_direction !== 'KEEP')
    .map(r => ({
      ruleId: r.rule_id,
      currentThreshold: r.current_threshold ?? 0,
      accuracy: r.accuracy_rate ?? 0,
      avgPnl: r.avg_pnl_when_triggered ?? 0,
      recommendation: r.tune_direction === 'TIGHTEN' 
        ? `Tighten threshold (accuracy ${((r.accuracy_rate ?? 0) * 100).toFixed(0)}% but avg PnL negative)`
        : `Loosen threshold (accuracy ${((r.accuracy_rate ?? 0) * 100).toFixed(0)}% - missing good trades)`,
      suggestedThreshold: r.suggested_threshold ?? (r.current_threshold ?? 0) * (r.tune_direction === 'TIGHTEN' ? 1.2 : 0.8),
    }));
}

/**
 * Get recent decisions for a ticker
 */
export async function getRecentDecisions(
  ticker: string,
  limit: number = 50
): Promise<DecisionLog[]> {
  const supabase = createSupabaseClient();
  
  const { data, error } = await supabase
    .from('decision_log')
    .select('*')
    .eq('ticker', ticker)
    .order('decision_timestamp', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('[Observability] Error fetching decisions:', error);
    return [];
  }
  
  return (data || []).map(row => ({
    decisionType: row.decision_type,
    ticker: row.ticker,
    action: row.action,
    actionReason: row.action_reason,
    contextSnapshot: row.context_snapshot ?? {},
    tvSignal: row.tv_signal,
    gexSignals: row.gex_signals,
    marketContext: row.market_context,
    mtfTrend: row.mtf_trend,
    positioning: row.positioning,
    confluenceScore: row.confluence_score,
    conflictResolution: row.conflict_resolution,
    regimeStability: row.regime_stability,
    positionSizing: row.position_sizing,
    confidence: row.confidence,
    quantity: row.quantity,
    price: row.price,
    rulesTriggered: row.rules_triggered ?? [],
  }));
}

/**
 * Get decision by ID for replay
 */
export async function getDecisionById(decisionId: string): Promise<DecisionLog | null> {
  const supabase = createSupabaseClient();
  
  const { data, error } = await supabase
    .from('decision_log')
    .select('*')
    .eq('id', decisionId)
    .maybeSingle();
  
  if (error || !data) return null;
  
  return {
    decisionType: data.decision_type,
    ticker: data.ticker,
    action: data.action,
    actionReason: data.action_reason,
    contextSnapshot: data.context_snapshot ?? {},
    tvSignal: data.tv_signal,
    gexSignals: data.gex_signals,
    marketContext: data.market_context,
    mtfTrend: data.mtf_trend,
    positioning: data.positioning,
    confluenceScore: data.confluence_score,
    conflictResolution: data.conflict_resolution,
    regimeStability: data.regime_stability,
    positionSizing: data.position_sizing,
    confidence: data.confidence,
    quantity: data.quantity,
    price: data.price,
    rulesTriggered: data.rules_triggered ?? [],
  };
}
