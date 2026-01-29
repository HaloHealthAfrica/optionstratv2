/**
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use DecisionOrchestrator from refactored/orchestrator/decision-orchestrator.ts instead.
 * 
 * Enhanced Decision Engine with Market Data + Context + Trend Integration
 * 
 * Evaluates signals using:
 * - Real-time market data (Greeks, spreads, liquidity)
 * - Market context (VIX, S/R levels, session timing)
 * - MTF trend alignment
 * - Position sizing based on risk
 */

import type { 
  IncomingSignal, 
  Decision, 
  OrderSide, 
  RiskLimits, 
  RiskViolation,
  Position,
  OrderType,
  ContextRiskLimits,
  DecisionWithContext,
  MTFTrendForDecision,
  ContextSummary,
  MTFSummary,
} from "./types.ts";
import { getMarketDataService, type OptionsQuote } from "./market-data/index.ts";
import { getMarketPositioningService } from "./market-data/positioning-service.ts";
import { getLatestContext } from "./market-context-service.ts";
import { getLatestTrend } from "./trend-service.ts";
import { 
  applyContextAdjustments, 
  buildContextSummary, 
  buildMTFSummary,
  isBullishSignal,
  isBearishSignal,
} from "./context-adjustments.ts";
import { 
  applyPositioningAdjustments, 
  summarizePositioningAdjustments,
  type PositioningAdjustmentResult,
  type StrategyHint,
} from "./positioning-adjustments.ts";
import type { MarketContextForDecision } from "./market-context-types.ts";

export interface EnhancedDecisionContext {
  signal: IncomingSignal;
  riskLimits: RiskLimits;
  openPositions: Position[];
  dailyPnL: number;
  weeklyPnL: number;
  totalPnL: number;
  // Optional market data override (for testing)
  marketData?: OptionsQuote;
  // Context and trend data
  marketContext?: MarketContextForDecision;
  mtfTrend?: MTFTrendForDecision;
  contextLimits?: ContextRiskLimits;
  // Control flags
  fetchContextIfMissing?: boolean; // Default true
  fetchTrendIfMissing?: boolean;   // Default true
}

export interface EnhancedDecision extends DecisionWithContext {
  market_data?: {
    bid: number;
    ask: number;
    mid: number;
    spread: number;
    spread_percent: number;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    iv: number;
    underlying_price: number;
    provider: string;
  };
  positioning?: {
    bias: 'STRONGLY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONGLY_BEARISH';
    confidence: number;
    max_pain_strike?: number;
    pc_ratio?: number;
    gex_direction?: 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL';
    insights: string[];
    quantity_impact?: number;
    confidence_impact?: number;
    strategy_hints?: StrategyHint[];
  };
  order_adjustments?: {
    original_order_type: OrderType;
    adjusted_order_type: OrderType;
    limit_price?: number;
    adjustment_reason: string;
  };
}

// Thresholds for market data-based decisions
const MARKET_DATA_THRESHOLDS = {
  MAX_SPREAD_FOR_MARKET_ORDER: 5.0,
  MIN_OPEN_INTEREST: 100,
  MAX_IV_PERCENTILE: 85,
  MIN_DELTA_MAGNITUDE: 0.15,
  MAX_THETA_DECAY_PERCENT: 3.0,
  MAX_PORTFOLIO_DELTA: 500,
  MAX_PORTFOLIO_GAMMA: 100,
  MAX_PORTFOLIO_VEGA: 1000,
};

/**
 * Calculate spread metrics from bid/ask
 */
function calculateSpreadMetrics(bid: number, ask: number, mid: number) {
  const spread = ask - bid;
  const spreadPercent = mid > 0 ? (spread / mid) * 100 : 0;
  return { spread, spreadPercent };
}

/**
 * Determine optimal order type based on market conditions
 */
function determineOrderType(
  requestedType: OrderType,
  optionQuote: OptionsQuote
): { orderType: OrderType; limitPrice?: number; reason: string } {
  const { spreadPercent } = calculateSpreadMetrics(
    optionQuote.bid,
    optionQuote.ask,
    optionQuote.mid
  );

  if (spreadPercent > MARKET_DATA_THRESHOLDS.MAX_SPREAD_FOR_MARKET_ORDER) {
    return {
      orderType: 'LIMIT',
      limitPrice: optionQuote.mid,
      reason: `Wide spread (${spreadPercent.toFixed(1)}%) - using limit order at mid`,
    };
  }

  if (optionQuote.open_interest < MARKET_DATA_THRESHOLDS.MIN_OPEN_INTEREST) {
    return {
      orderType: 'LIMIT',
      limitPrice: optionQuote.mid,
      reason: `Low liquidity (OI: ${optionQuote.open_interest}) - using limit order`,
    };
  }

  return {
    orderType: requestedType,
    reason: 'Normal spread and liquidity',
  };
}

/**
 * Evaluate Greeks-based risk
 */
function evaluateGreeksRisk(
  optionQuote: OptionsQuote,
  openPositions: Position[],
  quantity: number,
  side: OrderSide
): RiskViolation[] {
  const violations: RiskViolation[] = [];
  
  const currentDelta = openPositions.reduce((sum, p) => sum + (p.delta || 0) * p.quantity, 0);
  const currentGamma = openPositions.reduce((sum, p) => sum + (p.gamma || 0) * p.quantity, 0);
  const currentVega = openPositions.reduce((sum, p) => sum + (p.vega || 0) * p.quantity, 0);
  
  const isOpening = side === 'BUY_TO_OPEN' || side === 'SELL_TO_OPEN';
  const isBuying = side === 'BUY_TO_OPEN' || side === 'BUY_TO_CLOSE';
  const multiplier = isOpening ? (isBuying ? 1 : -1) : (isBuying ? 1 : -1);
  
  const newDelta = optionQuote.delta * quantity * multiplier * 100;
  const newGamma = optionQuote.gamma * quantity * multiplier * 100;
  const newVega = optionQuote.vega * quantity * multiplier * 100;
  
  const projectedDelta = currentDelta + newDelta;
  const projectedGamma = currentGamma + newGamma;
  const projectedVega = currentVega + newVega;
  
  if (Math.abs(projectedDelta) > MARKET_DATA_THRESHOLDS.MAX_PORTFOLIO_DELTA) {
    violations.push({
      violation_type: 'PORTFOLIO_DELTA',
      rule_violated: 'max_portfolio_delta',
      current_value: Math.abs(projectedDelta),
      limit_value: MARKET_DATA_THRESHOLDS.MAX_PORTFOLIO_DELTA,
      severity: 'WARNING',
    });
  }
  
  if (Math.abs(projectedGamma) > MARKET_DATA_THRESHOLDS.MAX_PORTFOLIO_GAMMA) {
    violations.push({
      violation_type: 'PORTFOLIO_GAMMA',
      rule_violated: 'max_portfolio_gamma',
      current_value: Math.abs(projectedGamma),
      limit_value: MARKET_DATA_THRESHOLDS.MAX_PORTFOLIO_GAMMA,
      severity: 'WARNING',
    });
  }
  
  if (Math.abs(projectedVega) > MARKET_DATA_THRESHOLDS.MAX_PORTFOLIO_VEGA) {
    violations.push({
      violation_type: 'PORTFOLIO_VEGA',
      rule_violated: 'max_portfolio_vega',
      current_value: Math.abs(projectedVega),
      limit_value: MARKET_DATA_THRESHOLDS.MAX_PORTFOLIO_VEGA,
      severity: 'WARNING',
    });
  }
  
  if (isBuying && optionQuote.theta && optionQuote.mid > 0) {
    const dailyDecayPercent = Math.abs(optionQuote.theta) / optionQuote.mid * 100;
    if (dailyDecayPercent > MARKET_DATA_THRESHOLDS.MAX_THETA_DECAY_PERCENT) {
      violations.push({
        violation_type: 'THETA_DECAY',
        rule_violated: 'max_theta_decay_percent',
        current_value: dailyDecayPercent,
        limit_value: MARKET_DATA_THRESHOLDS.MAX_THETA_DECAY_PERCENT,
        severity: 'WARNING',
      });
    }
  }
  
  if (Math.abs(optionQuote.delta) < MARKET_DATA_THRESHOLDS.MIN_DELTA_MAGNITUDE) {
    violations.push({
      violation_type: 'LOW_DELTA',
      rule_violated: 'min_delta_magnitude',
      current_value: Math.abs(optionQuote.delta),
      limit_value: MARKET_DATA_THRESHOLDS.MIN_DELTA_MAGNITUDE,
      severity: 'WARNING',
    });
  }
  
  return violations;
}

/**
 * Enhanced signal evaluation with market data + context + trend
 */
export async function evaluateSignalWithMarketData(
  context: EnhancedDecisionContext
): Promise<EnhancedDecision> {
  const { 
    signal, 
    riskLimits, 
    openPositions, 
    dailyPnL, 
    weeklyPnL, 
    totalPnL,
    contextLimits,
    fetchContextIfMissing = true,
    fetchTrendIfMissing = true,
  } = context;
  
  const violations: RiskViolation[] = [];

  // Determine order side based on action
  let side: OrderSide;
  switch (signal.action) {
    case 'BUY':
      side = 'BUY_TO_OPEN';
      break;
    case 'SELL':
      side = 'SELL_TO_OPEN';
      break;
    case 'CLOSE':
      const existingPosition = openPositions.find(
        p => p.underlying === signal.underlying && 
             p.strike === signal.strike && 
             p.option_type === signal.option_type
      );
      if (existingPosition) {
        side = existingPosition.quantity > 0 ? 'SELL_TO_CLOSE' : 'BUY_TO_CLOSE';
      } else {
        return {
          action: 'REJECT',
          side: 'SELL_TO_CLOSE',
          quantity: 0,
          price_hint: null,
          order_type: signal.order_type || 'MARKET',
          reason: 'No existing position to close',
          confidence: 1,
          risk_violations: [],
        };
      }
      break;
    default:
      return {
        action: 'REJECT',
        side: 'BUY_TO_OPEN',
        quantity: 0,
        price_hint: null,
        order_type: 'MARKET',
        reason: `Invalid action: ${signal.action}`,
        confidence: 1,
        risk_violations: [],
      };
  }

  // ========================================================================
  // FETCH CONTEXT AND TREND DATA IF NOT PROVIDED
  // ========================================================================
  
  let marketContext: MarketContextForDecision | null = context.marketContext || null;
  let mtfTrend: MTFTrendForDecision | null = context.mtfTrend || null;

  // Fetch context if missing
  if (!marketContext && fetchContextIfMissing) {
    try {
      marketContext = await getLatestContext(signal.underlying);
      if (marketContext) {
        console.log(`[DecisionEngine] Fetched context for ${signal.underlying}: VIX=${marketContext.volatility.vix}, bias=${marketContext.market.marketBias}`);
      }
    } catch (error) {
      console.warn(`[DecisionEngine] Failed to fetch context: ${error}`);
    }
  }

  // Fetch trend if missing
  if (!mtfTrend && fetchTrendIfMissing) {
    try {
      mtfTrend = await getLatestTrend(signal.underlying);
      if (mtfTrend) {
        console.log(`[DecisionEngine] Fetched trend for ${signal.underlying}: bias=${mtfTrend.bias}, alignment=${mtfTrend.alignmentScore}%`);
      }
    } catch (error) {
      console.warn(`[DecisionEngine] Failed to fetch trend: ${error}`);
    }
  }

  // ========================================================================
  // APPLY CONTEXT ADJUSTMENTS (can result in early rejection)
  // ========================================================================
  
  const contextResult = applyContextAdjustments(
    signal,
    side,
    marketContext || null,
    mtfTrend || null,
    contextLimits
  );

  // Check for context-based rejection
  if (contextResult.shouldReject) {
    return {
      action: 'REJECT',
      side,
      quantity: 0,
      price_hint: null,
      order_type: signal.order_type || 'MARKET',
      reason: contextResult.rejectReason || 'Context-based rejection',
      confidence: 1,
      risk_violations: contextResult.violations,
      context_summary: buildContextSummary(marketContext || null),
      mtf_summary: buildMTFSummary(mtfTrend || null),
      adjustments_applied: contextResult.adjustmentsApplied,
    };
  }

  // Add context violations
  violations.push(...contextResult.violations);

  // Apply quantity adjustment from context
  let adjustedQuantity = Math.max(1, Math.floor(signal.quantity * contextResult.quantityMultiplier));

  // ========================================================================
  // FETCH MARKET DATA
  // ========================================================================
  
  let optionQuote: OptionsQuote | null = context.marketData || null;
  let marketDataError: string | null = null;

  if (!optionQuote) {
    try {
      const marketDataService = getMarketDataService();
      const result = await marketDataService.getOptionQuote(
        signal.underlying,
        signal.expiration,
        signal.strike,
        signal.option_type
      );
      
      if (result.success && result.data) {
        optionQuote = result.data;
        console.log(`[DecisionEngine] Market data fetched: bid=${optionQuote.bid}, ask=${optionQuote.ask}, delta=${optionQuote.delta}`);
      } else {
        marketDataError = result.error || 'Failed to fetch market data';
        console.warn(`[DecisionEngine] Market data fetch failed: ${marketDataError}`);
      }
    } catch (error) {
      marketDataError = error instanceof Error ? error.message : 'Unknown error fetching market data';
      console.error(`[DecisionEngine] Market data error: ${marketDataError}`);
    }
  }

  // ========================================================================
  // STANDARD RISK CHECKS
  // ========================================================================
  
  if (riskLimits.max_position_size && adjustedQuantity > riskLimits.max_position_size) {
    violations.push({
      violation_type: 'POSITION_SIZE',
      rule_violated: 'max_position_size',
      current_value: adjustedQuantity,
      limit_value: riskLimits.max_position_size,
      severity: 'CRITICAL',
    });
  }

  if (riskLimits.max_total_positions) {
    const openCount = openPositions.filter(p => !p.is_closed).length;
    if (signal.action === 'BUY' && openCount >= riskLimits.max_total_positions) {
      violations.push({
        violation_type: 'TOTAL_POSITIONS',
        rule_violated: 'max_total_positions',
        current_value: openCount,
        limit_value: riskLimits.max_total_positions,
        severity: 'CRITICAL',
      });
    }
  }

  // Daily loss limit (FIXED - only trigger on losses)
  if (riskLimits.max_daily_loss && dailyPnL <= -riskLimits.max_daily_loss) {
    violations.push({
      violation_type: 'DAILY_LOSS',
      rule_violated: 'max_daily_loss',
      current_value: Math.abs(dailyPnL),
      limit_value: riskLimits.max_daily_loss,
      severity: 'CRITICAL',
    });
  }

  // Weekly loss limit (FIXED)
  if (riskLimits.max_weekly_loss && weeklyPnL <= -riskLimits.max_weekly_loss) {
    violations.push({
      violation_type: 'WEEKLY_LOSS',
      rule_violated: 'max_weekly_loss',
      current_value: Math.abs(weeklyPnL),
      limit_value: riskLimits.max_weekly_loss,
      severity: 'CRITICAL',
    });
  }

  // Portfolio loss circuit breaker (FIXED)
  if (riskLimits.max_total_portfolio_loss && totalPnL <= -riskLimits.max_total_portfolio_loss) {
    violations.push({
      violation_type: 'PORTFOLIO_LOSS',
      rule_violated: 'max_total_portfolio_loss',
      current_value: Math.abs(totalPnL),
      limit_value: riskLimits.max_total_portfolio_loss,
      severity: 'CRITICAL',
    });
  }

  // Underlying exposure concentration
  if (riskLimits.max_underlying_exposure) {
    const underlyingPositions = openPositions.filter(
      p => p.underlying === signal.underlying && !p.is_closed
    );
    const underlyingExposure = underlyingPositions.reduce(
      (sum, p) => sum + Math.abs(p.total_cost), 0
    );
    const totalExposure = openPositions.reduce(
      (sum, p) => sum + Math.abs(p.total_cost), 0
    );
    
    if (totalExposure > 0) {
      const exposurePercent = (underlyingExposure / totalExposure) * 100;
      if (exposurePercent >= riskLimits.max_underlying_exposure) {
        violations.push({
          violation_type: 'UNDERLYING_EXPOSURE',
          rule_violated: 'max_underlying_exposure',
          current_value: exposurePercent,
          limit_value: riskLimits.max_underlying_exposure,
          severity: 'WARNING',
        });
      }
    }
  }

  // ========================================================================
  // MARKET DATA-BASED RISK CHECKS
  // ========================================================================
  
  let orderAdjustment: EnhancedDecision['order_adjustments'] | undefined;
  let marketDataInfo: EnhancedDecision['market_data'] | undefined;
  let positioningInfo: EnhancedDecision['positioning'] | undefined;

  if (optionQuote) {
    // Add Greeks-based risk violations
    const greeksViolations = evaluateGreeksRisk(
      optionQuote,
      openPositions,
      adjustedQuantity,
      side
    );
    violations.push(...greeksViolations);

    // Determine optimal order type
    const orderTypeDecision = determineOrderType(
      signal.order_type || 'MARKET',
      optionQuote
    );

    if (orderTypeDecision.orderType !== (signal.order_type || 'MARKET')) {
      orderAdjustment = {
        original_order_type: signal.order_type || 'MARKET',
        adjusted_order_type: orderTypeDecision.orderType,
        limit_price: orderTypeDecision.limitPrice,
        adjustment_reason: orderTypeDecision.reason,
      };
    }

    // Build market data info
    const { spread, spreadPercent } = calculateSpreadMetrics(
      optionQuote.bid,
      optionQuote.ask,
      optionQuote.mid
    );

    marketDataInfo = {
      bid: optionQuote.bid,
      ask: optionQuote.ask,
      mid: optionQuote.mid,
      spread,
      spread_percent: spreadPercent,
      delta: optionQuote.delta,
      gamma: optionQuote.gamma,
      theta: optionQuote.theta,
      vega: optionQuote.vega,
      iv: optionQuote.implied_volatility,
      underlying_price: optionQuote.underlying_price,
      provider: optionQuote.provider,
    };

    // Fetch positioning data and apply adjustments
    let positioningAdjustments: PositioningAdjustmentResult | null = null;
    
    try {
      const positioningService = getMarketPositioningService();
      const positioning = await positioningService.getPositioning(
        signal.underlying,
        signal.expiration
      );

      // Apply positioning-based adjustments (GEX, Max Pain, P/C ratio)
      positioningAdjustments = applyPositioningAdjustments(
        positioning,
        side,
        signal.option_type,
        signal.expiration,
        optionQuote.underlying_price
      );

      // Check for positioning-based rejection
      if (positioningAdjustments.shouldReject) {
        return {
          action: 'REJECT',
          side,
          quantity: 0,
          price_hint: null,
          order_type: signal.order_type || 'MARKET',
          reason: positioningAdjustments.rejectReason || 'Positioning-based rejection',
          confidence: 1,
          risk_violations: [...violations, ...positioningAdjustments.violations],
          context_summary: buildContextSummary(marketContext || null),
          mtf_summary: buildMTFSummary(mtfTrend || null),
          adjustments_applied: [...contextResult.adjustmentsApplied, ...positioningAdjustments.adjustmentsApplied],
        };
      }

      // Apply positioning quantity adjustment
      adjustedQuantity = Math.max(1, Math.floor(adjustedQuantity * positioningAdjustments.quantityMultiplier));
      
      // Add positioning violations
      violations.push(...positioningAdjustments.violations);
      
      // Track adjustments applied
      contextResult.adjustmentsApplied.push(...positioningAdjustments.adjustmentsApplied);

      // Build positioning info for response
      positioningInfo = {
        bias: positioning.positioning_bias,
        confidence: positioning.confidence,
        max_pain_strike: positioning.max_pain?.max_pain_strike,
        pc_ratio: positioning.put_call_ratio?.volume_ratio,
        gex_direction: positioning.gamma_exposure?.dealer_position,
        insights: positioning.insights.slice(0, 3),
        quantity_impact: positioningAdjustments.quantityMultiplier,
        confidence_impact: positioningAdjustments.confidenceAdjustment,
        strategy_hints: positioningAdjustments.strategyHints,
      };
      
      const adjustmentSummary = summarizePositioningAdjustments(positioningAdjustments);
      console.log(`[DecisionEngine] Positioning: ${positioning.positioning_bias} (${positioning.confidence}% conf) | ${adjustmentSummary}`);
    } catch (error) {
      console.warn(`[DecisionEngine] Positioning fetch failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  // ========================================================================
  // FINAL DECISION
  // ========================================================================

  // Check for critical violations
  const criticalViolations = violations.filter(v => v.severity === 'CRITICAL');
  if (criticalViolations.length > 0) {
    return {
      action: 'REJECT',
      side,
      quantity: adjustedQuantity,
      price_hint: signal.limit_price || orderAdjustment?.limit_price || null,
      order_type: signal.order_type || 'MARKET',
      reason: `Risk limit breached: ${criticalViolations.map(v => v.rule_violated).join(', ')}`,
      confidence: 1,
      risk_violations: violations,
      market_data: marketDataInfo,
      positioning: positioningInfo,
      order_adjustments: orderAdjustment,
      context_summary: buildContextSummary(marketContext || null),
      mtf_summary: buildMTFSummary(mtfTrend || null),
      adjustments_applied: contextResult.adjustmentsApplied,
    };
  }

  // Calculate final confidence (includes context + positioning adjustments)
  let confidence = 1;
  const warningCount = violations.filter(v => v.severity === 'WARNING').length;
  confidence -= warningCount * 0.03; // -3% per warning
  confidence += contextResult.confidenceAdjustment;
  // Add positioning confidence adjustment
  if (positioningInfo?.confidence_impact) {
    confidence += positioningInfo.confidence_impact;
  }
  if (marketDataError) confidence -= 0.1;
  confidence = Math.max(0.3, Math.min(1, confidence));

  // Determine final order type and price
  const finalOrderType = orderAdjustment?.adjusted_order_type || signal.order_type || 'MARKET';
  const finalPrice = orderAdjustment?.limit_price || signal.limit_price || (optionQuote?.mid) || null;

  return {
    action: 'EXECUTE',
    side,
    quantity: adjustedQuantity,
    price_hint: finalPrice,
    order_type: finalOrderType,
    reason: marketDataError 
      ? `Executing without market data: ${marketDataError}` 
      : violations.length === 0
        ? 'All risk checks passed with full context validation'
        : `Approved with ${violations.length} warning(s)`,
    confidence,
    risk_violations: violations,
    market_data: marketDataInfo,
    positioning: positioningInfo,
    order_adjustments: orderAdjustment,
    context_summary: buildContextSummary(marketContext || null),
    mtf_summary: buildMTFSummary(mtfTrend || null),
    adjustments_applied: contextResult.adjustmentsApplied,
  };
}

// Export the original function for backwards compatibility
export { evaluateSignal } from "./decision-engine.ts";
