# Fly.io Quick Setup Guide

Quick reference for deploying Optionstrat to Fly.io.

## Prerequisites

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login
```

## Quick Deploy (5 Steps)

### 1. Create Database

```bash
chmod +x scripts/setup-database.sh
./scripts/setup-database.sh
```

### 2. Run Migrations

```bash
chmod +x scripts/run-migrations.sh
./scripts/run-migrations.sh
```

### 3. Set Environment Variables

```bash
# Required secrets
flyctl secrets set \
  ALPACA_API_KEY="your-key" \
  ALPACA_SECRET_KEY="your-secret" \
  TRADIER_API_KEY="your-key" \
  TWELVEDATA_API_KEY="your-key" \
  UNUSUAL_WHALES_API_KEY="your-key" \
  APP_MODE="PAPER" \
  LIVE_TRADING_ENABLED="false" \
  -a optionstrat-backend
```

### 4. Deploy Backend

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### 5. Verify

```bash
# Check health
curl https://optionstrat-backend.fly.dev/health

# View logs
flyctl logs -a optionstrat-backend
```

## Your Backend URL

```
https://optionstrat-backend.fly.dev
```

Use this URL in your frontend environment variables.

## Common Commands

```bash
# View logs
flyctl logs -a optionstrat-backend

# Check status
flyctl status -a optionstrat-backend

# SSH into machine
flyctl ssh console -a optionstrat-backend

# Restart app
flyctl apps restart optionstrat-backend

# Scale up
flyctl scale count 2 -a optionstrat-backend

# Connect to database
flyctl postgres connect -a optionstrat-db
```

## Troubleshooting

### App won't start

```bash
# Check logs
flyctl logs -a optionstrat-backend

# Check secrets are set
flyctl secrets list -a optionstrat-backend
```

### Database connection issues

```bash
# Verify database is attached
flyctl postgres list

# Check database status
flyctl status -a optionstrat-db

# Reconnect database
flyctl postgres attach optionstrat-db --app optionstrat-backend
```

### Deployment fails

```bash
# Check Dockerfile syntax
docker build -t test .

# Check fly.toml configuration
flyctl config validate
```

## Cost

- **Backend:** ~$5-10/month (shared CPU, 256MB RAM)
- **Database:** ~$5-15/month (1GB storage)
- **Total:** ~$10-25/month

## Next Steps

1. Deploy frontend to Vercel
2. Update frontend to use Fly.io backend URL
3. Test end-to-end functionality
4. Set up monitoring and alerts

See `DEPLOYMENT.md` for complete documentation.
