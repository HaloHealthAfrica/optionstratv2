/**
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use DecisionOrchestrator from refactored/orchestrator/decision-orchestrator.ts instead.
 * 
 * Decision Engine
 * Core risk evaluation with optional market context integration
 */

import type { 
  IncomingSignal, 
  Decision, 
  OrderSide, 
  RiskLimits, 
  RiskViolation,
  Position,
  ContextRiskLimits,
  DecisionWithContext,
  MTFTrendForDecision,
} from "./types.ts";
import type { MarketContextForDecision } from "./market-context-types.ts";
import { 
  applyContextAdjustments, 
  buildContextSummary, 
  buildMTFSummary 
} from "./context-adjustments.ts";

interface DecisionContext {
  signal: IncomingSignal;
  riskLimits: RiskLimits;
  openPositions: Position[];
  dailyPnL: number;
  weeklyPnL: number;
  totalPnL: number;
  // Optional context data
  marketContext?: MarketContextForDecision;
  mtfTrend?: MTFTrendForDecision;
  contextLimits?: ContextRiskLimits;
}

export function evaluateSignal(context: DecisionContext): DecisionWithContext {
  const { 
    signal, 
    riskLimits, 
    openPositions, 
    dailyPnL, 
    weeklyPnL, 
    totalPnL,
    marketContext,
    mtfTrend,
    contextLimits,
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
  // APPLY CONTEXT ADJUSTMENTS FIRST (can result in early rejection)
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

  // Add context violations to main violations list
  violations.push(...contextResult.violations);

  // Apply quantity adjustment from context
  let adjustedQuantity = Math.max(1, Math.floor(signal.quantity * contextResult.quantityMultiplier));

  // ========================================================================
  // STANDARD RISK CHECKS
  // ========================================================================

  // Risk check: Position size limit
  if (riskLimits.max_position_size && adjustedQuantity > riskLimits.max_position_size) {
    violations.push({
      violation_type: 'POSITION_SIZE',
      rule_violated: 'max_position_size',
      current_value: adjustedQuantity,
      limit_value: riskLimits.max_position_size,
      severity: 'CRITICAL',
    });
  }

  // Risk check: Total positions limit
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

  // Risk check: Daily loss limit (FIXED - only trigger on losses)
  if (riskLimits.max_daily_loss && dailyPnL <= -riskLimits.max_daily_loss) {
    violations.push({
      violation_type: 'DAILY_LOSS',
      rule_violated: 'max_daily_loss',
      current_value: Math.abs(dailyPnL),
      limit_value: riskLimits.max_daily_loss,
      severity: 'CRITICAL',
    });
  }

  // Risk check: Weekly loss limit (FIXED)
  if (riskLimits.max_weekly_loss && weeklyPnL <= -riskLimits.max_weekly_loss) {
    violations.push({
      violation_type: 'WEEKLY_LOSS',
      rule_violated: 'max_weekly_loss',
      current_value: Math.abs(weeklyPnL),
      limit_value: riskLimits.max_weekly_loss,
      severity: 'CRITICAL',
    });
  }

  // Risk check: Total portfolio loss (FIXED)
  if (riskLimits.max_total_portfolio_loss && totalPnL <= -riskLimits.max_total_portfolio_loss) {
    violations.push({
      violation_type: 'PORTFOLIO_LOSS',
      rule_violated: 'max_total_portfolio_loss',
      current_value: Math.abs(totalPnL),
      limit_value: riskLimits.max_total_portfolio_loss,
      severity: 'CRITICAL',
    });
  }

  // Risk check: Underlying exposure concentration
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
  // FINAL DECISION
  // ========================================================================

  // Check for critical violations
  const criticalViolations = violations.filter(v => v.severity === 'CRITICAL');
  if (criticalViolations.length > 0) {
    return {
      action: 'REJECT',
      side,
      quantity: adjustedQuantity,
      price_hint: signal.limit_price || null,
      order_type: signal.order_type || 'MARKET',
      reason: `Risk limit breached: ${criticalViolations.map(v => v.rule_violated).join(', ')}`,
      confidence: 1,
      risk_violations: violations,
      context_summary: buildContextSummary(marketContext || null),
      mtf_summary: buildMTFSummary(mtfTrend || null),
      adjustments_applied: contextResult.adjustmentsApplied,
    };
  }

  // Calculate final confidence
  let confidence = 1;
  const warningCount = violations.filter(v => v.severity === 'WARNING').length;
  confidence -= warningCount * 0.05; // -5% per warning
  confidence += contextResult.confidenceAdjustment;
  confidence = Math.max(0.3, Math.min(1, confidence)); // Clamp between 0.3 and 1

  // All checks passed - execute
  return {
    action: 'EXECUTE',
    side,
    quantity: adjustedQuantity,
    price_hint: signal.limit_price || null,
    order_type: signal.order_type || 'MARKET',
    reason: violations.length === 0 
      ? 'All risk checks passed' 
      : `Approved with ${violations.length} warning(s)`,
    confidence,
    risk_violations: violations,
    context_summary: buildContextSummary(marketContext || null),
    mtf_summary: buildMTFSummary(mtfTrend || null),
    adjustments_applied: contextResult.adjustmentsApplied,
  };
}
