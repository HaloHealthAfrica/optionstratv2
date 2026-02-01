# Phase 1: Real Market Data Integration - Setup Guide

**Status**: Implementation Complete ✅  
**Date**: February 1, 2026

---

## What Was Implemented

### 1. Cache Service (`backend/lib/cache-service.js`)
- In-memory caching with TTL support
- Automatic cleanup of expired entries
- Cache statistics (hit rate, size, etc.)
- Singleton pattern for global access

### 2. Rate Limiter Service (`backend/lib/rate-limiter.js`)
- Token bucket algorithm for rate limiting
- Per-provider rate limiting
- Request queuing when rate limit reached
- Rate limiter statistics

### 3. Market Data Service (`backend/lib/market-data-service.js`)
- Centralized service for fetching market data
- Support for multiple providers (Polygon.io, Alpha Vantage)
- Automatic fallback to backup provider on failure
- Caching with configurable TTL
- Rate limiting per provider
- Market hours detection (NYSE/NASDAQ)
- VIX and SPY price fetching

### 4. Updated Workers
- **Position Refresher**: Now uses real underlying prices
- **Order Creator**: Now uses real stock prices for strike calculation
- **Paper Executor**: Now uses real underlying prices for option pricing
- **Signal Processor**: Now uses real market hours detection

### 5. New Endpoint
- `/market-data-status`: Check market data service health and statistics

---

## Setup Instructions

### Step 1: Get API Keys

#### Option A: Polygon.io (Recommended)
1. Go to https://polygon.io/
2. Sign up for an account
3. Choose a plan:
   - **Free**: 5 API calls/minute (good for testing)
   - **Starter**: $99/month, 5 calls/second (recommended for production)
   - **Developer**: $199/month, unlimited calls
4. Get your API key from the dashboard
5. Copy the API key

#### Option B: Alpha Vantage (Backup/Free Option)
1. Go to https://www.alphavantage.co/
2. Click "Get Your Free API Key Today"
3. Fill out the form
4. Get your API key from email
5. Copy the API key

**Recommendation**: Get both API keys for redundancy. Polygon as primary, Alpha Vantage as backup.

---

### Step 2: Configure Environment Variables

#### Local Development (`.env` file)
Add these lines to `optionstrat-main/.env`:

```bash
# Market Data Provider (polygon or alphaVantage)
MARKET_DATA_PROVIDER=polygon

# Polygon.io API Key
POLYGON_API_KEY=your_polygon_api_key_here

# Alpha Vantage API Key (backup)
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
```

#### Production (Fly.io)
Set secrets on Fly.io:

```bash
# Navigate to project directory
cd optionstrat-main

# Set Polygon API key
flyctl secrets set POLYGON_API_KEY="your_polygon_api_key_here" --app optionstratv2

# Set Alpha Vantage API key (backup)
flyctl secrets set ALPHA_VANTAGE_API_KEY="your_alpha_vantage_api_key_here" --app optionstratv2

# Set market data provider
flyctl secrets set MARKET_DATA_PROVIDER="polygon" --app optionstratv2
```

---

### Step 3: Test Locally

#### 1. Install Dependencies (if needed)
```bash
cd optionstrat-main
npm install
```

#### 2. Start the Server
```bash
npm start
```

#### 3. Test Market Data Service
Open a new terminal and test the endpoint:

```powershell
# Check market data status
Invoke-RestMethod -Uri "http://localhost:8080/market-data-status"

# Test fetching a specific symbol
$body = @{ symbol = "SPY" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/market-data-status/test" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

**Expected Response**:
```json
{
  "status": "ok",
  "provider": "polygon",
  "api_status": "connected",
  "market_hours": {
    "is_market_open": true,
    "market_open": "2026-02-01T09:30:00.000Z",
    "market_close": "2026-02-01T16:00:00.000Z",
    "minutes_since_open": 120,
    "minutes_until_close": 270
  },
  "cache_stats": {
    "hits": 0,
    "misses": 1,
    "sets": 1,
    "size": 1,
    "hitRate": "0.00%"
  },
  "test_price": {
    "symbol": "SPY",
    "price": 502.15,
    "provider": "polygon",
    "timestamp": "2026-02-01T14:30:00.000Z"
  }
}
```

#### 4. Send a Test Signal
```powershell
$body = @{
    ticker = "SPY"
    action = "BUY"
    direction = "CALL"
    timeframe = "5m"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8080/webhook" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

#### 5. Check Positions (after 2-3 minutes)
```powershell
Invoke-RestMethod -Uri "http://localhost:8080/positions"
```

**Verify**: Position should show `current_price` that's different from `entry_price` (real market data is being used).

---

### Step 4: Deploy to Production

#### 1. Commit Changes
```bash
cd optionstrat-main
git add .
git commit -m "Phase 1: Integrate real market data service"
git push v2 master
```

#### 2. Deploy to Fly.io
```bash
flyctl deploy --app optionstratv2 --now
```

#### 3. Verify Deployment
```bash
# Check logs
flyctl logs --app optionstratv2

# Look for these messages:
# [Market Data] Initialized with provider: polygon
# [Cache] Auto cleanup started
# [Rate Limiter] Created limiter for polygon
```

#### 4. Test Production Endpoint
```powershell
# Check market data status
Invoke-RestMethod -Uri "https://optionstratv2.fly.dev/market-data-status"

# Test fetching SPY
$body = @{ symbol = "SPY" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://optionstratv2.fly.dev/market-data-status/test" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

---

## Verification Checklist

- [ ] API keys obtained (Polygon and/or Alpha Vantage)
- [ ] Environment variables configured locally
- [ ] Environment variables configured on Fly.io
- [ ] Local server starts without errors
- [ ] `/market-data-status` endpoint returns `api_status: "connected"`
- [ ] Test signal creates position with real prices
- [ ] Position refresher updates prices every 60 seconds
- [ ] Cache statistics show hits and misses
- [ ] Rate limiter statistics show requests are throttled
- [ ] Deployed to Fly.io successfully
- [ ] Production endpoint returns real market data

---

## Troubleshooting

### Issue: `api_status: "fallback"` or `provider: "demo"`
**Cause**: API keys not configured or invalid  
**Solution**: 
1. Check environment variables are set correctly
2. Verify API keys are valid
3. Check API key has not exceeded rate limits
4. Check API provider status page

### Issue: `api_status: "error"`
**Cause**: API request failed  
**Solution**:
1. Check internet connectivity
2. Check API provider status page
3. Check rate limits not exceeded
4. Check API key is valid
5. Check logs for detailed error message

### Issue: Positions not updating
**Cause**: Position refresher not running or failing  
**Solution**:
1. Check logs for position refresher activity
2. Verify market data service is working
3. Check database connection
4. Restart server

### Issue: Rate limit exceeded
**Cause**: Too many API requests  
**Solution**:
1. Check rate limiter statistics
2. Increase cache TTL to reduce API calls
3. Upgrade API plan for higher rate limits
4. Reduce worker intervals

### Issue: Cache not working
**Cause**: Cache service not initialized  
**Solution**:
1. Check logs for cache initialization
2. Verify cache statistics endpoint
3. Restart server

---

## API Usage & Costs

### Polygon.io
- **Free Tier**: 5 calls/minute = 7,200 calls/day
- **Starter Plan**: $99/month, 5 calls/second = 432,000 calls/day
- **Developer Plan**: $199/month, unlimited calls

### Alpha Vantage
- **Free Tier**: 5 calls/minute = 7,200 calls/day
- **Premium**: $49.99/month, 75 calls/minute

### Estimated Usage
With current caching (30 second TTL):
- Position refresher: ~60 calls/hour (1 per minute per symbol)
- Order creator: ~10 calls/hour
- Paper executor: ~10 calls/hour
- Signal processor: ~5 calls/hour

**Total**: ~85 calls/hour = ~2,040 calls/day

**Recommendation**: Free tier is sufficient for testing. Upgrade to Starter plan ($99/month) for production.

---

## Next Steps

### Phase 2: Real Options Pricing (Week 2-3)
- Integrate Tradier for real options quotes
- Fetch bid/ask spreads
- Calculate Greeks (delta, gamma, theta, vega)
- Update paper executor to use real option prices

### Phase 3: Real MTF Analysis (Week 3-4)
- Fetch historical OHLCV data
- Implement technical indicators (EMA, MACD, RSI, ATR)
- Calculate trend bias for multiple timeframes
- Apply MTF alignment filter

### Phase 4: Real Market Context (Week 4)
- Fetch real VIX data
- Calculate SPY trend from price action
- Detect opening range breakout
- Apply market context filters

---

## Support

If you encounter issues:
1. Check logs: `flyctl logs --app optionstratv2`
2. Check market data status: `GET /market-data-status`
3. Test specific symbol: `POST /market-data-status/test`
4. Review this guide
5. Check API provider status pages

---

**Phase 1 Complete!** 🎉

Your system now uses real market data for:
- ✅ Stock prices (underlying)
- ✅ Market hours detection
- ✅ Position valuations
- ✅ Order strike calculations

**Next**: Set up API keys and deploy to production!
