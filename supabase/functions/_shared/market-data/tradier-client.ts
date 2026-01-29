/**
 * Tradier API Client
 * 
 * Provides options chains, quotes, and Greeks from Tradier Brokerage API.
 * Docs: https://documentation.tradier.com/brokerage-api/markets/get-options-chains
 */

import type { OptionsQuote, StockQuote, OptionsChain, MarketDataResult } from "./types.ts";

const TRADIER_BASE_URL = "https://api.tradier.com/v1";
const TRADIER_SANDBOX_URL = "https://sandbox.tradier.com/v1";

interface TradierConfig {
  apiKey: string;
  sandbox?: boolean;
  timeout_ms?: number;
}

interface TradierQuoteResponse {
  quotes: {
    quote: TradierQuote | TradierQuote[];
  };
}

interface TradierQuote {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  volume: number;
  average_volume?: number;
  change: number;
  change_percentage: number;
  high: number;
  low: number;
  open: number;
  prevclose: number;
  trade_date: string;
}

interface TradierOptionsChainResponse {
  options: {
    option: TradierOption[];
  } | null;
}

interface TradierOption {
  symbol: string;
  description: string;
  exch: string;
  type: string; // 'call' or 'put'
  last: number;
  change: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  close: number;
  bid: number;
  ask: number;
  underlying: string;
  strike: number;
  change_percentage: number;
  average_volume: number;
  last_volume: number;
  trade_date: number;
  prevclose: number;
  week_52_high: number;
  week_52_low: number;
  bidsize: number;
  bidexch: string;
  bid_date: number;
  asksize: number;
  askexch: string;
  ask_date: number;
  open_interest: number;
  contract_size: number;
  expiration_date: string;
  expiration_type: string;
  option_type: string;
  root_symbol: string;
  greeks?: TradierGreeks;
}

interface TradierGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  phi: number;
  bid_iv: number;
  mid_iv: number;
  ask_iv: number;
  smv_vol: number;
  updated_at: string;
}

export class TradierClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout_ms: number;

  constructor(config: TradierConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.sandbox ? TRADIER_SANDBOX_URL : TRADIER_BASE_URL;
    this.timeout_ms = config.timeout_ms || 5000;
  }

  private async fetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout_ms);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Tradier API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  async getStockQuote(symbol: string): Promise<MarketDataResult<StockQuote>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<TradierQuoteResponse>('/markets/quotes', {
        symbols: symbol.toUpperCase(),
      });

      const quote = Array.isArray(response.quotes.quote) 
        ? response.quotes.quote[0] 
        : response.quotes.quote;

      if (!quote) {
        return {
          success: false,
          error: `No quote found for ${symbol}`,
          provider: 'tradier',
          latency_ms: Date.now() - startTime,
        };
      }

      return {
        success: true,
        data: {
          symbol: quote.symbol,
          price: quote.last,
          bid: quote.bid,
          ask: quote.ask,
          volume: quote.volume,
          avg_volume: quote.average_volume,
          change: quote.change,
          change_percent: quote.change_percentage,
          high: quote.high,
          low: quote.low,
          open: quote.open,
          prev_close: quote.prevclose,
          quote_time: quote.trade_date,
          provider: 'tradier',
        },
        provider: 'tradier',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'tradier',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  async getOptionsChain(
    symbol: string, 
    expiration: string,
    includeGreeks = true
  ): Promise<MarketDataResult<OptionsChain>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<TradierOptionsChainResponse>('/markets/options/chains', {
        symbol: symbol.toUpperCase(),
        expiration,
        greeks: includeGreeks ? 'true' : 'false',
      });

      if (!response.options?.option || response.options.option.length === 0) {
        return {
          success: false,
          error: `No options found for ${symbol} expiring ${expiration}`,
          provider: 'tradier',
          latency_ms: Date.now() - startTime,
        };
      }

      const options = response.options.option;
      const calls: OptionsQuote[] = [];
      const puts: OptionsQuote[] = [];
      const strikes = new Set<number>();

      // Get underlying price
      const stockQuote = await this.getStockQuote(symbol);
      const underlyingPrice = stockQuote.success ? stockQuote.data!.price : 0;

      for (const opt of options) {
        strikes.add(opt.strike);
        
        const quote: OptionsQuote = {
          symbol: opt.symbol,
          underlying: opt.underlying,
          strike: opt.strike,
          expiration: opt.expiration_date,
          option_type: opt.option_type.toUpperCase() === 'CALL' ? 'CALL' : 'PUT',
          bid: opt.bid || 0,
          ask: opt.ask || 0,
          mid: ((opt.bid || 0) + (opt.ask || 0)) / 2,
          last: opt.last || 0,
          mark: ((opt.bid || 0) + (opt.ask || 0)) / 2,
          volume: opt.volume || 0,
          open_interest: opt.open_interest || 0,
          delta: opt.greeks?.delta || 0,
          gamma: opt.greeks?.gamma || 0,
          theta: opt.greeks?.theta || 0,
          vega: opt.greeks?.vega || 0,
          rho: opt.greeks?.rho || 0,
          implied_volatility: opt.greeks?.mid_iv || 0,
          underlying_price: underlyingPrice,
          quote_time: new Date().toISOString(),
          provider: 'tradier',
        };

        if (opt.option_type.toUpperCase() === 'CALL') {
          calls.push(quote);
        } else {
          puts.push(quote);
        }
      }

      return {
        success: true,
        data: {
          underlying: symbol.toUpperCase(),
          underlying_price: underlyingPrice,
          expirations: [expiration],
          strikes: Array.from(strikes).sort((a, b) => a - b),
          calls,
          puts,
          quote_time: new Date().toISOString(),
          provider: 'tradier',
        },
        provider: 'tradier',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'tradier',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  async getOptionQuote(
    underlying: string,
    expiration: string,
    strike: number,
    optionType: 'CALL' | 'PUT'
  ): Promise<MarketDataResult<OptionsQuote>> {
    const startTime = Date.now();
    
    try {
      const chainResult = await this.getOptionsChain(underlying, expiration, true);
      
      if (!chainResult.success || !chainResult.data) {
        return {
          success: false,
          error: chainResult.error || 'Failed to fetch options chain',
          provider: 'tradier',
          latency_ms: Date.now() - startTime,
        };
      }

      const options = optionType === 'CALL' ? chainResult.data.calls : chainResult.data.puts;
      const option = options.find(o => o.strike === strike);

      if (!option) {
        return {
          success: false,
          error: `Option not found: ${underlying} ${expiration} ${strike} ${optionType}`,
          provider: 'tradier',
          latency_ms: Date.now() - startTime,
        };
      }

      return {
        success: true,
        data: option,
        provider: 'tradier',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'tradier',
        latency_ms: Date.now() - startTime,
      };
    }
  }
}

export function createTradierClient(): TradierClient | null {
  const apiKey = Deno.env.get('TRADIER_API_KEY');
  if (!apiKey) {
    console.warn('TRADIER_API_KEY not configured');
    return null;
  }
  
  // Use sandbox if explicitly set, otherwise production
  const sandbox = Deno.env.get('TRADIER_SANDBOX') === 'true';
  
  return new TradierClient({ apiKey, sandbox });
}
