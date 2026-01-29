# Optionstrat Deployment Guide

Complete guide for deploying Optionstrat to Fly.io (backend) and Vercel (frontend).

## Architecture

- **Backend:** Fly.io (Deno server)
- **Database:** Fly.io Postgres
- **Frontend:** Vercel (React)

---

## Prerequisites

1. **Fly.io Account**
   - Sign up at https://fly.io
   - Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
   - Login: `flyctl auth login`

2. **Vercel Account**
   - Sign up at https://vercel.com
   - Install Vercel CLI: `npm install -g vercel`
   - Login: `vercel login`

3. **API Keys**
   - Alpaca API key and secret
   - Tradier API key
   - TwelveData API key
   - Unusual Whales API key

---

## Step 1: Deploy Database

### Create Postgres Database

```bash
# Make script executable
chmod +x scripts/setup-database.sh

# Run setup
./scripts/setup-database.sh
```

This will:
- Create a Fly.io Postgres cluster named `optionstrat-db`
- Attach it to your app
- Provide connection details

### Run Migrations

```bash
# Make script executable
chmod +x scripts/run-migrations.sh

# Run migrations
./scripts/run-migrations.sh
```

This will apply all SQL migrations from `supabase/migrations/` to your Fly.io Postgres database.

---

## Step 2: Configure Environment Variables

### Set Fly.io Secrets

```bash
# Database (automatically set when you attach the database)
flyctl secrets set DATABASE_URL="<your-postgres-url>" -a optionstrat-backend

# API Keys
flyctl secrets set ALPACA_API_KEY="<your-key>" -a optionstrat-backend
flyctl secrets set ALPACA_SECRET_KEY="<your-secret>" -a optionstrat-backend
flyctl secrets set TRADIER_API_KEY="<your-key>" -a optionstrat-backend
flyctl secrets set TWELVEDATA_API_KEY="<your-key>" -a optionstrat-backend
flyctl secrets set UNUSUAL_WHALES_API_KEY="<your-key>" -a optionstrat-backend

# App Configuration
flyctl secrets set APP_MODE="PAPER" -a optionstrat-backend
flyctl secrets set LIVE_TRADING_ENABLED="false" -a optionstrat-backend

# HMAC Secret (for webhook verification)
flyctl secrets set HMAC_SECRET="<generate-random-secret>" -a optionstrat-backend
```

---

## Step 3: Deploy Backend to Fly.io

### Option A: Using Deploy Script

```bash
# Make script executable
chmod +x scripts/deploy.sh

# Deploy
./scripts/deploy.sh
```

### Option B: Manual Deployment

```bash
# Create app (first time only)
flyctl apps create optionstrat-backend

# Deploy
flyctl deploy
```

### Verify Deployment

```bash
# Check status
flyctl status -a optionstrat-backend

# View logs
flyctl logs -a optionstrat-backend

# Test health endpoint
curl https://optionstrat-backend.fly.dev/health
```

---

## Step 4: Deploy Frontend to Vercel

### Update Frontend Configuration

1. **Update API Base URL**

Create `.env.production` in the root:

```env
VITE_API_URL=https://optionstrat-backend.fly.dev
```

2. **Remove Supabase Client** (if not already done)

The frontend should use direct API calls to Fly.io instead of Supabase client.

### Deploy to Vercel

```bash
# From project root
vercel

# Follow prompts:
# - Link to existing project or create new
# - Set build command: npm run build
# - Set output directory: dist
# - Set environment variables
```

### Set Vercel Environment Variables

In Vercel dashboard or CLI:

```bash
vercel env add VITE_API_URL production
# Enter: https://optionstrat-backend.fly.dev
```

### Production Deployment

```bash
# Deploy to production
vercel --prod
```

---

## Step 5: Verify End-to-End

### Test Backend

```bash
# Health check
curl https://optionstrat-backend.fly.dev/health

# Stats endpoint
curl https://optionstrat-backend.fly.dev/stats \
  -H "Authorization: Bearer <your-token>"

# Positions endpoint
curl https://optionstrat-backend.fly.dev/positions \
  -H "Authorization: Bearer <your-token>"
```

### Test Frontend

1. Visit your Vercel URL
2. Login
3. Check dashboard loads
4. Verify data displays correctly

### Test Webhook

```bash
# Send test webhook
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "source": "test",
    "symbol": "SPY",
    "direction": "CALL",
    "timeframe": "5m",
    "timestamp": "2026-01-29T12:00:00Z"
  }'
```

---

## Monitoring

### Fly.io Monitoring

```bash
# View logs
flyctl logs -a optionstrat-backend

# View metrics
flyctl dashboard -a optionstrat-backend

# SSH into machine
flyctl ssh console -a optionstrat-backend
```

### Vercel Monitoring

- View logs in Vercel dashboard
- Check analytics
- Monitor performance

---

## Scaling

### Scale Backend

```bash
# Scale to 2 machines
flyctl scale count 2 -a optionstrat-backend

# Scale VM size
flyctl scale vm shared-cpu-2x -a optionstrat-backend

# Scale memory
flyctl scale memory 512 -a optionstrat-backend
```

### Scale Database

```bash
# Scale database
flyctl postgres update --vm-size dedicated-cpu-1x -a optionstrat-db
```

---

## Troubleshooting

### Backend Issues

```bash
# Check logs
flyctl logs -a optionstrat-backend

# Check status
flyctl status -a optionstrat-backend

# Restart app
flyctl apps restart optionstrat-backend

# SSH into machine
flyctl ssh console -a optionstrat-backend
```

### Database Issues

```bash
# Connect to database
flyctl postgres connect -a optionstrat-db

# Check database status
flyctl postgres db list -a optionstrat-db

# View database logs
flyctl logs -a optionstrat-db
```

### Frontend Issues

```bash
# Check Vercel logs
vercel logs <deployment-url>

# Redeploy
vercel --prod
```

---

## Rollback

### Rollback Backend

```bash
# List deployments
flyctl releases -a optionstrat-backend

# Rollback to previous version
flyctl releases rollback -a optionstrat-backend
```

### Rollback Frontend

In Vercel dashboard:
1. Go to Deployments
2. Find previous working deployment
3. Click "Promote to Production"

---

## Cost Estimation

### Fly.io (Backend + Database)

- **Backend:** ~$5-10/month (shared CPU, 256MB RAM)
- **Database:** ~$5-15/month (1GB storage, shared CPU)
- **Total:** ~$10-25/month

### Vercel (Frontend)

- **Hobby Plan:** Free (100GB bandwidth)
- **Pro Plan:** $20/month (1TB bandwidth)

### Total Estimated Cost

- **Development:** ~$10-25/month (Fly.io only, Vercel free)
- **Production:** ~$30-45/month (Fly.io + Vercel Pro)

---

## Security Checklist

- [ ] All API keys stored as secrets (not in code)
- [ ] HTTPS enabled (automatic on Fly.io and Vercel)
- [ ] CORS configured correctly
- [ ] Database has strong password
- [ ] Webhook HMAC verification enabled
- [ ] Rate limiting configured
- [ ] Authentication implemented
- [ ] Environment variables set correctly

---

## Next Steps

1. **Set up monitoring alerts**
   - Fly.io: Configure health checks
   - Vercel: Set up error tracking

2. **Configure CI/CD**
   - GitHub Actions for automated deployments
   - Automated testing before deployment

3. **Set up backups**
   - Fly.io Postgres automated backups
   - Database backup schedule

4. **Performance optimization**
   - Enable caching
   - Optimize database queries
   - Monitor response times

---

## Support

- **Fly.io Docs:** https://fly.io/docs
- **Vercel Docs:** https://vercel.com/docs
- **Deno Docs:** https://deno.land/manual

---

**Last Updated:** January 29, 2026
