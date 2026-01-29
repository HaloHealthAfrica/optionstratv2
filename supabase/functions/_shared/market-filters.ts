/**
 * Market Data Filters - Enhanced Signal Validation
 * 
 * Uses TwelveData, Marketdata.app, and Tradier for:
 * - IV rank filtering
 * - Volume confirmation
 * - VIX thresholds
 * - Liquidity checks
 * - Real-time market schedule from TechnicalAnalysisService
 */

import { getMarketDataService, getTechnicalAnalysisService, type OptionsQuote, type StockQuote, type MarketScheduleInfo } from "./market-data/index.ts";

export interface MarketFilterConfig {
  // VIX thresholds
  maxVix: number;           // Don't trade above this VIX level
  minVix: number;           // Don't trade below this VIX level (no volatility)
  
  // IV filtering
  maxIvRank: number;        // Max IV rank for entries (avoid IV crush)
  minIvRank: number;        // Min IV rank (need some premium)
  maxIvPercentile: number;  // Alternative to IV rank
  
  // Volume/Liquidity
  minUnderlyingVolume: number;  // Minimum underlying daily volume
  minOptionOI: number;          // Minimum option open interest
  minOptionVolume: number;      // Minimum option volume
  maxBidAskSpreadPct: number;   // Maximum spread as % of mid price
  
  // Price action
  minDailyRange: number;        // Minimum daily range % (avoid dead stocks)
  maxDailyRange: number;        // Maximum daily range % (avoid news events)
  
  // Time filters (in minutes since market open)
  avoidOpeningMinutes: number;  // Skip first N minutes
  avoidClosingMinutes: number;  // Skip last N minutes
}

export const DEFAULT_MARKET_FILTER_CONFIG: MarketFilterConfig = {
  maxVix: 35,
  minVix: 12,
  maxIvRank: 80,
  minIvRank: 20,
  maxIvPercentile: 85,
  minUnderlyingVolume: 500000,
  minOptionOI: 100,
  minOptionVolume: 50,
  maxBidAskSpreadPct: 10,
  minDailyRange: 0.3,
  maxDailyRange: 5.0,
  avoidOpeningMinutes: 15,
  avoidClosingMinutes: 10,
};

export interface MarketFilterResult {
  approved: boolean;
  reason: string;
  filters: {
    vix: { passed: boolean; value: number | null; threshold: string };
    iv: { passed: boolean; value: number | null; threshold: string };
    volume: { passed: boolean; value: number | null; threshold: string };
    liquidity: { passed: boolean; spread: number | null; oi: number | null };
    priceAction: { passed: boolean; range: number | null };
    timing: { passed: boolean; minutesSinceOpen: number };
  };
  warnings: string[];
  recommendations: string[];
  marketData?: {
    vix: number | null;
    underlyingPrice: number | null;
    optionBid: number | null;
    optionAsk: number | null;
    iv: number | null;
    openInterest: number | null;
  };
}

/**
 * Get current VIX level
 */
async function getVixLevel(): Promise<number | null> {
  try {
    const marketData = getMarketDataService();
    const result = await marketData.getStockQuote('VIX');
    return result.success && result.data ? result.data.price : null;
  } catch (error) {
    console.error('Failed to fetch VIX:', error);
    return null;
  }
}

// Cached market schedule to avoid repeated API calls
let cachedSchedule: { data: MarketScheduleInfo; expiry: number } | null = null;
const SCHEDULE_CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Get current market schedule from TechnicalAnalysisService
 * Uses caching to minimize API calls
 */
async function getMarketScheduleAsync(): Promise<{
  minutesSinceOpen: number;
  minutesToClose: number;
  isOpen: boolean;
  session: 'PRE_MARKET' | 'REGULAR' | 'AFTER_HOURS' | 'CLOSED';
}> {
  // Check cache
  if (cachedSchedule && cachedSchedule.expiry > Date.now()) {
    const schedule = cachedSchedule.data;
    return {
      minutesSinceOpen: schedule.minutesToClose ? 390 - schedule.minutesToClose : 0,
      minutesToClose: schedule.minutesToClose ?? 0,
      isOpen: schedule.isOpen,
      session: schedule.session,
    };
  }
  
  try {
    const techService = getTechnicalAnalysisService();
    const schedule = await techService.getMarketSchedule();
    
    // Cache the result
    cachedSchedule = { data: schedule, expiry: Date.now() + SCHEDULE_CACHE_TTL };
    
    return {
      minutesSinceOpen: schedule.minutesToClose ? 390 - schedule.minutesToClose : 0,
      minutesToClose: schedule.minutesToClose ?? 0,
      isOpen: schedule.isOpen,
      session: schedule.session,
    };
  } catch (error) {
    console.warn('Failed to get market schedule, using fallback:', error);
    return getFallbackSchedule();
  }
}

/**
 * Synchronous fallback for when async schedule fetch isn't available
 */
function getFallbackSchedule(): {
  minutesSinceOpen: number;
  minutesToClose: number;
  isOpen: boolean;
  session: 'PRE_MARKET' | 'REGULAR' | 'AFTER_HOURS' | 'CLOSED';
} {
  const now = new Date();
  const estOffset = -5;
  const utcHour = now.getUTCHours();
  const estHour = (utcHour + estOffset + 24) % 24;
  const estMinutes = now.getUTCMinutes();
  const currentMinutes = estHour * 60 + estMinutes;
  
  const marketOpenMinutes = 9 * 60 + 30;
  const marketCloseMinutes = 16 * 60;
  
  const minutesSinceOpen = currentMinutes - marketOpenMinutes;
  const minutesToClose = marketCloseMinutes - currentMinutes;
  const isOpen = minutesSinceOpen >= 0 && minutesToClose > 0;
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
  
  return { minutesSinceOpen, minutesToClose, isOpen: isOpen && !isWeekend, session };
}

/**
 * Legacy sync function - uses cached schedule or fallback
 */
function getMinutesSinceMarketOpen(): number {
  if (cachedSchedule && cachedSchedule.expiry > Date.now()) {
    return cachedSchedule.data.minutesToClose ? 390 - cachedSchedule.data.minutesToClose : 0;
  }
  return getFallbackSchedule().minutesSinceOpen;
}

/**
 * Legacy sync function - uses cached schedule or fallback
 */
function getMinutesUntilMarketClose(): number {
  if (cachedSchedule && cachedSchedule.expiry > Date.now()) {
    return cachedSchedule.data.minutesToClose ?? 0;
  }
  return getFallbackSchedule().minutesToClose;
}

/**
 * Check if market is currently open
 */
function isMarketOpen(): boolean {
  if (cachedSchedule && cachedSchedule.expiry > Date.now()) {
    return cachedSchedule.data.isOpen;
  }
  return getFallbackSchedule().isOpen;
}

/**
 * Calculate daily range percentage
 */
function calculateDailyRangePct(quote: StockQuote): number {
  if (!quote.high || !quote.low || !quote.price || quote.price === 0) return 0;
  return ((quote.high - quote.low) / quote.price) * 100;
}

/**
 * Calculate bid-ask spread percentage
 */
function calculateSpreadPct(bid: number, ask: number): number {
  if (!bid || !ask) return 100;
  const mid = (bid + ask) / 2;
  if (mid === 0) return 100;
  return ((ask - bid) / mid) * 100;
}

/**
 * Apply market data filters to a potential trade
 */
export async function applyMarketFilters(
  underlying: string,
  optionSymbol: string | null,
  expiration: string | null,
  strike: number | null,
  optionType: 'CALL' | 'PUT' | null,
  config: Partial<MarketFilterConfig> = {}
): Promise<MarketFilterResult> {
  const cfg = { ...DEFAULT_MARKET_FILTER_CONFIG, ...config };
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const marketData = getMarketDataService();
  
  // Get real-time market schedule (updates cache)
  const schedule = await getMarketScheduleAsync();
  
  // Initialize filter results
  const filters: MarketFilterResult['filters'] = {
    vix: { passed: true, value: null, threshold: `${cfg.minVix}-${cfg.maxVix}` },
    iv: { passed: true, value: null, threshold: `${cfg.minIvRank}-${cfg.maxIvRank}%` },
    volume: { passed: true, value: null, threshold: `>${cfg.minUnderlyingVolume}` },
    liquidity: { passed: true, spread: null, oi: null },
    priceAction: { passed: true, range: null },
    timing: { passed: true, minutesSinceOpen: schedule.minutesSinceOpen },
  };
  
  let vixLevel: number | null = null;
  let underlyingPrice: number | null = null;
  let optionBid: number | null = null;
  let optionAsk: number | null = null;
  let iv: number | null = null;
  let openInterest: number | null = null;
  
  try {
    // 1. Timing filter - uses real-time schedule from TechnicalAnalysisService
    filters.timing.minutesSinceOpen = schedule.minutesSinceOpen;
    
    if (!schedule.isOpen) {
      filters.timing.passed = false;
      return {
        approved: false,
        reason: `Market is ${schedule.session.toLowerCase().replace('_', '-')}`,
        filters,
        warnings,
        recommendations: ['Wait for regular trading hours'],
        marketData: { vix: null, underlyingPrice: null, optionBid: null, optionAsk: null, iv: null, openInterest: null },
      };
    }
    
    if (schedule.minutesSinceOpen < cfg.avoidOpeningMinutes) {
      filters.timing.passed = false;
      warnings.push(`Within first ${cfg.avoidOpeningMinutes} minutes of market open`);
      recommendations.push(`Wait ${cfg.avoidOpeningMinutes - schedule.minutesSinceOpen} more minutes`);
    }
    
    if (schedule.minutesToClose < cfg.avoidClosingMinutes) {
      filters.timing.passed = false;
      warnings.push(`Within last ${cfg.avoidClosingMinutes} minutes before market close`);
    }
    
    // 2. VIX filter (parallel fetch)
    const [vixResult, underlyingResult] = await Promise.all([
      getVixLevel(),
      marketData.getStockQuote(underlying),
    ]);
    
    vixLevel = vixResult;
    filters.vix.value = vixLevel;
    
    if (vixLevel !== null) {
      if (vixLevel > cfg.maxVix) {
        filters.vix.passed = false;
        warnings.push(`VIX ${vixLevel.toFixed(1)} exceeds max threshold ${cfg.maxVix}`);
        recommendations.push('Reduce position size or wait for volatility to decrease');
      } else if (vixLevel < cfg.minVix) {
        filters.vix.passed = false;
        warnings.push(`VIX ${vixLevel.toFixed(1)} below min threshold ${cfg.minVix}`);
        recommendations.push('Low volatility environment - consider tighter stops');
      }
    }
    
    // 3. Underlying volume and price action
    if (underlyingResult.success && underlyingResult.data) {
      const quote = underlyingResult.data;
      underlyingPrice = quote.price;
      
      // Volume check
      filters.volume.value = quote.volume || null;
      if (quote.volume && quote.volume < cfg.minUnderlyingVolume) {
        filters.volume.passed = false;
        warnings.push(`Low underlying volume: ${quote.volume.toLocaleString()}`);
      }
      
      // Daily range check
      const rangePct = calculateDailyRangePct(quote);
      filters.priceAction.range = rangePct;
      
      if (rangePct < cfg.minDailyRange) {
        filters.priceAction.passed = false;
        warnings.push(`Low daily range: ${rangePct.toFixed(2)}%`);
        recommendations.push('Stock may lack momentum for options play');
      } else if (rangePct > cfg.maxDailyRange) {
        filters.priceAction.passed = false;
        warnings.push(`Extreme daily range: ${rangePct.toFixed(2)}% - possible news event`);
        recommendations.push('Wait for price stabilization');
      }
    }
    
    // 4. Option-specific filters (if we have option details)
    if (optionType && strike && expiration) {
      const optionResult = await marketData.getOptionQuote(
        underlying,
        expiration,
        strike,
        optionType
      );
      
      if (optionResult.success && optionResult.data) {
        const option = optionResult.data;
        optionBid = option.bid;
        optionAsk = option.ask;
        iv = option.implied_volatility ? option.implied_volatility * 100 : null; // Convert to percentage
        openInterest = option.open_interest;
        
        // IV filter
        filters.iv.value = iv;
        if (iv !== null) {
          if (iv > cfg.maxIvRank) {
            filters.iv.passed = false;
            warnings.push(`IV ${iv.toFixed(1)}% exceeds max ${cfg.maxIvRank}%`);
            recommendations.push('High IV crush risk - consider selling premium instead');
          } else if (iv < cfg.minIvRank) {
            filters.iv.passed = false;
            warnings.push(`IV ${iv.toFixed(1)}% below min ${cfg.minIvRank}%`);
          }
        }
        
        // Liquidity filter
        const spreadPct = calculateSpreadPct(option.bid, option.ask);
        filters.liquidity.spread = spreadPct;
        filters.liquidity.oi = option.open_interest;
        
        if (spreadPct > cfg.maxBidAskSpreadPct) {
          filters.liquidity.passed = false;
          warnings.push(`Wide spread: ${spreadPct.toFixed(1)}%`);
          recommendations.push('Use limit orders at mid-price');
        }
        
        if (option.open_interest && option.open_interest < cfg.minOptionOI) {
          filters.liquidity.passed = false;
          warnings.push(`Low open interest: ${option.open_interest}`);
          recommendations.push('Consider more liquid strike or expiration');
        }
      }
    }
    
    // Determine overall approval
    const failedFilters = Object.entries(filters)
      .filter(([_, f]) => !f.passed)
      .map(([name]) => name);
    
    const approved = failedFilters.length === 0;
    const reason = approved
      ? 'All market filters passed'
      : `Failed filters: ${failedFilters.join(', ')}`;
    
    return {
      approved,
      reason,
      filters,
      warnings,
      recommendations,
      marketData: {
        vix: vixLevel,
        underlyingPrice,
        optionBid,
        optionAsk,
        iv,
        openInterest,
      },
    };
  } catch (error) {
    console.error('Market filter error:', error);
    // Fail open on errors
    return {
      approved: true,
      reason: 'Market filter check failed - proceeding with caution',
      filters,
      warnings: ['Could not verify market conditions'],
      recommendations: ['Use conservative position sizing'],
      marketData: { vix: null, underlyingPrice: null, optionBid: null, optionAsk: null, iv: null, openInterest: null },
    };
  }
}

/**
 * Quick VIX check for circuit breaker
 */
export async function isVixTooHigh(maxVix: number = 35): Promise<boolean> {
  const vix = await getVixLevel();
  return vix !== null && vix > maxVix;
}

/**
 * Get cached market schedule for use by other modules
 * Returns null if no cached schedule is available
 */
export function getCachedMarketSchedule(): MarketScheduleInfo | null {
  if (cachedSchedule && cachedSchedule.expiry > Date.now()) {
    return cachedSchedule.data;
  }
  return null;
}

/**
 * Get current market session
 */
export type MarketSession = 'PRE_MARKET' | 'OPENING' | 'MORNING' | 'MIDDAY' | 'AFTERNOON' | 'POWER_HOUR' | 'CLOSING' | 'AFTER_HOURS';

export function getCurrentMarketSession(): MarketSession {
  const minutesSinceOpen = getMinutesSinceMarketOpen();
  const minutesUntilClose = getMinutesUntilMarketClose();
  
  if (minutesSinceOpen < 0) return 'PRE_MARKET';
  if (minutesUntilClose <= 0) return 'AFTER_HOURS';
  if (minutesSinceOpen < 15) return 'OPENING';
  if (minutesSinceOpen < 90) return 'MORNING';
  if (minutesSinceOpen < 210) return 'MIDDAY';
  if (minutesUntilClose > 60) return 'AFTERNOON';
  if (minutesUntilClose > 10) return 'POWER_HOUR';
  return 'CLOSING';
}
