import type { IncomingSignal, OptionType, OrderType, TimeInForce, SignalAction } from "../types.ts";

/**
 * Multi-Timeframe Trend Dots Parser
 * 
 * Handles trend_change and bar_update webhooks from the MTF Trend Dots indicator.
 * Uses alignment_score and bias to determine trade direction and sizing.
 */

export type TrendDirection = 'bullish' | 'bearish' | 'neutral';
export type OverallBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface TimeframeData {
  dir: TrendDirection;
  chg: boolean;
}

export interface MtfTrendDotsPayload {
  ticker?: string;
  symbol?: string;
  exchange?: string;
  price?: number;
  current_price?: number;
  bias?: OverallBias;
  event?: 'trend_change' | 'bar_update';
  trigger_timeframe?: string;
  timestamp?: number;
  alignment_score?: number;
  bullish_count?: number;
  bearish_count?: number;
  
  timeframes?: {
    '3m'?: TimeframeData;
    '5m'?: TimeframeData;
    '15m'?: TimeframeData;
    '30m'?: TimeframeData;
    '1h'?: TimeframeData;
    '4h'?: TimeframeData;
    '1w'?: TimeframeData;
    '1M'?: TimeframeData;
  };
  
  meta?: {
    version?: string;
    source?: string;
    indicator_name?: string;
    bar_time?: string;
  };
  
  [key: string]: unknown;
}

export interface ParseResult {
  signal: IncomingSignal | null;
  errors: string[];
  rawPayload: MtfTrendDotsPayload;
  isTest: boolean;
}

export interface ScoreConfig {
  minThreshold: number;
  baseQuantity: number;
  scalingFactor: number;
  maxQuantity: number;
}

const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  minThreshold: 0,  // Accept all signals for MTF aggregation
  baseQuantity: 1,
  scalingFactor: 0.05,
  maxQuantity: 10,
};

/**
 * Calculate position size based on alignment score
 * All signals are accepted; quantity scales with alignment
 */
function calculateQuantity(score: number, config: ScoreConfig): number {
  const scaledQty = config.baseQuantity + 
    Math.floor(Math.max(0, score - config.minThreshold) * config.scalingFactor);
  return Math.min(Math.max(1, scaledQty), config.maxQuantity);
}

/**
 * Derive ATM strike from current price
 */
function deriveAtmStrike(currentPrice: number): number {
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
 * Derive next monthly expiration (3rd Friday)
 */
function deriveNextMonthlyExpiration(): string {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  
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
  while (date.getDay() !== 5) {
    date.setDate(date.getDate() + 1);
  }
  date.setDate(date.getDate() + 14);
  return date;
}

/**
 * Analyze which timeframes changed and in what direction
 */
function analyzeTimeframeChanges(timeframes: MtfTrendDotsPayload['timeframes']): {
  changedTimeframes: string[];
  bullishChanges: number;
  bearishChanges: number;
} {
  if (!timeframes) {
    return { changedTimeframes: [], bullishChanges: 0, bearishChanges: 0 };
  }
  
  const changedTimeframes: string[] = [];
  let bullishChanges = 0;
  let bearishChanges = 0;
  
  for (const [tf, data] of Object.entries(timeframes)) {
    if (data?.chg) {
      changedTimeframes.push(tf);
      if (data.dir === 'bullish') bullishChanges++;
      if (data.dir === 'bearish') bearishChanges++;
    }
  }
  
  return { changedTimeframes, bullishChanges, bearishChanges };
}

/**
 * Parse Multi-Timeframe Trend Dots webhook payload
 */
export function parseMtfTrendDotsPayload(
  raw: unknown,
  scoreConfig: ScoreConfig = DEFAULT_SCORE_CONFIG
): ParseResult {
  const errors: string[] = [];
  
  if (!raw || typeof raw !== 'object') {
    return {
      signal: null,
      errors: ['Payload must be a valid JSON object'],
      rawPayload: {} as MtfTrendDotsPayload,
      isTest: false,
    };
  }
  
  const payload = raw as MtfTrendDotsPayload;
  
  // Check for test mode (bar_update events)
  if (payload.event === 'bar_update') {
    return {
      signal: null,
      errors: [],
      rawPayload: payload,
      isTest: true,
    };
  }
  
  // Validate we have a trend_change event (the only actionable event)
  if (payload.event !== 'trend_change') {
    errors.push(`Non-actionable event type: ${payload.event || 'unknown'}`);
  }
  
  // Extract ticker
  const ticker = payload.ticker || payload.symbol;
  if (!ticker) {
    errors.push('Missing required field: ticker/symbol');
  }
  
  // Extract current price
  const currentPrice = payload.price || payload.current_price;
  if (!currentPrice || currentPrice <= 0) {
    errors.push('Missing or invalid price');
  }
  
  // Extract bias
  const bias = payload.bias;
  if (!bias || bias === 'NEUTRAL') {
    errors.push('No directional bias (NEUTRAL or missing)');
  }
  
  // Extract alignment score
  const alignmentScore = payload.alignment_score ?? 0;
  
  // Store alignment score in metadata for MTF aggregation - no threshold rejection
  
  // Validate timeframes object exists
  if (!payload.timeframes) {
    errors.push('Missing required field: timeframes');
  }
  
  if (errors.length > 0) {
    return {
      signal: null,
      errors,
      rawPayload: payload,
      isTest: false,
    };
  }
  
  // Analyze timeframe changes
  const tfAnalysis = analyzeTimeframeChanges(payload.timeframes);
  
  // Determine action based on bias
  const action: SignalAction = 'BUY';
  const optionType: OptionType = bias === 'BULLISH' ? 'CALL' : 'PUT';
  
  // Derive options parameters
  const strike = deriveAtmStrike(currentPrice!);
  const expiration = deriveNextMonthlyExpiration();
  const quantity = calculateQuantity(alignmentScore, scoreConfig);
  
  const signal: IncomingSignal = {
    source: 'mtf-trend-dots',
    action,
    underlying: ticker!.toUpperCase(),
    strike,
    expiration,
    option_type: optionType,
    quantity,
    strategy_type: 'MTF_ALIGNMENT',
    order_type: 'MARKET' as OrderType,
    time_in_force: 'DAY' as TimeInForce,
    metadata: {
      bias,
      event: payload.event,
      alignment_score: alignmentScore,
      bullish_count: payload.bullish_count,
      bearish_count: payload.bearish_count,
      trigger_timeframes: payload.trigger_timeframe,
      changed_timeframes: tfAnalysis.changedTimeframes,
      bullish_changes: tfAnalysis.bullishChanges,
      bearish_changes: tfAnalysis.bearishChanges,
      timeframes: payload.timeframes,
      meta_version: payload.meta?.version,
      bar_time: payload.meta?.bar_time,
      exchange: payload.exchange,
    },
  };
  
  return {
    signal,
    errors: [],
    rawPayload: payload,
    isTest: false,
  };
}
