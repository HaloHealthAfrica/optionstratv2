/**
 * Unusual Whales API Client
 * 
 * Provides options flow data including sweeps, blocks, and unusual activity.
 * Docs: https://docs.unusualwhales.com/
 */

import type { OptionsFlowAlert } from "./positioning-types.ts";

const UW_BASE_URL = "https://api.unusualwhales.com/api";

interface UnusualWhalesConfig {
  apiKey: string;
  timeout_ms?: number;
}

interface UWFlowResponse {
  data: UWFlowItem[];
}

interface UWFlowItem {
  id: string;
  ticker: string;
  strike: number;
  expiry: string;  // YYYY-MM-DD format
  type: 'call' | 'put';
  side: 'ask' | 'bid' | 'mid' | 'unknown';
  size: number;
  premium: number;
  price: number;
  volume: number;
  open_interest: number;
  execution_type: 'sweep' | 'block' | 'split' | 'regular';
  exchange: string;
  is_unusual: boolean;
  is_golden_sweep: boolean;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  executed_at: string;  // ISO timestamp
}

export class UnusualWhalesClient {
  private apiKey: string;
  private timeout_ms: number;

  constructor(config: UnusualWhalesConfig) {
    this.apiKey = config.apiKey;
    this.timeout_ms = config.timeout_ms || 10000;
  }

  private async fetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${UW_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout_ms);

    try {
      const response = await this.fetchWithRetry(url.toString(), controller.signal);

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Unusual Whales API error: ${response.status} - ${errorText}`);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  private async fetchWithRetry(
    url: string,
    signal: AbortSignal,
    attempt = 0
  ): Promise<Response> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
      },
      signal,
    });

    if (response.ok || attempt >= 2) {
      return response;
    }

    if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
      const backoffMs = 300 * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return this.fetchWithRetry(url, signal, attempt + 1);
    }

    return response;
  }

  /**
   * Get recent options flow for a specific ticker
   */
  async getFlow(
    ticker: string,
    options: {
      limit?: number;
      minPremium?: number;
      executionType?: 'sweep' | 'block' | 'all';
      sentiment?: 'bullish' | 'bearish' | 'all';
    } = {}
  ): Promise<{ success: boolean; data?: OptionsFlowAlert[]; error?: string }> {
    try {
      const params: Record<string, string> = {
        ticker: ticker.toUpperCase(),
        limit: String(options.limit || 50),
      };

      if (options.minPremium) {
        params.min_premium = String(options.minPremium);
      }
      if (options.executionType && options.executionType !== 'all') {
        params.execution_type = options.executionType;
      }
      if (options.sentiment && options.sentiment !== 'all') {
        params.sentiment = options.sentiment;
      }

      const response = await this.fetch<UWFlowResponse>('/flow', params);
      
      const alerts: OptionsFlowAlert[] = response.data.map(item => this.mapFlowItem(item));

      return { success: true, data: alerts };
    } catch (error) {
      console.error('[UnusualWhales] Flow fetch error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get unusual activity alerts (high volume / OI, sweeps, etc.)
   */
  async getUnusualActivity(
    ticker?: string,
    options: {
      limit?: number;
      minPremium?: number;
    } = {}
  ): Promise<{ success: boolean; data?: OptionsFlowAlert[]; error?: string }> {
    try {
      const params: Record<string, string> = {
        limit: String(options.limit || 25),
        is_unusual: 'true',
      };

      if (ticker) {
        params.ticker = ticker.toUpperCase();
      }
      if (options.minPremium) {
        params.min_premium = String(options.minPremium);
      }

      const response = await this.fetch<UWFlowResponse>('/flow', params);
      
      const alerts: OptionsFlowAlert[] = response.data
        .filter(item => item.is_unusual)
        .map(item => this.mapFlowItem(item));

      return { success: true, data: alerts };
    } catch (error) {
      console.error('[UnusualWhales] Unusual activity fetch error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get golden sweeps (large orders hitting the ask, strong conviction buys)
   */
  async getGoldenSweeps(
    ticker?: string,
    limit: number = 20
  ): Promise<{ success: boolean; data?: OptionsFlowAlert[]; error?: string }> {
    try {
      const params: Record<string, string> = {
        limit: String(limit),
        is_golden_sweep: 'true',
      };

      if (ticker) {
        params.ticker = ticker.toUpperCase();
      }

      const response = await this.fetch<UWFlowResponse>('/flow', params);
      
      const alerts: OptionsFlowAlert[] = response.data
        .filter(item => item.is_golden_sweep)
        .map(item => this.mapFlowItem(item));

      return { success: true, data: alerts };
    } catch (error) {
      console.error('[UnusualWhales] Golden sweeps fetch error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get flow summary for a ticker (aggregated sentiment)
   */
  async getFlowSummary(ticker: string): Promise<{
    success: boolean;
    data?: {
      bullish_premium: number;
      bearish_premium: number;
      net_premium: number;
      bullish_count: number;
      bearish_count: number;
      sweep_count: number;
      overall_sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    };
    error?: string;
  }> {
    try {
      const flowResult = await this.getFlow(ticker, { limit: 100 });
      
      if (!flowResult.success || !flowResult.data) {
        return { success: false, error: flowResult.error };
      }

      const flow = flowResult.data;
      
      let bullishPremium = 0;
      let bearishPremium = 0;
      let bullishCount = 0;
      let bearishCount = 0;
      let sweepCount = 0;

      for (const alert of flow) {
        if (alert.sentiment === 'BULLISH') {
          bullishPremium += alert.premium;
          bullishCount++;
        } else if (alert.sentiment === 'BEARISH') {
          bearishPremium += alert.premium;
          bearishCount++;
        }
        if (alert.execution_type === 'SWEEP') {
          sweepCount++;
        }
      }

      const netPremium = bullishPremium - bearishPremium;
      let overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      
      if (netPremium > 100000) {
        overallSentiment = 'BULLISH';
      } else if (netPremium < -100000) {
        overallSentiment = 'BEARISH';
      }

      return {
        success: true,
        data: {
          bullish_premium: bullishPremium,
          bearish_premium: bearishPremium,
          net_premium: netPremium,
          bullish_count: bullishCount,
          bearish_count: bearishCount,
          sweep_count: sweepCount,
          overall_sentiment: overallSentiment,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private mapFlowItem(item: UWFlowItem): OptionsFlowAlert {
    return {
      id: item.id,
      underlying: item.ticker,
      strike: item.strike,
      expiration: item.expiry,
      option_type: item.type.toUpperCase() as 'CALL' | 'PUT',
      side: this.mapSide(item.side),
      size: item.size,
      premium: item.premium,
      price: item.price,
      execution_type: item.execution_type.toUpperCase() as 'SWEEP' | 'BLOCK' | 'SPLIT' | 'REGULAR',
      exchange: item.exchange,
      sentiment: item.sentiment.toUpperCase() as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
      is_unusual: item.is_unusual,
      is_golden_sweep: item.is_golden_sweep,
      executed_at: item.executed_at,
      source: 'unusual_whales',
    };
  }

  private mapSide(side: string): 'BUY' | 'SELL' | 'UNKNOWN' {
    switch (side.toLowerCase()) {
      case 'ask': return 'BUY';   // Bought at ask = buyer
      case 'bid': return 'SELL';  // Sold at bid = seller
      default: return 'UNKNOWN';
    }
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

/**
 * Factory function to create UnusualWhalesClient
 */
export function createUnusualWhalesClient(): UnusualWhalesClient | null {
  const apiKey = Deno.env.get('UNUSUAL_WHALES_API_KEY');
  if (!apiKey) {
    console.warn('[UnusualWhales] UNUSUAL_WHALES_API_KEY not configured - flow data unavailable');
    return null;
  }
  
  return new UnusualWhalesClient({ apiKey });
}
