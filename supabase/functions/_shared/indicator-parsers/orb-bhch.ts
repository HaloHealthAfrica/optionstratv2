/**
 * ORB_BHCH Indicator Parser
 * 
 * Handles 4 types of signals:
 * 1. ORB Breakouts (Opening Range Breakout)
 * 2. Stretch Level Breaks
 * 3. BHCH (Big Body Candle > 50%)
 * 4. EMA Crossovers (5x21, 21x55)
 */

import type { IncomingSignal, SignalAction, OptionType, OrderType } from "../types.ts";

// Signal types from the indicator
export type OrbIndicatorType = 'ORB' | 'Stretch' | 'BHCH' | 'EMA';

export interface OrbBhchPayload {
  action: 'BUY' | 'SELL' | 'SIGNAL';
  indicator: OrbIndicatorType;
  type: string;
  symbol: string;
  price: number;
  // ORB/Stretch specific
  level?: number;
  // BHCH specific
  bodySize?: number;
  // EMA specific
  ema5?: number;
  ema21?: number;
  ema55?: number;
  // Optional metadata
  timestamp?: number;
  meta?: {
    version?: string;
    source?: string;
    [key: string]: unknown;
  };
}

export interface ParseResult {
  signal: IncomingSignal | null;
  errors: string[];
  rawPayload: OrbBhchPayload;
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
 * Detect if a payload is from the ORB_BHCH indicator
 */
export function isOrbBhchPayload(payload: Record<string, unknown>): boolean {
  // Must have indicator field with known type
  const indicator = payload.indicator;
  if (typeof indicator !== 'string') return false;
  
  const validIndicators = ['ORB', 'Stretch', 'BHCH', 'EMA'];
  if (!validIndicators.includes(indicator)) return false;
  
  // Must have action and type
  if (!payload.action || !payload.type) return false;
  
  // Must have symbol and price
  if (!payload.symbol || typeof payload.price !== 'number') return false;
  
  return true;
}

/**
 * Calculate quantity based on signal strength
 * For ORB/Stretch: distance from level indicates strength
 * For BHCH: bodySize indicates strength
 * For EMA: EMA separation indicates strength
 */
function calculateQuantity(
  payload: OrbBhchPayload,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG
): number {
  let strength = 75; // Default medium strength
  
  if (payload.indicator === 'BHCH' && payload.bodySize) {
    // Body size 50-100% maps to strength 50-100
    strength = Math.min(100, payload.bodySize);
  } else if (payload.indicator === 'ORB' || payload.indicator === 'Stretch') {
    // Distance from level as percentage of price
    if (payload.level && payload.price) {
      const distancePercent = Math.abs(payload.price - payload.level) / payload.price * 100;
      // 0.1% = 75 strength, 0.5% = 100 strength
      strength = Math.min(100, 50 + distancePercent * 100);
    }
  } else if (payload.indicator === 'EMA') {
    // EMA separation strength
    if (payload.ema5 && payload.ema21) {
      const separation = Math.abs(payload.ema5 - payload.ema21) / payload.price * 100;
      strength = Math.min(100, 60 + separation * 50);
    } else if (payload.ema21 && payload.ema55) {
      const separation = Math.abs(payload.ema21 - payload.ema55) / payload.price * 100;
      strength = Math.min(100, 60 + separation * 50);
    }
  }
  
  if (strength < config.minThreshold) {
    return config.baseQuantity;
  }
  
  const additionalContracts = Math.floor(
    (strength - config.minThreshold) * config.scalingFactor
  );
  
  return Math.min(config.baseQuantity + additionalContracts, config.maxQuantity);
}

/**
 * Derive ATM strike from current price
 */
function deriveAtmStrike(currentPrice: number): number {
  let increment: number;
  if (currentPrice < 50) {
    increment = 2.5;
  } else if (currentPrice < 200) {
    increment = 5;
  } else {
    increment = 10;
  }
  return Math.round(currentPrice / increment) * increment;
}

/**
 * Derive next weekly expiration (Friday)
 */
function deriveNextWeeklyExpiration(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  // Days until next Friday (0 = Sunday, 5 = Friday)
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  
  // If today is Friday after market close or weekend, get next Friday
  if (daysUntilFriday === 0) {
    daysUntilFriday = 7;
  }
  
  // For ORB signals, we want shorter DTE - next Friday or 2 Fridays out
  // Use next Friday if > 2 days away, otherwise 2 Fridays
  if (daysUntilFriday < 3) {
    daysUntilFriday += 7;
  }
  
  const expDate = new Date(today);
  expDate.setDate(today.getDate() + daysUntilFriday);
  
  const year = expDate.getFullYear();
  const month = String(expDate.getMonth() + 1).padStart(2, '0');
  const day = String(expDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Map action and type to trading signal
 */
function mapToSignal(payload: OrbBhchPayload): {
  action: SignalAction | null;
  optionType: OptionType | null;
  reason: string;
  isActionable: boolean;
} {
  const { action, indicator, type } = payload;
  
  // SIGNAL actions (BHCH) are informational only
  if (action === 'SIGNAL') {
    // BHCH can still be actionable if bullish/bearish
    if (type.includes('Bullish')) {
      return {
        action: 'BUY',
        optionType: 'CALL',
        reason: `BHCH Bullish confirmation: ${type}`,
        isActionable: true,
      };
    } else if (type.includes('Bearish')) {
      return {
        action: 'BUY',
        optionType: 'PUT',
        reason: `BHCH Bearish confirmation: ${type}`,
        isActionable: true,
      };
    }
    return {
      action: null,
      optionType: null,
      reason: `BHCH signal logged: ${type}`,
      isActionable: false,
    };
  }
  
  // BUY/SELL actions from ORB, Stretch, EMA
  if (action === 'BUY') {
    return {
      action: 'BUY',
      optionType: 'CALL',
      reason: `${indicator} bullish: ${type}`,
      isActionable: true,
    };
  }
  
  if (action === 'SELL') {
    return {
      action: 'BUY',
      optionType: 'PUT',
      reason: `${indicator} bearish: ${type}`,
      isActionable: true,
    };
  }
  
  return {
    action: null,
    optionType: null,
    reason: `Unknown action: ${action}`,
    isActionable: false,
  };
}

/**
 * Parse ORB_BHCH indicator payload
 */
export function parseOrbBhchPayload(
  raw: unknown,
  scoreConfig: ScoreConfig = DEFAULT_SCORE_CONFIG
): ParseResult {
  const errors: string[] = [];
  
  if (typeof raw !== 'object' || raw === null) {
    errors.push('Payload must be an object');
    return {
      signal: null,
      errors,
      rawPayload: {} as OrbBhchPayload,
      isTest: false,
    };
  }
  
  const payload = raw as Record<string, unknown>;
  
  // Extract and validate required fields
  const action = payload.action as string | undefined;
  const indicator = payload.indicator as OrbIndicatorType | undefined;
  const type = payload.type as string | undefined;
  const symbol = payload.symbol as string | undefined;
  const price = payload.price as number | undefined;
  
  // Validate required fields
  if (!action) {
    errors.push('Missing required field: action');
  }
  if (!indicator) {
    errors.push('Missing required field: indicator');
  }
  if (!type) {
    errors.push('Missing required field: type');
  }
  if (!symbol) {
    errors.push('Missing required field: symbol');
  }
  if (typeof price !== 'number' || isNaN(price)) {
    errors.push('Missing or invalid required field: price');
  }
  
  // Validate indicator type
  const validIndicators = ['ORB', 'Stretch', 'BHCH', 'EMA'];
  if (indicator && !validIndicators.includes(indicator)) {
    errors.push(`Invalid indicator: ${indicator}. Must be one of: ${validIndicators.join(', ')}`);
  }
  
  // Validate action type
  const validActions = ['BUY', 'SELL', 'SIGNAL'];
  if (action && !validActions.includes(action)) {
    errors.push(`Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`);
  }
  
  // Build typed payload for return
  const typedPayload: OrbBhchPayload = {
    action: action as 'BUY' | 'SELL' | 'SIGNAL',
    indicator: indicator as OrbIndicatorType,
    type: type || '',
    symbol: symbol || '',
    price: price || 0,
    level: payload.level as number | undefined,
    bodySize: payload.bodySize as number | undefined,
    ema5: payload.ema5 as number | undefined,
    ema21: payload.ema21 as number | undefined,
    ema55: payload.ema55 as number | undefined,
    timestamp: payload.timestamp as number | undefined,
    meta: payload.meta as OrbBhchPayload['meta'],
  };
  
  // If validation errors, return early
  if (errors.length > 0) {
    return {
      signal: null,
      errors,
      rawPayload: typedPayload,
      isTest: false,
    };
  }
  
  // Map to trading signal
  const signalMapping = mapToSignal(typedPayload);
  
  if (!signalMapping.isActionable) {
    // Log but don't trade
    return {
      signal: null,
      errors: [`Non-actionable signal: ${signalMapping.reason}`],
      rawPayload: typedPayload,
      isTest: false,
    };
  }
  
  // Calculate derived values
  const strike = deriveAtmStrike(typedPayload.price);
  const expiration = deriveNextWeeklyExpiration();
  const quantity = calculateQuantity(typedPayload, scoreConfig);
  
  // Build the signal
  const signal: IncomingSignal = {
    source: `orb_bhch_${typedPayload.indicator.toLowerCase()}`,
    action: signalMapping.action!,
    underlying: typedPayload.symbol.toUpperCase(),
    strike,
    expiration,
    option_type: signalMapping.optionType!,
    quantity,
    order_type: 'MARKET' as OrderType,
    time_in_force: 'DAY',
    strategy_type: 'SINGLE',
    metadata: {
      indicator: typedPayload.indicator,
      signal_type: typedPayload.type,
      original_action: typedPayload.action,
      price: typedPayload.price,
      level: typedPayload.level,
      body_size: typedPayload.bodySize,
      ema_values: {
        ema5: typedPayload.ema5,
        ema21: typedPayload.ema21,
        ema55: typedPayload.ema55,
      },
      signal_reason: signalMapping.reason,
      derived_strike: strike,
      derived_expiration: expiration,
      timestamp: typedPayload.timestamp,
    },
  };
  
  return {
    signal,
    errors: [],
    rawPayload: typedPayload,
    isTest: false,
  };
}
