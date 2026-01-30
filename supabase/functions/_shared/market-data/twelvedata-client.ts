/**
 * TwelveData API Client
 * 
 * Provides stock quotes and technical indicators.
 * Docs: https://twelvedata.com/docs
 */

import type { StockQuote, MarketDataResult, VolatilityData } from "./types.ts";

const TWELVEDATA_BASE_URL = "https://api.twelvedata.com";

interface TwelveDataConfig {
  apiKey: string;
  timeout_ms?: number;
}

interface TwelveDataQuoteResponse {
  symbol: string;
  name: string;
  exchange: string;
  datetime: string;
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  previous_close: string;
  change: string;
  percent_change: string;
  average_volume: string;
  is_market_open: boolean;
  fifty_two_week?: {
    low: string;
    high: string;
  };
}

interface TwelveDataPriceResponse {
  price: string;
}

interface TwelveDataATRResponse {
  meta: {
    symbol: string;
    interval: string;
    indicator: {
      name: string;
      time_period: number;
    };
  };
  values: Array<{
    datetime: string;
    atr: string;
  }>;
  status: string;
}

interface TwelveDataRSIResponse {
  meta: {
    symbol: string;
    interval: string;
  };
  values: Array<{
    datetime: string;
    rsi: string;
  }>;
  status: string;
}

export class TwelveDataClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout_ms: number;

  constructor(config: TwelveDataConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = TWELVEDATA_BASE_URL;
    this.timeout_ms = config.timeout_ms || 5000;
  }

  private async fetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.append('apikey', this.apiKey);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout_ms);

    try {
      const response = await this.fetchWithRetry(url.toString(), controller.signal);

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`TwelveData API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as T;
      
      // Check for API error in response
      if ((data as Record<string, unknown>).status === 'error') {
        throw new Error((data as Record<string, unknown>).message as string || 'TwelveData API error');
      }

      return data;
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

  async getStockQuote(symbol: string): Promise<MarketDataResult<StockQuote>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<TwelveDataQuoteResponse>('/quote', {
        symbol: symbol.toUpperCase(),
      });

      if (!response.symbol) {
        return {
          success: false,
          error: `No quote found for ${symbol}`,
          provider: 'twelvedata',
          latency_ms: Date.now() - startTime,
        };
      }

      return {
        success: true,
        data: {
          symbol: response.symbol,
          price: parseFloat(response.close),
          bid: parseFloat(response.close), // TwelveData doesn't provide bid/ask
          ask: parseFloat(response.close),
          volume: parseInt(response.volume),
          avg_volume: response.average_volume ? parseInt(response.average_volume) : undefined,
          change: parseFloat(response.change),
          change_percent: parseFloat(response.percent_change),
          high: parseFloat(response.high),
          low: parseFloat(response.low),
          open: parseFloat(response.open),
          prev_close: parseFloat(response.previous_close),
          quote_time: response.datetime,
          provider: 'twelvedata',
        },
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  async getRealTimePrice(symbol: string): Promise<MarketDataResult<number>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<TwelveDataPriceResponse>('/price', {
        symbol: symbol.toUpperCase(),
      });

      if (!response.price) {
        return {
          success: false,
          error: `No price found for ${symbol}`,
          provider: 'twelvedata',
          latency_ms: Date.now() - startTime,
        };
      }

      return {
        success: true,
        data: parseFloat(response.price),
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  async getATR(
    symbol: string,
    interval = '1day',
    timePeriod = 14
  ): Promise<MarketDataResult<number>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<TwelveDataATRResponse>('/atr', {
        symbol: symbol.toUpperCase(),
        interval,
        time_period: timePeriod.toString(),
        outputsize: '1',
      });

      if (!response.values || response.values.length === 0) {
        return {
          success: false,
          error: `No ATR data for ${symbol}`,
          provider: 'twelvedata',
          latency_ms: Date.now() - startTime,
        };
      }

      return {
        success: true,
        data: parseFloat(response.values[0].atr),
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  async getRSI(
    symbol: string,
    interval = '1day',
    timePeriod = 14
  ): Promise<MarketDataResult<number>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<TwelveDataRSIResponse>('/rsi', {
        symbol: symbol.toUpperCase(),
        interval,
        time_period: timePeriod.toString(),
        outputsize: '1',
      });

      if (!response.values || response.values.length === 0) {
        return {
          success: false,
          error: `No RSI data for ${symbol}`,
          provider: 'twelvedata',
          latency_ms: Date.now() - startTime,
        };
      }

      return {
        success: true,
        data: parseFloat(response.values[0].rsi),
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  async getVolatilityData(symbol: string): Promise<MarketDataResult<VolatilityData>> {
    const startTime = Date.now();
    
    try {
      // Fetch ATR for volatility calculation
      const atrResult = await this.getATR(symbol, '1day', 30);
      const quoteResult = await this.getStockQuote(symbol);
      
      if (!atrResult.success || !quoteResult.success) {
        return {
          success: false,
          error: 'Failed to fetch volatility data',
          provider: 'twelvedata',
          latency_ms: Date.now() - startTime,
        };
      }

      const price = quoteResult.data!.price;
      const atr = atrResult.data!;
      
      // Calculate historical volatility from ATR (approximation)
      // HV ≈ ATR / price * sqrt(252) * 100
      const hv30 = (atr / price) * Math.sqrt(252) * 100;

      return {
        success: true,
        data: {
          symbol: symbol.toUpperCase(),
          iv_30: 0, // TwelveData doesn't provide IV
          hv_30: hv30,
        },
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Get MACD (Moving Average Convergence Divergence)
   * Used for momentum confirmation in confluence scoring
   */
  async getMACD(
    symbol: string,
    interval = '1day',
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9
  ): Promise<MarketDataResult<MACDData>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<TwelveDataMACDResponse>('/macd', {
        symbol: symbol.toUpperCase(),
        interval,
        fast_period: fastPeriod.toString(),
        slow_period: slowPeriod.toString(),
        signal_period: signalPeriod.toString(),
        outputsize: '1',
      });

      if (!response.values || response.values.length === 0) {
        return {
          success: false,
          error: `No MACD data for ${symbol}`,
          provider: 'twelvedata',
          latency_ms: Date.now() - startTime,
        };
      }

      const latest = response.values[0];
      const macd = parseFloat(latest.macd);
      const signal = parseFloat(latest.macd_signal);
      const histogram = parseFloat(latest.macd_hist);

      return {
        success: true,
        data: {
          macd,
          signal,
          histogram,
          trend: histogram > 0 ? 'BULLISH' : histogram < 0 ? 'BEARISH' : 'NEUTRAL',
          crossover: Math.abs(macd - signal) < 0.01 ? 'CROSSOVER' : macd > signal ? 'ABOVE' : 'BELOW',
        },
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Get ADX (Average Directional Index)
   * Measures trend strength (>25 = strong trend, <20 = weak/ranging)
   */
  async getADX(
    symbol: string,
    interval = '1day',
    timePeriod = 14
  ): Promise<MarketDataResult<ADXData>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<TwelveDataADXResponse>('/adx', {
        symbol: symbol.toUpperCase(),
        interval,
        time_period: timePeriod.toString(),
        outputsize: '1',
      });

      if (!response.values || response.values.length === 0) {
        return {
          success: false,
          error: `No ADX data for ${symbol}`,
          provider: 'twelvedata',
          latency_ms: Date.now() - startTime,
        };
      }

      const adx = parseFloat(response.values[0].adx);
      
      let strength: 'STRONG' | 'MODERATE' | 'WEAK';
      if (adx >= 25) strength = 'STRONG';
      else if (adx >= 20) strength = 'MODERATE';
      else strength = 'WEAK';

      return {
        success: true,
        data: {
          adx,
          strength,
          trending: adx >= 20,
        },
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Get Supertrend indicator
   * Trend-following indicator combining ATR with price action
   */
  async getSupertrend(
    symbol: string,
    interval = '1day',
    multiplier = 3,
    period = 10
  ): Promise<MarketDataResult<SupertrendData>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<TwelveDataSupertrendResponse>('/supertrend', {
        symbol: symbol.toUpperCase(),
        interval,
        multiplier: multiplier.toString(),
        period: period.toString(),
        outputsize: '1',
      });

      if (!response.values || response.values.length === 0) {
        return {
          success: false,
          error: `No Supertrend data for ${symbol}`,
          provider: 'twelvedata',
          latency_ms: Date.now() - startTime,
        };
      }

      const latest = response.values[0];
      const supertrendValue = parseFloat(latest.supertrend);
      const trend = latest.supertrend_direction === '1' ? 'BULLISH' : 'BEARISH';

      return {
        success: true,
        data: {
          value: supertrendValue,
          trend,
          signal: trend === 'BULLISH' ? 'BUY' : 'SELL',
        },
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Get Market State - Real exchange schedule
   * Replaces hardcoded time filters with actual market hours
   */
  async getMarketState(exchange = 'NYSE'): Promise<MarketDataResult<MarketStateData>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<TwelveDataMarketStateResponse>('/market_state', {
        exchange,
      });

      if (!response.name) {
        return {
          success: false,
          error: `No market state for ${exchange}`,
          provider: 'twelvedata',
          latency_ms: Date.now() - startTime,
        };
      }

      return {
        success: true,
        data: {
          exchange: response.name,
          code: response.code,
          country: response.country,
          isOpen: response.is_market_open,
          timeToOpen: response.time_to_open || null,
          timeToClose: response.time_to_close || null,
          nextOpenDate: response.next_open || null,
          nextCloseDate: response.next_close || null,
          timezone: response.timezone?.name || 'America/New_York',
        },
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Get combined technical analysis snapshot
   * Aggregates MACD, ADX, RSI, and Supertrend for confluence scoring
   */
  async getTechnicalSnapshot(
    symbol: string,
    interval = '1day'
  ): Promise<MarketDataResult<TechnicalSnapshot>> {
    const startTime = Date.now();
    
    try {
      // Fetch all indicators in parallel
      const [macdResult, adxResult, rsiResult, supertrendResult] = await Promise.all([
        this.getMACD(symbol, interval),
        this.getADX(symbol, interval),
        this.getRSI(symbol, interval),
        this.getSupertrend(symbol, interval),
      ]);

      const snapshot: TechnicalSnapshot = {
        symbol: symbol.toUpperCase(),
        interval,
        timestamp: new Date().toISOString(),
        indicators: {
          macd: macdResult.success ? macdResult.data! : null,
          adx: adxResult.success ? adxResult.data! : null,
          rsi: rsiResult.success ? rsiResult.data! : null,
          supertrend: supertrendResult.success ? supertrendResult.data! : null,
        },
        overallBias: 'NEUTRAL',
        confidenceScore: 0,
      };

      // Calculate overall bias and confidence
      let bullishCount = 0;
      let bearishCount = 0;
      let availableIndicators = 0;

      if (snapshot.indicators.macd) {
        availableIndicators++;
        if (snapshot.indicators.macd.trend === 'BULLISH') bullishCount++;
        else if (snapshot.indicators.macd.trend === 'BEARISH') bearishCount++;
      }

      if (snapshot.indicators.supertrend) {
        availableIndicators++;
        if (snapshot.indicators.supertrend.trend === 'BULLISH') bullishCount++;
        else bearishCount++;
      }

      if (snapshot.indicators.rsi) {
        availableIndicators++;
        if (snapshot.indicators.rsi < 30) bullishCount++; // Oversold = bullish reversal
        else if (snapshot.indicators.rsi > 70) bearishCount++; // Overbought = bearish reversal
      }

      // Determine overall bias
      if (bullishCount > bearishCount) {
        snapshot.overallBias = bullishCount >= 3 ? 'STRONGLY_BULLISH' : 'BULLISH';
      } else if (bearishCount > bullishCount) {
        snapshot.overallBias = bearishCount >= 3 ? 'STRONGLY_BEARISH' : 'BEARISH';
      }

      // Calculate confidence (0-100)
      if (availableIndicators > 0) {
        const agreement = Math.max(bullishCount, bearishCount);
        snapshot.confidenceScore = Math.round((agreement / availableIndicators) * 100);
        
        // Boost confidence if ADX shows strong trend
        if (snapshot.indicators.adx?.strength === 'STRONG') {
          snapshot.confidenceScore = Math.min(100, snapshot.confidenceScore + 15);
        }
      }

      return {
        success: true,
        data: snapshot,
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'twelvedata',
        latency_ms: Date.now() - startTime,
      };
    }
  }
}

// ============= Type Definitions for New Indicators =============

export interface MACDData {
  macd: number;
  signal: number;
  histogram: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  crossover: 'CROSSOVER' | 'ABOVE' | 'BELOW';
}

export interface ADXData {
  adx: number;
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  trending: boolean;
}

export interface SupertrendData {
  value: number;
  trend: 'BULLISH' | 'BEARISH';
  signal: 'BUY' | 'SELL';
}

export interface MarketStateData {
  exchange: string;
  code: string;
  country: string;
  isOpen: boolean;
  timeToOpen: string | null;
  timeToClose: string | null;
  nextOpenDate: string | null;
  nextCloseDate: string | null;
  timezone: string;
}

export interface TechnicalSnapshot {
  symbol: string;
  interval: string;
  timestamp: string;
  indicators: {
    macd: MACDData | null;
    adx: ADXData | null;
    rsi: number | null;
    supertrend: SupertrendData | null;
  };
  overallBias: 'STRONGLY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONGLY_BEARISH';
  confidenceScore: number;
}

// API Response Types
interface TwelveDataMACDResponse {
  meta: { symbol: string; interval: string };
  values: Array<{
    datetime: string;
    macd: string;
    macd_signal: string;
    macd_hist: string;
  }>;
  status: string;
}

interface TwelveDataADXResponse {
  meta: { symbol: string; interval: string };
  values: Array<{
    datetime: string;
    adx: string;
  }>;
  status: string;
}

interface TwelveDataSupertrendResponse {
  meta: { symbol: string; interval: string };
  values: Array<{
    datetime: string;
    supertrend: string;
    supertrend_direction: string;
  }>;
  status: string;
}

interface TwelveDataMarketStateResponse {
  name: string;
  code: string;
  country: string;
  is_market_open: boolean;
  time_to_open?: string;
  time_to_close?: string;
  next_open?: string;
  next_close?: string;
  timezone?: {
    name: string;
    abbr: string;
  };
}

export function createTwelveDataClient(): TwelveDataClient | null {
  const apiKey = Deno.env.get('TWELVEDATA_API_KEY');
  if (!apiKey) {
    console.warn('TWELVEDATA_API_KEY not configured');
    return null;
  }
  
  return new TwelveDataClient({ apiKey });
}
