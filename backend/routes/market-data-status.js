// Market Data Status Endpoint
// Provides information about market data service health and statistics

import express from 'express';
import marketDataService from '../lib/market-data-service.js';

const router = express.Router();

/**
 * GET /market-data-status
 * Get market data service status and statistics
 */
router.get('/', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Get cache statistics
    const cacheStats = marketDataService.getCacheStats();
    
    // Get rate limiter statistics
    const rateLimiterStats = marketDataService.getRateLimiterStats();
    
    // Get market hours
    const marketHours = await marketDataService.getMarketHours();
    
    // Test API connectivity by fetching SPY price
    let apiStatus = 'unknown';
    let testPrice = null;
    try {
      const spyData = await marketDataService.getStockPrice('SPY');
      apiStatus = spyData.provider === 'demo' ? 'fallback' : 'connected';
      testPrice = {
        symbol: spyData.symbol,
        price: spyData.price,
        provider: spyData.provider,
        timestamp: spyData.timestamp
      };
    } catch (error) {
      apiStatus = 'error';
    }
    
    const duration = Date.now() - startTime;
    
    res.json({
      status: 'ok',
      provider: process.env.MARKET_DATA_PROVIDER || 'polygon',
      api_status: apiStatus,
      market_hours: marketHours,
      cache_stats: cacheStats,
      rate_limiter_stats: rateLimiterStats,
      test_price: testPrice,
      api_keys_configured: {
        polygon: !!process.env.POLYGON_API_KEY,
        alphaVantage: !!process.env.ALPHA_VANTAGE_API_KEY
      },
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Market Data Status] Error:', error);
    res.status(500).json({
      error: 'Failed to get market data status',
      message: error.message
    });
  }
});

/**
 * POST /market-data-status/test
 * Test fetching price for a specific symbol
 */
router.post('/test', async (req, res) => {
  try {
    const { symbol } = req.body;
    
    if (!symbol) {
      return res.status(400).json({
        error: 'Missing required field: symbol'
      });
    }
    
    const startTime = Date.now();
    
    const priceData = await marketDataService.getStockPrice(symbol);
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: true,
      symbol: priceData.symbol,
      price: priceData.price,
      open: priceData.open,
      high: priceData.high,
      low: priceData.low,
      volume: priceData.volume,
      provider: priceData.provider,
      timestamp: priceData.timestamp,
      duration_ms: duration
    });
    
  } catch (error) {
    console.error('[Market Data Status] Test error:', error);
    res.status(500).json({
      error: 'Failed to fetch price',
      message: error.message
    });
  }
});

export default router;
