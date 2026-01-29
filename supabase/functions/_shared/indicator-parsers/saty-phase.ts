import type { IncomingSignal, OptionType, OrderType, TimeInForce, SignalAction } from "../types.ts";

/**
 * SATY Phase Detector Parser
 * 
 * Handles REGIME_PHASE_ENTRY and REGIME_STATUS_UPDATE webhooks.
 * Maps market phases (Accumulation, Markup, Distribution, Markdown) to trading signals.
 */

export type SatyPhase = 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'MARKDOWN';
export type SatyBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type SatyRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';

export interface SatyPhasePayload {
  meta?: {
    engine?: string;
    engine_version?: string;
    event_id?: string;
    event_type?: 'REGIME_PHASE_ENTRY' | 'REGIME_STATUS_UPDATE';
    generated_at?: string;
    source?: string;
    indicator_name?: string;
  };
  
  instrument?: {
    symbol?: string;
    exchange?: string;
    current_price?: number;
  };
  
  timeframe?: {
    chart_tf?: string;
    event_tf?: string;
    tf_role?: string;
    bar_close_time?: string;
  };
  
  event?: {
    name?: string;
    type?: string;
    phase_from?: number;
    phase_to?: number;
    phase_name?: SatyPhase;
    description?: string;
    timestamp?: number;
  };
  
  regime_context?: {
    local_bias?: SatyBias;
    regime?: SatyRegime;
    volatility_state?: 'LOW' | 'HIGH' | 'NORMAL';
    trend_strength?: number;
    atr?: number;
    atr_normalized?: number;
  };
  
  confidence?: {
    confidence_score?: number;
    trend_alignment?: SatyBias;
    volatility_confirmation?: boolean;
  };
  
  oscillator_state?: {
    value?: number;
    rsi_14?: number;
    rsi_state?: string;
    macd_signal?: string;
  };
  
  market_structure?: {
    structure?: string;
    ema_8?: number;
    ema_21?: number;
    ema_50?: number;
    price_vs_ema50?: string;
    price_vs_ema21?: string;
    vwap?: number;
    pmh?: number;
    pml?: number;
  };
  
  execution_guidance?: {
    bias?: 'LONG' | 'SHORT' | 'NEUTRAL';
    urgency?: 'LOW' | 'MEDIUM' | 'HIGH';
    session?: string;
    day_of_week?: string;
  };
  
  audit?: {
    bar_index?: number;
    volume?: number;
    volume_vs_avg?: number;
    test_mode?: boolean;
  };
  
  [key: string]: unknown;
}

export interface ParseResult {
  signal: IncomingSignal | null;
  errors: string[];
  rawPayload: SatyPhasePayload;
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
 * Calculate position size based on confidence score
 * All signals are accepted; quantity scales with confidence
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
 * Determine if phase transition is actionable
 * - MARKUP (Phase 2) with BULLISH bias → BUY CALL
 * - MARKDOWN (Phase 4) with BEARISH bias → BUY PUT  
 * - ACCUMULATION/DISTRIBUTION → No action (consolidation phases)
 */
function getPhaseAction(
  phaseName: SatyPhase | undefined,
  executionBias: 'LONG' | 'SHORT' | 'NEUTRAL' | undefined,
  localBias: SatyBias | undefined
): { action: SignalAction | null; optionType: OptionType | null; reason: string } {
  
  // MARKUP phase with bullish signals → Buy calls
  if (phaseName === 'MARKUP' && (executionBias === 'LONG' || localBias === 'BULLISH')) {
    return { action: 'BUY', optionType: 'CALL', reason: 'Markup phase with bullish bias' };
  }
  
  // MARKDOWN phase with bearish signals → Buy puts
  if (phaseName === 'MARKDOWN' && (executionBias === 'SHORT' || localBias === 'BEARISH')) {
    return { action: 'BUY', optionType: 'PUT', reason: 'Markdown phase with bearish bias' };
  }
  
  // ACCUMULATION - building base, not yet actionable
  if (phaseName === 'ACCUMULATION') {
    return { action: null, optionType: null, reason: 'Accumulation phase - waiting for breakout' };
  }
  
  // DISTRIBUTION - topping, could be reversal warning
  if (phaseName === 'DISTRIBUTION') {
    return { action: null, optionType: null, reason: 'Distribution phase - potential reversal zone' };
  }
  
  return { action: null, optionType: null, reason: 'No clear directional signal' };
}

/**
 * Parse SATY Phase Detector webhook payload
 */
export function parseSatyPhasePayload(
  raw: unknown,
  scoreConfig: ScoreConfig = DEFAULT_SCORE_CONFIG
): ParseResult {
  const errors: string[] = [];
  
  if (!raw || typeof raw !== 'object') {
    return {
      signal: null,
      errors: ['Payload must be a valid JSON object'],
      rawPayload: {} as SatyPhasePayload,
      isTest: false,
    };
  }
  
  const payload = raw as SatyPhasePayload;
  
  // Check for test mode
  if (payload.audit?.test_mode === true || 
      payload.meta?.event_type === 'REGIME_STATUS_UPDATE') {
    return {
      signal: null,
      errors: [],
      rawPayload: payload,
      isTest: true,
    };
  }
  
  // Validate required meta fields
  if (!payload.meta?.engine || payload.meta.engine !== 'SATY_PO') {
    errors.push('Invalid or missing meta.engine (expected SATY_PO)');
  }
  
  // Extract ticker
  const ticker = payload.instrument?.symbol;
  if (!ticker) {
    errors.push('Missing required field: instrument.symbol');
  }
  
  // Extract current price
  const currentPrice = payload.instrument?.current_price;
  if (!currentPrice || currentPrice <= 0) {
    errors.push('Missing or invalid instrument.current_price');
  }
  
  // Extract phase info
  const phaseName = payload.event?.phase_name;
  if (!phaseName) {
    errors.push('Missing required field: event.phase_name');
  }
  
  // Extract confidence score
  const confidenceScore = payload.confidence?.confidence_score ?? 0;
  
  // Store confidence in metadata for MTF aggregation - no threshold rejection
  
  // Determine action based on phase
  const phaseAction = getPhaseAction(
    phaseName,
    payload.execution_guidance?.bias,
    payload.regime_context?.local_bias
  );
  
  if (!phaseAction.action) {
    errors.push(`Non-actionable phase: ${phaseAction.reason}`);
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
  const strike = deriveAtmStrike(currentPrice!);
  const expiration = deriveNextMonthlyExpiration();
  const quantity = calculateQuantity(confidenceScore, scoreConfig);
  
  const signal: IncomingSignal = {
    source: 'saty-phase',
    action: phaseAction.action!,
    underlying: ticker!.toUpperCase(),
    strike,
    expiration,
    option_type: phaseAction.optionType!,
    quantity,
    strategy_type: 'PHASE_ENTRY',
    order_type: 'MARKET' as OrderType,
    time_in_force: 'DAY' as TimeInForce,
    metadata: {
      event_id: payload.meta?.event_id,
      event_type: payload.meta?.event_type,
      phase_from: payload.event?.phase_from,
      phase_to: payload.event?.phase_to,
      phase_name: phaseName,
      phase_description: payload.event?.description,
      confidence_score: confidenceScore,
      trend_alignment: payload.confidence?.trend_alignment,
      volatility_confirmation: payload.confidence?.volatility_confirmation,
      local_bias: payload.regime_context?.local_bias,
      regime: payload.regime_context?.regime,
      volatility_state: payload.regime_context?.volatility_state,
      trend_strength: payload.regime_context?.trend_strength,
      atr: payload.regime_context?.atr,
      execution_bias: payload.execution_guidance?.bias,
      urgency: payload.execution_guidance?.urgency,
      session: payload.execution_guidance?.session,
      rsi: payload.oscillator_state?.rsi_14,
      rsi_state: payload.oscillator_state?.rsi_state,
      macd_signal: payload.oscillator_state?.macd_signal,
      market_structure: payload.market_structure?.structure,
      vwap: payload.market_structure?.vwap,
      ema_8: payload.market_structure?.ema_8,
      ema_21: payload.market_structure?.ema_21,
      ema_50: payload.market_structure?.ema_50,
      timeframe: payload.timeframe?.event_tf,
      bar_close_time: payload.timeframe?.bar_close_time,
    },
  };
  
  return {
    signal,
    errors: [],
    rawPayload: payload,
    isTest: false,
  };
}
