// Market Data Service
// Centralized service for fetching and caching market data from multiple providers

import cacheService from './cache-service.js';
import rateLimiterManager from './rate-limiter.js';

class MarketDataService {
  constructor() {
    this.provider = process.env.MARKET_DATA_PROVIDER || 'twelvedata';
    this.polygonApiKey = process.env.POLYGON_API_KEY;
    this.alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY;
    this.twelveDataApiKey = process.env.TWELVE_DATA_API_KEY;
    this.marketDataApiKey = process.env.MARKET_DATA_API_KEY;
    this.alpacaApiKey = process.env.ALPACA_API_KEY;
    this.alpacaSecretKey = process.env.ALPACA_SECRET_KEY;
    this.alpacaPaper = process.env.ALPACA_PAPER !== 'false'; // Default to paper trading
    
    // Initialize rate limiters
    // Polygon: 5 requests/second on free tier
    rateLimiterManager.getLimiter('polygon', 5, 5, 1000);
    
    // Alpha Vantage: 5 requests/minute on free tier
    rateLimiterManager.getLimiter('alphaVantage', 5, 5, 60000);
    
    // TwelveData: 8 requests/minute on free tier
    rateLimiterManager.getLimiter('twelvedata', 8, 8, 60000);
    
    // MarketData.app: 100 requests/day on free tier (conservative: 4/hour)
    rateLimiterManager.getLimiter('marketdata', 4, 4, 3600000);
    
    // Alpaca: No strict rate limit, but be reasonable (10/second)
    rateLimiterManager.getLimiter('alpaca', 10, 10, 1000);
    
    console.log(`[Market Data] Initialized with provider: ${this.provider}`);
  }

  /**
   * Get stock price for a single symbol
   */
  async getStockPrice(symbol) {
    const cacheKey = `stock_price:${symbol}`;
    
    // Check cache first
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Fetch from API
    let price;
    try {
      // Try primary provider
      if (this.provider === 'twelvedata' && this.twelveDataApiKey) {
        price = await this.fetchTwelveDataPrice(symbol);
      } else if (this.provider === 'marketdata' && this.marketDataApiKey) {
        price = await this.fetchMarketDataPrice(symbol);
      } else if (this.provider === 'alpaca' && this.alpacaApiKey) {
        price = await this.fetchAlpacaPrice(symbol);
      } else if (this.provider === 'polygon' && this.polygonApiKey) {
        price = await this.fetchPolygonPrice(symbol);
      } else if (this.provider === 'alphaVantage' && this.alphaVantageApiKey) {
        price = await this.fetchAlphaVantagePrice(symbol);
      } else {
        // Fallback to demo data if no API keys configured
        console.warn(`[Market Data] No API keys configured for ${this.provider}, using demo data for ${symbol}`);
        price = this.getDemoPrice(symbol);
      }
      
      // Cache for 30 seconds during market hours
      cacheService.set(cacheKey, price, 30);
      
      return price;
    } catch (error) {
      console.error(`[Market Data] Error fetching price for ${symbol} from ${this.provider}:`, error.message);
      
      // Try backup providers in order
      const backupProviders = [
        { name: 'twelvedata', key: this.twelveDataApiKey, fn: this.fetchTwelveDataPrice.bind(this) },
        { name: 'marketdata', key: this.marketDataApiKey, fn: this.fetchMarketDataPrice.bind(this) },
        { name: 'alpaca', key: this.alpacaApiKey, fn: this.fetchAlpacaPrice.bind(this) },
        { name: 'polygon', key: this.polygonApiKey, fn: this.fetchPolygonPrice.bind(this) },
        { name: 'alphaVantage', key: this.alphaVantageApiKey, fn: this.fetchAlphaVantagePrice.bind(this) }
      ].filter(p => p.name !== this.provider && p.key);
      
      for (const provider of backupProviders) {
        try {
          console.log(`[Market Data] Trying backup provider (${provider.name}) for ${symbol}`);
          price = await provider.fn(symbol);
          cacheService.set(cacheKey, price, 30);
          return price;
        } catch (backupError) {
          console.error(`[Market Data] Backup provider ${provider.name} also failed for ${symbol}:`, backupError.message);
        }
      }
      
      // Return demo data as last resort
      console.warn(`[Market Data] All providers failed, using demo data for ${symbol}`);
      return this.getDemoPrice(symbol);
    }
  }

  /**
   * Get stock prices for multiple symbols (batch)
   */
  async getStockPrices(symbols) {
    const prices = {};
    
    // Fetch prices in parallel
    const results = await Promise.allSettled(
      symbols.map(symbol => this.getStockPrice(symbol))
    );
    
    results.forEach((result, index) => {
      const symbol = symbols[index];
      if (result.status === 'fulfilled') {
        prices[symbol] = result.value;
      } else {
        console.error(`[Market Data] Failed to fetch price for ${symbol}:`, result.reason);
        prices[symbol] = this.getDemoPrice(symbol);
      }
    });
    
    return prices;
  }

  /**
   * Fetch price from Polygon.io
   */
  async fetchPolygonPrice(symbol) {
    await rateLimiterManager.waitForToken('polygon');
    
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${this.polygonApiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      throw new Error(`No data returned from Polygon for ${symbol}`);
    }
    
    const result = data.results[0];
    
    return {
      symbol,
      price: result.c, // Close price
      open: result.o,
      high: result.h,
      low: result.l,
      volume: result.v,
      timestamp: new Date(result.t).toISOString(),
      provider: 'polygon'
    };
  }

  /**
   * Fetch price from Alpha Vantage
   */
  async fetchAlphaVantagePrice(symbol) {
    await rateLimiterManager.waitForToken('alphaVantage');
    
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.alphaVantageApiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data['Global Quote'] || Object.keys(data['Global Quote']).length === 0) {
      throw new Error(`No data returned from Alpha Vantage for ${symbol}`);
    }
    
    const quote = data['Global Quote'];
    
    return {
      symbol,
      price: parseFloat(quote['05. price']),
      open: parseFloat(quote['02. open']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      volume: parseInt(quote['06. volume']),
      timestamp: new Date().toISOString(),
      provider: 'alphaVantage'
    };
  }

  /**
   * Fetch price from TwelveData
   */
  async fetchTwelveDataPrice(symbol) {
    await rateLimiterManager.waitForToken('twelvedata');
    
    const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${this.twelveDataApiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`TwelveData API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'error') {
      throw new Error(`TwelveData error: ${data.message}`);
    }
    
    if (!data.close) {
      throw new Error(`No data returned from TwelveData for ${symbol}`);
    }
    
    return {
      symbol,
      price: parseFloat(data.close),
      open: parseFloat(data.open),
      high: parseFloat(data.high),
      low: parseFloat(data.low),
      volume: parseInt(data.volume),
      timestamp: data.datetime || new Date().toISOString(),
      provider: 'twelvedata'
    };
  }

  /**
   * Fetch price from MarketData.app
   */
  async fetchMarketDataPrice(symbol) {
    await rateLimiterManager.waitForToken('marketdata');
    
    const url = `https://api.marketdata.app/v1/stocks/quotes/${symbol}/`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${this.marketDataApiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`MarketData.app API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.s !== 'ok' || !data.last) {
      throw new Error(`No data returned from MarketData.app for ${symbol}`);
    }
    
    return {
      symbol,
      price: parseFloat(data.last[0]),
      open: parseFloat(data.open[0]),
      high: parseFloat(data.high[0]),
      low: parseFloat(data.low[0]),
      volume: parseInt(data.volume[0]),
      timestamp: new Date(data.updated[0] * 1000).toISOString(),
      provider: 'marketdata'
    };
  }

  /**
   * Fetch price from Alpaca
   */
  async fetchAlpacaPrice(symbol) {
    await rateLimiterManager.waitForToken('alpaca');
    
    const baseUrl = this.alpacaPaper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
    
    const url = `${baseUrl}/v2/stocks/${symbol}/quotes/latest`;
    
    const response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': this.alpacaApiKey,
        'APCA-API-SECRET-KEY': this.alpacaSecretKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`Alpaca API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.quote) {
      throw new Error(`No data returned from Alpaca for ${symbol}`);
    }
    
    const quote = data.quote;
    
    // Use mid-price (bid + ask) / 2
    const price = (quote.ap + quote.bp) / 2;
    
    return {
      symbol,
      price: parseFloat(price.toFixed(2)),
      bid: quote.bp,
      ask: quote.ap,
      bidSize: quote.bs,
      askSize: quote.as,
      timestamp: quote.t,
      provider: 'alpaca'
    };
  }

  /**
   * Get demo price (fallback)
   */
  getDemoPrice(symbol) {
    const demoPrices = {
      'SPY': 502.15,
      'QQQ': 438.20,
      'AAPL': 190.50,
      'TSLA': 245.30,
      'MSFT': 420.80,
      'NVDA': 875.50,
      'AMZN': 178.25,
      'GOOGL': 142.80,
      'META': 485.60,
      'AMD': 165.40
    };
    
    const basePrice = demoPrices[symbol] || 100.00;
    
    // Add small random variation (±0.5%)
    const variation = 1 + (Math.random() * 0.01 - 0.005);
    const price = basePrice * variation;
    
    return {
      symbol,
      price: parseFloat(price.toFixed(2)),
      open: parseFloat((price * 0.995).toFixed(2)),
      high: parseFloat((price * 1.005).toFixed(2)),
      low: parseFloat((price * 0.995).toFixed(2)),
      volume: Math.floor(Math.random() * 10000000),
      timestamp: new Date().toISOString(),
      provider: 'demo'
    };
  }

  /**
   * Check if market is open
   */
  async isMarketOpen() {
    const cacheKey = 'market_status:open';
    
    // Check cache first
    const cached = cacheService.get(cacheKey);
    if (cached !== null) {
      return cached;
    }
    
    // Calculate market hours (9:30 AM - 4:00 PM ET)
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    const day = et.getDay(); // 0 = Sunday, 6 = Saturday
    const hours = et.getHours();
    const minutes = et.getMinutes();
    
    // Check if weekend
    if (day === 0 || day === 6) {
      cacheService.set(cacheKey, false, 300); // Cache for 5 minutes
      return false;
    }
    
    // Check if within market hours (9:30 AM - 4:00 PM)
    const currentMinutes = hours * 60 + minutes;
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM
    
    const isOpen = currentMinutes >= marketOpen && currentMinutes < marketClose;
    
    // Cache for 5 minutes
    cacheService.set(cacheKey, isOpen, 300);
    
    return isOpen;
  }

  /**
   * Get market hours information
   */
  async getMarketHours() {
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    const marketOpen = new Date(et);
    marketOpen.setHours(9, 30, 0, 0);
    
    const marketClose = new Date(et);
    marketClose.setHours(16, 0, 0, 0);
    
    const isOpen = await this.isMarketOpen();
    
    let minutesSinceOpen = 0;
    let minutesUntilClose = 0;
    
    if (isOpen) {
      minutesSinceOpen = Math.floor((et - marketOpen) / 60000);
      minutesUntilClose = Math.floor((marketClose - et) / 60000);
    }
    
    return {
      is_market_open: isOpen,
      market_open: marketOpen.toISOString(),
      market_close: marketClose.toISOString(),
      current_time: et.toISOString(),
      minutes_since_open: minutesSinceOpen,
      minutes_until_close: minutesUntilClose
    };
  }

  /**
   * Get VIX (volatility index)
   */
  async getVIX() {
    const cacheKey = 'vix:current';
    
    // Check cache first
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    try {
      // Fetch VIX from market data provider
      const vixData = await this.getStockPrice('VIX');
      
      const vix = {
        value: vixData.price,
        timestamp: vixData.timestamp,
        provider: vixData.provider
      };
      
      // Cache for 1 minute
      cacheService.set(cacheKey, vix, 60);
      
      return vix;
    } catch (error) {
      console.error('[Market Data] Error fetching VIX:', error.message);
      
      // Return demo VIX
      return {
        value: 14.8,
        timestamp: new Date().toISOString(),
        provider: 'demo'
      };
    }
  }

  /**
   * Get SPY price
   */
  async getSPYPrice() {
    return await this.getStockPrice('SPY');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return cacheService.getStats();
  }

  /**
   * Get rate limiter statistics
   */
  getRateLimiterStats() {
    return rateLimiterManager.getAllStats();
  }
}

// Export singleton instance
export const marketDataService = new MarketDataService();

export default marketDataService;
