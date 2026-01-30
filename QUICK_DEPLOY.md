# Quick Deploy Reference

Fast reference for deploying to Fly.io + Neon.tech + Vercel.

## 🚀 Quick Start (3 Steps)

### 1. Run Migrations on Neon

```powershell
cd optionstrat-main
.\scripts\run-neon-migrations.ps1 -DatabaseUrl "postgresql://user:pass@host/db?sslmode=require"
```

### 2. Configure Fly.io

```powershell
# Set database URL
flyctl secrets set DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" -a optionstrat-backend

# Set API keys
flyctl secrets set ALPACA_API_KEY="your-key" -a optionstrat-backend
flyctl secrets set ALPACA_SECRET_KEY="your-secret" -a optionstrat-backend
flyctl secrets set TRADIER_API_KEY="your-key" -a optionstrat-backend
flyctl secrets set TWELVEDATA_API_KEY="your-key" -a optionstrat-backend
flyctl secrets set UNUSUAL_WHALES_API_KEY="your-key" -a optionstrat-backend

# Set app config
flyctl secrets set APP_MODE="PAPER" -a optionstrat-backend
flyctl secrets set LIVE_TRADING_ENABLED="false" -a optionstrat-backend

# Deploy
flyctl deploy
```

### 3. Deploy Frontend to Vercel

```powershell
# Set environment variable
vercel env add VITE_API_URL production
# Enter: https://optionstrat-backend.fly.dev

# Deploy
vercel --prod
```

---

## 📋 Verification Checklist

```powershell
# ✅ Check database tables
psql "your-neon-connection-string" -c "\dt"

# ✅ Check Fly.io secrets
flyctl secrets list -a optionstrat-backend

# ✅ Check Fly.io status
flyctl status -a optionstrat-backend

# ✅ Test backend health
curl https://optionstrat-backend.fly.dev/health

# ✅ Test backend stats
curl https://optionstrat-backend.fly.dev/stats

# ✅ Check Fly.io logs
flyctl logs -a optionstrat-backend

# ✅ Test frontend
# Visit your Vercel URL in browser
```

---

## 🔧 Common Commands

### Neon Database

```powershell
# Connect to database
psql "postgresql://user:pass@host/db?sslmode=require"

# List tables
psql "your-connection-string" -c "\dt"

# Describe table
psql "your-connection-string" -c "\d refactored_signals"

# Count records
psql "your-connection-string" -c "SELECT COUNT(*) FROM refactored_signals;"
```

### Fly.io

```powershell
# View logs
flyctl logs -a optionstrat-backend

# SSH into machine
flyctl ssh console -a optionstrat-backend

# Restart app
flyctl apps restart optionstrat-backend

# Check status
flyctl status -a optionstrat-backend

# List secrets
flyctl secrets list -a optionstrat-backend

# Deploy
flyctl deploy

# Get IP addresses
flyctl ips list -a optionstrat-backend
```

### Vercel

```powershell
# Deploy
vercel --prod

# View logs
vercel logs

# List environment variables
vercel env ls

# Add environment variable
vercel env add VITE_API_URL production
```

---

## 🐛 Troubleshooting

### Database Connection Issues

```powershell
# Test connection
psql "your-connection-string" -c "SELECT 1;"

# Check if database is paused (Neon free tier)
# Go to: https://console.neon.tech/

# Verify SSL mode in connection string
# Should end with: ?sslmode=require
```

### Fly.io Issues

```powershell
# Check logs for errors
flyctl logs -a optionstrat-backend

# Verify secrets are set
flyctl secrets list -a optionstrat-backend

# SSH and test database connection
flyctl ssh console -a optionstrat-backend
# Then inside: echo $DATABASE_URL
```

### Frontend Issues

```powershell
# Check environment variables
vercel env ls

# Redeploy
vercel --prod

# Check build logs in Vercel dashboard
```

---

## 📊 Expected Database Tables

After migrations, you should have these tables:

- ✅ `refactored_signals` - Trading signals
- ✅ `refactored_positions` - Open/closed positions
- ✅ `refactored_decisions` - Decision audit trail
- ✅ `refactored_gex_signals` - Gamma exposure signals
- ✅ `refactored_context_snapshots` - Market context
- ✅ `refactored_pipeline_failures` - Pipeline errors
- ✅ `refactored_processing_errors` - System errors

---

## 🔐 Security Checklist

- [ ] DATABASE_URL stored as Fly.io secret (not in code)
- [ ] All API keys stored as Fly.io secrets
- [ ] Neon IP allowlist configured (if required)
- [ ] HTTPS enabled (automatic on Fly.io/Vercel)
- [ ] CORS configured in backend
- [ ] Environment variables set in Vercel
- [ ] No secrets committed to git

---

## 📞 Support Links

- **Neon Docs:** https://neon.tech/docs
- **Fly.io Docs:** https://fly.io/docs
- **Vercel Docs:** https://vercel.com/docs
- **Deno Docs:** https://deno.land/manual

---

## 🎯 Quick Test Flow

```powershell
# 1. Test database
psql "your-connection-string" -c "SELECT COUNT(*) FROM refactored_signals;"

# 2. Test backend health
curl https://optionstrat-backend.fly.dev/health

# 3. Send test webhook
curl -X POST https://optionstrat-backend.fly.dev/webhook `
  -H "Content-Type: application/json" `
  -d '{\"source\":\"test\",\"symbol\":\"SPY\",\"direction\":\"CALL\",\"timeframe\":\"5m\",\"timestamp\":\"2026-01-29T12:00:00Z\"}'

# 4. Check if signal was stored
psql "your-connection-string" -c "SELECT * FROM refactored_signals ORDER BY created_at DESC LIMIT 1;"

# 5. Check Fly.io logs
flyctl logs -a optionstrat-backend

# 6. Visit frontend
# Open browser to your Vercel URL
```

---

**Last Updated:** January 29, 2026
