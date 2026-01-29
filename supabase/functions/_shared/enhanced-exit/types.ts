/**
 * Enhanced Exit Service Types
 * 
 * ATR-based volatility-adjusted stops, time-decay urgency, and partial profit taking
 */

export interface EnhancedExitConfig {
  // ATR-based stops
  atrMultiplierForStop: number;     // Default: 2.0
  minStopPercent: number;           // Minimum stop distance: 15%
  maxStopPercent: number;           // Maximum stop distance: 40%
  
  // Time decay urgency
  urgentDTE: number;                // Start being aggressive: 3 DTE
  criticalDTE: number;              // Very aggressive: 1 DTE
  
  // Partial profit scaling
  target1Percent: number;           // First target: 30%
  target1ExitPercent: number;       // Exit 25% at T1
  target2Percent: number;           // Second target: 60%
  target2ExitPercent: number;       // Exit 50% at T2
  trailRemainder: boolean;          // Trail the remaining 25%
  trailPercent: number;             // Trailing stop: 20%
}

export const DEFAULT_EXIT_CONFIG: EnhancedExitConfig = {
  atrMultiplierForStop: 2.0,
  minStopPercent: 15,
  maxStopPercent: 40,
  urgentDTE: 3,
  criticalDTE: 1,
  target1Percent: 30,
  target1ExitPercent: 25,
  target2Percent: 60,
  target2ExitPercent: 50,
  trailRemainder: true,
  trailPercent: 20,
};

export interface VolatilityAdjustedLevels {
  stopLoss: number;
  stopLossPercent: number;
  target1: number;
  target1Percent: number;
  target2: number;
  target2Percent: number;
  trailingStopPercent: number;
  reasoning: string;
}

export type TimeDecayUrgency = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface TimeDecayResult {
  urgency: TimeDecayUrgency;
  action: string;
  adjustedTargets: { 
    target1Multiplier: number; 
    target2Multiplier: number;
  };
}

export interface PartialExitStep {
  triggerPercent: number;
  exitPercent: number;
  remainingPercent: number;
  action: string;
}

export interface PartialExitPlan {
  exits: PartialExitStep[];
  trailingStopForRemainder: number;
}

export interface EnhancedExitResult {
  action: 'HOLD' | 'CLOSE_PARTIAL' | 'CLOSE_FULL';
  quantity: number;
  reason: string;
  urgency: string;
  newStopLoss?: number;
  volatilityLevels: VolatilityAdjustedLevels;
  timeDecay: TimeDecayResult;
}

export interface PositionForExit {
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  partialExitsTaken: number;
  highestPriceSinceEntry: number;
  dte: number;
  unrealizedPnlPercent: number;
}

export interface VolatilityData {
  atr: number;
  atrPercentile: number;
}
