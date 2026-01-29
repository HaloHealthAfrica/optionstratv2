/**
 * Risk Manager with market condition filters
 * Implements Requirements 6.2, 13.1, 13.3, 13.4
 */

import { Signal, ContextData, Config } from '../core/types.ts';

export interface MarketFilters {
  vixCheck: boolean;
  marketHoursCheck: boolean;
  trendCheck: boolean;
}

export interface ConfidenceAdjustments {
  contextAdjustment: number;
  positioningAdjustment: number;
  totalAdjustment: number;
}

export class RiskManager {
  constructor(private config: Config) {}

  /**
   * Apply market condition filters
   * Implements Requirements 13.1, 13.3, 13.4
   * 
   * Checks VIX, market hours, and trend conditions
   * Returns filter results and any position size reductions
   */
  applyMarketFilters(signal: Signal, context: ContextData): {
    passed: boolean;
    filters: MarketFilters;
    positionSizeMultiplier: number;
    rejectionReason?: string;
  } {
    const filters: MarketFilters = {
      vixCheck: true,
      marketHoursCheck: true,
      trendCheck: true,
    };

    let positionSizeMultiplier = 1.0;

    // Check VIX (Requirement 13.1)
    if (context.vix > 30) {
      // High VIX: reduce position size by 50%
      positionSizeMultiplier *= this.config.risk.vixPositionSizeReduction;
    }

    if (context.vix > this.config.risk.maxVixForEntry) {
      filters.vixCheck = false;
      return {
        passed: false,
        filters,
        positionSizeMultiplier,
        rejectionReason: `VIX too high: ${context.vix} > ${this.config.risk.maxVixForEntry}`,
      };
    }

    // Market hours check is handled by SignalValidator
    // This is a secondary check for context
    filters.marketHoursCheck = true;

    // Check trend conditions (Requirement 13.3)
    // Strong counter-trend reduces confidence
    const signalDirection = signal.direction;
    const isBullishSignal = signalDirection === 'CALL';
    const isBearishTrend = context.trend === 'BEARISH';
    const isBullishTrend = context.trend === 'BULLISH';

    // Counter-trend condition
    if ((isBullishSignal && isBearishTrend) || (!isBullishSignal && isBullishTrend)) {
      // Strong counter-trend - this will reduce confidence in calculateContextAdjustment
      filters.trendCheck = true; // Still pass, but will reduce confidence
    }

    return {
      passed: true,
      filters,
      positionSizeMultiplier,
    };
  }

  /**
   * Calculate context-based confidence adjustments
   * Implements Requirement 6.2
   * 
   * Adjusts confidence based on VIX, trend, and bias
   */
  calculateContextAdjustment(signal: Signal, context: ContextData): number {
    let adjustment = 0;

    // VIX adjustment
    if (context.vix < 15) {
      // Low VIX: increase confidence
      adjustment += 5;
    } else if (context.vix > 30) {
      // High VIX: decrease confidence
      adjustment -= 10;
    }

    // Trend adjustment (Requirement 13.3)
    const signalDirection = signal.direction;
    const isBullishSignal = signalDirection === 'CALL';
    
    if (context.trend === 'BULLISH' && isBullishSignal) {
      // Trend alignment: increase confidence
      adjustment += 10;
    } else if (context.trend === 'BEARISH' && !isBullishSignal) {
      // Trend alignment: increase confidence
      adjustment += 10;
    } else if (context.trend === 'BULLISH' && !isBullishSignal) {
      // Counter-trend: decrease confidence by 20 points
      adjustment -= 20;
    } else if (context.trend === 'BEARISH' && isBullishSignal) {
      // Counter-trend: decrease confidence by 20 points
      adjustment -= 20;
    }

    // Bias adjustment
    if (isBullishSignal && context.bias > 0.5) {
      // Bullish signal with bullish bias
      adjustment += 5;
    } else if (!isBullishSignal && context.bias < -0.5) {
      // Bearish signal with bearish bias
      adjustment += 5;
    } else if (isBullishSignal && context.bias < -0.5) {
      // Bullish signal with bearish bias
      adjustment -= 5;
    } else if (!isBullishSignal && context.bias > 0.5) {
      // Bearish signal with bullish bias
      adjustment -= 5;
    }

    // Clamp to configured range
    const maxAdjustment = this.config.confidence.contextAdjustmentRange;
    return Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustment));
  }

  /**
   * Calculate positioning-based confidence adjustments
   * Implements Requirement 6.2
   * 
   * Adjusts confidence based on regime and market positioning
   */
  calculatePositioningAdjustment(context: ContextData): number {
    let adjustment = 0;

    // Regime adjustment
    if (context.regime === 'LOW_VOL') {
      // Low volatility: increase confidence
      adjustment += 10;
    } else if (context.regime === 'HIGH_VOL') {
      // High volatility: decrease confidence
      adjustment -= 10;
    }

    // Additional positioning factors could be added here
    // (max pain, P/C ratio, etc.)

    // Clamp to configured range
    const maxAdjustment = this.config.confidence.positioningAdjustmentRange;
    return Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustment));
  }

  /**
   * Calculate all confidence adjustments
   * Returns both individual and total adjustments
   */
  calculateAllAdjustments(signal: Signal, context: ContextData): ConfidenceAdjustments {
    const contextAdjustment = this.calculateContextAdjustment(signal, context);
    const positioningAdjustment = this.calculatePositioningAdjustment(context);

    return {
      contextAdjustment,
      positioningAdjustment,
      totalAdjustment: contextAdjustment + positioningAdjustment,
    };
  }

  /**
   * Check if signal should be rejected based on risk criteria
   */
  shouldRejectSignal(signal: Signal, context: ContextData): {
    reject: boolean;
    reason?: string;
  } {
    const filterResult = this.applyMarketFilters(signal, context);

    if (!filterResult.passed) {
      return {
        reject: true,
        reason: filterResult.rejectionReason,
      };
    }

    return { reject: false };
  }

  /**
   * Get risk assessment summary
   */
  getRiskAssessment(signal: Signal, context: ContextData): {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    factors: string[];
    positionSizeMultiplier: number;
  } {
    const factors: string[] = [];
    let riskScore = 0;

    // VIX risk
    if (context.vix > 30) {
      riskScore += 2;
      factors.push(`High VIX: ${context.vix}`);
    } else if (context.vix < 15) {
      riskScore -= 1;
      factors.push(`Low VIX: ${context.vix}`);
    }

    // Trend risk
    const isBullishSignal = signal.direction === 'CALL';
    if ((isBullishSignal && context.trend === 'BEARISH') ||
        (!isBullishSignal && context.trend === 'BULLISH')) {
      riskScore += 2;
      factors.push('Counter-trend signal');
    }

    // Regime risk
    if (context.regime === 'HIGH_VOL') {
      riskScore += 1;
      factors.push('High volatility regime');
    }

    const filterResult = this.applyMarketFilters(signal, context);

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    if (riskScore >= 3) {
      riskLevel = 'HIGH';
    } else if (riskScore >= 1) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'LOW';
    }

    return {
      riskLevel,
      factors,
      positionSizeMultiplier: filterResult.positionSizeMultiplier,
    };
  }
}
