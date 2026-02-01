# Phase 1: Real Market Data - Quick Start

**Goal**: Replace demo data with real market data

**Supported Providers**: TwelveData ⭐, MarketData.app, Alpaca ⭐, Polygon.io, Alpha Vantage

---

## 🚀 Quick Setup (5 minutes)

### 1. Choose Provider & Get API Keys

#### Option A: Alpaca (Recommended - Free & Unlimited)
- Go to: https://alpaca.markets/
- Sign up → Paper Trading → Generate API Keys
- Get: API Key ID + Secret Key
- **Cost**: Free, unlimited requests ✅

#### Option B: TwelveData (Recommended - Good Free Tier)
- Go to: https://twelvedata.com/
- Sign up → Get API key
- **Cost**: Free, 8 requests/minute ✅

#### Option C: MarketData.app (Budget Option)
- Go to: https://www.marketdata.app/
- Sign up → Get API token
- **Cost**: Free (100 req/day) or $9/month

### 2. Configure Locally

**For Alpaca**:
```bash
# Add to optionstrat-main/.env
MARKET_DATA_PROVIDER=alpaca
ALPACA_API_KEY=your_key_id_here
ALPACA_SECRET_KEY=your_secret_key_here
ALPACA_PAPER=true
```

**For TwelveData**:
```bash
# Add to optionstrat-main/.env
MARKET_DATA_PROVIDER=twelvedata
TWELVE_DATA_API_KEY=your_key_here
```

**For Multiple Providers (Recommended)**:
```bash
# Primary
MARKET_DATA_PROVIDER=alpaca
ALPACA_API_KEY=your_alpaca_key_id
ALPACA_SECRET_KEY=your_alpaca_secret
ALPACA_PAPER=true

# Backups
TWELVE_DATA_API_KEY=your_twelvedata_key
MARKET_DATA_API_KEY=your_marketdata_token
```

### 3. Test Locally

```powershell
cd optionstrat-main
npm run dev:server

# In new terminal:
Invoke-RestMethod -Uri "http://localhost:8080/market-data-status"
```

**Expected**: `"api_status": "connected"`

### 4. Deploy to Production

```bash
# For Alpaca
flyctl secrets set MARKET_DATA_PROVIDER="alpaca" --app optionstratv2
flyctl secrets set ALPACA_API_KEY="your_key_id" --app optionstratv2
flyctl secrets set ALPACA_SECRET_KEY="your_secret" --app optionstratv2
flyctl secrets set ALPACA_PAPER="true" --app optionstratv2

# For TwelveData
flyctl secrets set MARKET_DATA_PROVIDER="twelvedata" --app optionstratv2
flyctl secrets set TWELVE_DATA_API_KEY="your_key" --app optionstratv2

# Add backups (optional but recommended)
flyctl secrets set MARKET_DATA_API_KEY="your_marketdata_token" --app optionstratv2

# Deploy
flyctl deploy --app optionstratv2 --now

# Verify
flyctl logs --app optionstratv2
```

### 5. Test Production

```powershell
Invoke-RestMethod -Uri "https://optionstratv2.fly.dev/market-data-status"
```

**Expected**: `"api_status": "connected"`

---

## ✅ Verification

Send a test signal and check positions after 2-3 minutes:

```powershell
# Send signal
$body = @{
    ticker = "SPY"
    action = "BUY"
    direction = "CALL"
    timeframe = "5m"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://optionstratv2.fly.dev/webhook" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body

# Wait 2-3 minutes...

# Check positions
Invoke-RestMethod -Uri "https://optionstratv2.fly.dev/positions"
```

**Verify**: `current_price` is different from `entry_price` (real data!)

---

## 📊 What Changed

| Component | Before | After |
|-----------|--------|-------|
| Stock Prices | Demo data | Real from TwelveData/Alpaca/MarketData.app |
| Market Hours | Always open | Real NYSE/NASDAQ hours |
| Position Prices | Random variation | Real market prices |
| Strike Calculation | Demo prices | Real ATM prices |
| Cache | None | 30-second TTL |
| Rate Limiting | None | Per-provider limits |
| Providers | None | 5 providers with auto-fallback |

---

## 🔍 Monitoring

### Check Status
```powershell
Invoke-RestMethod -Uri "https://optionstratv2.fly.dev/market-data-status"
```

**Look for**:
- `"api_status": "connected"` ✅
- `"provider": "alpaca"` or `"twelvedata"` ✅
- Cache hit rate > 70% after warm-up ✅

### Test Symbol
```powershell
$body = @{ symbol = "AAPL" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://optionstratv2.fly.dev/market-data-status/test" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

### View Logs
```bash
flyctl logs --app optionstratv2 | Select-String "Market Data"
```

---

## 💰 Cost

**Free Tier** (Recommended):
- Alpaca: Free, unlimited ✅
- TwelveData: Free, 8 req/min ✅
- MarketData.app: Free, 100 req/day (too low for production)
- Current usage: ~85 calls/hour
- **Cost**: $0/month ✅

**Paid Plans** (If needed):
- TwelveData Basic: $49/month (unlimited)
- MarketData.app Starter: $9/month (10,000 req/day)
- **Cost**: $9-49/month

**Recommendation**: Use Alpaca (free, unlimited) as primary ✅

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `api_status: "fallback"` | Check API keys are set |
| `api_status: "error"` | Check API key is valid |
| Positions not updating | Check worker logs |
| Rate limit exceeded | Upgrade API plan |

---

## 📚 Full Documentation

- `PHASE1_SETUP_GUIDE.md` - Detailed setup
- `PHASE1_IMPLEMENTATION_COMPLETE.md` - What was implemented
- `.kiro/specs/real-data-integration/` - Full spec

---

## ⏭️ Next Phase

**Phase 2: Real Options Pricing** (Week 2-3)
- Integrate Tradier for real options quotes
- Fetch bid/ask spreads and Greeks
- Update paper executor with real option prices

---

**Done!** 🎉 Your system now uses real market data!
