/**
 * Position Sizing Types
 * 
 * Types for dynamic position sizing using Kelly Criterion and VIX scaling.
 */

export type VixLevel = 'LOW' | 'NORMAL' | 'ELEVATED' | 'HIGH' | 'VERY_HIGH' | 'EXTREME';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Kelly sizing result from historical performance
 */
export interface KellySizing {
  kellyFraction: number;      // Optimal bet size (0-0.25)
  halfKelly: number;          // Conservative Kelly (kellyFraction / 2)
  confidence: ConfidenceLevel;
  totalTrades: number;
  winRate: number;
}

/**
 * VIX-based sizing result
 */
export interface VixSizing {
  multiplier: number;         // Position size multiplier (0.1-1.2)
  maxPositions: number;       // Max concurrent positions allowed
  vixLevel: VixLevel;
  currentVix: number;
}

/**
 * Position size adjustment detail
 */
export interface SizeAdjustment {
  factor: string;             // KELLY, VIX, REGIME, DEALER, CONFLUENCE
  multiplier: number;         // The multiplier applied
  reason: string;             // Human-readable explanation
}

/**
 * Full position size calculation result
 */
export interface PositionSizeCalculation {
  // Quantities
  baseQuantity: number;
  adjustedQuantity: number;
  
  // Individual factors
  kellyFactor: number;
  vixFactor: number;
  regimeFactor: number;
  dealerFactor: number;
  confluenceFactor: number;
  
  // Combined
  totalMultiplier: number;
  
  // Adjustment log
  adjustments: SizeAdjustment[];
  
  // Risk metrics
  estimatedRisk: number;      // $ at risk (quantity * price * 100)
  maxLossPercent: number;     // % of portfolio at risk
  
  // Constraints applied
  wasLimitedByRisk: boolean;
  wasLimitedByVix: boolean;
}

/**
 * Regime performance data from database
 */
export interface RegimePerformanceRow {
  id?: string;
  regime: string;
  dealer_position: string | null;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number | null;
  total_pnl: number;
  average_win: number | null;
  average_loss: number | null;
  win_loss_ratio: number | null;
  kelly_fraction: number | null;
  half_kelly: number | null;
  period_start: string | null;
  period_end: string | null;
  updated_at?: string;
}

/**
 * VIX sizing rule from database
 */
export interface VixSizingRuleRow {
  id?: string;
  vix_min: number;
  vix_max: number;
  size_multiplier: number;
  max_positions: number | null;
  notes: string | null;
}

/**
 * Input parameters for position size calculation
 */
export interface PositionSizingInput {
  baseQuantity: number;
  portfolioValue: number;
  optionPrice: number;
  regime: string;
  dealerPosition: string;
  currentVix: number;
  confluenceScore: number;    // 0-100
  riskPerTradePercent?: number; // Default 2%
}

/**
 * Default sizing configuration
 */
export const DEFAULT_SIZING_CONFIG = {
  defaultKellyFraction: 0.02,   // 2% when no data
  maxKellyFraction: 0.25,       // Cap at 25%
  minQuantity: 1,
  defaultRiskPercent: 2,
  
  // Regime-specific multipliers (fallback)
  regimeMultipliers: {
    TRENDING_UP: 1.0,
    TRENDING_DOWN: 1.0,
    RANGE_BOUND: 0.7,
    BREAKOUT_IMMINENT: 1.2,
    REVERSAL_UP: 0.8,
    REVERSAL_DOWN: 0.8,
    UNKNOWN: 0.5,
  } as Record<string, number>,
  
  // Dealer position multipliers
  dealerMultipliers: {
    LONG_GAMMA: 1.0,
    NEUTRAL: 1.0,
    SHORT_GAMMA: 0.75,
  } as Record<string, number>,
};
