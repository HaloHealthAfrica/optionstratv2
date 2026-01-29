/**
 * GEX Signal Types
 * 
 * Types for the comprehensive GEX-based trading signal system
 */

// Market Regimes
export type MarketRegime = 
  | 'TRENDING_UP' 
  | 'TRENDING_DOWN' 
  | 'RANGE_BOUND' 
  | 'BREAKOUT_IMMINENT' 
  | 'REVERSAL_UP' 
  | 'REVERSAL_DOWN'
  | 'UNKNOWN';

export type DealerPosition = 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL';
export type Conviction = 'HIGH' | 'MEDIUM' | 'LOW';
export type BiasStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
export type TradeAction = 'BUY_CALLS' | 'BUY_PUTS' | 'SELL_CALLS' | 'SELL_PUTS' | 'SELL_STRADDLE' | 'SELL_STRANGLE' | 'IRON_CONDOR' | 'LONG_STRADDLE' | 'HOLD' | 'NO_TRADE';
export type Sentiment = 'EXTREME_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'EXTREME_BEARISH';

// GEX Flip Signal
export interface GEXFlipSignal {
  detected: boolean;
  direction: 'LONG_TO_SHORT' | 'SHORT_TO_LONG' | null;
  implication: string;
  tradeAction: TradeAction;
  conviction: Conviction;
  priceVsZeroGamma: 'ABOVE' | 'BELOW' | 'AT';
}

// Zero Gamma Breakout Signal
export interface ZeroGammaBreakoutSignal {
  zeroGammaLevel: number | null;
  currentPrice: number;
  distancePercent: number;
  direction: 'ABOVE' | 'BELOW' | 'AT';
  dealerPosition: DealerPosition;
  expectedBehavior: string;
  tradeAction: TradeAction;
  conviction: Conviction;
}

// GEX Wall
export interface GEXWall {
  strike: number;
  gexValue: number;
  strength: 'MAJOR' | 'MINOR';
  expectedBehavior: string;
}

// GEX Walls Signal
export interface GEXWallsSignal {
  callWalls: GEXWall[];  // Resistance (above current price)
  putWalls: GEXWall[];   // Support (below current price)
  nearestCallWall: GEXWall | null;
  nearestPutWall: GEXWall | null;
  currentRange: {
    support: number | null;
    resistance: number | null;
  };
  priceNearWall: boolean;
  wallType: 'CALL' | 'PUT' | null;
}

// Max Pain Magnet Signal
export interface MaxPainMagnetSignal {
  maxPainStrike: number;
  currentPrice: number;
  distancePercent: number;
  dte: number;
  magnetStrength: BiasStrength;
  expectedDirection: 'UP' | 'DOWN' | 'NEUTRAL';
  pinExpected: boolean;
  tradeAction: TradeAction;
}

// Put/Call Ratio Signal
export interface PCRatioSignal {
  volumeRatio: number;
  oiRatio: number;
  combinedRatio: number;
  sentiment: Sentiment;
  isExtreme: boolean;
  contrarianSignal: 'BUY' | 'SELL' | 'HOLD';
  conviction: Conviction;
  reasoning: string;
}

// Market Regime Analysis
export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  confidence: number;  // 0-100
  primaryDriver: string;
  strategy: TradeAction;
  reasoning: string;
}

// Complete GEX Signal Bundle
export interface GEXSignalBundle {
  ticker: string;
  expiration: string;
  currentPrice: number;
  underlyingPrice: number;
  calculatedAt: string;
  
  // Core GEX data
  netGex: number;
  dealerPosition: DealerPosition;
  previousDealerPosition?: DealerPosition;
  
  // Individual signals
  gexFlip: GEXFlipSignal;
  zeroGammaBreakout: ZeroGammaBreakoutSignal;
  gexWalls: GEXWallsSignal;
  maxPainMagnet: MaxPainMagnetSignal;
  pcRatio: PCRatioSignal;
  marketRegime: MarketRegimeAnalysis;
  
  // Summary
  summary: {
    overallBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    biasStrength: BiasStrength;
    recommendedAction: TradeAction;
    actionConviction: Conviction;
    reasoning: string;
    keyLevels: {
      support: number | null;
      resistance: number | null;
      zeroGamma: number | null;
      maxPain: number;
    };
  };
}

// Entry Decision Types
export interface EntryDecision {
  action: 'EXECUTE' | 'REJECT';
  confidence: number;  // 0-100
  quantity: number;
  adjustedQuantity: number;
  
  // Adjustments applied
  quantityMultiplier: number;
  confidenceAdjustments: {
    source: string;
    adjustment: number;
    reason: string;
  }[];
  
  // Trade plan
  stopLoss: number;
  target1: number;
  target2: number;
  trailingStopPct: number;
  maxHoldHours: number;
  
  // Decision context
  gexAlignment: 'ALIGNED' | 'NEUTRAL' | 'CONFLICTING';
  regimeAlignment: 'ALIGNED' | 'NEUTRAL' | 'CONFLICTING';
  
  // Rejection details (if rejected)
  rejectionReason?: string;
  rejectionDetails?: string;
  
  // Decision log
  decisionLog: {
    timestamp: string;
    factors: Record<string, unknown>;
    finalScore: number;
  };
}

// Hold Decision Types
export interface HoldDecision {
  action: 'HOLD' | 'EXIT' | 'PARTIAL_EXIT' | 'TIGHTEN_STOP';
  holdConfidence: number;  // 0-100
  
  // For partial exit
  exitQuantityPct?: number;
  
  // For tighten stop
  newStopLoss?: number;
  
  // Warnings
  warnings: {
    type: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    message: string;
  }[];
  
  // Regime changes
  regimeChanged: boolean;
  previousRegime?: MarketRegime;
  currentRegime: MarketRegime;
  regimeChangeImpact: 'FAVORABLE' | 'NEUTRAL' | 'UNFAVORABLE';
  
  // Decision log
  decisionLog: {
    timestamp: string;
    factors: Record<string, unknown>;
    holdScore: number;
  };
}

// Exit Decision Types
export type ExitUrgency = 'IMMEDIATE' | 'SOON' | 'OPTIONAL';
export type ExitTrigger = 
  | 'STOP_LOSS' 
  | 'TARGET_1' 
  | 'TARGET_2' 
  | 'TRAILING_STOP' 
  | 'GEX_FLIP' 
  | 'ZERO_GAMMA_BREAKOUT' 
  | 'REGIME_CHANGE' 
  | 'DTE_LIMIT' 
  | 'TIME_LIMIT' 
  | 'THETA_DECAY'
  | 'MANUAL';

export interface ExitDecision {
  action: 'CLOSE_FULL' | 'CLOSE_PARTIAL' | 'HOLD';
  urgency: ExitUrgency;
  trigger: ExitTrigger | null;
  
  // For partial exit
  exitQuantityPct?: number;
  
  // P&L at exit
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  
  // Decision details
  reason: string;
  details: string;
  
  // Decision log
  decisionLog: {
    timestamp: string;
    triggers: Record<string, boolean>;
    exitScore: number;
  };
}

// Paper Trade Status
export type PaperTradeStatus = 'OPEN' | 'PARTIAL_CLOSED' | 'CLOSED' | 'EXPIRED';

// Paper Trading Account Stats
export interface PaperTradingStats {
  accountName: string;
  startingBalance: number;
  currentBalance: number;
  
  // Overall performance
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number | null;
  averageWinner: number | null;
  averageLoser: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number;
  
  // By regime
  regimeStats: {
    regime: MarketRegime;
    trades: number;
    winRate: number | null;
  }[];
  
  // By signal type
  signalStats: {
    signal: string;
    trades: number;
    winRate: number | null;
  }[];
  
  // Current period
  dailyPnl: number;
  dailyTrades: number;
  weeklyPnl: number;
  weeklyTrades: number;
  
  // Open positions
  openPositions: number;
  openPositionValue: number;
}
