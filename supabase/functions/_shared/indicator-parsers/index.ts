/**
 * Indicator Parser Registry
 * 
 * Central module for parsing webhooks from different trading indicators.
 * Each indicator has its own parser module with format-specific logic.
 */

import type { IncomingSignal } from "../types.ts";
import { parseUltimateOptionPayload, type ScoreConfig } from "./ultimate-option.ts";
import { parseSatyPhasePayload } from "./saty-phase.ts";
import { parseMtfTrendDotsPayload } from "./mtf-trend-dots.ts";
import { parseOrbBhchPayload, isOrbBhchPayload } from "./orb-bhch.ts";
import { parseStratEnginePayload, isStratEnginePayload } from "./strat-engine.ts";

export type IndicatorSource = 
  | 'ultimate-option'
  | 'saty-phase'
  | 'mtf-trend-dots'
  | 'orb-bhch'
  | 'strat-engine'
  | 'tradingview';     // Generic TradingView format

export interface IndicatorParseResult {
  signal: IncomingSignal | null;
  errors: string[];
  rawPayload: Record<string, unknown>;
  source: IndicatorSource;
  isTest: boolean;
}

/**
 * Detect which indicator sent the webhook based on payload structure
 */
export function detectIndicatorSource(payload: Record<string, unknown>): IndicatorSource {
  // STRAT Full Engine v6.1 detection (check first - most specific)
  // Has journal.engine === "STRAT_V6_FULL" or signal with STRAT patterns
  if (isStratEnginePayload(payload)) {
    return 'strat-engine';
  }
  
  // SATY Phase Detector detection:
  // Has meta.engine === "SATY_PO" and event.phase_name
  const meta = payload.meta as Record<string, unknown> | undefined;
  if (meta?.engine === 'SATY_PO' || meta?.indicator_name?.toString().includes('SATY Phase')) {
    return 'saty-phase';
  }
  
  // Also detect by presence of regime_context and event.phase_name
  const event = payload.event as Record<string, unknown> | undefined;
  if (event?.phase_name && payload.regime_context) {
    return 'saty-phase';
  }
  
  // ORB_BHCH detection:
  // Has 'indicator' field with ORB/Stretch/BHCH/EMA and 'action', 'type', 'symbol', 'price'
  if (isOrbBhchPayload(payload)) {
    return 'orb-bhch';
  }
  
  // Multi-Timeframe Trend Dots detection:
  // Has 'timeframes' object with tf keys and 'alignment_score'
  if (payload.timeframes && typeof payload.timeframes === 'object') {
    const tf = payload.timeframes as Record<string, unknown>;
    // Check for expected timeframe keys
    if (tf['3m'] || tf['5m'] || tf['15m'] || tf['1h']) {
      return 'mtf-trend-dots';
    }
  }
  // Also detect by meta.indicator_name
  if (meta?.indicator_name?.toString().includes('Trend Dots')) {
    return 'mtf-trend-dots';
  }
  
  // Ultimate Option Indicator detection:
  // Has 'trend' field with BULLISH/BEARISH/NEUTRAL, often has 'score', 'entry', 'risk' objects
  if (
    payload.trend && 
    ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(String(payload.trend))
  ) {
    return 'ultimate-option';
  }
  
  // Test mode detection for Ultimate Option
  if (payload.test === true && payload.type === 'PING') {
    return 'ultimate-option';
  }
  
  // Default to generic TradingView format
  return 'tradingview';
}

/**
 * Parse a webhook payload using the appropriate indicator parser
 */
export function parseIndicatorPayload(
  raw: unknown,
  options?: {
    forceSource?: IndicatorSource;
    scoreConfig?: ScoreConfig;
  }
): IndicatorParseResult {
  if (!raw || typeof raw !== 'object') {
    return {
      signal: null,
      errors: ['Payload must be a valid JSON object'],
      rawPayload: {},
      source: 'tradingview',
      isTest: false,
    };
  }
  
  const payload = raw as Record<string, unknown>;
  const source = options?.forceSource || detectIndicatorSource(payload);
  
  switch (source) {
    case 'ultimate-option': {
      const result = parseUltimateOptionPayload(payload, options?.scoreConfig);
      return {
        signal: result.signal,
        errors: result.errors,
        rawPayload: result.rawPayload as Record<string, unknown>,
        source,
        isTest: result.isTest,
      };
    }
    
    case 'saty-phase': {
      const result = parseSatyPhasePayload(payload, options?.scoreConfig);
      return {
        signal: result.signal,
        errors: result.errors,
        rawPayload: result.rawPayload as Record<string, unknown>,
        source,
        isTest: result.isTest,
      };
    }
    
    case 'mtf-trend-dots': {
      const result = parseMtfTrendDotsPayload(payload, options?.scoreConfig);
      return {
        signal: result.signal,
        errors: result.errors,
        rawPayload: result.rawPayload as Record<string, unknown>,
        source,
        isTest: result.isTest,
      };
    }
    
    case 'orb-bhch': {
      const result = parseOrbBhchPayload(payload, options?.scoreConfig);
      return {
        signal: result.signal,
        errors: result.errors,
        rawPayload: result.rawPayload as unknown as Record<string, unknown>,
        source,
        isTest: result.isTest,
      };
    }
    
    case 'strat-engine': {
      const result = parseStratEnginePayload(payload, options?.scoreConfig);
      return {
        signal: result.signal,
        errors: result.errors,
        rawPayload: result.rawPayload as unknown as Record<string, unknown>,
        source,
        isTest: result.isTest,
      };
    }
    
    case 'tradingview':
    default:
      return {
        signal: null,
        errors: ['Use parseTradingViewPayload for generic TradingView format'],
        rawPayload: payload,
        source: 'tradingview',
        isTest: false,
      };
  }
}

// Re-export for convenience
export { parseUltimateOptionPayload, type ScoreConfig } from "./ultimate-option.ts";
export { parseSatyPhasePayload } from "./saty-phase.ts";
export { parseMtfTrendDotsPayload } from "./mtf-trend-dots.ts";
export { parseOrbBhchPayload, isOrbBhchPayload } from "./orb-bhch.ts";
export { parseStratEnginePayload, isStratEnginePayload } from "./strat-engine.ts";
