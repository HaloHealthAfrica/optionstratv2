// ============================================================================
// MULTI-TIMEFRAME SIGNAL ADAPTER
// ============================================================================
// Normalizes webhooks from 5 different indicators into unified format
// Handles 8 timeframes per indicator: 3m, 5m, 15m, 30m, 60m, 240m, 1D, 1W
//
// Strategy: Swing Trading (1-3 days)
// - 15min+ signals only (3m/5m for entry refinement)
// - Multi-timeframe alignment required
// - Larger positions for higher timeframe confirmation
// ============================================================================

export type SignalSource = 'SIGNALS' | 'SATY_PHASE' | 'TREND' | 'ORB' | 'STRAT';
export type SignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';
export type Timeframe = '3' | '5' | '15' | '30' | '60' | '240' | '1D' | '1W';

export interface TimeframeConfig {
  weight: number;
  role: 'NOISE' | 'SCALP_ONLY' | 'ENTRY_PRECISION' | 'ENTRY_TIMING' | 'ENTRY_FILTER' | 'HTF_CONFIRMATION' | 'DAILY_BIAS' | 'MACRO_TREND';
  canTriggerTrade: boolean;
  minConfidence: number;
}

// Timeframe hierarchy for swing trading
export const TIMEFRAME_HIERARCHY: Record<Timeframe, TimeframeConfig> = {
  '1W': { weight: 10, role: 'MACRO_TREND', canTriggerTrade: false, minConfidence: 60 },
  '1D': { weight: 9, role: 'DAILY_BIAS', canTriggerTrade: true, minConfidence: 65 },
  '240': { weight: 8, role: 'HTF_CONFIRMATION', canTriggerTrade: true, minConfidence: 70 },
  '60': { weight: 7, role: 'ENTRY_FILTER', canTriggerTrade: true, minConfidence: 70 },
  '30': { weight: 5, role: 'ENTRY_TIMING', canTriggerTrade: true, minConfidence: 75 },
  '15': { weight: 4, role: 'ENTRY_PRECISION', canTriggerTrade: true, minConfidence: 75 },
  '5': { weight: 2, role: 'SCALP_ONLY', canTriggerTrade: false, minConfidence: 80 },
  '3': { weight: 1, role: 'NOISE', canTriggerTrade: false, minConfidence: 85 },
};

// Timeframes that can trigger actual trades (15min and above)
export const TRADE_TIMEFRAMES: Timeframe[] = ['15', '30', '60', '240', '1D'];

// Timeframes used for filtering/confirmation only
export const FILTER_TIMEFRAMES: Timeframe[] = ['240', '1D', '1W'];

// Timeframes for entry refinement (not trade triggers)
export const REFINEMENT_TIMEFRAMES: Timeframe[] = ['3', '5'];

export interface NormalizedSignal {
  // Identity
  source: SignalSource;
  ticker: string;
  exchange: string;
  timeframe: Timeframe;
  timestamp: Date;
  
  // Direction & Confidence
  direction: SignalDirection;
  confidence: number; // 0-100 normalized
  
  // Price Data
  price: number;
  entry?: number;
  stop?: number;
  targets?: number[];
  
  // Trade Levels (if provided)
  tradeLevels?: {
    entry: number;
    stop: number;
    target1?: number;
    target2?: number;
    target3?: number;
    riskPoints?: number;
    rrRatio?: number;
  };
  
  // Market Context
  context: {
    session?: string;
    volatility?: string;
    volume?: number;
    volumeZone?: string;
    phase?: string;
    pattern?: string;
    isCounterTrend?: boolean;
    atExtreme?: boolean;
  };
  
  // Risk Metrics
  risk?: {
    atr?: number;
    atrPercent?: number;
    riskPoints?: number;
    rrRatio?: number;
  };
  
  // Metadata
  metadata: {
    engineVersion?: string;
    mode?: string;
    originalPayload: unknown;
  };
}

// ============================================================================
// SIGNAL SOURCE DETECTION
// ============================================================================

export function detectSignalSource(payload: Record<string, unknown>): SignalSource {
  // SATY Phase Detector
  const meta = payload.meta as Record<string, unknown> | undefined;
  if (meta?.engine === 'SATY_PO') {
    return 'SATY_PHASE';
  }
  
  // STRAT Full Engine
  const journal = payload.journal as Record<string, unknown> | undefined;
  if (journal?.engine === 'STRAT_V6_FULL') {
    return 'STRAT';
  }
  
  // Multi-Timeframe Trend
  if (payload.timeframes && payload.bias && payload.ticker) {
    return 'TREND';
  }
  
  // ORB_BHCH
  if (payload.indicator && ['ORB', 'Stretch', 'BHCH', 'EMA'].includes(String(payload.indicator))) {
    return 'ORB';
  }
  
  // Ultimate Options Strategy (Signals)
  if (payload.trend && payload.score !== undefined && payload.signal) {
    return 'SIGNALS';
  }
  
  throw new Error(`Unknown signal source. Payload keys: ${Object.keys(payload).join(', ')}`);
}

// ============================================================================
// FIELD EXTRACTORS
// ============================================================================

function extractTicker(payload: Record<string, unknown>, source: SignalSource): string {
  switch (source) {
    case 'SIGNALS': {
      const instrument = payload.instrument as Record<string, unknown> | undefined;
      return String(payload.ticker || instrument?.ticker || 'UNKNOWN');
    }
    case 'SATY_PHASE': {
      const instrument = payload.instrument as Record<string, unknown> | undefined;
      return String(instrument?.symbol || 'UNKNOWN');
    }
    case 'TREND':
      return String(payload.ticker || payload.symbol || 'UNKNOWN');
    case 'ORB':
      return String(payload.symbol || 'UNKNOWN');
    case 'STRAT': {
      const market = payload.market as Record<string, unknown> | undefined;
      return String(market?.symbol || 'UNKNOWN');
    }
  }
}

function extractExchange(payload: Record<string, unknown>, source: SignalSource): string {
  switch (source) {
    case 'SIGNALS': {
      const instrument = payload.instrument as Record<string, unknown> | undefined;
      return String(payload.exchange || instrument?.exchange || 'UNKNOWN');
    }
    case 'SATY_PHASE': {
      const instrument = payload.instrument as Record<string, unknown> | undefined;
      return String(instrument?.exchange || 'UNKNOWN');
    }
    case 'TREND':
      return String(payload.exchange || 'UNKNOWN');
    case 'ORB':
      return 'UNKNOWN'; // ORB doesn't provide exchange
    case 'STRAT':
      return 'UNKNOWN'; // STRAT doesn't provide exchange
  }
}

function extractTimeframe(payload: Record<string, unknown>, source: SignalSource): Timeframe {
  let tf: string | undefined;
  
  switch (source) {
    case 'SIGNALS': {
      const timeframe = payload.timeframe as Record<string, unknown> | string | undefined;
      tf = typeof timeframe === 'object' ? String(timeframe?.chart_tf) : String(timeframe);
      break;
    }
    case 'SATY_PHASE': {
      const timeframe = payload.timeframe as Record<string, unknown> | undefined;
      tf = String(timeframe?.chart_tf || '15');
      break;
    }
    case 'TREND':
      // Trend doesn't have a timeframe - it aggregates all
      tf = '60'; // Default to 1H for trend signals
      break;
    case 'ORB':
      tf = '15'; // ORB typically on 15min charts
      break;
    case 'STRAT': {
      const market = payload.market as Record<string, unknown> | undefined;
      tf = String(market?.timeframe || '15');
      break;
    }
  }
  
  // Normalize timeframe to our standard format
  return normalizeTimeframe(tf || '15');
}

function normalizeTimeframe(tf: string): Timeframe {
  // Handle various timeframe formats
  const normalized = tf.replace(/[mMhHdDwW]/gi, '').trim();
  
  if (normalized === '1' || normalized === '3') return '3';
  if (normalized === '5') return '5';
  if (normalized === '10' || normalized === '15') return '15';
  if (normalized === '30') return '30';
  if (normalized === '60') return '60';
  if (normalized === '120' || normalized === '180' || normalized === '240') return '240';
  if (tf.includes('D') || tf.includes('d')) return '1D';
  if (tf.includes('W') || tf.includes('w')) return '1W';
  
  return '15'; // Default fallback
}

function extractDirection(payload: Record<string, unknown>, source: SignalSource): SignalDirection {
  switch (source) {
    case 'SIGNALS':
      return payload.trend === 'BULLISH' ? 'LONG' : 
             payload.trend === 'BEARISH' ? 'SHORT' : 'NEUTRAL';
    
    case 'SATY_PHASE': {
      const regimeContext = payload.regime_context as Record<string, unknown> | undefined;
      const bias = regimeContext?.local_bias;
      return bias === 'BULLISH' ? 'LONG' :
             bias === 'BEARISH' ? 'SHORT' : 'NEUTRAL';
    }
    
    case 'TREND':
      return payload.bias === 'BULLISH' ? 'LONG' :
             payload.bias === 'BEARISH' ? 'SHORT' : 'NEUTRAL';
    
    case 'ORB':
      return payload.action === 'BUY' ? 'LONG' :
             payload.action === 'SELL' ? 'SHORT' : 'NEUTRAL';
    
    case 'STRAT': {
      const signal = payload.signal as Record<string, unknown> | undefined;
      const side = signal?.side;
      return side === 'LONG' ? 'LONG' :
             side === 'SHORT' ? 'SHORT' : 'NEUTRAL';
    }
  }
}

function extractConfidence(payload: Record<string, unknown>, source: SignalSource): number {
  switch (source) {
    case 'SIGNALS':
      // 0-10.5 scale
      return Number(payload.score) || 0;
    
    case 'SATY_PHASE': {
      // 0-100 scale
      const confidence = payload.confidence as Record<string, unknown> | undefined;
      return Number(confidence?.confidence_score) || 50;
    }
    
    case 'TREND':
      // 0-100 scale (alignment score)
      return Number(payload.alignment_score) || 50;
    
    case 'ORB': {
      // No confidence score - derive from context
      if (payload.indicator === 'ORB' || payload.indicator === 'Stretch') {
        return 70; // ORB breakouts are medium-high confidence
      }
      if (payload.indicator === 'BHCH') {
        return Number(payload.bodySize) || 60; // Use body size as proxy
      }
      return 50; // EMA crosses are medium confidence
    }
    
    case 'STRAT': {
      // 0-100 scale
      const signal = payload.signal as Record<string, unknown> | undefined;
      return Number(signal?.confidence) || 50;
    }
  }
}

function normalizeConfidence(score: number, source: SignalSource): number {
  switch (source) {
    case 'SIGNALS':
      // Convert 0-10.5 to 0-100
      return Math.min(100, Math.max(0, (score / 10.5) * 100));
    
    case 'SATY_PHASE':
    case 'TREND':
    case 'STRAT':
    case 'ORB':
      // Already 0-100
      return Math.min(100, Math.max(0, score));
  }
}

function extractPrice(payload: Record<string, unknown>, source: SignalSource): number {
  switch (source) {
    case 'SIGNALS': {
      const instrument = payload.instrument as Record<string, unknown> | undefined;
      return Number(payload.current_price || instrument?.current_price) || 0;
    }
    case 'SATY_PHASE': {
      const instrument = payload.instrument as Record<string, unknown> | undefined;
      return Number(instrument?.current_price) || 0;
    }
    case 'TREND':
      return Number(payload.price || payload.current_price) || 0;
    case 'ORB':
      return Number(payload.price) || 0;
    case 'STRAT': {
      const tradePlan = payload.trade_plan as Record<string, unknown> | undefined;
      return Number(tradePlan?.entry) || 0;
    }
  }
}

function extractTradeLevels(payload: Record<string, unknown>, source: SignalSource): NormalizedSignal['tradeLevels'] | undefined {
  switch (source) {
    case 'SIGNALS': {
      const entry = payload.entry as Record<string, unknown> | undefined;
      const risk = payload.risk as Record<string, unknown> | undefined;
      if (!entry) return undefined;
      return {
        entry: Number(entry.price),
        stop: Number(entry.stop_loss),
        target1: Number(entry.target_1) || undefined,
        target2: Number(entry.target_2) || undefined,
        riskPoints: Number(risk?.amount) || undefined,
        rrRatio: Number(risk?.rr_ratio_t1) || undefined,
      };
    }
    
    case 'SATY_PHASE':
      // SATY doesn't provide trade levels
      return undefined;
    
    case 'TREND':
      // Trend doesn't provide trade levels
      return undefined;
    
    case 'ORB':
      return {
        entry: Number(payload.price),
        stop: Number(payload.level), // Use breakout level as stop reference
        target1: undefined,
        target2: undefined,
      };
    
    case 'STRAT': {
      const tradePlan = payload.trade_plan as Record<string, unknown> | undefined;
      if (!tradePlan) return undefined;
      return {
        entry: Number(tradePlan.entry),
        stop: Number(tradePlan.stop),
        target1: Number(tradePlan.target_1) || undefined,
        target2: Number(tradePlan.target_2) || undefined,
        target3: Number(tradePlan.target_3) || undefined,
        riskPoints: Number(tradePlan.risk_points) || undefined,
        rrRatio: Number(tradePlan.rr_1) || undefined,
      };
    }
  }
}

function extractMarketContext(payload: Record<string, unknown>, source: SignalSource): NormalizedSignal['context'] {
  switch (source) {
    case 'SIGNALS': {
      const timeContext = payload.time_context as Record<string, unknown> | undefined;
      const marketContext = payload.market_context as Record<string, unknown> | undefined;
      return {
        session: String(timeContext?.market_session || ''),
        volume: Number(marketContext?.volume_vs_avg) || undefined,
        volatility: marketContext?.atr ? 'NORMAL' : undefined,
      };
    }
    
    case 'SATY_PHASE': {
      const event = payload.event as Record<string, unknown> | undefined;
      const regimeContext = payload.regime_context as Record<string, unknown> | undefined;
      const executionGuidance = payload.execution_guidance as Record<string, unknown> | undefined;
      return {
        phase: String(event?.phase_name || ''),
        volatility: String(regimeContext?.volatility_state || ''),
        session: String(executionGuidance?.session || ''),
      };
    }
    
    case 'TREND':
      return {
        volume: Number(payload.alignment_score) || undefined,
      };
    
    case 'ORB':
      return {
        pattern: `${payload.indicator}_${payload.type}`,
      };
    
    case 'STRAT': {
      const signal = payload.signal as Record<string, unknown> | undefined;
      const market = payload.market as Record<string, unknown> | undefined;
      const volume = payload.volume as Record<string, unknown> | undefined;
      const context = payload.context as Record<string, unknown> | undefined;
      return {
        pattern: String(signal?.pattern || ''),
        session: String(market?.session || ''),
        volumeZone: String(volume?.volume_zone || ''),
        isCounterTrend: Boolean(signal?.is_counter_trend),
        atExtreme: Boolean(context?.at_hod || context?.at_lod),
      };
    }
  }
}

function extractRiskMetrics(payload: Record<string, unknown>, source: SignalSource): NormalizedSignal['risk'] | undefined {
  switch (source) {
    case 'SIGNALS': {
      const marketContext = payload.market_context as Record<string, unknown> | undefined;
      const risk = payload.risk as Record<string, unknown> | undefined;
      return {
        atr: Number(marketContext?.atr) || undefined,
        riskPoints: Number(risk?.amount) || undefined,
        rrRatio: Number(risk?.rr_ratio_t1) || undefined,
      };
    }
    
    case 'SATY_PHASE': {
      const regimeContext = payload.regime_context as Record<string, unknown> | undefined;
      return {
        atr: Number(regimeContext?.atr) || undefined,
        atrPercent: Number(regimeContext?.atr_normalized) || undefined,
      };
    }
    
    case 'TREND':
      return undefined;
    
    case 'ORB':
      return undefined;
    
    case 'STRAT': {
      const context = payload.context as Record<string, unknown> | undefined;
      const tradePlan = payload.trade_plan as Record<string, unknown> | undefined;
      return {
        atrPercent: Number(context?.atr_pct) || undefined,
        riskPoints: Number(tradePlan?.risk_points) || undefined,
        rrRatio: Number(tradePlan?.rr_1) || undefined,
      };
    }
  }
}

// ============================================================================
// MAIN NORMALIZATION FUNCTION
// ============================================================================

export function normalizeWebhookPayload(payload: Record<string, unknown>): NormalizedSignal {
  const source = detectSignalSource(payload);
  const rawConfidence = extractConfidence(payload, source);
  const confidence = normalizeConfidence(rawConfidence, source);
  const timeframe = extractTimeframe(payload, source);
  
  const meta = payload.meta as Record<string, unknown> | undefined;
  const journal = payload.journal as Record<string, unknown> | undefined;
  
  return {
    source,
    ticker: extractTicker(payload, source),
    exchange: extractExchange(payload, source),
    timeframe,
    timestamp: new Date(),
    direction: extractDirection(payload, source),
    confidence,
    price: extractPrice(payload, source),
    tradeLevels: extractTradeLevels(payload, source),
    context: extractMarketContext(payload, source),
    risk: extractRiskMetrics(payload, source),
    metadata: {
      engineVersion: String(meta?.engine_version || journal?.engine_version || ''),
      mode: String(meta?.mode || journal?.mode || ''),
      originalPayload: payload,
    },
  };
}

// ============================================================================
// SOURCE-SPECIFIC FILTERING
// ============================================================================

export interface FilterResult {
  approved: boolean;
  reason?: string;
}

export function applySourceSpecificFilters(signal: NormalizedSignal): FilterResult {
  // Check timeframe eligibility
  const tfConfig = TIMEFRAME_HIERARCHY[signal.timeframe];
  
  // Reject signals from noise timeframes
  if (tfConfig.role === 'NOISE') {
    return { approved: false, reason: 'TIMEFRAME_TOO_LOW_3MIN' };
  }
  
  // Only allow scalp timeframe (5min) for very high confidence
  if (tfConfig.role === 'SCALP_ONLY' && signal.confidence < tfConfig.minConfidence) {
    return { approved: false, reason: 'SCALP_TIMEFRAME_LOW_CONFIDENCE' };
  }
  
  // Check minimum confidence for timeframe
  if (signal.confidence < tfConfig.minConfidence) {
    return { 
      approved: false, 
      reason: `${signal.timeframe}MIN_LOW_CONFIDENCE_${signal.confidence.toFixed(0)}_MIN_${tfConfig.minConfidence}` 
    };
  }
  
  // Source-specific filters
  switch (signal.source) {
    case 'SIGNALS':
      // Require minimum score of 4.0/10.5 = 38%
      if (signal.confidence < 38) {
        return { approved: false, reason: 'SIGNALS_SCORE_TOO_LOW' };
      }
      break;
    
    case 'SATY_PHASE': {
      // Only trade on phase entries, not status updates
      const originalPayload = signal.metadata.originalPayload as Record<string, unknown>;
      const event = originalPayload?.event as Record<string, unknown> | undefined;
      const eventName = String(event?.name || '');
      if (!eventName.startsWith('ENTER_')) {
        return { approved: false, reason: 'SATY_STATUS_UPDATE_NOT_ENTRY' };
      }
      // Require confidence > 70
      if (signal.confidence < 70) {
        return { approved: false, reason: 'SATY_CONFIDENCE_TOO_LOW' };
      }
      // Only trade MARKUP and MARKDOWN phases
      const phase = signal.context.phase;
      if (phase !== 'MARKUP' && phase !== 'MARKDOWN') {
        return { approved: false, reason: `SATY_PHASE_${phase}_NOT_TRADEABLE` };
      }
      break;
    }
    
    case 'TREND':
      // Require alignment score > 60
      if (signal.confidence < 60) {
        return { approved: false, reason: 'TREND_ALIGNMENT_TOO_LOW' };
      }
      break;
    
    case 'ORB': {
      // Only trade ORB breakouts and stretches
      const originalPayload = signal.metadata.originalPayload as Record<string, unknown>;
      const indicator = String(originalPayload?.indicator || '');
      if (!['ORB', 'Stretch'].includes(indicator)) {
        return { approved: false, reason: `ORB_${indicator}_NOT_BREAKOUT` };
      }
      break;
    }
    
    case 'STRAT':
      // Require minimum confidence
      if (signal.confidence < 70) {
        return { approved: false, reason: 'STRAT_CONFIDENCE_TOO_LOW' };
      }
      // Counter-trend signals need higher confidence
      if (signal.context.isCounterTrend && signal.confidence < 80) {
        return { approved: false, reason: 'STRAT_COUNTER_TREND_LOW_CONFIDENCE' };
      }
      break;
  }
  
  return { approved: true };
}
