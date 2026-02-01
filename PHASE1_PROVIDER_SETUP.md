# Phase 1: Market Data Provider Setup

**Supported Providers**: TwelveData, MarketData.app, Alpaca, Polygon.io, Alpha Vantage

---

## Provider Comparison

| Provider | Free Tier | Paid Plans | Best For | Recommendation |
|----------|-----------|------------|----------|----------------|
| **TwelveData** | 8 req/min (800/day) | $49-299/month | Real-time stocks | ⭐ **Primary** |
| **MarketData.app** | 100 req/day | $9-99/month | Budget option | Good backup |
| **Alpaca** | Unlimited | Free | Stocks + broker | ⭐ **Primary** (if using Alpaca broker) |
| **Polygon.io** | 5 req/min | $99-199/month | Professional | Good for high volume |
| **Alpha Vantage** | 5 req/min | $50/month | Backup | Good backup |

---

## Recommended Setup

### Option 1: TwelveData + Alpaca (Best for Options Trading)
```bash
MARKET_DATA_PROVIDER=twelvedata
TWELVE_DATA_API_KEY=your_twelvedata_key
ALPACA_API_KEY=your_alpaca_key
ALPACA_SECRET_KEY=your_alpaca_secret
ALPACA_PAPER=true
```

**Why**: TwelveData has good free tier (8 req/min), Alpaca provides broker integration

### Option 2: Alpaca Only (Simplest)
```bash
MARKET_DATA_PROVIDER=alpaca
ALPACA_API_KEY=your_alpaca_key
ALPACA_SECRET_KEY=your_alpaca_secret
ALPACA_PAPER=true
```

**Why**: One provider for both market data and broker, unlimited requests

### Option 3: MarketData.app (Budget)
```bash
MARKET_DATA_PROVIDER=marketdata
MARKET_DATA_API_KEY=your_marketdata_key
TWELVE_DATA_API_KEY=your_twelvedata_key  # Backup
```

**Why**: Cheapest paid option ($9/month), good for low-volume trading

---

## Setup Instructions

### 1. TwelveData

**Get API Key**:
1. Go to https://twelvedata.com/
2. Sign up for free account
3. Get API key from dashboard
4. Free tier: 8 requests/minute (800/day)

**Configure**:
```bash
# Local (.env)
MARKET_DATA_PROVIDER=twelvedata
TWELVE_DATA_API_KEY=your_key_here

# Production (Fly.io)
flyctl secrets set MARKET_DATA_PROVIDER="twelvedata" --app optionstratv2
flyctl secrets set TWELVE_DATA_API_KEY="your_key" --app optionstratv2
```

**Test**:
```powershell
$body = @{ symbol = "SPY" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/market-data-status/test" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

---

### 2. MarketData.app

**Get API Key**:
1. Go to https://www.marketdata.app/
2. Sign up for account
3. Get API token from dashboard
4. Free tier: 100 requests/day

**Configure**:
```bash
# Local (.env)
MARKET_DATA_PROVIDER=marketdata
MARKET_DATA_API_KEY=your_token_here

# Production (Fly.io)
flyctl secrets set MARKET_DATA_PROVIDER="marketdata" --app optionstratv2
flyctl secrets set MARKET_DATA_API_KEY="your_token" --app optionstratv2
```

**Test**:
```powershell
$body = @{ symbol = "AAPL" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/market-data-status/test" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

---

### 3. Alpaca

**Get API Keys**:
1. Go to https://alpaca.markets/
2. Sign up for account
3. Go to Paper Trading dashboard
4. Generate API keys (Key ID + Secret Key)
5. Unlimited requests (no rate limit)

**Configure**:
```bash
# Local (.env)
MARKET_DATA_PROVIDER=alpaca
ALPACA_API_KEY=your_key_id_here
ALPACA_SECRET_KEY=your_secret_key_here
ALPACA_PAPER=true  # Use paper trading (recommended)

# Production (Fly.io)
flyctl secrets set MARKET_DATA_PROVIDER="alpaca" --app optionstratv2
flyctl secrets set ALPACA_API_KEY="your_key_id" --app optionstratv2
flyctl secrets set ALPACA_SECRET_KEY="your_secret_key" --app optionstratv2
flyctl secrets set ALPACA_PAPER="true" --app optionstratv2
```

**Test**:
```powershell
$body = @{ symbol = "TSLA" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/market-data-status/test" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

---

### 4. Polygon.io (Optional)

**Get API Key**:
1. Go to https://polygon.io/
2. Sign up for account
3. Get API key from dashboard
4. Free tier: 5 requests/minute

**Configure**:
```bash
# Local (.env)
POLYGON_API_KEY=your_key_here

# Production (Fly.io)
flyctl secrets set POLYGON_API_KEY="your_key" --app optionstratv2
```

---

### 5. Alpha Vantage (Optional)

**Get API Key**:
1. Go to https://www.alphavantage.co/
2. Get free API key
3. Free tier: 5 requests/minute

**Configure**:
```bash
# Local (.env)
ALPHA_VANTAGE_API_KEY=your_key_here

# Production (Fly.io)
flyctl secrets set ALPHA_VANTAGE_API_KEY="your_key" --app optionstratv2
```

---

## Complete Configuration Example

### Recommended: TwelveData + Alpaca + Backups

```bash
# Primary provider
MARKET_DATA_PROVIDER=twelvedata
TWELVE_DATA_API_KEY=your_twelvedata_key

# Alpaca (for broker integration in Phase 5)
ALPACA_API_KEY=your_alpaca_key_id
ALPACA_SECRET_KEY=your_alpaca_secret
ALPACA_PAPER=true

# Backup providers (optional but recommended)
MARKET_DATA_API_KEY=your_marketdata_token
POLYGON_API_KEY=your_polygon_key
ALPHA_VANTAGE_API_KEY=your_alphavantage_key
```

**Fallback Order**:
1. TwelveData (primary)
2. MarketData.app (backup 1)
3. Alpaca (backup 2)
4. Polygon (backup 3)
5. Alpha Vantage (backup 4)
6. Demo data (last resort)

---

## Rate Limits

| Provider | Free Tier | Requests/Day | Requests/Hour |
|----------|-----------|--------------|---------------|
| TwelveData | 8/min | 11,520 | 480 |
| MarketData.app | 100/day | 100 | 4 |
| Alpaca | Unlimited | Unlimited | Unlimited |
| Polygon | 5/min | 7,200 | 300 |
| Alpha Vantage | 5/min | 7,200 | 300 |

**Current System Usage**: ~85 requests/hour

**Recommendation**: 
- TwelveData free tier is sufficient (480/hour > 85/hour)
- Alpaca is best if you need unlimited requests
- MarketData.app free tier is too low (4/hour < 85/hour) - need paid plan

---

## Testing All Providers

### Test Script

```powershell
# Test TwelveData
$env:MARKET_DATA_PROVIDER = "twelvedata"
npm run dev:server

# Test MarketData.app
$env:MARKET_DATA_PROVIDER = "marketdata"
npm run dev:server

# Test Alpaca
$env:MARKET_DATA_PROVIDER = "alpaca"
npm run dev:server

# Check status
Invoke-RestMethod -Uri "http://localhost:8080/market-data-status"
```

### Verify Fallback

1. Set invalid primary key
2. Verify system falls back to next provider
3. Check logs for fallback messages

```powershell
# Should see: "Trying backup provider (alpaca) for SPY"
flyctl logs --app optionstratv2 | Select-String "backup provider"
```

---

## Cost Comparison

### Free Tier (Testing)
- TwelveData: Free (8 req/min)
- MarketData.app: Free (100 req/day) - **Too low for production**
- Alpaca: Free (unlimited)
- **Total**: $0/month ✅

### Paid Plans (Production)
- TwelveData Basic: $49/month (unlimited)
- MarketData.app Starter: $9/month (10,000 req/day)
- Alpaca: Free (unlimited)
- **Total**: $0-49/month

### Recommended for Production
- **Alpaca** (free, unlimited) + **TwelveData** (free, 8 req/min)
- **Total**: $0/month ✅
- Upgrade to TwelveData Basic ($49/month) if you need more than 8 req/min

---

## Troubleshooting

### Issue: "No API keys configured"
**Solution**: Set at least one provider's API key

### Issue: "All providers failed"
**Solution**: 
1. Check API keys are valid
2. Check rate limits not exceeded
3. Check provider status pages
4. Verify internet connectivity

### Issue: Rate limit exceeded
**Solution**:
1. Check rate limiter stats: `GET /market-data-status`
2. Increase cache TTL (reduce API calls)
3. Upgrade to paid plan
4. Add more backup providers

### Issue: Alpaca returns bid/ask instead of last price
**Note**: Alpaca uses mid-price (bid+ask)/2 which is more accurate

---

## Provider Status Pages

- TwelveData: https://status.twelvedata.com/
- MarketData.app: https://status.marketdata.app/
- Alpaca: https://status.alpaca.markets/
- Polygon: https://status.polygon.io/
- Alpha Vantage: https://www.alphavantage.co/support/

---

## Next Steps

1. ✅ Choose primary provider (TwelveData or Alpaca recommended)
2. ✅ Get API keys
3. ✅ Configure environment variables
4. ✅ Test locally
5. ✅ Deploy to production
6. ✅ Monitor for 24 hours
7. ✅ Add backup providers for redundancy

---

**Recommendation**: Use **Alpaca** as primary (free, unlimited) with **TwelveData** as backup (free, 8 req/min). This gives you unlimited requests with a reliable backup.

**Cost**: $0/month ✅
