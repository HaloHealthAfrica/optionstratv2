import type { IncomingSignal, OptionType, OrderType, TimeInForce, SignalAction } from "../types.ts";

/**
 * Ultimate Option Indicator Parser
 * 
 * Handles LONG/SHORT/TEST webhooks from Ultimate Option Indicator.
 * Derives options details (strike, expiration, option_type) from rules since
 * the indicator sends stock-focused signals.
 */

export interface UltimateOptionPayload {
  // Top-level required fields
  ticker?: string;
  trend?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score?: number;
  exchange?: string;
  timeframe?: string;
  current_price?: number;
  
  // Test mode fields
  test?: boolean;
  type?: string;
  timestamp?: number;
  price?: number;
  score_bull?: number;
  score_bear?: number;
  
  // Nested objects
  signal?: {
    type?: string;
    timeframe?: string;
    quality?: string;
    ai_score?: number;
    timestamp?: number;
  };
  
  instrument?: {
    exchange?: string;
    ticker?: string;
    current_price?: number;
  };
  
  entry?: {
    price?: number;
    stop_loss?: number;
    target_1?: number;
    target_2?: number;
    stop_reason?: string;
  };
  
  risk?: {
    amount?: number;
    rr_ratio_1?: number;
    rr_ratio_2?: number;
    stop_distance_percent?: number;
    recommended_shares?: number;
    recommended_contracts?: number;
    position_multiplier?: number;
  };
  
  market_context?: {
    vwap?: number;
    pmh?: number;
    pml?: number;
    day_open?: number;
    atr?: number;
    volume?: number;
    avg_volume?: number;
  };
  
  trend_data?: {
    ema_8?: number;
    ema_21?: number;
    ema_50?: number;
    alignment?: string;
    strength?: number;
    rsi?: number;
    macd?: number;
    macd_signal?: number;
  };
  
  mtf_context?: {
    bias_4h?: string;
    rsi_4h?: number;
    bias_1h?: string;
    rsi_1h?: number;
  };
  
  score_breakdown?: Record<string, number>;
  components?: string[];
  
  time_context?: {
    market_session?: string;
    day_of_week?: string;
  };
  
  // Allow additional fields
  [key: string]: unknown;
}

export interface ParseResult {
  signal: IncomingSignal | null;
  errors: string[];
  rawPayload: UltimateOptionPayload;
  isTest: boolean;
}

// Configuration for score-based decisions
export interface ScoreConfig {
  minThreshold: number;        // Minimum score to execute (e.g., 70)
  baseQuantity: number;        // Base contract quantity
  scalingFactor: number;       // How much to scale based on score
  maxQuantity: number;         // Maximum contracts regardless of score
}

const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  minThreshold: 0,  // Accept all signals for MTF aggregation
  baseQuantity: 1,
  scalingFactor: 0.05,  // 5% increase per point above threshold
  maxQuantity: 10,
};

/**
 * Calculate position size based on score
 * All signals are accepted; quantity scales with score strength
 */
function calculateQuantity(score: number, config: ScoreConfig = DEFAULT_SCORE_CONFIG): number {
  // Always return at least base quantity - all signals contribute to MTF analysis
  const scaledQty = config.baseQuantity + 
    Math.floor(Math.max(0, score - config.minThreshold) * config.scalingFactor);
  
  return Math.min(Math.max(1, scaledQty), config.maxQuantity);
}

/**
 * Derive ATM strike from current price
 * Rounds to nearest standard strike increment
 */
function deriveAtmStrike(currentPrice: number): number {
  // Standard strike increments based on price
  let increment: number;
  if (currentPrice < 25) {
    increment = 2.5;
  } else if (currentPrice < 200) {
    increment = 5;
  } else {
    increment = 10;
  }
  
  return Math.round(currentPrice / increment) * increment;
}

/**
 * Derive next monthly expiration (3rd Friday of next month)
 */
function deriveNextMonthlyExpiration(): string {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // Next month
  
  // If we're past the 3rd Friday, go to month after next
  const thisMonthThirdFriday = getThirdFriday(now.getFullYear(), now.getMonth());
  if (now > thisMonthThirdFriday) {
    month += 1;
  }
  
  if (month > 11) {
    month = 0;
    year += 1;
  }
  
  const thirdFriday = getThirdFriday(year, month);
  return thirdFriday.toISOString().split('T')[0];
}

function getThirdFriday(year: number, month: number): Date {
  const date = new Date(year, month, 1);
  // Find first Friday
  while (date.getDay() !== 5) {
    date.setDate(date.getDate() + 1);
  }
  // Add 2 weeks for third Friday
  date.setDate(date.getDate() + 14);
  return date;
}

/**
 * Parse Ultimate Option Indicator webhook payload
 */
export function parseUltimateOptionPayload(
  raw: unknown,
  scoreConfig: ScoreConfig = DEFAULT_SCORE_CONFIG
): ParseResult {
  const errors: string[] = [];
  
  if (!raw || typeof raw !== 'object') {
    return {
      signal: null,
      errors: ['Payload must be a valid JSON object'],
      rawPayload: {} as UltimateOptionPayload,
      isTest: false,
    };
  }
  
  const payload = raw as UltimateOptionPayload;
  
  // Check if this is a TEST ping
  if (payload.test === true || payload.type === 'PING') {
    return {
      signal: null,
      errors: [],
      rawPayload: payload,
      isTest: true,
    };
  }
  
  // Extract ticker - check multiple locations
  const ticker = payload.ticker || payload.instrument?.ticker;
  if (!ticker) {
    errors.push('Missing required field: ticker');
  }
  
  // Extract trend
  const trend = payload.trend;
  if (!trend || !['BULLISH', 'BEARISH'].includes(trend)) {
    errors.push('Missing or invalid trend (must be BULLISH or BEARISH)');
  }
  
  // Extract score - check multiple locations
  const score = payload.score ?? payload.signal?.ai_score ?? 0;
  
  // Store score in metadata for MTF aggregation - no threshold rejection
  
  // Extract current price - check multiple locations
  const currentPrice = payload.current_price ?? 
                       payload.instrument?.current_price ?? 
                       payload.entry?.price ??
                       payload.price;
  
  if (!currentPrice || currentPrice <= 0) {
    errors.push('Missing or invalid current_price');
  }
  
  if (errors.length > 0) {
    return {
      signal: null,
      errors,
      rawPayload: payload,
      isTest: false,
    };
  }
  
  // Derive options parameters
  const action: SignalAction = trend === 'BULLISH' ? 'BUY' : 'SELL';
  const optionType: OptionType = trend === 'BULLISH' ? 'CALL' : 'PUT';
  const strike = deriveAtmStrike(currentPrice!);
  const expiration = deriveNextMonthlyExpiration();
  const quantity = calculateQuantity(score, scoreConfig);
  
  // Get limit price from entry if available, otherwise market order
  const limitPrice = payload.entry?.price;
  const orderType: OrderType = limitPrice ? 'LIMIT' : 'MARKET';
  
  const signal: IncomingSignal = {
    source: 'ultimate-option',
    action,
    underlying: ticker!.toUpperCase(),
    strike,
    expiration,
    option_type: optionType,
    quantity,
    strategy_type: payload.signal?.type || 'DIRECTIONAL',
    limit_price: limitPrice,
    order_type: orderType,
    time_in_force: 'DAY' as TimeInForce,
    metadata: {
      original_score: score,
      score_breakdown: payload.score_breakdown,
      trend,
      trend_strength: payload.trend_data?.strength,
      rsi: payload.trend_data?.rsi,
      market_session: payload.time_context?.market_session,
      entry_price: payload.entry?.price,
      stop_loss: payload.entry?.stop_loss,
      target_1: payload.entry?.target_1,
      target_2: payload.entry?.target_2,
      risk_amount: payload.risk?.amount,
      rr_ratio: payload.risk?.rr_ratio_1,
      recommended_contracts: payload.risk?.recommended_contracts,
      vwap: payload.market_context?.vwap,
      atr: payload.market_context?.atr,
      mtf_bias_4h: payload.mtf_context?.bias_4h,
      mtf_bias_1h: payload.mtf_context?.bias_1h,
      components: payload.components,
    },
  };
  
  return {
    signal,
    errors: [],
    rawPayload: payload,
    isTest: false,
  };
}
