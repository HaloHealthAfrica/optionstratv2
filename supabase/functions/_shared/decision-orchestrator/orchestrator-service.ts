/**
 * Unified Decision Orchestrator Service
 * 
 * The single authority for entry, hold, and exit decisions.
 * Coordinates all six trading services into a deterministic, explainable decision engine.
 */

import { createDbClient } from "../db-client.ts";
import type {
  OrchestratorConfig,
  OrchestratorEntryInput,
  OrchestratorHoldInput,
  OrchestratorExitInput,
  IntegratedEntryDecision,
  IntegratedHoldDecision,
  IntegratedExitDecision,
  RuleTrigger,
  ExitPlan,
  ConfidenceBreakdown,
  DecisionContextSnapshot,
  OrchestratorDecisionLog,
} from './types.ts';
import { DEFAULT_ORCHESTRATOR_CONFIG } from './types.ts';

// Import existing services
import {
  createSignalScore,
  calculateConfluence,
  normalizeTVUltimateOptions,
  normalizeGEXAnalysis,
  normalizeContextWebhook,
  normalizePositioning,
  normalizeTVMtfDots,
} from '../signal-scoring/scoring-service.ts';
import type { SignalScore, Direction } from '../signal-scoring/types.ts';

import { resolveConflicts, updateSourceCredibility } from '../signal-scoring/conflict-resolution.ts';

import {
  recordRegimeObservation,
  getRegimeStability,
  checkEntryGate,
} from '../regime-stability/stability-service.ts';
import type { RegimeStability, MarketRegime, DealerPosition } from '../regime-stability/types.ts';

import { calculatePositionSize, updateRegimePerformance } from '../position-sizing/sizing-service.ts';
import type { PositionSizeCalculation } from '../position-sizing/types.ts';

import {
  calculateExitLevels,
  calculateTimeDecayUrgency,
  calculatePartialExitPlan,
  evaluateEnhancedExit,
} from '../enhanced-exit/exit-service.ts';
import type { VolatilityAdjustedLevels } from '../enhanced-exit/types.ts';

import { logDecision, updateDecisionOutcome } from '../observability/observability-service.ts';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSupabaseClient(): any {
  return createDbClient();
}

function mergeConfig(overrides?: Partial<OrchestratorConfig>): OrchestratorConfig {
  return { ...DEFAULT_ORCHESTRATOR_CONFIG, ...overrides };
}

function generateDecisionId(): string {
  return crypto.randomUUID();
}

/**
 * Determine alignment between signal direction and GEX bias
 */
function assessGEXAlignment(
  signalDirection: Direction,
  gexBias: string | undefined
): 'ALIGNED' | 'NEUTRAL' | 'CONFLICTING' {
  if (!gexBias) return 'NEUTRAL';
  
  const gexIsBullish = gexBias === 'BULLISH';
  const gexIsBearish = gexBias === 'BEARISH';
  const signalIsBullish = signalDirection === 'BULLISH';
  const signalIsBearish = signalDirection === 'BEARISH';
  
  if ((signalIsBullish && gexIsBullish) || (signalIsBearish && gexIsBearish)) {
    return 'ALIGNED';
  }
  if ((signalIsBullish && gexIsBearish) || (signalIsBearish && gexIsBullish)) {
    return 'CONFLICTING';
  }
  return 'NEUTRAL';
}

/**
 * Determine alignment between signal direction and regime
 */
function assessRegimeAlignment(
  signalDirection: Direction,
  regime: MarketRegime | undefined
): 'ALIGNED' | 'NEUTRAL' | 'CONFLICTING' {
  if (!regime || regime === 'UNKNOWN' || regime === 'RANGE_BOUND') return 'NEUTRAL';
  
  const bullishRegimes: MarketRegime[] = ['TRENDING_UP', 'REVERSAL_UP', 'BREAKOUT_IMMINENT'];
  const bearishRegimes: MarketRegime[] = ['TRENDING_DOWN', 'REVERSAL_DOWN'];
  
  const signalIsBullish = signalDirection === 'BULLISH';
  const signalIsBearish = signalDirection === 'BEARISH';
  const regimeIsBullish = bullishRegimes.includes(regime);
  const regimeIsBearish = bearishRegimes.includes(regime);
  
  if ((signalIsBullish && regimeIsBullish) || (signalIsBearish && regimeIsBearish)) {
    return 'ALIGNED';
  }
  if ((signalIsBullish && regimeIsBearish) || (signalIsBearish && regimeIsBullish)) {
    return 'CONFLICTING';
  }
  return 'NEUTRAL';
}

/**
 * Calculate confidence breakdown with all impacts
 */
function calculateConfidenceBreakdown(
  baseConfidence: number,
  confluenceScore: number,
  regimeStability: RegimeStability | null,
  conflictResolved: boolean,
  gexAlignment: 'ALIGNED' | 'NEUTRAL' | 'CONFLICTING',
  regimeAlignment: 'ALIGNED' | 'NEUTRAL' | 'CONFLICTING',
  positioningScore: number,
  contextScore: number,
  mtfScore: number
): ConfidenceBreakdown {
  let confidence = baseConfidence;
  
  // Confluence impact: +/- based on how far from 50 (neutral)
  const confluenceImpact = (confluenceScore - 50) * 0.3; // +/- 15 max
  confidence += confluenceImpact;
  
  // Regime impact
  let regimeImpact = 0;
  if (regimeStability) {
    if (regimeStability.isStable && regimeStability.regimeConfidence > 0.8) {
      regimeImpact = 10;
    } else if (!regimeStability.canTrade) {
      regimeImpact = -20;
    } else if (regimeStability.stabilityScore < 50) {
      regimeImpact = -10;
    }
  }
  confidence += regimeImpact;
  
  // Conflict resolution impact
  const conflictImpact = conflictResolved ? 0 : -15;
  confidence += conflictImpact;
  
  // GEX alignment impact
  const gexImpact = gexAlignment === 'ALIGNED' ? 10 : gexAlignment === 'CONFLICTING' ? -15 : 0;
  confidence += gexImpact;
  
  // Regime alignment impact
  const regimeAlignImpact = regimeAlignment === 'ALIGNED' ? 8 : regimeAlignment === 'CONFLICTING' ? -12 : 0;
  confidence += regimeAlignImpact;
  
  // Positioning impact
  const positioningImpact = (positioningScore - 50) * 0.15; // +/- 7.5 max
  confidence += positioningImpact;
  
  // Context impact
  const contextImpact = (contextScore - 50) * 0.1; // +/- 5 max
  confidence += contextImpact;
  
  // MTF impact
  const mtfImpact = (mtfScore - 50) * 0.2; // +/- 10 max
  confidence += mtfImpact;
  
  // Clamp to 0-100
  const clampedConfidence = Math.max(0, Math.min(100, confidence));
  
  return {
    baseConfidence,
    confluenceImpact,
    regimeImpact,
    conflictImpact,
    positioningImpact: positioningImpact + gexImpact, // Combined for simplicity
    contextImpact,
    mtfImpact: mtfImpact + regimeAlignImpact,
    finalConfidence: confidence,
    clampedConfidence,
  };
}

// =============================================================================
// ENTRY ORCHESTRATION
// =============================================================================

/**
 * Main entry decision orchestration
 * 
 * Implements the 7-step entry flow:
 * 1. Collect & Normalize Signals
 * 2. Regime Stability Check
 * 3. Conflict Resolution
 * 4. Position Sizing
 * 5. Exit Planning
 * 6. Final Decision
 * 7. Observability
 */
export async function orchestrateEntryDecision(
  input: OrchestratorEntryInput
): Promise<IntegratedEntryDecision> {
  const startTime = Date.now();
  const decisionId = generateDecisionId();
  const config = mergeConfig(input.configOverrides);
  const supabase = getSupabaseClient();
  
  const rulesTriggered: RuleTrigger[] = [];
  
  console.log(`[Orchestrator:${decisionId}] Starting entry decision for ${input.tvSignal.ticker}`);
  
  // Determine signal direction
  const signalDirection: Direction = input.tvSignal.action === 'BUY' ? 'BULLISH' : 
                                     input.tvSignal.action === 'SELL' ? 'BEARISH' : 'NEUTRAL';
  
  // ==========================================================================
  // STEP 1: Collect & Normalize Signals
  // ==========================================================================
  const signalScores: SignalScore[] = [];
  
  // Normalize TV signal
  const tvScore = createSignalScore(
    input.tvSignal.ticker,
    'TV_ULTIMATE_OPTIONS', // Default source, could be parameterized
    'ENTRY',
    75, // Base score for valid signal
    0,
    100,
    signalDirection,
    new Date(),
    input.tvSignal.rawPayload
  );
  signalScores.push(tvScore);
  
  // Normalize GEX if available
  if (input.gexSignals) {
    const gexScore = normalizeGEXAnalysis({
      ticker: input.tvSignal.ticker,
      overall_bias: input.gexSignals.summary.overallBias,
      regime_confidence: input.gexSignals.marketRegime.confidence,
      calculated_at: input.gexSignals.calculatedAt,
    });
    signalScores.push(gexScore);
  }
  
  // Normalize context if available
  if (input.marketContext) {
    // Handle timestamp as Date or string
    const contextTimestamp = input.marketContext.timestamp instanceof Date 
      ? input.marketContext.timestamp.toISOString() 
      : String(input.marketContext.timestamp);
    
    const contextScore = normalizeContextWebhook({
      ticker: input.tvSignal.ticker,
      vix_regime: input.marketContext.vixRegime,
      market_bias: input.marketContext.marketBias,
      or_breakout: input.marketContext.orBreakout,
      spy_trend: input.marketContext.spyTrend,
      updated_at: contextTimestamp,
    });
    signalScores.push(contextScore);
  }
  
  // Normalize MTF if available
  if (input.mtfTrend) {
    const mtfScore = normalizeTVMtfDots({
      ticker: input.tvSignal.ticker,
      bias: input.mtfTrend.bias,
      alignment_score: input.mtfTrend.alignmentScore,
      timestamp: new Date().toISOString(),
    });
    signalScores.push(mtfScore);
  }
  
  // Normalize positioning if available
  if (input.positioning) {
    const posScore = normalizePositioning({
      ticker: input.tvSignal.ticker,
      positioning_bias: input.positioning.pcSentiment,
      confidence: input.positioning.confidence,
      calculated_at: new Date().toISOString(),
    });
    signalScores.push(posScore);
  }
  
  // Calculate confluence
  const confluenceScore = calculateConfluence(signalScores);
  
  rulesTriggered.push({
    ruleId: 'SIGNAL_NORMALIZATION',
    category: 'ENTRY',
    condition: `Normalized ${signalScores.length} signal sources`,
    fired: true,
    impact: 0,
    details: `Confluence: ${confluenceScore.weightedConfluence.toFixed(1)}, Consensus: ${confluenceScore.directionConsensus}`,
  });
  
  console.log(`[Orchestrator:${decisionId}] Step 1 complete: ${signalScores.length} signals, confluence=${confluenceScore.weightedConfluence.toFixed(1)}`);
  
  // ==========================================================================
  // STEP 2: Regime Stability Check
  // ==========================================================================
  let regimeStability: RegimeStability | null = null;
  
  if (config.requireStableRegime && input.gexSignals) {
    // Record observation first
    regimeStability = await recordRegimeObservation({
      ticker: input.tvSignal.ticker,
      expiration: input.tvSignal.expiration,
      regime: input.gexSignals.marketRegime.regime as MarketRegime,
      regimeConfidence: input.gexSignals.marketRegime.confidence / 100,
      dealerPosition: input.gexSignals.dealerPosition as DealerPosition,
      netGex: input.gexSignals.netGex,
      zeroGammaLevel: input.gexSignals.zeroGammaBreakout.zeroGammaLevel,
    });
    
    rulesTriggered.push({
      ruleId: 'REGIME_STABILITY',
      category: 'REGIME',
      condition: `Regime: ${regimeStability.currentRegime}, Stable: ${regimeStability.isStable}`,
      fired: !regimeStability.canTrade,
      impact: regimeStability.canTrade ? 0 : -100,
      details: regimeStability.blockReason,
    });
    
    // If regime unstable, REJECT immediately
    if (!regimeStability.canTrade) {
      const durationMs = Date.now() - startTime;
      
      const decision: IntegratedEntryDecision = {
        action: 'REJECT',
        confidence: 0,
        baseQuantity: input.tvSignal.quantity,
        adjustedQuantity: 0,
        gexAlignment: 'NEUTRAL',
        regimeAlignment: 'CONFLICTING',
        signalScores,
        confluenceScore,
        regimeStability,
        conflictResolution: {
          canTrade: false,
          resolution: 'CONFLICT_REJECTED',
          bullishVotes: [],
          bearishVotes: [],
          bullishWeightedScore: 0,
          bearishWeightedScore: 0,
          winningDirection: 'TIE',
          confidence: 0,
          confidenceReason: 'Regime unstable',
          dissentingSources: [],
          dissentImpact: 'N/A',
        },
        positionSizing: {
          baseQuantity: input.tvSignal.quantity,
          adjustedQuantity: 0,
          kellyFactor: 0,
          vixFactor: 0,
          regimeFactor: 0,
          dealerFactor: 0,
          confluenceFactor: 0,
          totalMultiplier: 0,
          adjustments: [],
          estimatedRisk: 0,
          maxLossPercent: 0,
          wasLimitedByRisk: false,
          wasLimitedByVix: false,
        },
        confidenceBreakdown: {
          baseConfidence: 50,
          confluenceImpact: 0,
          regimeImpact: -100,
          conflictImpact: 0,
          positioningImpact: 0,
          contextImpact: 0,
          mtfImpact: 0,
          finalConfidence: 0,
          clampedConfidence: 0,
        },
        rulesTriggered,
        rejectionReason: 'REGIME_UNSTABLE',
        rejectionDetails: regimeStability.blockReason,
        recommendations: ['Wait for regime stabilization', 'Check GEX signals again in 15 minutes'],
        decisionId,
        timestamp: new Date().toISOString(),
        durationMs,
      };
      
      // Log decision
      if (config.logAllDecisions) {
        await logDecision({
          decisionType: 'ENTRY',
          ticker: input.tvSignal.ticker,
          action: 'REJECT',
          actionReason: regimeStability.blockReason || 'Regime unstable',
          contextSnapshot: buildContextSnapshot(input, signalScores, confluenceScore, regimeStability, null, null) as unknown as Record<string, unknown>,
          confidence: 0,
          rulesTriggered,
        });
      }
      
      console.log(`[Orchestrator:${decisionId}] REJECTED: ${regimeStability.blockReason}`);
      return decision;
    }
  } else {
    // Fetch existing stability if not enforcing
    regimeStability = await getRegimeStability(input.tvSignal.ticker);
  }
  
  console.log(`[Orchestrator:${decisionId}] Step 2 complete: Regime ${regimeStability?.currentRegime || 'UNKNOWN'}, canTrade=${regimeStability?.canTrade ?? true}`);
  
  // ==========================================================================
  // STEP 3: Conflict Resolution
  // ==========================================================================
  const conflictResolution = await resolveConflicts(signalScores, signalDirection);
  
  rulesTriggered.push({
    ruleId: 'CONFLICT_RESOLUTION',
    category: 'CONFLICT',
    condition: `Resolution: ${conflictResolution.resolution}`,
    fired: !conflictResolution.canTrade,
    impact: conflictResolution.canTrade ? 0 : -100,
    details: conflictResolution.confidenceReason,
  });
  
  if (!conflictResolution.canTrade && !config.allowConflictOverride) {
    const durationMs = Date.now() - startTime;
    
    const decision: IntegratedEntryDecision = {
      action: 'REJECT',
      confidence: conflictResolution.confidence * 100,
      baseQuantity: input.tvSignal.quantity,
      adjustedQuantity: 0,
      gexAlignment: assessGEXAlignment(signalDirection, input.gexSignals?.summary.overallBias),
      regimeAlignment: assessRegimeAlignment(signalDirection, regimeStability?.currentRegime),
      signalScores,
      confluenceScore,
      regimeStability,
      conflictResolution,
      positionSizing: {
        baseQuantity: input.tvSignal.quantity,
        adjustedQuantity: 0,
        kellyFactor: 0,
        vixFactor: 0,
        regimeFactor: 0,
        dealerFactor: 0,
        confluenceFactor: 0,
        totalMultiplier: 0,
        adjustments: [],
        estimatedRisk: 0,
        maxLossPercent: 0,
        wasLimitedByRisk: false,
        wasLimitedByVix: false,
      },
      confidenceBreakdown: {
        baseConfidence: 50,
        confluenceImpact: 0,
        regimeImpact: 0,
        conflictImpact: -100,
        positioningImpact: 0,
        contextImpact: 0,
        mtfImpact: 0,
        finalConfidence: 0,
        clampedConfidence: 0,
      },
      rulesTriggered,
      rejectionReason: 'UNRESOLVED_CONFLICT',
      rejectionDetails: conflictResolution.dissentImpact,
      recommendations: ['Wait for signal agreement', `Dissenting: ${conflictResolution.dissentingSources.join(', ')}`],
      decisionId,
      timestamp: new Date().toISOString(),
      durationMs,
    };
    
    if (config.logAllDecisions) {
      await logDecision({
        decisionType: 'ENTRY',
        ticker: input.tvSignal.ticker,
        action: 'REJECT',
        actionReason: 'Unresolved signal conflict',
        contextSnapshot: buildContextSnapshot(input, signalScores, confluenceScore, regimeStability, conflictResolution, null) as unknown as Record<string, unknown>,
        confidence: conflictResolution.confidence * 100,
        rulesTriggered,
      });
    }
    
    console.log(`[Orchestrator:${decisionId}] REJECTED: Unresolved conflict`);
    return decision;
  }
  
  console.log(`[Orchestrator:${decisionId}] Step 3 complete: Conflict ${conflictResolution.resolution}, canTrade=${conflictResolution.canTrade}`);
  
  // ==========================================================================
  // STEP 4: Position Sizing
  // ==========================================================================
  const regime = regimeStability?.currentRegime || 'UNKNOWN';
  const dealerPosition = input.gexSignals?.dealerPosition || 'NEUTRAL';
  const currentVix = input.marketContext?.vix || 20;
  
  // Estimate option price (would come from market data in real scenario)
  const estimatedOptionPrice = 2.50; // Placeholder
  
  const positionSizing = await calculatePositionSize(supabase, {
    baseQuantity: input.tvSignal.quantity,
    portfolioValue: input.portfolioValue,
    optionPrice: estimatedOptionPrice,
    regime,
    dealerPosition,
    currentVix,
    confluenceScore: confluenceScore.weightedConfluence,
    riskPerTradePercent: config.maxRiskPerTradePercent,
  });
  
  rulesTriggered.push({
    ruleId: 'POSITION_SIZING',
    category: 'SIZING',
    condition: `Kelly: ${positionSizing.kellyFactor.toFixed(2)}, VIX: ${positionSizing.vixFactor.toFixed(2)}`,
    fired: true,
    impact: 0,
    details: `${input.tvSignal.quantity} → ${positionSizing.adjustedQuantity} (${positionSizing.totalMultiplier.toFixed(2)}x)`,
  });
  
  console.log(`[Orchestrator:${decisionId}] Step 4 complete: Quantity ${input.tvSignal.quantity} → ${positionSizing.adjustedQuantity}`);
  
  // ==========================================================================
  // STEP 5: Exit Planning
  // ==========================================================================
  let exitPlan: ExitPlan | undefined;
  
  if (config.enableAtrStops && input.marketContext) {
    const atr = input.marketContext.atr;
    const atrPercentile = input.marketContext.atrPercentile;
    
    const levels = calculateExitLevels(estimatedOptionPrice, atr, atrPercentile);
    const partialPlan = calculatePartialExitPlan(positionSizing.adjustedQuantity);
    
    exitPlan = {
      stopLoss: levels.stopLoss,
      stopLossPercent: levels.stopLossPercent,
      target1: levels.target1,
      target1Percent: levels.target1Percent,
      target1ExitQuantity: Math.ceil(positionSizing.adjustedQuantity * 0.25),
      target2: levels.target2,
      target2Percent: levels.target2Percent,
      target2ExitQuantity: Math.ceil(positionSizing.adjustedQuantity * 0.50),
      trailingStopPercent: levels.trailingStopPercent,
      maxHoldHours: 168, // 7 days default
      reasoning: levels.reasoning,
    };
    
    rulesTriggered.push({
      ruleId: 'EXIT_PLANNING',
      category: 'EXIT',
      condition: `ATR-based stop at ${levels.stopLossPercent.toFixed(1)}%`,
      fired: true,
      impact: 0,
      details: `T1: +${levels.target1Percent.toFixed(1)}%, T2: +${levels.target2Percent.toFixed(1)}%`,
    });
  } else {
    // Default exit plan
    exitPlan = {
      stopLoss: estimatedOptionPrice * 0.75,
      stopLossPercent: 25,
      target1: estimatedOptionPrice * 1.30,
      target1Percent: 30,
      target1ExitQuantity: Math.ceil(positionSizing.adjustedQuantity * 0.25),
      target2: estimatedOptionPrice * 1.60,
      target2Percent: 60,
      target2ExitQuantity: Math.ceil(positionSizing.adjustedQuantity * 0.50),
      trailingStopPercent: 20,
      maxHoldHours: 168,
      reasoning: 'Default fixed exit levels',
    };
  }
  
  console.log(`[Orchestrator:${decisionId}] Step 5 complete: Stop=${exitPlan.stopLossPercent.toFixed(1)}%, T1=${exitPlan.target1Percent.toFixed(1)}%, T2=${exitPlan.target2Percent.toFixed(1)}%`);
  
  // ==========================================================================
  // STEP 6: Final Decision
  // ==========================================================================
  const gexAlignment = assessGEXAlignment(signalDirection, input.gexSignals?.summary.overallBias);
  const regimeAlignment = assessRegimeAlignment(signalDirection, regimeStability?.currentRegime);
  
  // Get individual scores for breakdown
  const posScore = signalScores.find(s => s.source === 'POSITIONING')?.decayedScore || 50;
  const ctxScore = signalScores.find(s => s.source === 'CONTEXT_WEBHOOK')?.decayedScore || 50;
  const mtfScore = signalScores.find(s => s.source === 'TV_MTF_DOTS')?.decayedScore || 50;
  
  const confidenceBreakdown = calculateConfidenceBreakdown(
    50, // Base confidence
    confluenceScore.weightedConfluence,
    regimeStability,
    conflictResolution.canTrade,
    gexAlignment,
    regimeAlignment,
    posScore,
    ctxScore,
    mtfScore
  );
  
  rulesTriggered.push({
    ruleId: 'CONFIDENCE_THRESHOLD',
    category: 'ENTRY',
    condition: `Confidence ${confidenceBreakdown.clampedConfidence.toFixed(1)} vs threshold ${config.minConfidenceToExecute}`,
    fired: confidenceBreakdown.clampedConfidence < config.minConfidenceToExecute,
    impact: confidenceBreakdown.clampedConfidence >= config.minConfidenceToExecute ? 0 : -100,
  });
  
  const shouldExecute = confidenceBreakdown.clampedConfidence >= config.minConfidenceToExecute;
  const durationMs = Date.now() - startTime;
  
  const decision: IntegratedEntryDecision = {
    action: shouldExecute ? 'EXECUTE' : 'REJECT',
    confidence: confidenceBreakdown.clampedConfidence,
    baseQuantity: input.tvSignal.quantity,
    adjustedQuantity: shouldExecute ? positionSizing.adjustedQuantity : 0,
    exitPlan: shouldExecute ? exitPlan : undefined,
    gexAlignment,
    regimeAlignment,
    signalScores,
    confluenceScore,
    regimeStability,
    conflictResolution,
    positionSizing,
    confidenceBreakdown,
    rulesTriggered,
    rejectionReason: shouldExecute ? undefined : 'LOW_CONFIDENCE',
    rejectionDetails: shouldExecute ? undefined : `Confidence ${confidenceBreakdown.clampedConfidence.toFixed(1)}% below threshold ${config.minConfidenceToExecute}%`,
    decisionId,
    timestamp: new Date().toISOString(),
    durationMs,
  };
  
  // ==========================================================================
  // STEP 7: Observability
  // ==========================================================================
  if (config.logAllDecisions) {
    await logDecision({
      decisionType: 'ENTRY',
      ticker: input.tvSignal.ticker,
      action: decision.action,
      actionReason: decision.rejectionReason || 'Trade approved',
      contextSnapshot: buildContextSnapshot(input, signalScores, confluenceScore, regimeStability, conflictResolution, positionSizing) as unknown as Record<string, unknown>,
      confidence: decision.confidence,
      quantity: decision.adjustedQuantity,
      rulesTriggered,
    });
  }
  
  console.log(`[Orchestrator:${decisionId}] DECISION: ${decision.action}, confidence=${decision.confidence.toFixed(1)}%, quantity=${decision.adjustedQuantity}, duration=${durationMs}ms`);
  
  return decision;
}

// =============================================================================
// HOLD ORCHESTRATION
// =============================================================================

/**
 * Hold decision orchestration - evaluates whether to continue holding a position
 */
export async function orchestrateHoldDecision(
  input: OrchestratorHoldInput
): Promise<IntegratedHoldDecision> {
  const decisionId = generateDecisionId();
  const config = mergeConfig(input.configOverrides);
  
  const rulesTriggered: RuleTrigger[] = [];
  const warnings: IntegratedHoldDecision['warnings'] = [];
  
  console.log(`[Orchestrator:${decisionId}] Evaluating hold for ${input.position.symbol}`);
  
  // Assess regime change
  const currentRegime = input.gexSignals.marketRegime.regime as MarketRegime;
  const entryRegime = input.position.entryMarketRegime;
  const regimeChanged = entryRegime ? currentRegime !== entryRegime : false;
  
  // Determine regime change impact
  let regimeChangeImpact: 'FAVORABLE' | 'NEUTRAL' | 'UNFAVORABLE' = 'NEUTRAL';
  if (regimeChanged && entryRegime) {
    const isLong = input.position.optionType === 'CALL';
    const bullishRegimes: MarketRegime[] = ['TRENDING_UP', 'REVERSAL_UP'];
    const bearishRegimes: MarketRegime[] = ['TRENDING_DOWN', 'REVERSAL_DOWN'];
    
    if (isLong && bullishRegimes.includes(currentRegime)) regimeChangeImpact = 'FAVORABLE';
    else if (isLong && bearishRegimes.includes(currentRegime)) regimeChangeImpact = 'UNFAVORABLE';
    else if (!isLong && bearishRegimes.includes(currentRegime)) regimeChangeImpact = 'FAVORABLE';
    else if (!isLong && bullishRegimes.includes(currentRegime)) regimeChangeImpact = 'UNFAVORABLE';
  }
  
  rulesTriggered.push({
    ruleId: 'REGIME_CHANGE_CHECK',
    category: 'REGIME',
    condition: `Regime: ${entryRegime || 'N/A'} → ${currentRegime}`,
    fired: regimeChanged,
    impact: regimeChangeImpact === 'UNFAVORABLE' ? -20 : regimeChangeImpact === 'FAVORABLE' ? 10 : 0,
  });
  
  // Check for warnings
  if (input.position.dte <= 3) {
    warnings.push({
      type: 'DTE_WARNING',
      severity: input.position.dte <= 1 ? 'HIGH' : 'MEDIUM',
      message: `Only ${input.position.dte} day(s) to expiration`,
    });
  }
  
  if (input.position.unrealizedPnlPct < -20) {
    warnings.push({
      type: 'DRAWDOWN_WARNING',
      severity: 'HIGH',
      message: `Position down ${Math.abs(input.position.unrealizedPnlPct).toFixed(1)}%`,
    });
  }
  
  if (regimeChangeImpact === 'UNFAVORABLE') {
    warnings.push({
      type: 'REGIME_WARNING',
      severity: 'MEDIUM',
      message: `Regime changed to ${currentRegime} (unfavorable for ${input.position.optionType})`,
    });
  }
  
  // Determine action
  let action: IntegratedHoldDecision['action'] = 'HOLD';
  let newStopLoss: number | undefined;
  let exitQuantityPct: number | undefined;
  let reason = 'Position within parameters';
  let details = `P&L: ${input.position.unrealizedPnlPct.toFixed(1)}%, DTE: ${input.position.dte}`;
  
  // Critical conditions for exit
  if (input.position.dte <= 1 && input.position.unrealizedPnlPct < -10) {
    action = 'EXIT';
    reason = 'Critical DTE with loss';
    details = 'Expiring soon with negative P&L - close to prevent total loss';
  } else if (regimeChangeImpact === 'UNFAVORABLE' && input.position.unrealizedPnlPct > 10) {
    action = 'PARTIAL_EXIT';
    exitQuantityPct = 50;
    reason = 'Regime turned unfavorable but in profit';
    details = 'Taking partial profits as regime changed against position';
  } else if (input.position.unrealizedPnlPct >= 25 && input.position.partialExitsTaken === 0) {
    action = 'TIGHTEN_STOP';
    newStopLoss = input.position.entryPrice; // Move to breakeven
    reason = 'In profit - tightening stop to breakeven';
    details = 'Protecting gains by moving stop to entry price';
  }
  
  // Calculate confidence
  let holdConfidence = 70;
  if (warnings.some(w => w.severity === 'HIGH')) holdConfidence -= 20;
  if (warnings.some(w => w.severity === 'MEDIUM')) holdConfidence -= 10;
  if (regimeChangeImpact === 'FAVORABLE') holdConfidence += 10;
  holdConfidence = Math.max(0, Math.min(100, holdConfidence));
  
  return {
    action,
    confidence: holdConfidence,
    exitQuantityPct,
    exitQuantity: exitQuantityPct ? Math.ceil(input.position.quantity * exitQuantityPct / 100) : undefined,
    newStopLoss,
    warnings,
    regimeChanged,
    previousRegime: entryRegime,
    currentRegime,
    regimeChangeImpact,
    rulesTriggered,
    reason,
    details,
    decisionId,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// EXIT ORCHESTRATION
// =============================================================================

/**
 * Exit decision orchestration - evaluates exit triggers for open positions
 */
export async function orchestrateExitDecision(
  input: OrchestratorExitInput
): Promise<IntegratedExitDecision> {
  const decisionId = generateDecisionId();
  const config = mergeConfig(input.configOverrides);
  
  const rulesTriggered: RuleTrigger[] = [];
  
  console.log(`[Orchestrator:${decisionId}] Evaluating exit for ${input.position.symbol}`);
  
  // Use enhanced exit service
  const enhancedResult = evaluateEnhancedExit(
    {
      entryPrice: input.position.entryPrice,
      currentPrice: input.position.currentPrice,
      quantity: input.position.quantity,
      partialExitsTaken: input.position.partialExitsTaken,
      highestPriceSinceEntry: input.position.highestPriceSinceEntry,
      dte: input.position.dte,
      unrealizedPnlPercent: input.position.unrealizedPnlPct,
    },
    input.volatility
  );
  
  // Add rule for whatever triggered
  rulesTriggered.push({
    ruleId: enhancedResult.action === 'HOLD' ? 'NO_EXIT_TRIGGER' : 'EXIT_TRIGGER',
    category: 'EXIT',
    condition: enhancedResult.reason,
    fired: enhancedResult.action !== 'HOLD',
    impact: enhancedResult.action === 'CLOSE_FULL' ? 100 : enhancedResult.action === 'CLOSE_PARTIAL' ? 50 : 0,
    details: enhancedResult.urgency,
  });
  
  // Check GEX-based exit triggers
  const isLong = input.position.optionType === 'CALL';
  const gexFlip = input.gexSignals.gexFlip;
  
  if (gexFlip.detected && input.position.unrealizedPnlPct > 10) {
    const flipAgainst = (gexFlip.tradeAction === 'BUY_PUTS' && isLong) ||
                        (gexFlip.tradeAction === 'BUY_CALLS' && !isLong);
    
    if (flipAgainst) {
      rulesTriggered.push({
        ruleId: 'GEX_FLIP_EXIT',
        category: 'EXIT',
        condition: `GEX flipped ${gexFlip.direction} against position`,
        fired: true,
        impact: 100,
        details: `With ${input.position.unrealizedPnlPct.toFixed(1)}% profit`,
      });
      
      // Override to full exit if GEX flipped against with profit
      if (enhancedResult.action === 'HOLD') {
        return {
          action: 'CLOSE_FULL',
          urgency: 'SOON',
          trigger: 'GEX_FLIP',
          exitQuantity: input.position.quantity - input.position.partialExitsTaken,
          unrealizedPnl: input.position.unrealizedPnl,
          unrealizedPnlPct: input.position.unrealizedPnlPct,
          volatilityLevels: enhancedResult.volatilityLevels,
          timeDecay: enhancedResult.timeDecay,
          rulesTriggered,
          reason: 'GEX regime flip against position',
          details: `${gexFlip.direction} flip detected with ${input.position.unrealizedPnlPct.toFixed(1)}% profit`,
          decisionId,
          timestamp: new Date().toISOString(),
        };
      }
    }
  }
  
  // Map enhanced result to integrated result
  const trigger = enhancedResult.action === 'HOLD' ? null : 
    enhancedResult.reason.includes('Stop') ? 'STOP_LOSS' :
    enhancedResult.reason.includes('Target 1') ? 'TARGET_1' :
    enhancedResult.reason.includes('Target 2') ? 'TARGET_2' :
    enhancedResult.reason.includes('Trailing') ? 'TRAILING_STOP' :
    enhancedResult.reason.includes('DTE') || enhancedResult.reason.includes('expir') ? 'DTE_LIMIT' :
    'TIME_DECAY';
  
  return {
    action: enhancedResult.action,
    urgency: enhancedResult.urgency === 'IMMEDIATE' ? 'IMMEDIATE' : 
             enhancedResult.urgency === 'SOON' ? 'SOON' : 'OPTIONAL',
    trigger,
    exitQuantity: enhancedResult.quantity,
    unrealizedPnl: input.position.unrealizedPnl,
    unrealizedPnlPct: input.position.unrealizedPnlPct,
    volatilityLevels: enhancedResult.volatilityLevels,
    timeDecay: enhancedResult.timeDecay,
    newStopLoss: enhancedResult.newStopLoss,
    rulesTriggered,
    reason: enhancedResult.reason,
    details: `Action: ${enhancedResult.action}, Urgency: ${enhancedResult.urgency}`,
    decisionId,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// LEARNING / FEEDBACK
// =============================================================================

/**
 * Record trade outcome for learning
 */
export async function recordTradeOutcome(
  decisionId: string,
  pnl: number,
  wasWinner: boolean,
  regime: string,
  dealerPosition: string,
  signalSources: string[]
): Promise<void> {
  const supabase = getSupabaseClient();
  
  // Update decision outcome
  await updateDecisionOutcome(decisionId, pnl, wasWinner);
  
  // Update regime performance for Kelly
  await updateRegimePerformance(supabase, regime, dealerPosition, pnl, wasWinner);
  
  // Update source credibility
  for (const source of signalSources) {
    await updateSourceCredibility(source as any, wasWinner);
  }
  
  console.log(`[Orchestrator] Recorded outcome for ${decisionId}: P&L=${pnl.toFixed(2)}, winner=${wasWinner}`);
}

// =============================================================================
// HELPER: Build context snapshot
// =============================================================================

function buildContextSnapshot(
  input: OrchestratorEntryInput,
  signalScores: SignalScore[],
  confluenceScore: any,
  regimeStability: RegimeStability | null,
  conflictResolution: any,
  positionSizing: PositionSizeCalculation | null
): DecisionContextSnapshot {
  return {
    tvSignal: input.tvSignal,
    gexSignals: input.gexSignals,
    marketContext: input.marketContext,
    mtfTrend: input.mtfTrend,
    positioning: input.positioning,
    signalScores,
    confluenceScore,
    conflictResolution,
    regimeStability,
    positionSizing: positionSizing || undefined,
    portfolioValue: input.portfolioValue,
    openPositionsCount: input.openPositionsCount,
  };
}
