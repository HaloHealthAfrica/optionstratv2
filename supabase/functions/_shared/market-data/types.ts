/**
 * Shared types for market data providers
 */

export interface OptionsQuote {
  symbol: string;           // OCC symbol
  underlying: string;
  strike: number;
  expiration: string;
  option_type: 'CALL' | 'PUT';
  
  // Pricing
  bid: number;
  ask: number;
  mid: number;
  last: number;
  mark: number;
  
  // Volume & Interest
  volume: number;
  open_interest: number;
  
  // Greeks
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho?: number;
  
  // Volatility
  implied_volatility: number;
  
  // Underlying data
  underlying_price: number;
  
  // Metadata
  quote_time: string;
  provider: 'tradier' | 'marketdata' | 'twelvedata';
}

export interface StockQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  avg_volume?: number;
  change: number;
  change_percent: number;
  high: number;
  low: number;
  open: number;
  prev_close: number;
  quote_time: string;
  provider: 'tradier' | 'marketdata' | 'twelvedata';
}

export interface OptionsChain {
  underlying: string;
  underlying_price: number;
  expirations: string[];
  strikes: number[];
  calls: OptionsQuote[];
  puts: OptionsQuote[];
  quote_time: string;
  provider: 'tradier' | 'marketdata' | 'twelvedata';
}

export interface MarketDataResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  provider: 'tradier' | 'marketdata' | 'twelvedata';
  latency_ms: number;
}

export interface VolatilityData {
  symbol: string;
  iv_30: number;        // 30-day implied volatility
  iv_60?: number;       // 60-day implied volatility
  hv_30: number;        // 30-day historical volatility
  iv_percentile?: number; // Current IV percentile (0-100)
  iv_rank?: number;     // Current IV rank (0-100)
}

export interface MarketDataConfig {
  preferredProvider: 'tradier' | 'marketdata' | 'twelvedata';
  fallbackProviders: ('tradier' | 'marketdata' | 'twelvedata')[];
  cacheSeconds: number;
  timeout_ms: number;
}

export const DEFAULT_MARKET_DATA_CONFIG: MarketDataConfig = {
  preferredProvider: 'marketdata',
  fallbackProviders: ['tradier', 'twelvedata'],
  cacheSeconds: 5,
  timeout_ms: 5000,
};
