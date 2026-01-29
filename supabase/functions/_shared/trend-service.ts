/**
 * Trend Service
 * Provides access to latest MTF trend data for decision engine
 */

import { createSupabaseClient } from "./supabase-client.ts";
import type { MTFTrendForDecision } from "./types.ts";

// Trend stale threshold in milliseconds (5 minutes)
const TREND_STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Get the latest MTF trend for a ticker
 */
export async function getLatestTrend(ticker: string): Promise<MTFTrendForDecision | null> {
  try {
    const supabase = createSupabaseClient();
    
    // Query the signals table for MTF Trend Dots data
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('source', 'mtf_trend_dots')
      .eq('underlying', ticker.toUpperCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[TrendService] Error fetching trend for ${ticker}:`, error);
      return null;
    }

    if (!data) {
      console.warn(`[TrendService] No trend found for ${ticker}`);
      return null;
    }

    return transformToTrendDecision(data);
  } catch (error) {
    console.error(`[TrendService] Error fetching trend for ${ticker}:`, error);
    return null;
  }
}

/**
 * Get latest trend for multiple tickers at once
 */
export async function getLatestTrendBatch(tickers: string[]): Promise<Map<string, MTFTrendForDecision>> {
  const results = new Map<string, MTFTrendForDecision>();
  
  if (tickers.length === 0) {
    return results;
  }

  try {
    const supabase = createSupabaseClient();
    
    // Get latest trend signals for each ticker
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('source', 'mtf_trend_dots')
      .in('underlying', tickers.map(t => t.toUpperCase()))
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.warn('[TrendService] Error fetching batch trends:', error);
      return results;
    }

    // Group by ticker and take latest
    const latestByTicker = new Map<string, typeof data[0]>();
    for (const record of data) {
      if (record.underlying && !latestByTicker.has(record.underlying)) {
        latestByTicker.set(record.underlying, record);
      }
    }

    for (const [ticker, record] of latestByTicker) {
      const trend = transformToTrendDecision(record);
      if (trend) {
        results.set(ticker, trend);
      }
    }
  } catch (error) {
    console.error('[TrendService] Error in batch fetch:', error);
  }

  return results;
}

/**
 * Transform signal record to trend decision format
 */
function transformToTrendDecision(record: Record<string, unknown>): MTFTrendForDecision | null {
  try {
    const createdAt = new Date(record.created_at as string);
    const isStale = Date.now() - createdAt.getTime() > TREND_STALE_THRESHOLD_MS;
    
    // Extract metadata from raw_payload
    const payload = record.raw_payload as Record<string, unknown> || {};
    const metadata = payload.metadata as Record<string, unknown> || {};
    const timeframes = metadata.timeframes as Record<string, string> || {};
    
    // Calculate bias and counts from timeframes
    let bullishCount = 0;
    let bearishCount = 0;
    
    const defaultTimeframes = {
      '3m': 'neutral' as const,
      '5m': 'neutral' as const,
      '15m': 'neutral' as const,
      '30m': 'neutral' as const,
      '1h': 'neutral' as const,
      '4h': 'neutral' as const,
      '1w': 'neutral' as const,
      '1M': 'neutral' as const,
    };
    
    const normalizedTimeframes: MTFTrendForDecision['timeframes'] = { ...defaultTimeframes };
    
    for (const [tf, bias] of Object.entries(timeframes)) {
      const normalizedBias = String(bias).toLowerCase() as 'bullish' | 'bearish' | 'neutral';
      if (normalizedBias === 'bullish') bullishCount++;
      if (normalizedBias === 'bearish') bearishCount++;
      
      // Map timeframe keys
      const tfKey = tf as keyof typeof normalizedTimeframes;
      if (tfKey in normalizedTimeframes) {
        normalizedTimeframes[tfKey] = normalizedBias;
      }
    }
    
    // Determine overall bias
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (bullishCount >= 5) bias = 'BULLISH';
    else if (bearishCount >= 5) bias = 'BEARISH';
    else if (bullishCount > bearishCount + 2) bias = 'BULLISH';
    else if (bearishCount > bullishCount + 2) bias = 'BEARISH';
    
    // Calculate alignment score
    const totalTimeframes = 8;
    const dominantCount = Math.max(bullishCount, bearishCount);
    const alignmentScore = Math.round((dominantCount / totalTimeframes) * 100);

    return {
      ticker: (record.underlying as string) || '',
      updatedAt: createdAt,
      isStale,
      bias,
      alignmentScore,
      bullishCount,
      bearishCount,
      timeframes: normalizedTimeframes,
    };
  } catch (error) {
    console.error('[TrendService] Error transforming trend:', error);
    return null;
  }
}

/**
 * Check if trend data is stale
 */
export function isTrendStale(trend: MTFTrendForDecision): boolean {
  const ageMs = Date.now() - trend.updatedAt.getTime();
  return ageMs > TREND_STALE_THRESHOLD_MS;
}
