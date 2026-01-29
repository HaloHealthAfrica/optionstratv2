/**
 * Market Context Types
 * Types for the market context webhook and decision engine integration
 */

// Incoming webhook payload from TradingView
export interface ContextWebhookPayload {
  // Required top-level
  ticker: string;
  exchange: string;
  price: number;
  timestamp: number;
  type: "CONTEXT";
  event: "bar_close" | "significant_change" | "test";
  timeframe: string;
  
  // Volatility regime
  volatility: {
    vix: number;
    vix_sma20: number;
    vix_regime: "HIGH_VOL" | "NORMAL" | "LOW_VOL";
    vix_trend: "RISING" | "FALLING";
    atr: number;
    atr_percentile: number;
    bb_position: number;
    vol_expansion_pct: number;
  };
  
  // Support/Resistance levels
  levels: {
    pivot: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
    nearest_resistance: number;
    nearest_support: number;
    dist_to_r1_pct: number;
    dist_to_s1_pct: number;
    dist_to_nearest_res_pct: number;
    dist_to_nearest_sup_pct: number;
    prior_day_high: number;
    prior_day_low: number;
    prior_day_close: number;
  };
  
  // Opening range
  opening_range: {
    high: number;
    low: number;
    midpoint: number;
    range: number;
    breakout: "ABOVE" | "BELOW" | "INSIDE" | "PENDING";
    complete: boolean;
  };
  
  // Market correlation
  market: {
    spy_price: number;
    spy_trend: "BULLISH" | "BEARISH";
    spy_rsi: number;
    spy_day_change_pct: number;
    qqq_price: number;
    qqq_trend: "BULLISH" | "BEARISH";
    market_bias: "BULLISH" | "BEARISH" | "MIXED";
    moving_with_market: boolean;
    self_day_change_pct: number;
  };
  
  // Candle quality
  candle: {
    body_ratio: number;
    wick_ratio: number;
    close_position: number;
    strength: number;
    pattern: string;
    pattern_bias: "BULLISH" | "BEARISH" | "NEUTRAL";
    is_inside_bar: boolean;
    is_outside_bar: boolean;
  };
  
  // Session info
  session: {
    is_market_open: boolean;
    is_first_30min: boolean;
    ny_hour: number;
    ny_minute: number;
  };
  
  // Freshness
  freshness?: {
    bar_open_time: number;
    server_time: number;
    bar_age_seconds: number;
  };
  
  // Change flags
  changes: {
    vix_changed: boolean;
    regime_changed: boolean;
    or_breakout_changed: boolean;
    market_bias_changed: boolean;
    pattern_detected: boolean;
    significant: boolean;
  };
  
  // Optional meta
  meta?: {
    version: string;
    indicator: string;
    bar_time: string;
  };
}

// Database record type
export interface MarketContextRecord {
  id: string;
  ticker: string;
  exchange: string | null;
  timeframe: string | null;
  price: number;
  
  // Volatility
  vix: number | null;
  vix_sma20: number | null;
  vix_regime: string | null;
  vix_trend: string | null;
  atr: number | null;
  atr_percentile: number | null;
  bb_position: number | null;
  vol_expansion_pct: number | null;
  
  // Levels
  pivot: number | null;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  nearest_resistance: number | null;
  nearest_support: number | null;
  dist_to_r1_pct: number | null;
  dist_to_s1_pct: number | null;
  dist_to_nearest_res_pct: number | null;
  dist_to_nearest_sup_pct: number | null;
  prior_day_high: number | null;
  prior_day_low: number | null;
  prior_day_close: number | null;
  
  // Opening range
  or_high: number | null;
  or_low: number | null;
  or_midpoint: number | null;
  or_range: number | null;
  or_breakout: string | null;
  or_complete: boolean;
  
  // Market
  spy_price: number | null;
  spy_trend: string | null;
  spy_rsi: number | null;
  spy_day_change_pct: number | null;
  qqq_price: number | null;
  qqq_trend: string | null;
  market_bias: string | null;
  moving_with_market: boolean | null;
  self_day_change_pct: number | null;
  
  // Candle
  candle_body_ratio: number | null;
  candle_wick_ratio: number | null;
  candle_close_position: number | null;
  candle_strength: number | null;
  candle_pattern: string | null;
  candle_pattern_bias: string | null;
  is_inside_bar: boolean;
  is_outside_bar: boolean;
  
  // Session
  is_market_open: boolean;
  is_first_30min: boolean;
  ny_hour: number | null;
  ny_minute: number | null;
  
  // Changes
  vix_changed: boolean;
  regime_changed: boolean;
  or_breakout_changed: boolean;
  market_bias_changed: boolean;
  pattern_detected: boolean;
  significant_change: boolean;
  
  // Meta
  event_type: string | null;
  signal_timestamp: number | null;
  bar_time: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
}

// Simplified context for decision engine
export interface MarketContextForDecision {
  ticker: string;
  price: number;
  updatedAt: Date;
  isStale: boolean; // True if data is older than 5 minutes
  
  volatility: {
    vix: number;
    vixRegime: "HIGH_VOL" | "NORMAL" | "LOW_VOL";
    vixTrend: "RISING" | "FALLING";
    atrPercentile: number;
    bbPosition: number;
  };
  
  levels: {
    nearestResistance: number;
    nearestSupport: number;
    distToResistancePct: number;
    distToSupportPct: number;
    orBreakout: "ABOVE" | "BELOW" | "INSIDE" | "PENDING";
    orComplete: boolean;
  };
  
  market: {
    spyTrend: "BULLISH" | "BEARISH";
    qqqTrend: "BULLISH" | "BEARISH";
    marketBias: "BULLISH" | "BEARISH" | "MIXED";
    movingWithMarket: boolean;
  };
  
  candle: {
    pattern: string;
    patternBias: "BULLISH" | "BEARISH" | "NEUTRAL";
    strength: number;
  };
  
  session: {
    isMarketOpen: boolean;
    isFirst30Min: boolean;
  };
}

// Context summary for decision response
export interface ContextSummary {
  vix_regime: string;
  market_bias: string;
  or_breakout: string;
  moving_with_market: boolean;
  is_stale: boolean;
}
