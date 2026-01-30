# Quick Setup Guide

Fast reference for setting up environment variables.

---

## 🎨 FRONTEND (Vercel)

### Only 1 Variable Needed

```bash
VITE_API_URL=https://optionstrat-backend.fly.dev
```

**Set in Vercel**:
1. Dashboard → Project → Settings → Environment Variables
2. Add `VITE_API_URL` with value above
3. Redeploy

---

## 🔧 BACKEND (Fly.io)

### Copy-Paste Command (Update values first!)

```bash
fly secrets set \
  DATABASE_URL="postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  JWT_SECRET="REPLACE_WITH_RANDOM_32_CHAR_STRING" \
  APP_MODE="PAPER" \
  ALLOW_LIVE_EXECUTION="false" \
  TRADIER_API_KEY="REPLACE_WITH_YOUR_TRADIER_KEY" \
  TRADIER_ACCOUNT_ID="REPLACE_WITH_YOUR_TRADIER_ACCOUNT" \
  PREFERRED_BROKER="TRADIER" \
  EXIT_WORKER_ENABLED="true" \
  EXIT_WORKER_CRON="*/5 * * * 1-5" \
  -a optionstrat-backend
```

### Generate JWT_SECRET

```bash
# Run this to generate a secure secret:
openssl rand -base64 32

# Or use Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Copy the output and use it as JWT_SECRET
```

---

## ✅ Verification

### Check Frontend
```bash
# Visit your site and open browser console
console.log(import.meta.env.VITE_API_URL)
# Should show: https://optionstrat-backend.fly.dev
```

### Check Backend
```bash
# List all secrets (values hidden for security)
fly secrets list -a optionstrat-backend

# Should see:
# - DATABASE_URL
# - JWT_SECRET
# - APP_MODE
# - ALLOW_LIVE_EXECUTION
# - TRADIER_API_KEY (or ALPACA_API_KEY)
# - TRADIER_ACCOUNT_ID (or ALPACA_SECRET_KEY)
# - PREFERRED_BROKER
# - EXIT_WORKER_ENABLED
# - EXIT_WORKER_CRON
```

---

## 🚀 Deploy

```bash
# Backend
cd optionstrat-main
fly deploy

# Frontend (auto-deploys from GitHub)
# Just verify at: https://optionstratv2.vercel.app
```

---

## 📋 Minimum Required Variables

### Frontend (1 variable)
- ✅ `VITE_API_URL`

### Backend (9 variables)
- ✅ `DATABASE_URL`
- ✅ `JWT_SECRET`
- ✅ `APP_MODE`
- ✅ `ALLOW_LIVE_EXECUTION`
- ✅ `TRADIER_API_KEY` (or `ALPACA_API_KEY`)
- ✅ `TRADIER_ACCOUNT_ID` (or `ALPACA_SECRET_KEY`)
- ✅ `PREFERRED_BROKER`
- ✅ `EXIT_WORKER_ENABLED`
- ✅ `EXIT_WORKER_CRON`

**Total**: 10 environment variables (1 frontend + 9 backend)

---

## 🔐 Where to Get API Keys

### Tradier (Recommended)
- Sign up: https://tradier.com/
- Get keys: Account → API Access
- Need: API Key + Account ID

### Alpaca (Alternative)
- Sign up: https://alpaca.markets/
- Get keys: Paper Trading → API Keys
- Need: API Key + Secret Key

---

## ⚠️ Important Notes

1. **Start in PAPER mode** - Don't enable live execution until tested
2. **Generate secure JWT_SECRET** - Use the command above
3. **Keep secrets safe** - Never commit to Git
4. **Test thoroughly** - Run in paper mode for 1 day minimum
5. **Monitor logs** - Watch for errors after deployment

---

**For complete details, see**: `ENVIRONMENT_VARIABLES.md`
