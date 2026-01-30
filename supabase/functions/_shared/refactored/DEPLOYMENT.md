# Deployment Guide: Refactored Trading System

## Pre-Deployment Checklist

### 1. Environment Setup

- [ ] Deno runtime installed (v1.37+)
- [ ] Supabase CLI installed
- [ ] Git repository up to date
- [ ] Staging environment available for testing

### 2. Configuration Review

- [ ] Review `core/config.ts` settings
- [ ] Verify environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `WEBHOOK_SECRET`
  - `NODE_ENV`

### 3. Testing

- [ ] All unit tests passing
- [ ] All property-based tests passing (100+ iterations)
- [ ] Integration tests passing
- [ ] Manual testing in staging completed

### 4. Backup

- [ ] Database backup created
- [ ] Current webhook handler backed up
- [ ] Configuration files backed up

## Deployment Steps

### Step 1: Deploy Database Migrations

```bash
# Review pending migrations
ls supabase/migrations

# Apply migrations (Neon/Fly Postgres)
psql "$DATABASE_URL" -f supabase/migrations/<latest>.sql

# Verify schema
psql "$DATABASE_URL" -c "\dt"
```

**Expected Tables:**
- `signals`
- `positions`
- `decisions`
- `gex_signals`
- `context_snapshots`
- `processing_errors`

### Step 2: Deploy Fly Backend

```bash
# Deploy backend to Fly.io
flyctl deploy -a optionstrat-backend
```

**Verify Deployment:**
```bash
# Check application logs
flyctl logs -a optionstrat-backend
```

### Step 3: Configure Environment Variables

```bash
# Set environment variables for Fly.io app
flyctl secrets set WEBHOOK_SECRET=your_secret_here -a optionstrat-backend
flyctl secrets set NODE_ENV=production -a optionstrat-backend

# Verify secrets
flyctl secrets list -a optionstrat-backend
```

### Step 4: Test Deployed Functions

#### Test Health Endpoint

```bash
curl https://optionstrat-backend.fly.dev/health
```

**Expected Response:**
```json
{
  "healthy": true,
  "status": "healthy",
  "message": "All systems operational",
  "timestamp": "2024-01-29T...",
  "components": {
    "context": { "healthy": true, ... },
    "gex": { "healthy": true, ... },
    "database": { "healthy": true, ... }
  }
}
```

#### Test Metrics Endpoint

```bash
curl https://optionstrat-backend.fly.dev/metrics
```

**Expected Response:**
```json
{
  "signals": {
    "totalSignals": 0,
    "acceptedSignals": 0,
    "rejectedSignals": 0,
    "acceptanceRate": 0
  },
  "positions": {
    "openPositions": 0,
    "totalExposure": 0,
    "unrealizedPnL": 0,
    "realizedPnL": 0
  },
  "latency": { ... }
}
```

#### Test Webhook with Sample Signal

```bash
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -H "x-signature: your_signature" \
  -d '{
    "source": "TradingView",
    "symbol": "SPY",
    "direction": "CALL",
    "timeframe": "5m",
    "timestamp": "2024-01-29T12:00:00Z",
    "metadata": {
      "score": 85,
      "confidence": 0.85
    }
  }'
```

**Expected Response:**
```json
{
  "status": "ACCEPTED",
  "message": "Signal received and queued for processing",
  "correlation_id": "...",
  "processing_time_ms": 5,
  "system": "REFACTORED"
}
```

### Step 5: Monitor Initial Traffic

```bash
# Watch webhook logs in real-time
flyctl logs -a optionstrat-backend --tail

# Check for errors
flyctl logs -a optionstrat-backend | grep ERROR

# Monitor database
psql "$DATABASE_URL"
```

### Step 6: Verify Frontend Integration

1. Open frontend dashboard
2. Verify real-time updates working
3. Check positions table displays correctly
4. Verify signals table shows new signals
5. Confirm health status displays

## Post-Deployment Validation

### Immediate Checks (First 15 minutes)

- [ ] Health endpoint returns 200 OK
- [ ] Metrics endpoint returns data
- [ ] Webhook accepts test signals
- [ ] No errors in function logs
- [ ] Database writes successful
- [ ] Frontend displays updates

### Short-term Monitoring (First Hour)

- [ ] Signal processing latency < 100ms
- [ ] Decision latency < 500ms
- [ ] No degraded mode alerts
- [ ] Context cache hit rate > 80%
- [ ] No duplicate signal issues
- [ ] Position tracking accurate

### Long-term Monitoring (First Day)

- [ ] Signal acceptance rate within expected range
- [ ] No memory leaks in functions
- [ ] Database performance stable
- [ ] Audit logs complete
- [ ] No unexpected errors
- [ ] Frontend performance good

## Rollback Procedure

If issues occur, follow this rollback procedure:

### Immediate Rollback

```bash
# Revert to previous webhook deployment
git checkout HEAD~1 -- supabase/functions/webhook/index.ts

# Redeploy previous version
flyctl deploy -a optionstrat-backend

# Verify rollback
curl https://optionstrat-backend.fly.dev/webhook
```

### Database Rollback

```bash
# Revert database migrations (restore from backup)
psql "$DATABASE_URL" < backup_file.sql
```

### Verify Rollback

- [ ] Webhook processing signals
- [ ] Database writes working
- [ ] Frontend displays correctly
- [ ] No errors in logs

## Troubleshooting

### Issue: Webhook Returns 500 Error

**Diagnosis:**
```bash
flyctl logs -a optionstrat-backend | tail -50
```

**Common Causes:**
- Missing environment variables
- Database connection failure
- Invalid configuration

**Solution:**
1. Check environment variables
2. Verify database connectivity
3. Review configuration settings
4. Check function logs for specific error

### Issue: High Latency

**Diagnosis:**
```bash
curl https://optionstrat-backend.fly.dev/metrics/latency
```

**Common Causes:**
- Context cache misses
- Slow database queries
- External API timeouts

**Solution:**
1. Check context cache hit rate
2. Review database query performance
3. Monitor external service response times
4. Consider increasing cache TTL

### Issue: Signals Not Processing

**Diagnosis:**
```bash
# Check health
curl https://optionstrat-backend.fly.dev/health

# Check recent signals
psql "$DATABASE_URL" -c "SELECT * FROM signals ORDER BY created_at DESC LIMIT 10"
```

**Common Causes:**
- Validation failures
- Deduplication rejections
- Market hours restrictions

**Solution:**
1. Review validation errors in database
2. Check signal format matches schema
3. Verify market hours configuration
4. Review deduplication cache settings

### Issue: Degraded Mode

**Diagnosis:**
```bash
curl https://optionstrat-backend.fly.dev/health
```

**Common Causes:**
- GEX service unavailable
- Context fetch failures
- Database connectivity issues

**Solution:**
1. Check service health status
2. Review recent errors
3. Verify external service availability
4. Check database connection pool

## Performance Optimization

### Cache Tuning

Adjust cache TTL based on performance:

```typescript
// In core/config.ts
cache: {
  contextTTLSeconds: 60,  // Increase for better cache hit rate
  deduplicationTTLSeconds: 60,
}
```

### Database Indexing

Ensure proper indexes exist:

```sql
-- Check existing indexes
SELECT * FROM pg_indexes WHERE tablename IN ('signals', 'positions', 'decisions');

-- Add missing indexes if needed
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_positions_is_closed ON positions(is_closed);
```

### Function Memory

Adjust function memory if needed:

```bash
# Increase memory allocation
flyctl scale memory 512 -a optionstrat-backend
```

## Monitoring Setup

### Set Up Alerts

Configure alerts for:
- Function errors (> 5 per minute)
- High latency (> 1 second)
- Degraded mode activation
- Low signal acceptance rate (< 50%)

### Dashboard Setup

Create monitoring dashboard with:
- Signal processing rate
- Decision latency
- Position count and exposure
- Error rate
- Cache hit rate

### Log Aggregation

Set up log aggregation for:
- Error tracking
- Performance analysis
- Audit trail queries
- Debugging

## Maintenance

### Regular Tasks

**Daily:**
- Review error logs
- Check health endpoint
- Monitor metrics
- Verify signal processing

**Weekly:**
- Review performance trends
- Check database size
- Analyze rejection reasons
- Update documentation

**Monthly:**
- Review configuration
- Optimize database queries
- Update dependencies
- Conduct load testing

## Support Contacts

For deployment issues:
1. Check this deployment guide
2. Review function logs
3. Consult README.md
4. Check END_TO_END_REVIEW.md

## Appendix

### Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key for database access |
| `WEBHOOK_SECRET` | Yes | Secret for webhook signature verification |
| `NODE_ENV` | No | Environment (development/production) |

### Function Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webhook` | POST | Receive trading signals |
| `/health` | GET | System health check |
| `/health/context` | GET | Context cache health |
| `/health/gex` | GET | GEX service health |
| `/health/database` | GET | Database health |
| `/metrics` | GET | Full metrics snapshot |
| `/metrics/signals` | GET | Signal metrics |
| `/metrics/positions` | GET | Position metrics |
| `/metrics/latency` | GET | Latency statistics |

### Database Tables

| Table | Purpose |
|-------|---------|
| `signals` | Incoming signals |
| `positions` | Open/closed positions |
| `decisions` | Entry/exit decisions |
| `gex_signals` | GEX signal data |
| `context_snapshots` | Market context data |
| `processing_errors` | Error logs |
