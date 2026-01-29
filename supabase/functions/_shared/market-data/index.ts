/**
 * Unified Market Data Service
 * 
 * Aggregates data from multiple providers with fallback support.
 * Primary use: fetch real-time options data for decision engine.
 */

import type { 
  OptionsQuote, 
  StockQuote, 
  MarketDataResult, 
  MarketDataConfig,
  DEFAULT_MARKET_DATA_CONFIG 
} from "./types.ts";
import { createTradierClient, TradierClient } from "./tradier-client.ts";
import { createMarketdataClient, MarketdataClient } from "./marketdata-client.ts";
import { createTwelveDataClient, TwelveDataClient } from "./twelvedata-client.ts";

export interface MarketDataService {
  getOptionQuote(
    underlying: string,
    expiration: string,
    strike: number,
    optionType: 'CALL' | 'PUT'
  ): Promise<MarketDataResult<OptionsQuote>>;
  
  getStockQuote(symbol: string): Promise<MarketDataResult<StockQuote>>;
  
  getUnderlyingPrice(symbol: string): Promise<number | null>;
}

export class UnifiedMarketDataService implements MarketDataService {
  private tradier: TradierClient | null;
  private marketdata: MarketdataClient | null;
  private twelvedata: TwelveDataClient | null;
  private config: MarketDataConfig;

  constructor(config: Partial<MarketDataConfig> = {}) {
    this.config = { 
      preferredProvider: 'marketdata',
      fallbackProviders: ['tradier', 'twelvedata'],
      cacheSeconds: 5,
      timeout_ms: 5000,
      ...config 
    };
    
    this.tradier = createTradierClient();
    this.marketdata = createMarketdataClient();
    this.twelvedata = createTwelveDataClient();
  }

  private getProviderOrder(): ('tradier' | 'marketdata' | 'twelvedata')[] {
    const order = [this.config.preferredProvider, ...this.config.fallbackProviders];
    // Remove duplicates while preserving order
    return [...new Set(order)];
  }

  async getOptionQuote(
    underlying: string,
    expiration: string,
    strike: number,
    optionType: 'CALL' | 'PUT'
  ): Promise<MarketDataResult<OptionsQuote>> {
    const startTime = Date.now();
    const errors: string[] = [];

    for (const provider of this.getProviderOrder()) {
      try {
        let result: MarketDataResult<OptionsQuote>;

        switch (provider) {
          case 'marketdata':
            if (!this.marketdata) {
              errors.push('Marketdata client not configured');
              continue;
            }
            result = await this.marketdata.getOptionQuote(underlying, expiration, strike, optionType);
            break;

          case 'tradier':
            if (!this.tradier) {
              errors.push('Tradier client not configured');
              continue;
            }
            result = await this.tradier.getOptionQuote(underlying, expiration, strike, optionType);
            break;

          case 'twelvedata':
            // TwelveData doesn't support options quotes
            errors.push('TwelveData does not support options quotes');
            continue;

          default:
            continue;
        }

        if (result.success && result.data) {
          console.log(`[MarketData] Option quote fetched from ${provider} in ${result.latency_ms}ms`);
          return result;
        } else {
          errors.push(`${provider}: ${result.error}`);
        }
      } catch (error) {
        errors.push(`${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: false,
      error: `All providers failed: ${errors.join('; ')}`,
      provider: this.config.preferredProvider,
      latency_ms: Date.now() - startTime,
    };
  }

  async getStockQuote(symbol: string): Promise<MarketDataResult<StockQuote>> {
    const startTime = Date.now();
    const errors: string[] = [];

    for (const provider of this.getProviderOrder()) {
      try {
        let result: MarketDataResult<StockQuote>;

        switch (provider) {
          case 'marketdata':
            if (!this.marketdata) {
              errors.push('Marketdata client not configured');
              continue;
            }
            result = await this.marketdata.getStockQuote(symbol);
            break;

          case 'tradier':
            if (!this.tradier) {
              errors.push('Tradier client not configured');
              continue;
            }
            result = await this.tradier.getStockQuote(symbol);
            break;

          case 'twelvedata':
            if (!this.twelvedata) {
              errors.push('TwelveData client not configured');
              continue;
            }
            result = await this.twelvedata.getStockQuote(symbol);
            break;

          default:
            continue;
        }

        if (result.success && result.data) {
          console.log(`[MarketData] Stock quote fetched from ${provider} in ${result.latency_ms}ms`);
          return result;
        } else {
          errors.push(`${provider}: ${result.error}`);
        }
      } catch (error) {
        errors.push(`${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: false,
      error: `All providers failed: ${errors.join('; ')}`,
      provider: this.config.preferredProvider,
      latency_ms: Date.now() - startTime,
    };
  }

  async getUnderlyingPrice(symbol: string): Promise<number | null> {
    const result = await this.getStockQuote(symbol);
    return result.success && result.data ? result.data.price : null;
  }

  /**
   * Check which providers are available
   */
  getAvailableProviders(): string[] {
    const available: string[] = [];
    if (this.tradier) available.push('tradier');
    if (this.marketdata) available.push('marketdata');
    if (this.twelvedata) available.push('twelvedata');
    return available;
  }
}

// Singleton instance
let serviceInstance: UnifiedMarketDataService | null = null;

export function getMarketDataService(config?: Partial<MarketDataConfig>): UnifiedMarketDataService {
  if (!serviceInstance) {
    serviceInstance = new UnifiedMarketDataService(config);
  }
  return serviceInstance;
}

// Re-export types and clients
export * from "./types.ts";
export { createTradierClient } from "./tradier-client.ts";
export { createMarketdataClient } from "./marketdata-client.ts";
export { createTwelveDataClient, type MACDData, type ADXData, type SupertrendData, type MarketStateData, type TechnicalSnapshot } from "./twelvedata-client.ts";

// Market positioning exports
export * from "./positioning-types.ts";
export { getPositioningAnalytics, PositioningAnalytics } from "./positioning-analytics.ts";
export { createUnusualWhalesClient, UnusualWhalesClient } from "./unusual-whales-client.ts";
export { getMarketPositioningService, MarketPositioningService } from "./positioning-service.ts";

// Technical Analysis exports
export { getTechnicalAnalysisService, TechnicalAnalysisService, type TechnicalConfluenceResult, type MarketScheduleInfo } from "./technical-analysis-service.ts";
