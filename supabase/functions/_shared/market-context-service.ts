/**
 * Market Context Service
 * Provides access to latest market context data for decision engine
 */

import { createSupabaseClient } from "./supabase-client.ts";
import type { 
  MarketContextRecord, 
  MarketContextForDecision,
  ContextWebhookPayload 
} from "./market-context-types.ts";

// Cache TTL in milliseconds (5 minutes)
const CONTEXT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Get the latest market context for a ticker
 */
export async function getLatestContext(ticker: string): Promise<MarketContextForDecision | null> {
  try {
    const supabase = createSupabaseClient();
    
    const { data, error } = await supabase
      .from('market_context')
      .select('*')
      .eq('ticker', ticker.toUpperCase())
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[ContextService] Error fetching context for ${ticker}:`, error);
      return null;
    }

    if (!data) {
      console.warn(`[ContextService] No context found for ${ticker}`);
      return null;
    }

    return transformToDecisionContext(data as MarketContextRecord);
  } catch (error) {
    console.error(`[ContextService] Error fetching context for ${ticker}:`, error);
    return null;
  }
}

/**
 * Get latest context for multiple tickers at once
 */
export async function getLatestContextBatch(tickers: string[]): Promise<Map<string, MarketContextForDecision>> {
  const results = new Map<string, MarketContextForDecision>();
  
  if (tickers.length === 0) {
    return results;
  }

  try {
    const supabase = createSupabaseClient();
    
    // Use the view for latest context per ticker
    const { data, error } = await supabase
      .from('latest_market_context')
      .select('*')
      .in('ticker', tickers.map(t => t.toUpperCase()));

    if (error || !data) {
      console.warn('[ContextService] Error fetching batch context:', error);
      return results;
    }

    for (const record of data) {
      const context = transformToDecisionContext(record as MarketContextRecord);
      if (context) {
        results.set(record.ticker, context);
      }
    }
  } catch (error) {
    console.error('[ContextService] Error in batch fetch:', error);
  }

  return results;
}

/**
 * Check if context data is stale
 */
export function isContextStale(context: MarketContextForDecision): boolean {
  const ageMs = Date.now() - context.updatedAt.getTime();
  return ageMs > CONTEXT_STALE_THRESHOLD_MS;
}

/**
 * Transform database record to decision engine format
 */
function transformToDecisionContext(record: MarketContextRecord): MarketContextForDecision {
  const updatedAt = new Date(record.updated_at);
  const isStale = Date.now() - updatedAt.getTime() > CONTEXT_STALE_THRESHOLD_MS;

  return {
    ticker: record.ticker,
    price: Number(record.price),
    updatedAt,
    isStale,

    volatility: {
      vix: Number(record.vix) || 0,
      vixRegime: (record.vix_regime as "HIGH_VOL" | "NORMAL" | "LOW_VOL") || "NORMAL",
      vixTrend: (record.vix_trend as "RISING" | "FALLING") || "FALLING",
      atrPercentile: record.atr_percentile ?? 50,
      bbPosition: record.bb_position ?? 50,
    },

    levels: {
      nearestResistance: Number(record.nearest_resistance) || 0,
      nearestSupport: Number(record.nearest_support) || 0,
      distToResistancePct: Number(record.dist_to_nearest_res_pct) || 0,
      distToSupportPct: Number(record.dist_to_nearest_sup_pct) || 0,
      orBreakout: (record.or_breakout as "ABOVE" | "BELOW" | "INSIDE" | "PENDING") || "PENDING",
      orComplete: record.or_complete ?? false,
    },

    market: {
      spyTrend: (record.spy_trend as "BULLISH" | "BEARISH") || "BULLISH",
      qqqTrend: (record.qqq_trend as "BULLISH" | "BEARISH") || "BULLISH",
      marketBias: (record.market_bias as "BULLISH" | "BEARISH" | "MIXED") || "MIXED",
      movingWithMarket: record.moving_with_market ?? true,
    },

    candle: {
      pattern: record.candle_pattern || "NONE",
      patternBias: (record.candle_pattern_bias as "BULLISH" | "BEARISH" | "NEUTRAL") || "NEUTRAL",
      strength: record.candle_strength ?? 50,
    },

    session: {
      isMarketOpen: record.is_market_open ?? false,
      isFirst30Min: record.is_first_30min ?? false,
    },
  };
}

/**
 * Save context from webhook payload to database
 */
export async function saveContext(payload: ContextWebhookPayload): Promise<{ id: string } | null> {
  try {
    const supabase = createSupabaseClient();
    
    const record = {
      ticker: payload.ticker.toUpperCase(),
      exchange: payload.exchange || null,
      timeframe: payload.timeframe || null,
      price: payload.price,
      
      // Volatility
      vix: payload.volatility?.vix ?? null,
      vix_sma20: payload.volatility?.vix_sma20 ?? null,
      vix_regime: payload.volatility?.vix_regime ?? null,
      vix_trend: payload.volatility?.vix_trend ?? null,
      atr: payload.volatility?.atr ?? null,
      atr_percentile: payload.volatility?.atr_percentile ?? null,
      bb_position: payload.volatility?.bb_position ?? null,
      vol_expansion_pct: payload.volatility?.vol_expansion_pct ?? null,
      
      // Levels
      pivot: payload.levels?.pivot ?? null,
      r1: payload.levels?.r1 ?? null,
      r2: payload.levels?.r2 ?? null,
      r3: payload.levels?.r3 ?? null,
      s1: payload.levels?.s1 ?? null,
      s2: payload.levels?.s2 ?? null,
      s3: payload.levels?.s3 ?? null,
      nearest_resistance: payload.levels?.nearest_resistance ?? null,
      nearest_support: payload.levels?.nearest_support ?? null,
      dist_to_r1_pct: payload.levels?.dist_to_r1_pct ?? null,
      dist_to_s1_pct: payload.levels?.dist_to_s1_pct ?? null,
      dist_to_nearest_res_pct: payload.levels?.dist_to_nearest_res_pct ?? null,
      dist_to_nearest_sup_pct: payload.levels?.dist_to_nearest_sup_pct ?? null,
      prior_day_high: payload.levels?.prior_day_high ?? null,
      prior_day_low: payload.levels?.prior_day_low ?? null,
      prior_day_close: payload.levels?.prior_day_close ?? null,
      
      // Opening range
      or_high: payload.opening_range?.high ?? null,
      or_low: payload.opening_range?.low ?? null,
      or_midpoint: payload.opening_range?.midpoint ?? null,
      or_range: payload.opening_range?.range ?? null,
      or_breakout: payload.opening_range?.breakout ?? null,
      or_complete: payload.opening_range?.complete ?? false,
      
      // Market
      spy_price: payload.market?.spy_price ?? null,
      spy_trend: payload.market?.spy_trend ?? null,
      spy_rsi: payload.market?.spy_rsi ?? null,
      spy_day_change_pct: payload.market?.spy_day_change_pct ?? null,
      qqq_price: payload.market?.qqq_price ?? null,
      qqq_trend: payload.market?.qqq_trend ?? null,
      market_bias: payload.market?.market_bias ?? null,
      moving_with_market: payload.market?.moving_with_market ?? null,
      self_day_change_pct: payload.market?.self_day_change_pct ?? null,
      
      // Candle
      candle_body_ratio: payload.candle?.body_ratio ?? null,
      candle_wick_ratio: payload.candle?.wick_ratio ?? null,
      candle_close_position: payload.candle?.close_position ?? null,
      candle_strength: payload.candle?.strength ?? null,
      candle_pattern: payload.candle?.pattern ?? null,
      candle_pattern_bias: payload.candle?.pattern_bias ?? null,
      is_inside_bar: payload.candle?.is_inside_bar ?? false,
      is_outside_bar: payload.candle?.is_outside_bar ?? false,
      
      // Session
      is_market_open: payload.session?.is_market_open ?? false,
      is_first_30min: payload.session?.is_first_30min ?? false,
      ny_hour: payload.session?.ny_hour ?? null,
      ny_minute: payload.session?.ny_minute ?? null,
      
      // Changes
      vix_changed: payload.changes?.vix_changed ?? false,
      regime_changed: payload.changes?.regime_changed ?? false,
      or_breakout_changed: payload.changes?.or_breakout_changed ?? false,
      market_bias_changed: payload.changes?.market_bias_changed ?? false,
      pattern_detected: payload.changes?.pattern_detected ?? false,
      significant_change: payload.changes?.significant ?? false,
      
      // Meta
      event_type: payload.event ?? null,
      signal_timestamp: payload.timestamp ?? null,
      bar_time: payload.meta?.bar_time ?? null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('market_context')
      .insert(record)
      .select('id')
      .single();

    if (error) {
      console.error('[ContextService] Database error:', error);
      return null;
    }

    return { id: data.id };
  } catch (error) {
    console.error('[ContextService] Error saving context:', error);
    return null;
  }
}

/**
 * Clean up old context records (keep last 24 hours)
 */
export async function cleanupOldContext(): Promise<number> {
  try {
    const supabase = createSupabaseClient();
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('market_context')
      .delete()
      .lt('created_at', cutoffTime)
      .select('id');

    if (error) {
      console.error('[ContextService] Error cleaning up old context:', error);
      return 0;
    }

    const deletedCount = data?.length ?? 0;
    if (deletedCount > 0) {
      console.log(`[ContextService] Cleaned up ${deletedCount} old context records`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('[ContextService] Error in cleanup:', error);
    return 0;
  }
}
