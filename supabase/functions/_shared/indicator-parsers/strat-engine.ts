/**
 * STRAT Full Engine v6.1 Parser
 * 
 * Comprehensive trading signals with STRAT patterns, MTF analysis,
 * volume confirmation, key levels, and full trade plans.
 * 
 * Signal Types:
 * - LONG (with-trend)
 * - SHORT (with-trend)
 * - CT-LONG (counter-trend long)
 * - CT-SHORT (counter-trend short)
 */

import type { IncomingSignal, SignalAction, OptionType, OrderType } from "../types.ts";

// STRAT pattern types
export type StratPattern = 
  | '2-1-2 Reversal'
  | '3-1-2 Breakout'
  | '2-2 Continuation'
  | '3-2 Reversal'
  | string;

export type SignalSide = 'LONG' | 'SHORT';
export type SignalType = 'WITH_TREND' | 'COUNTER_TREND';
export type MtfBias = 'BULL' | 'BEAR' | 'NEUTRAL';
export type VolumeZone = 'EXTREME' | 'HIGH' | 'NORMAL' | 'LOW' | 'DEAD';
export type VolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH';
export type VwapZone = 'ABOVE' | 'BELOW' | 'AT';
export type Session = 'NY_OPEN' | 'NY_MID' | 'POWER_HOUR' | 'LONDON' | 'ASIA' | 'OFF';

export interface StratEnginePayload {
  journal: {
    signal_id: string;
    engine: string;
    engine_version: string;
    mode: 'PAPER' | 'LIVE';
    created_at: number;
  };
  signal: {
    side: SignalSide;
    pattern: StratPattern;
    confidence: number;
    signal_type: SignalType;
    is_counter_trend: boolean;
  };
  market: {
    symbol: string;
    timeframe: string;
    session: Session;
  };
  mtf: {
    bias_tf: string;
    bias: MtfBias;
    ema_htf: number;
    close_htf: number;
    mtf_enabled: boolean;
    counter_trend_enabled: boolean;
    direction_mode: 'BOTH' | 'LONG ONLY' | 'SHORT ONLY';
  };
  context: {
    trend_ok: boolean;
    vwap_ok: boolean;
    vol_ok: boolean;
    atr_pct: number;
    at_hod: boolean;
    at_lod: boolean;
    near_support: boolean;
    near_resistance: boolean;
  };
  volume: {
    current: number;
    avg_20: number;
    relative_volume: number;
    volume_spike: boolean;
    volume_zone: VolumeZone;
    volume_trend: boolean;
  };
  levels: {
    pdh: number;
    pdl: number;
    pwh: number;
    pwl: number;
    vwap: number;
    overnight_high: number;
    overnight_low: number;
    or_high: number;
    or_low: number;
    rth_open: number;
    hod: number;
    lod: number;
    level_confluence: number;
    nearest_level: string;
    dist_to_nearest: number;
  };
  liquidity: {
    session: Session;
    range_position: 'AT_HOD' | 'AT_LOD' | 'MID';
    vwap_zone: VwapZone;
    stop_pool: 'SWEEP_HIGH' | 'SWEEP_LOW' | 'NONE';
    volatility_regime: VolatilityRegime;
  };
  trade_plan: {
    entry: number;
    stop: number;
    target_1: number;
    target_2: number;
    target_3: number;
    breakeven_trigger: number;
    risk_points: number;
    rr_1: number;
    rr_2: number;
    rr_3: number;
  };
  confidence_breakdown: {
    structure: number;
    mtf: number;
    context: number;
    volume: number;
    levels: number;
    counter_trend_bonus: number;
    risk: number;
  };
}

export interface ParseResult {
  signal: IncomingSignal | null;
  errors: string[];
  rawPayload: StratEnginePayload;
  isTest: boolean;
}

export interface ScoreConfig {
  minThreshold: number;
  baseQuantity: number;
  scalingFactor: number;
  maxQuantity: number;
  counterTrendReduction: number; // Reduce quantity for counter-trend signals
}

const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  minThreshold: 0,  // Accept all signals for MTF aggregation
  baseQuantity: 1,
  scalingFactor: 0.05,
  maxQuantity: 10,
  counterTrendReduction: 0.5, // 50% reduction for counter-trend
};

/**
 * Detect if a payload is from the STRAT Full Engine
 */
export function isStratEnginePayload(payload: Record<string, unknown>): boolean {
  const journal = payload.journal as Record<string, unknown> | undefined;
  const signal = payload.signal as Record<string, unknown> | undefined;
  const trade_plan = payload.trade_plan as Record<string, unknown> | undefined;
  
  // Must have journal with STRAT engine identifier
  if (journal?.engine === 'STRAT_V6_FULL') return true;
  
  // Or must have signal.pattern with STRAT patterns and trade_plan
  if (signal?.pattern && signal?.side && trade_plan?.entry !== undefined) {
    const pattern = String(signal.pattern);
    const stratPatterns = ['2-1-2', '3-1-2', '2-2', '3-2'];
    if (stratPatterns.some(p => pattern.includes(p))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate quantity based on confidence score
 */
function calculateQuantity(
  confidence: number,
  isCounterTrend: boolean,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG
): number {
  if (confidence < config.minThreshold) {
    return config.baseQuantity;
  }
  
  const additionalContracts = Math.floor(
    (confidence - config.minThreshold) * config.scalingFactor
  );
  
  let quantity = Math.min(config.baseQuantity + additionalContracts, config.maxQuantity);
  
  // Reduce position size for counter-trend trades
  if (isCounterTrend) {
    quantity = Math.max(1, Math.floor(quantity * config.counterTrendReduction));
  }
  
  return quantity;
}

/**
 * Derive ATM strike from entry price
 */
function deriveAtmStrike(price: number): number {
  let increment: number;
  if (price < 50) {
    increment = 2.5;
  } else if (price < 200) {
    increment = 5;
  } else {
    increment = 10;
  }
  return Math.round(price / increment) * increment;
}

/**
 * Derive expiration based on trade plan and timeframe
 * STRAT signals are often shorter-term, so we use weekly options
 */
function deriveExpiration(timeframe: string): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  // Days until next Friday
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  if (daysUntilFriday === 0) daysUntilFriday = 7;
  
  // For shorter timeframes (5, 15), use this Friday if > 2 days out
  // For longer timeframes, use next Friday
  const shortTimeframes = ['1', '3', '5', '15'];
  if (shortTimeframes.includes(timeframe)) {
    if (daysUntilFriday < 2) {
      daysUntilFriday += 7;
    }
  } else {
    // For hourly+ timeframes, always use next week
    if (daysUntilFriday < 5) {
      daysUntilFriday += 7;
    }
  }
  
  const expDate = new Date(today);
  expDate.setDate(today.getDate() + daysUntilFriday);
  
  const year = expDate.getFullYear();
  const month = String(expDate.getMonth() + 1).padStart(2, '0');
  const day = String(expDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Map STRAT signal to options trade
 */
function mapToOptionsSignal(signal: StratEnginePayload['signal']): {
  action: SignalAction;
  optionType: OptionType;
  reason: string;
} {
  const signalTypeLabel = signal.is_counter_trend ? 'CT-' : '';
  
  if (signal.side === 'LONG') {
    return {
      action: 'BUY',
      optionType: 'CALL',
      reason: `${signalTypeLabel}LONG: ${signal.pattern} (${signal.signal_type})`,
    };
  } else {
    return {
      action: 'BUY',
      optionType: 'PUT',
      reason: `${signalTypeLabel}SHORT: ${signal.pattern} (${signal.signal_type})`,
    };
  }
}

/**
 * Parse STRAT Full Engine v6.1 payload
 */
export function parseStratEnginePayload(
  raw: unknown,
  scoreConfig: Partial<ScoreConfig> = {}
): ParseResult {
  const config = { ...DEFAULT_SCORE_CONFIG, ...scoreConfig };
  const errors: string[] = [];
  
  if (typeof raw !== 'object' || raw === null) {
    errors.push('Payload must be an object');
    return {
      signal: null,
      errors,
      rawPayload: {} as StratEnginePayload,
      isTest: false,
    };
  }
  
  const payload = raw as Record<string, unknown>;
  
  // Extract top-level objects
  const journal = payload.journal as StratEnginePayload['journal'] | undefined;
  const signal = payload.signal as StratEnginePayload['signal'] | undefined;
  const market = payload.market as StratEnginePayload['market'] | undefined;
  const mtf = payload.mtf as StratEnginePayload['mtf'] | undefined;
  const context = payload.context as StratEnginePayload['context'] | undefined;
  const volume = payload.volume as StratEnginePayload['volume'] | undefined;
  const levels = payload.levels as StratEnginePayload['levels'] | undefined;
  const liquidity = payload.liquidity as StratEnginePayload['liquidity'] | undefined;
  const trade_plan = payload.trade_plan as StratEnginePayload['trade_plan'] | undefined;
  const confidence_breakdown = payload.confidence_breakdown as StratEnginePayload['confidence_breakdown'] | undefined;
  
  // Validate required objects
  if (!journal) errors.push('Missing required object: journal');
  if (!signal) errors.push('Missing required object: signal');
  if (!market) errors.push('Missing required object: market');
  if (!trade_plan) errors.push('Missing required object: trade_plan');
  
  // Validate signal fields
  if (signal) {
    if (!signal.side || !['LONG', 'SHORT'].includes(signal.side)) {
      errors.push('Invalid or missing signal.side (must be LONG or SHORT)');
    }
    if (typeof signal.confidence !== 'number') {
      errors.push('Missing or invalid signal.confidence');
    }
    if (!signal.pattern) {
      errors.push('Missing signal.pattern');
    }
  }
  
  // Validate market fields
  if (market) {
    if (!market.symbol) {
      errors.push('Missing market.symbol');
    }
  }
  
  // Validate trade_plan fields
  if (trade_plan) {
    if (typeof trade_plan.entry !== 'number') {
      errors.push('Missing or invalid trade_plan.entry');
    }
    if (typeof trade_plan.stop !== 'number') {
      errors.push('Missing or invalid trade_plan.stop');
    }
  }
  
  // Build typed payload
  const typedPayload: StratEnginePayload = {
    journal: journal || {
      signal_id: '',
      engine: 'STRAT_V6_FULL',
      engine_version: '6.1',
      mode: 'PAPER',
      created_at: Date.now(),
    },
    signal: signal || {
      side: 'LONG',
      pattern: '',
      confidence: 0,
      signal_type: 'WITH_TREND',
      is_counter_trend: false,
    },
    market: market || {
      symbol: '',
      timeframe: '15',
      session: 'NY_OPEN',
    },
    mtf: mtf || {
      bias_tf: '15',
      bias: 'NEUTRAL',
      ema_htf: 0,
      close_htf: 0,
      mtf_enabled: false,
      counter_trend_enabled: true,
      direction_mode: 'BOTH',
    },
    context: context || {
      trend_ok: false,
      vwap_ok: false,
      vol_ok: false,
      atr_pct: 0,
      at_hod: false,
      at_lod: false,
      near_support: false,
      near_resistance: false,
    },
    volume: volume || {
      current: 0,
      avg_20: 0,
      relative_volume: 1,
      volume_spike: false,
      volume_zone: 'NORMAL',
      volume_trend: false,
    },
    levels: levels || {
      pdh: 0,
      pdl: 0,
      pwh: 0,
      pwl: 0,
      vwap: 0,
      overnight_high: 0,
      overnight_low: 0,
      or_high: 0,
      or_low: 0,
      rth_open: 0,
      hod: 0,
      lod: 0,
      level_confluence: 0,
      nearest_level: '',
      dist_to_nearest: 0,
    },
    liquidity: liquidity || {
      session: 'NY_OPEN',
      range_position: 'MID',
      vwap_zone: 'AT',
      stop_pool: 'NONE',
      volatility_regime: 'NORMAL',
    },
    trade_plan: trade_plan || {
      entry: 0,
      stop: 0,
      target_1: 0,
      target_2: 0,
      target_3: 0,
      breakeven_trigger: 0,
      risk_points: 0,
      rr_1: 1,
      rr_2: 2,
      rr_3: 3,
    },
    confidence_breakdown: confidence_breakdown || {
      structure: 0,
      mtf: 0,
      context: 0,
      volume: 0,
      levels: 0,
      counter_trend_bonus: 0,
      risk: 0,
    },
  };
  
  // Check for test mode
  const isTest = typedPayload.journal.mode === 'PAPER' && 
    (payload as Record<string, unknown>).test === true;
  
  // If validation errors, return early
  if (errors.length > 0) {
    return {
      signal: null,
      errors,
      rawPayload: typedPayload,
      isTest,
    };
  }
  
  // Store confidence in metadata for MTF aggregation - no threshold rejection
  
  // Map to options signal
  const optionsMapping = mapToOptionsSignal(typedPayload.signal);
  
  // Calculate derived values
  const strike = deriveAtmStrike(typedPayload.trade_plan.entry);
  const expiration = deriveExpiration(typedPayload.market.timeframe);
  const quantity = calculateQuantity(
    typedPayload.signal.confidence,
    typedPayload.signal.is_counter_trend,
    config
  );
  
  // Use entry price as limit price hint for better fills
  const limitPrice = typedPayload.trade_plan.entry;
  
  // Build the signal
  const incomingSignal: IncomingSignal = {
    source: 'strat_engine_v6',
    action: optionsMapping.action,
    underlying: typedPayload.market.symbol.toUpperCase(),
    strike,
    expiration,
    option_type: optionsMapping.optionType,
    quantity,
    order_type: 'LIMIT' as OrderType,
    limit_price: limitPrice,
    time_in_force: 'DAY',
    strategy_type: 'SINGLE',
    metadata: {
      // Signal info
      signal_id: typedPayload.journal.signal_id,
      engine: typedPayload.journal.engine,
      engine_version: typedPayload.journal.engine_version,
      signal_side: typedPayload.signal.side,
      pattern: typedPayload.signal.pattern,
      confidence: typedPayload.signal.confidence,
      signal_type: typedPayload.signal.signal_type,
      is_counter_trend: typedPayload.signal.is_counter_trend,
      signal_reason: optionsMapping.reason,
      
      // Market context
      timeframe: typedPayload.market.timeframe,
      session: typedPayload.market.session,
      
      // MTF analysis
      mtf_bias: typedPayload.mtf.bias,
      mtf_enabled: typedPayload.mtf.mtf_enabled,
      direction_mode: typedPayload.mtf.direction_mode,
      
      // Context conditions
      context: typedPayload.context,
      
      // Volume analysis
      relative_volume: typedPayload.volume.relative_volume,
      volume_zone: typedPayload.volume.volume_zone,
      volume_spike: typedPayload.volume.volume_spike,
      
      // Key levels
      levels: {
        pdh: typedPayload.levels.pdh,
        pdl: typedPayload.levels.pdl,
        vwap: typedPayload.levels.vwap,
        or_high: typedPayload.levels.or_high,
        or_low: typedPayload.levels.or_low,
        hod: typedPayload.levels.hod,
        lod: typedPayload.levels.lod,
        level_confluence: typedPayload.levels.level_confluence,
        nearest_level: typedPayload.levels.nearest_level,
      },
      
      // Liquidity context
      liquidity: typedPayload.liquidity,
      
      // Full trade plan
      trade_plan: typedPayload.trade_plan,
      
      // Confidence breakdown
      confidence_breakdown: typedPayload.confidence_breakdown,
      
      // Derived values
      derived_strike: strike,
      derived_expiration: expiration,
    },
  };
  
  return {
    signal: incomingSignal,
    errors: [],
    rawPayload: typedPayload,
    isTest,
  };
}
