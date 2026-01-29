/**
 * Marketdata.app API Client
 * 
 * Provides options quotes, chains, and Greeks from Marketdata.app.
 * Docs: https://docs.marketdata.app/
 */

import type { OptionsQuote, StockQuote, OptionsChain, MarketDataResult } from "./types.ts";

const MARKETDATA_BASE_URL = "https://api.marketdata.app/v1";

interface MarketdataConfig {
  apiKey: string;
  timeout_ms?: number;
}

interface MarketdataStockQuoteResponse {
  s: string; // status: "ok" or "no_data"
  symbol: string[];
  last: number[];
  bid: number[];
  bidSize: number[];
  ask: number[];
  askSize: number[];
  volume: number[];
  change: number[];
  changepct: number[];
  high: number[];
  low: number[];
  open: number[];
  prevClose: number[];
  updated: number[];
}

interface MarketdataOptionsChainResponse {
  s: string;
  optionSymbol: string[];
  underlying: string[];
  expiration: number[];
  side: string[];
  strike: number[];
  firstTraded: number[];
  dte: number[];
  bid: number[];
  bidSize: number[];
  ask: number[];
  askSize: number[];
  mid: number[];
  last: number[];
  volume: number[];
  openInterest: number[];
  underlyingPrice: number[];
  inTheMoney: boolean[];
  updated: number[];
  iv: number[];
  delta: number[];
  gamma: number[];
  theta: number[];
  vega: number[];
  rho: number[];
}

export class MarketdataClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout_ms: number;

  constructor(config: MarketdataConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = MARKETDATA_BASE_URL;
    // Increased timeout for chain requests (larger payloads)
    this.timeout_ms = config.timeout_ms || 15000;
  }

  private async fetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout_ms);

    // Check if custom proxy is configured for static IP routing
    const customProxyUrl = Deno.env.get('MARKETDATA_PROXY_URL');

    try {
      // Build the final URL - use custom proxy if configured
      let fetchUrl = url.toString();
      
      if (customProxyUrl) {
        // Route through custom proxy - replace the base URL
        // Custom proxy should forward to https://api.marketdata.app
        const originalPath = url.pathname + url.search;
        fetchUrl = `${customProxyUrl.replace(/\/$/, '')}${originalPath}`;
        console.log(`[Marketdata] Proxy base: ${customProxyUrl}`);
        console.log(`[Marketdata] Full request URL: ${fetchUrl}`);
        console.log(`[Marketdata] Authorization header: Token ${this.apiKey.slice(0, 8)}...`);
      } else {
        console.log(`[Marketdata] Direct API call: ${fetchUrl}`);
      }

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Marketdata API error: ${response.status} ${response.statusText}`);
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
      const response = await this.fetch<MarketdataStockQuoteResponse>(
        `/stocks/quotes/${symbol.toUpperCase()}/`
      );

      console.log(`[Marketdata] Stock quote response status: ${response.s}, keys: ${Object.keys(response).join(', ')}`);

      if (response.s !== 'ok') {
        return {
          success: false,
          error: `No quote found for ${symbol} (status: ${response.s})`,
          provider: 'marketdata',
          latency_ms: Date.now() - startTime,
        };
      }

      // Safely access array data with fallbacks
      const hasData = response.symbol && response.symbol.length > 0;
      if (!hasData) {
        return {
          success: false,
          error: `Empty quote data for ${symbol}`,
          provider: 'marketdata',
          latency_ms: Date.now() - startTime,
        };
      }

      return {
        success: true,
        data: {
          symbol: response.symbol?.[0] || symbol.toUpperCase(),
          price: response.last?.[0] ?? 0,
          bid: response.bid?.[0] ?? 0,
          ask: response.ask?.[0] ?? 0,
          volume: response.volume?.[0] ?? 0,
          change: response.change?.[0] ?? 0,
          change_percent: response.changepct?.[0] ?? 0,
          high: response.high?.[0] ?? 0,
          low: response.low?.[0] ?? 0,
          open: response.open?.[0] ?? 0,
          prev_close: response.prevClose?.[0] ?? 0,
          quote_time: response.updated?.[0] 
            ? new Date(response.updated[0] * 1000).toISOString() 
            : new Date().toISOString(),
          provider: 'marketdata',
        },
        provider: 'marketdata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`[Marketdata] getStockQuote error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'marketdata',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  async getOptionsChain(
    symbol: string,
    expiration: string
  ): Promise<MarketDataResult<OptionsChain>> {
    const startTime = Date.now();
    
    try {
      const response = await this.fetch<MarketdataOptionsChainResponse>(
        `/options/chain/${symbol.toUpperCase()}/`,
        { expiration }
      );

      // Log response structure for debugging
      console.log(`[Marketdata] Chain response status: ${response.s}, keys: ${Object.keys(response).join(', ')}`);
      
      if (response.s !== 'ok' || !response.optionSymbol || response.optionSymbol.length === 0) {
        return {
          success: false,
          error: `No options found for ${symbol} expiring ${expiration} (status: ${response.s})`,
          provider: 'marketdata',
          latency_ms: Date.now() - startTime,
        };
      }

      // Validate all required arrays exist
      if (!response.strike || !response.side || !response.underlying) {
        return {
          success: false,
          error: `Incomplete response from Marketdata: missing strike/side/underlying arrays`,
          provider: 'marketdata',
          latency_ms: Date.now() - startTime,
        };
      }

      const calls: OptionsQuote[] = [];
      const puts: OptionsQuote[] = [];
      const strikes = new Set<number>();
      const underlyingPrice = response.underlyingPrice?.[0] || 0;

      console.log(`[Marketdata] Processing ${response.optionSymbol.length} options, underlying price: ${underlyingPrice}`);

      for (let i = 0; i < response.optionSymbol.length; i++) {
        const strike = response.strike[i];
        if (strike === undefined) continue;
        
        strikes.add(strike);
        
        const sideValue = response.side?.[i] || '';
        const optionType = sideValue.toUpperCase() === 'CALL' ? 'CALL' : 'PUT';
        
        const quote: OptionsQuote = {
          symbol: response.optionSymbol[i],
          underlying: response.underlying?.[i] || symbol.toUpperCase(),
          strike: strike,
          expiration: response.expiration?.[i] 
            ? new Date(response.expiration[i] * 1000).toISOString().split('T')[0] 
            : expiration,
          option_type: optionType,
          bid: response.bid?.[i] || 0,
          ask: response.ask?.[i] || 0,
          mid: response.mid?.[i] || 0,
          last: response.last?.[i] || 0,
          mark: response.mid?.[i] || 0,
          volume: response.volume?.[i] || 0,
          open_interest: response.openInterest?.[i] || 0,
          delta: response.delta?.[i] || 0,
          gamma: response.gamma?.[i] || 0,
          theta: response.theta?.[i] || 0,
          vega: response.vega?.[i] || 0,
          rho: response.rho?.[i] || 0,
          implied_volatility: response.iv?.[i] || 0,
          underlying_price: underlyingPrice,
          quote_time: response.updated?.[i] 
            ? new Date(response.updated[i] * 1000).toISOString() 
            : new Date().toISOString(),
          provider: 'marketdata',
        };

        if (optionType === 'CALL') {
          calls.push(quote);
        } else {
          puts.push(quote);
        }
      }

      console.log(`[Marketdata] Chain parsed: ${calls.length} calls, ${puts.length} puts, ${strikes.size} strikes`);

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
          provider: 'marketdata',
        },
        provider: 'marketdata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`[Marketdata] getOptionsChain error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'marketdata',
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
      // Marketdata.app uses OCC symbol format WITHOUT spaces
      // Build the OCC symbol: AAPL271217C00250000 (no spaces, no padding)
      const expDate = expiration.replace(/-/g, '').slice(2); // YYMMDD
      const strikeStr = (strike * 1000).toString().padStart(8, '0');
      const optType = optionType === 'CALL' ? 'C' : 'P';
      // Note: Marketdata.app expects no spaces in the symbol
      const occSymbol = `${underlying.toUpperCase()}${expDate}${optType}${strikeStr}`;
      
      console.log(`[Marketdata] Fetching option quote for OCC symbol: ${occSymbol}`);

      const response = await this.fetch<MarketdataOptionsChainResponse>(
        `/options/quotes/${occSymbol}/`
      );

      console.log(`[Marketdata] Quote response status: ${response.s}, symbol: ${response.optionSymbol?.[0] || 'N/A'}`);

      if (response.s !== 'ok' || !response.optionSymbol || response.optionSymbol.length === 0) {
        // Fallback to chain lookup
        console.log(`[Marketdata] Direct quote failed, falling back to chain lookup`);
        const chainResult = await this.getOptionsChain(underlying, expiration);
        
        if (!chainResult.success || !chainResult.data) {
          return {
            success: false,
            error: `Option not found: ${underlying} ${expiration} ${strike} ${optionType}`,
            provider: 'marketdata',
            latency_ms: Date.now() - startTime,
          };
        }

        const options = optionType === 'CALL' ? chainResult.data.calls : chainResult.data.puts;
        const option = options.find(o => o.strike === strike);

        if (!option) {
          return {
            success: false,
            error: `Option not found: ${underlying} ${expiration} ${strike} ${optionType}`,
            provider: 'marketdata',
            latency_ms: Date.now() - startTime,
          };
        }

        return {
          success: true,
          data: option,
          provider: 'marketdata',
          latency_ms: Date.now() - startTime,
        };
      }

      const i = 0;
      // Note: Options quotes endpoint may not have all fields - use optional chaining
      return {
        success: true,
        data: {
          symbol: response.optionSymbol[i],
          underlying: response.underlying?.[i] || underlying.toUpperCase(),
          strike: response.strike?.[i] || strike,
          expiration: response.expiration?.[i] 
            ? new Date(response.expiration[i] * 1000).toISOString().split('T')[0] 
            : expiration,
          option_type: response.side?.[i]?.toUpperCase() === 'CALL' ? 'CALL' : optionType,
          bid: response.bid?.[i] ?? 0,
          ask: response.ask?.[i] ?? 0,
          mid: response.mid?.[i] ?? 0,
          last: response.last?.[i] ?? 0,
          mark: response.mid?.[i] ?? 0,
          volume: response.volume?.[i] ?? 0,
          open_interest: response.openInterest?.[i] ?? 0,
          delta: response.delta?.[i] ?? 0,
          gamma: response.gamma?.[i] ?? 0,
          theta: response.theta?.[i] ?? 0,
          vega: response.vega?.[i] ?? 0,
          rho: response.rho?.[i] ?? 0,
          implied_volatility: response.iv?.[i] ?? 0,
          underlying_price: response.underlyingPrice?.[i] ?? 0,
          quote_time: response.updated?.[i] 
            ? new Date(response.updated[i] * 1000).toISOString() 
            : new Date().toISOString(),
          provider: 'marketdata',
        },
        provider: 'marketdata',
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'marketdata',
        latency_ms: Date.now() - startTime,
      };
    }
  }
}

export function createMarketdataClient(): MarketdataClient | null {
  const apiKey = Deno.env.get('MARKETDATA_API_KEY');
  if (!apiKey) {
    console.warn('MARKETDATA_API_KEY not configured');
    return null;
  }
  
  return new MarketdataClient({ apiKey });
}
