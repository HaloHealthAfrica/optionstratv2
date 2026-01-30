// Core types for the trading system

export type SignalAction = 'BUY' | 'SELL' | 'CLOSE';
export type OptionType = 'CALL' | 'PUT';
export type SignalStatus = 'PENDING' | 'VALIDATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REJECTED';
export type OrderSide = 'BUY' | 'SELL' | 'BUY_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_OPEN' | 'SELL_TO_CLOSE';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
export type OrderStatus = 'PENDING' | 'SUBMITTED' | 'ACCEPTED' | 'PARTIAL_FILL' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED';
export type TradingMode = 'PAPER' | 'LIVE';
export type TimeInForce = 'DAY' | 'GTC' | 'IOC' | 'FOK';

export interface IncomingSignal {
  source: string;
  action: SignalAction;
  underlying: string;
  strike: number;
  expiration: string; // ISO date string
  option_type: OptionType;
  quantity: number;
  strategy_type?: string;
  limit_price?: number;
  stop_price?: number;
  order_type?: OrderType;
  time_in_force?: TimeInForce;
  metadata?: Record<string, unknown>;
}

export interface Signal {
  id: string;
  source: string;
  signal_hash: string;
  raw_payload: Record<string, unknown>;
  signature_verified: boolean;
  action: SignalAction | null;
  underlying: string | null;
  strike: number | null;
  expiration: string | null;
  option_type: OptionType | null;
  quantity: number | null;
  strategy_type: string | null;
  status: SignalStatus;
  validation_errors: Record<string, string>[] | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  signal_id: string | null;
  refactored_position_id?: string | null;
  exit_action?: 'PARTIAL' | 'FULL' | null;
  exit_quantity?: number | null;
  broker_order_id: string | null;
  client_order_id: string;
  underlying: string;
  symbol: string;
  strike: number;
  expiration: string;
  option_type: OptionType;
  side: OrderSide;
  quantity: number;
  order_type: OrderType;
  limit_price: number | null;
  stop_price: number | null;
  time_in_force: TimeInForce;
  mode: TradingMode;
  status: OrderStatus;
  filled_quantity: number;
  avg_fill_price: number | null;
  strategy_id: string | null;
  leg_number: number | null;
  rejection_reason: string | null;
  error_message: string | null;
  broker_response: Record<string, unknown> | null;
  submitted_at: string | null;
  filled_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  order_id: string;
  broker_trade_id: string | null;
  execution_price: number;
  quantity: number;
  commission: number;
  fees: number;
  total_cost: number;
  underlying: string;
  symbol: string;
  strike: number;
  expiration: string;
  option_type: string;
  executed_at: string;
  created_at: string;
}

export interface Position {
  id: string;
  symbol: string;
  underlying: string;
  strike: number;
  expiration: string;
  option_type: OptionType;
  quantity: number;
  avg_open_price: number;
  total_cost: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_percent: number | null;
  realized_pnl: number;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  implied_volatility: number | null;
  is_closed: boolean;
  closed_at: string | null;
  opened_at: string;
  last_updated: string;
  created_at: string;
}

export interface RiskLimits {
  id: string;
  max_position_size: number | null;
  max_position_value: number | null;
  max_total_positions: number | null;
  max_daily_loss: number | null;
  max_weekly_loss: number | null;
  max_total_portfolio_loss: number | null;
  max_underlying_exposure: number | null;
  max_expiration_concentration: number | null;
  max_portfolio_delta: number | null;
  max_portfolio_gamma: number | null;
  max_portfolio_vega: number | null;
  mode: TradingMode;
  is_active: boolean;
}

// ============================================================================
// CONTEXT-BASED RISK LIMITS
// ============================================================================

export interface ContextRiskLimits {
  // VIX-based limits
  max_vix_for_new_positions?: number;        // Don't open new positions above this VIX
  reduce_size_vix_threshold?: number;        // Reduce position size above this VIX (default: 25)
  reduce_size_vix_factor?: number;           // Multiply size by this when VIX high (default: 0.5)
  
  // Session limits
  allow_first_30min_trades?: boolean;        // Allow trades in first 30 min (default: true)
  first_30min_confidence_penalty?: number;   // Confidence reduction (default: 0.1)
  require_market_open?: boolean;             // Only trade during market hours (default: true)
  
  // Market correlation limits
  require_market_alignment?: boolean;        // Require signal to align with SPY/QQQ (default: false)
  market_divergence_penalty?: number;        // Confidence penalty when diverging (default: 0.15)
  
  // Support/Resistance limits
  min_distance_to_resistance_pct?: number;   // Min % distance to resistance for calls (default: 0.5)
  min_distance_to_support_pct?: number;      // Min % distance to support for puts (default: 0.5)
  
  // Opening range limits
  require_or_breakout_confirmation?: boolean; // Require OR breakout for trades (default: false)
  or_breakout_confidence_boost?: number;      // Confidence boost when OR confirms (default: 0.1)
  
  // MTF alignment limits
  min_mtf_alignment_score?: number;          // Minimum MTF alignment score (default: 50)
  min_bullish_timeframes?: number;           // Min bullish TFs for calls (default: 4)
  min_bearish_timeframes?: number;           // Min bearish TFs for puts (default: 4)
  
  // Staleness limits
  max_context_age_seconds?: number;          // Max age of context data (default: 300)
  max_trend_age_seconds?: number;            // Max age of trend data (default: 300)
  stale_data_confidence_penalty?: number;    // Penalty for stale data (default: 0.1)
}

export interface Decision {
  action: 'EXECUTE' | 'REJECT' | 'HOLD';
  side: OrderSide;
  quantity: number;
  price_hint: number | null;
  order_type: OrderType;
  reason: string;
  confidence: number;
  risk_violations: RiskViolation[];
}

export interface RiskViolation {
  violation_type: string;
  rule_violated: string;
  current_value: number;
  limit_value: number;
  severity: 'WARNING' | 'CRITICAL';
}

// ============================================================================
// MTF TREND TYPES (from Trend Webhook)
// ============================================================================

export interface MTFTrendForDecision {
  ticker: string;
  updatedAt: Date;
  isStale: boolean;
  
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  alignmentScore: number; // 0-100
  bullishCount: number;   // 0-8
  bearishCount: number;   // 0-8
  
  timeframes: {
    '3m': 'bullish' | 'bearish' | 'neutral';
    '5m': 'bullish' | 'bearish' | 'neutral';
    '15m': 'bullish' | 'bearish' | 'neutral';
    '30m': 'bullish' | 'bearish' | 'neutral';
    '1h': 'bullish' | 'bearish' | 'neutral';
    '4h': 'bullish' | 'bearish' | 'neutral';
    '1w': 'bullish' | 'bearish' | 'neutral';
    '1M': 'bullish' | 'bearish' | 'neutral';
  };
}

// ============================================================================
// EXTENDED DECISION OUTPUT
// ============================================================================

export interface MTFSummary {
  bias: string;
  alignment_score: number;
  bullish_count: number;
  bearish_count: number;
  is_stale: boolean;
}

export interface ContextSummary {
  vix_regime: string;
  vix_trend: string;
  market_bias: string;
  or_breakout: string;
  moving_with_market: boolean;
  spy_trend: string;
  candle_pattern: string;
  is_stale: boolean;
  data_age_seconds: number;
}

export interface DecisionWithContext extends Decision {
  context_summary?: ContextSummary;
  mtf_summary?: MTFSummary;
  adjustments_applied?: string[];
}

export interface AdapterConfig {
  mode: TradingMode;
  slippage_percent?: number;
  commission_per_contract?: number;
  fee_per_contract?: number;
  deterministic?: boolean;
  seed?: number;
}

export interface OrderRequest {
  signal_id?: string; // Optional for auto-close orders
  underlying: string;
  symbol: string;
  strike: number;
  expiration: string;
  option_type: OptionType;
  side: OrderSide;
  quantity: number;
  order_type: OrderType;
  limit_price?: number;
  stop_price?: number;
  time_in_force: TimeInForce;
}

export interface OrderResult {
  success: boolean;
  order_id: string;
  broker_order_id?: string;
  status: OrderStatus;
  filled_quantity: number;
  avg_fill_price?: number;
  error?: string;
}

// OCC Option Symbol Format: AAPL  251219C00150000
// Underlying (padded to 6), Expiration (YYMMDD), C/P, Strike (8 digits, price * 1000)
export function generateOccSymbol(
  underlying: string,
  expiration: string,
  optionType: OptionType,
  strike: number
): string {
  const paddedUnderlying = underlying.padEnd(6, ' ');
  const expDate = new Date(expiration);
  const yymmdd = `${String(expDate.getFullYear()).slice(-2)}${String(expDate.getMonth() + 1).padStart(2, '0')}${String(expDate.getDate()).padStart(2, '0')}`;
  const cp = optionType === 'CALL' ? 'C' : 'P';
  const strikeFormatted = String(Math.round(strike * 1000)).padStart(8, '0');
  
  return `${paddedUnderlying}${yymmdd}${cp}${strikeFormatted}`;
}
