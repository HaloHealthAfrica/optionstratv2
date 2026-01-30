/**
 * Core type definitions for the refactored trading system
 */

export type SignalSource = 'TRADINGVIEW' | 'GEX' | 'MTF' | 'MANUAL';
export type Direction = 'CALL' | 'PUT';
export type Trend = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type Regime = 'LOW_VOL' | 'HIGH_VOL' | 'NORMAL';
export type DecisionType = 'ENTER' | 'REJECT' | 'EXIT' | 'HOLD';
export type ExitReason = 'PROFIT_TARGET' | 'STOP_LOSS' | 'GEX_FLIP' | 'TIME_EXIT';
export type PositionStatus = 'OPEN' | 'CLOSED';

export interface Signal {
  id: string;
  source: SignalSource;
  symbol: string;
  direction: Direction;
  timeframe: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  checks: {
    cooldown: boolean;
    marketHours: boolean;
    mtf: boolean;
    confluence: boolean;
    timeFilters: boolean;
  };
  rejectionReason?: string;
  details: Record<string, any>;
}

export interface EntryDecision {
  decision: 'ENTER' | 'REJECT';
  signal: Signal;
  confidence: number;
  positionSize: number;
  reasoning: string[];
  calculations: {
    baseConfidence: number;
    contextAdjustment: number;
    positioningAdjustment: number;
    indicatorAdjustment: number;
    gexAdjustment: number;
    finalConfidence: number;
    baseSizing: number;
    kellyMultiplier: number;
    regimeMultiplier: number;
    confluenceMultiplier: number;
    indicatorSizeMultiplier: number;
    finalSize: number;
  };
}

export interface ExitDecision {
  decision: 'EXIT' | 'HOLD';
  position: Position;
  exitReason?: ExitReason;
  reasoning: string[];
  calculations: {
    profitTarget: boolean;
    stopLoss: boolean;
    gexFlip: boolean;
    timeExit: boolean;
    currentPnL: number;
    currentPnLPercent: number;
  };
}

export interface Position {
  id: string;
  signalId: string;
  symbol: string;
  direction: Direction;
  quantity: number;
  entryPrice: number;
  entryTime: Date;
  currentPrice?: number;
  unrealizedPnL?: number;
  status: PositionStatus;
  underlying?: string;
  strike?: number;
  expiration?: string;
  optionType?: 'CALL' | 'PUT';
  timeframe?: string;
}

export interface ContextData {
  vix: number;
  trend: Trend;
  bias: number;
  regime: Regime;
  timestamp: Date;
}

export interface GEXSignal {
  symbol: string;
  timeframe: string;
  strength: number;
  direction: Direction;
  timestamp: Date;
  age: number;
}

export interface Config {
  validation: {
    cooldownSeconds: number;
    marketHoursStart: string;
    marketHoursEnd: string;
    maxSignalAgeMinutes: number;
  };
  risk: {
    maxVixForEntry: number;
    vixPositionSizeReduction: number;
    maxPositionSize: number;
    maxTotalExposure: number;
  };
  sizing: {
    baseSize: number;
    kellyFraction: number;
    minSize: number;
    maxSize: number;
  };
  confidence: {
    baseConfidence: number;
    contextAdjustmentRange: number;
    positioningAdjustmentRange: number;
    gexAdjustmentRange: number;
  };
  cache: {
    contextTTLSeconds: number;
    deduplicationTTLSeconds: number;
  };
  gex: {
    maxStaleMinutes: number;
    staleWeightReduction: number;
  };
  exit?: {
    profitTargetPercent: number;
    stopLossPercent: number;
  };
}
