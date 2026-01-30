# Environment Variables Guide

Complete list of all environment variables needed for frontend and backend deployment.

---

## 🎨 FRONTEND (Vercel)

### Required Variables

```bash
# API Endpoint
VITE_API_URL=https://optionstrat-backend.fly.dev
```

### How to Set in Vercel

1. Go to: https://vercel.com/dashboard
2. Select your project: `optionstratv2`
3. Go to: Settings → Environment Variables
4. Add the variable above

**That's it!** The frontend only needs one environment variable.

---

## 🔧 BACKEND (Fly.io)

### Critical Variables (Required)

```bash
# Database Connection
DATABASE_URL=postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require

# Authentication
JWT_SECRET=your-secure-random-string-min-32-chars

# Application Mode
APP_MODE=PAPER                    # Options: PAPER, LIVE
ALLOW_LIVE_EXECUTION=false        # Options: true, false
```

### Broker Configuration (Choose ONE)

#### Option A: Tradier (Recommended)
```bash
TRADIER_API_KEY=your-tradier-api-key
TRADIER_ACCOUNT_ID=your-tradier-account-id
PREFERRED_BROKER=TRADIER
```

#### Option B: Alpaca
```bash
ALPACA_API_KEY=your-alpaca-api-key
ALPACA_SECRET_KEY=your-alpaca-secret-key
PREFERRED_BROKER=ALPACA
```

### Exit Worker Configuration (Recommended)

```bash
# Enable/disable automated exit monitoring
EXIT_WORKER_ENABLED=true          # Options: true, false

# Cron schedule (every 5 minutes, weekdays only)
EXIT_WORKER_CRON=*/5 * * * 1-5

# Fallback: interval in seconds (if Deno.cron unavailable)
EXIT_WORKER_INTERVAL_SECONDS=300
```

### Optional Variables

```bash
# API Authentication (if you want to protect endpoints)
API_AUTH_TOKEN=your-api-token

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_PER_HOUR=1000

# Logging Level
LOG_LEVEL=info                    # Options: debug, info, warn, error

# Market Data API Keys (if using external data)
TWELVEDATA_API_KEY=your-twelvedata-key
UNUSUAL_WHALES_API_KEY=your-unusual-whales-key
MARKETDATA_API_KEY=your-marketdata-key

# Paper Trading Configuration
PAPER_SLIPPAGE_PERCENT=0.1
PAPER_COMMISSION_PER_CONTRACT=0.65
PAPER_FEE_PER_CONTRACT=0.02
```

---

## 📝 How to Set Backend Variables in Fly.io

### Method 1: Using Fly CLI (Recommended)

```bash
# Set all critical variables at once
fly secrets set \
  DATABASE_URL="postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  JWT_SECRET="your-secure-random-string-min-32-chars" \
  APP_MODE="PAPER" \
  ALLOW_LIVE_EXECUTION="false" \
  TRADIER_API_KEY="your-tradier-api-key" \
  TRADIER_ACCOUNT_ID="your-tradier-account-id" \
  PREFERRED_BROKER="TRADIER" \
  EXIT_WORKER_ENABLED="true" \
  EXIT_WORKER_CRON="*/5 * * * 1-5" \
  -a optionstrat-backend
```

### Method 2: Set One at a Time

```bash
fly secrets set DATABASE_URL="postgresql://..." -a optionstrat-backend
fly secrets set JWT_SECRET="your-secret" -a optionstrat-backend
fly secrets set APP_MODE="PAPER" -a optionstrat-backend
# ... etc
```

### Method 3: Using Fly.io Dashboard

1. Go to: https://fly.io/dashboard
2. Select app: `optionstrat-backend`
3. Go to: Secrets
4. Add each variable manually

---

## 🔐 Generating Secure Values

### JWT_SECRET

Generate a secure random string (minimum 32 characters):

```bash
# Using OpenSSL (Mac/Linux)
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using PowerShell (Windows)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

### API_AUTH_TOKEN (Optional)

```bash
# Generate a random token
openssl rand -hex 32
```

---

## 🔍 Verifying Variables

### Check Frontend Variables (Vercel)

```bash
# In your browser console on https://optionstratv2.vercel.app
console.log(import.meta.env.VITE_API_URL)
# Should output: https://optionstrat-backend.fly.dev
```

### Check Backend Variables (Fly.io)

```bash
# List all secrets (values are hidden)
fly secrets list -a optionstrat-backend

# Test if variables are accessible
fly ssh console -a optionstrat-backend
# Inside container:
echo $DATABASE_URL
echo $JWT_SECRET
echo $APP_MODE
```

---

## 📋 Complete Setup Checklist

### Frontend (Vercel)
- [ ] `VITE_API_URL` set to backend URL

### Backend (Fly.io) - Critical
- [ ] `DATABASE_URL` set to Neon connection string
- [ ] `JWT_SECRET` generated and set (min 32 chars)
- [ ] `APP_MODE` set to "PAPER" (start safe)
- [ ] `ALLOW_LIVE_EXECUTION` set to "false" (start safe)

### Backend (Fly.io) - Broker (Choose One)
- [ ] Tradier: `TRADIER_API_KEY`, `TRADIER_ACCOUNT_ID`, `PREFERRED_BROKER=TRADIER`
- [ ] Alpaca: `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `PREFERRED_BROKER=ALPACA`

### Backend (Fly.io) - Exit Worker
- [ ] `EXIT_WORKER_ENABLED` set to "true"
- [ ] `EXIT_WORKER_CRON` set to "*/5 * * * 1-5"

---

## 🚨 Security Best Practices

### DO:
✅ Use strong, randomly generated secrets  
✅ Store secrets in Fly.io/Vercel (never in code)  
✅ Use different secrets for dev/staging/production  
✅ Rotate secrets periodically  
✅ Start in PAPER mode before going LIVE  

### DON'T:
❌ Commit secrets to Git  
❌ Share secrets in plain text  
❌ Use weak or predictable secrets  
❌ Enable LIVE mode without testing  
❌ Store secrets in .env files (use .env.example only)  

---

## 📊 Environment Variable Summary

| Variable | Frontend | Backend | Required | Default |
|----------|----------|---------|----------|---------|
| `VITE_API_URL` | ✅ | ❌ | Yes | - |
| `DATABASE_URL` | ❌ | ✅ | Yes | - |
| `JWT_SECRET` | ❌ | ✅ | Yes | - |
| `APP_MODE` | ❌ | ✅ | Yes | PAPER |
| `ALLOW_LIVE_EXECUTION` | ❌ | ✅ | Yes | false |
| `TRADIER_API_KEY` | ❌ | ✅ | Yes* | - |
| `TRADIER_ACCOUNT_ID` | ❌ | ✅ | Yes* | - |
| `ALPACA_API_KEY` | ❌ | ✅ | Yes* | - |
| `ALPACA_SECRET_KEY` | ❌ | ✅ | Yes* | - |
| `PREFERRED_BROKER` | ❌ | ✅ | Yes | PAPER |
| `EXIT_WORKER_ENABLED` | ❌ | ✅ | No | true |
| `EXIT_WORKER_CRON` | ❌ | ✅ | No | */5 * * * 1-5 |
| `EXIT_WORKER_INTERVAL_SECONDS` | ❌ | ✅ | No | 0 |
| `API_AUTH_TOKEN` | ❌ | ✅ | No | - |
| `RATE_LIMIT_PER_MINUTE` | ❌ | ✅ | No | 60 |
| `RATE_LIMIT_PER_HOUR` | ❌ | ✅ | No | 1000 |

*Required: Choose either Tradier OR Alpaca broker keys

---

## 🔄 Switching from Paper to Live Mode

When you're ready to go live (after thorough testing):

```bash
# Step 1: Enable live mode
fly secrets set APP_MODE="LIVE" -a optionstrat-backend
fly secrets set ALLOW_LIVE_EXECUTION="true" -a optionstrat-backend

# Step 2: Deploy
fly deploy

# Step 3: Monitor closely
fly logs -a optionstrat-backend -f
```

**⚠️ WARNING**: Only switch to LIVE mode after:
- ✅ Running in PAPER mode for at least 1 full trading day
- ✅ Verifying all orders execute correctly
- ✅ Confirming exit worker functions properly
- ✅ Testing with small position sizes first

---

## 📞 Getting API Keys

### Tradier
1. Sign up: https://tradier.com/
2. Go to: Account → API Access
3. Create API application
4. Copy: API Key and Account ID

### Alpaca
1. Sign up: https://alpaca.markets/
2. Go to: Paper Trading → API Keys
3. Generate new key
4. Copy: API Key and Secret Key

### Market Data (Optional)
- TwelveData: https://twelvedata.com/
- Unusual Whales: https://unusualwhales.com/
- MarketData: https://www.marketdata.app/

---

## 🆘 Troubleshooting

### Frontend can't connect to backend
- Check `VITE_API_URL` is set correctly in Vercel
- Verify backend is deployed and healthy: `curl https://optionstrat-backend.fly.dev/health`

### Backend can't connect to database
- Check `DATABASE_URL` is correct
- Verify Neon database is accessible
- Check SSL mode is set to "require"

### Orders not executing
- Verify `ALLOW_LIVE_EXECUTION` is set correctly
- Check broker API keys are valid
- Verify `PREFERRED_BROKER` matches your broker
- Check logs: `fly logs -a optionstrat-backend`

### Exit worker not running
- Check `EXIT_WORKER_ENABLED` is "true"
- Verify cron schedule is valid
- Check logs for scheduling confirmation
- Try setting `EXIT_WORKER_INTERVAL_SECONDS` as fallback

---

**Need Help?** Check the logs:
```bash
# Backend logs
fly logs -a optionstrat-backend -f

# Frontend logs (in browser console)
# Visit: https://optionstratv2.vercel.app
# Open: Developer Tools → Console
```
