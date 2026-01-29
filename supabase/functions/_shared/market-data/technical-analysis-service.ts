/**
 * Technical Analysis Service
 * 
 * Provides enhanced technical indicator analysis using TwelveData
 * for confluence scoring and signal validation.
 */

import { createTwelveDataClient, TwelveDataClient, type MACDData, type ADXData, type SupertrendData, type TechnicalSnapshot, type MarketStateData } from "./twelvedata-client.ts";

export interface TechnicalConfluenceResult {
  symbol: string;
  timeframe: string;
  
  // Individual indicators
  macd: MACDData | null;
  adx: ADXData | null;
  supertrend: SupertrendData | null;
  rsi: number | null;
  
  // Derived analysis
  trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'UNKNOWN';
  momentumBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  
  // Confluence scoring
  agreementScore: number;     // 0-100: how much indicators agree
  confluenceBoost: number;    // 0.0-0.5: position size boost factor
  
  // Warnings
  warnings: string[];
  recommendations: string[];
}

export interface MarketScheduleInfo {
  isOpen: boolean;
  session: 'PRE_MARKET' | 'REGULAR' | 'AFTER_HOURS' | 'CLOSED';
  minutesToOpen: number | null;
  minutesToClose: number | null;
  nextOpen: string | null;
  timezone: string;
}

/**
 * Technical Analysis Service
 * Combines multiple TwelveData indicators for enhanced signal validation
 */
export class TechnicalAnalysisService {
  private client: TwelveDataClient | null;
  private cache: Map<string, { data: TechnicalSnapshot; expiry: number }> = new Map();
  private cacheTTL = 60 * 1000; // 1 minute cache
  
  constructor() {
    this.client = createTwelveDataClient();
  }
  
  /**
   * Check if the service is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }
  
  /**
   * Get technical confluence analysis for a symbol
   * Used by the confluence engine to boost/reduce signal confidence
   */
  async getConfluenceAnalysis(
    symbol: string,
    timeframe: '1min' | '5min' | '15min' | '1h' | '1day' = '1day'
  ): Promise<TechnicalConfluenceResult> {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    if (!this.client) {
      return this.createEmptyResult(symbol, timeframe, ['TwelveData API not configured']);
    }
    
    // Check cache first
    const cacheKey = `${symbol}-${timeframe}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return this.processSnapshot(cached.data, symbol, timeframe);
    }
    
    try {
      const result = await this.client.getTechnicalSnapshot(symbol, timeframe);
      
      if (!result.success || !result.data) {
        return this.createEmptyResult(symbol, timeframe, [result.error || 'Failed to fetch technical data']);
      }
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: result.data,
        expiry: Date.now() + this.cacheTTL,
      });
      
      return this.processSnapshot(result.data, symbol, timeframe);
    } catch (error) {
      return this.createEmptyResult(symbol, timeframe, [error instanceof Error ? error.message : 'Unknown error']);
    }
  }
  
  /**
   * Process a technical snapshot into confluence result
   */
  private processSnapshot(
    snapshot: TechnicalSnapshot,
    symbol: string,
    timeframe: string
  ): TechnicalConfluenceResult {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // Determine trend strength from ADX
    let trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'UNKNOWN' = 'UNKNOWN';
    if (snapshot.indicators.adx) {
      trendStrength = snapshot.indicators.adx.strength;
      
      if (trendStrength === 'WEAK') {
        warnings.push('Market is ranging - trend signals less reliable');
        recommendations.push('Consider tighter stops or smaller position sizes');
      }
    }
    
    // Determine momentum bias from MACD
    let momentumBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (snapshot.indicators.macd) {
      momentumBias = snapshot.indicators.macd.trend;
      
      if (snapshot.indicators.macd.crossover === 'CROSSOVER') {
        recommendations.push('MACD crossover detected - potential trend change');
      }
    }
    
    // Determine trend bias from Supertrend
    let trendBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (snapshot.indicators.supertrend) {
      trendBias = snapshot.indicators.supertrend.trend;
    }
    
    // RSI warnings
    if (snapshot.indicators.rsi !== null) {
      if (snapshot.indicators.rsi > 70) {
        warnings.push(`RSI ${snapshot.indicators.rsi.toFixed(1)} - Overbought conditions`);
        recommendations.push('Be cautious with long entries');
      } else if (snapshot.indicators.rsi < 30) {
        warnings.push(`RSI ${snapshot.indicators.rsi.toFixed(1)} - Oversold conditions`);
        recommendations.push('Be cautious with short entries');
      }
    }
    
    // Calculate agreement score
    const biases = [momentumBias, trendBias];
    const bullishCount = biases.filter(b => b === 'BULLISH').length;
    const bearishCount = biases.filter(b => b === 'BEARISH').length;
    const agreement = Math.max(bullishCount, bearishCount);
    const agreementScore = biases.length > 0 ? Math.round((agreement / biases.length) * 100) : 0;
    
    // Calculate confluence boost (0.0 - 0.5)
    let confluenceBoost = 0;
    
    // Boost for indicator agreement
    if (agreementScore >= 100) {
      confluenceBoost += 0.20;
    } else if (agreementScore >= 50) {
      confluenceBoost += 0.10;
    }
    
    // Boost for strong trend
    if (trendStrength === 'STRONG') {
      confluenceBoost += 0.15;
    } else if (trendStrength === 'MODERATE') {
      confluenceBoost += 0.05;
    }
    
    // Reduce for conflicting signals
    if (momentumBias !== 'NEUTRAL' && trendBias !== 'NEUTRAL' && momentumBias !== trendBias) {
      confluenceBoost *= 0.5;
      warnings.push('MACD and Supertrend conflict - mixed signals');
    }
    
    return {
      symbol,
      timeframe,
      macd: snapshot.indicators.macd,
      adx: snapshot.indicators.adx,
      supertrend: snapshot.indicators.supertrend,
      rsi: snapshot.indicators.rsi,
      trendStrength,
      momentumBias,
      trendBias,
      agreementScore,
      confluenceBoost: Math.min(0.5, confluenceBoost),
      warnings,
      recommendations,
    };
  }
  
  /**
   * Create empty result for error cases
   */
  private createEmptyResult(
    symbol: string,
    timeframe: string,
    errors: string[]
  ): TechnicalConfluenceResult {
    return {
      symbol,
      timeframe,
      macd: null,
      adx: null,
      supertrend: null,
      rsi: null,
      trendStrength: 'UNKNOWN',
      momentumBias: 'NEUTRAL',
      trendBias: 'NEUTRAL',
      agreementScore: 0,
      confluenceBoost: 0,
      warnings: errors,
      recommendations: [],
    };
  }
  
  /**
   * Get real market schedule from TwelveData
   * Replaces hardcoded time calculations
   */
  async getMarketSchedule(exchange = 'NYSE'): Promise<MarketScheduleInfo> {
    if (!this.client) {
      return this.getFallbackSchedule();
    }
    
    try {
      const result = await this.client.getMarketState(exchange);
      
      if (!result.success || !result.data) {
        console.warn(`Market state fetch failed: ${result.error}`);
        return this.getFallbackSchedule();
      }
      
      const state = result.data;
      
      // Parse time strings to minutes
      const minutesToOpen = state.timeToOpen ? this.parseTimeString(state.timeToOpen) : null;
      const minutesToClose = state.timeToClose ? this.parseTimeString(state.timeToClose) : null;
      
      // Determine session
      let session: 'PRE_MARKET' | 'REGULAR' | 'AFTER_HOURS' | 'CLOSED';
      if (state.isOpen) {
        session = 'REGULAR';
      } else if (minutesToOpen !== null && minutesToOpen <= 330) {
        // Within 5.5 hours before open = pre-market
        session = 'PRE_MARKET';
      } else if (minutesToOpen !== null && minutesToOpen > 0 && minutesToOpen <= 240) {
        // Within 4 hours after close = after hours
        session = 'AFTER_HOURS';
      } else {
        session = 'CLOSED';
      }
      
      return {
        isOpen: state.isOpen,
        session,
        minutesToOpen,
        minutesToClose,
        nextOpen: state.nextOpenDate,
        timezone: state.timezone,
      };
    } catch (error) {
      console.error('Market schedule error:', error);
      return this.getFallbackSchedule();
    }
  }
  
  /**
   * Parse time string like "01:30:00" to minutes
   */
  private parseTimeString(timeStr: string): number | null {
    const match = timeStr.match(/^(\d+):(\d+):(\d+)$/);
    if (!match) return null;
    
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }
  
  /**
   * Fallback schedule when API is unavailable
   */
  private getFallbackSchedule(): MarketScheduleInfo {
    const now = new Date();
    const estOffset = -5;
    const utcHour = now.getUTCHours();
    const estHour = (utcHour + estOffset + 24) % 24;
    const estMinutes = now.getUTCMinutes();
    const currentMinutes = estHour * 60 + estMinutes;
    
    const marketOpenMinutes = 9 * 60 + 30; // 9:30 AM
    const marketCloseMinutes = 16 * 60;    // 4:00 PM
    
    const isOpen = currentMinutes >= marketOpenMinutes && currentMinutes < marketCloseMinutes;
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    let session: 'PRE_MARKET' | 'REGULAR' | 'AFTER_HOURS' | 'CLOSED';
    if (isWeekend) {
      session = 'CLOSED';
    } else if (isOpen) {
      session = 'REGULAR';
    } else if (currentMinutes >= 4 * 60 && currentMinutes < marketOpenMinutes) {
      session = 'PRE_MARKET';
    } else if (currentMinutes >= marketCloseMinutes && currentMinutes < 20 * 60) {
      session = 'AFTER_HOURS';
    } else {
      session = 'CLOSED';
    }
    
    return {
      isOpen: isOpen && !isWeekend,
      session,
      minutesToOpen: isOpen ? null : Math.max(0, marketOpenMinutes - currentMinutes),
      minutesToClose: isOpen ? marketCloseMinutes - currentMinutes : null,
      nextOpen: null,
      timezone: 'America/New_York',
    };
  }
  
  /**
   * Check if trading should be allowed based on market state
   */
  async shouldAllowTrading(): Promise<{ allowed: boolean; reason: string }> {
    const schedule = await this.getMarketSchedule();
    
    if (schedule.session === 'CLOSED') {
      return { allowed: false, reason: 'Market is closed' };
    }
    
    if (schedule.session === 'PRE_MARKET') {
      return { allowed: false, reason: 'Pre-market session - limited liquidity' };
    }
    
    if (schedule.session === 'AFTER_HOURS') {
      return { allowed: false, reason: 'After-hours session - limited liquidity' };
    }
    
    // Check if we're in the first 15 minutes
    if (schedule.minutesToClose && schedule.minutesToClose > 375) {
      return { allowed: false, reason: 'First 15 minutes - high volatility' };
    }
    
    // Check if we're in the last 10 minutes
    if (schedule.minutesToClose && schedule.minutesToClose < 10) {
      return { allowed: false, reason: 'Last 10 minutes - closing volatility' };
    }
    
    return { allowed: true, reason: 'Market is open for trading' };
  }
}

// Singleton instance
let serviceInstance: TechnicalAnalysisService | null = null;

export function getTechnicalAnalysisService(): TechnicalAnalysisService {
  if (!serviceInstance) {
    serviceInstance = new TechnicalAnalysisService();
  }
  return serviceInstance;
}
