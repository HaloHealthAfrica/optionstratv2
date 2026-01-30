# Webhook Diagnostic System - Deployment Checklist

## Pre-Deployment Checks

### 1. Review Changes

- [ ] Review enhanced logging in `supabase/functions/webhook/index.ts`
- [ ] Verify all diagnostic scripts are in `scripts/` directory
- [ ] Verify all documentation files are present

### 2. Test Locally (Optional)

If you have a local development environment:

- [ ] Test webhook handler locally
- [ ] Verify logging output format
- [ ] Test diagnostic scripts

---

## Deployment Steps

### Step 1: Deploy to Fly.io

```bash
cd optionstrat-main
fly deploy --app optionstrat-backend
```

**Expected output:**
```
==> Verifying app config
--> Verified app config
==> Building image
...
==> Deploying
...
--> v123 deployed successfully
```

**Verify deployment:**
```bash
fly status --app optionstrat-backend
```

### Step 2: Test Webhook Endpoint

```powershell
cd scripts
.\test-webhook.ps1
```

**Expected response:**
```json
{
  "signal_id": "...",
  "status": "PROCESSING",
  "correlation_id": "...",
  "processing_time_ms": 45,
  "system": "REFACTORED"
}
```

### Step 3: Check Enhanced Logging

```bash
fly logs --app optionstrat-backend --limit 50
```

**Look for:**
- `[correlation_id] Stage: RECEIPT, Status: RECEIVED`
- `[correlation_id] Stage: HMAC_VERIFICATION, Status: ...`
- `[correlation_id] Stage: JSON_PARSING, Status: SUCCESS`
- `[correlation_id] Stage: SIGNAL_STORAGE, Status: SUCCESS`

### Step 4: Verify Database

Run in Neon SQL Editor (https://console.neon.tech):

```sql
SELECT 
    'Signals (1h)' as metric,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
    'Orders (1h)' as metric,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM orders
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Expected:**
- At least 1 signal from test webhook
- Check if order was created (depends on decision logic)

---

## Post-Deployment Verification

### 1. Test Full Webhook Flow

```powershell
# Test webhook
.\test-webhook.ps1

# Note the correlation_id from response
# Example: "correlation_id": "abc-123-xyz"

# Check Fly.io logs for that correlation ID
fly logs --app optionstrat-backend | Select-String "abc-123-xyz"
```

**Verify you see:**
1. RECEIPT stage
2. HMAC_VERIFICATION stage
3. JSON_PARSING stage
4. SIGNAL_STORAGE stage
5. PIPELINE_PROCESSING stage
6. DECISION_MADE stage (if successful)
7. ORDER_CREATION stage (if decision = ENTER)

### 2. Test TradingView Integration

- [ ] Configure TradingView alert with webhook URL
- [ ] Trigger alert manually
- [ ] Check Fly.io logs for webhook receipt
- [ ] Check database for signal creation
- [ ] Verify order creation (if applicable)

### 3. Run Diagnostic Script

```powershell
$env:DATABASE_URL = "your-neon-connection-string"
.\quick-webhook-diagnostic.ps1
```

**Verify:**
- Database connection works
- Queries execute successfully
- Health report displays correctly

---

## Troubleshooting Deployment Issues

### Issue: Deployment Fails

**Check:**
```bash
fly logs --app optionstrat-backend
```

**Common causes:**
- Syntax errors in webhook handler
- Missing dependencies
- Configuration issues

**Fix:**
- Review error messages in logs
- Fix syntax errors
- Redeploy

### Issue: Webhook Returns 500 Error

**Check:**
```bash
fly logs --app optionstrat-backend
```

**Look for:**
- Exception stack traces
- Error messages with correlation ID

**Fix:**
- Review error in logs
- Check database connection
- Verify environment variables

### Issue: Enhanced Logging Not Appearing

**Check:**
```bash
fly logs --app optionstrat-backend | Select-String "Stage:"
```

**If no results:**
- Verify deployment completed successfully
- Check if old version is still running
- Force restart: `fly apps restart optionstrat-backend`

---

## Rollback Plan

If deployment causes issues:

### Option 1: Rollback to Previous Version

```bash
# List recent deployments
fly releases --app optionstrat-backend

# Rollback to previous version
fly releases rollback v122 --app optionstrat-backend
```

### Option 2: Quick Fix

If only logging is causing issues, you can temporarily reduce logging:

1. Comment out verbose log statements
2. Keep only critical error logging
3. Redeploy

---

## Configuration Checklist

### Fly.io Secrets

Verify all required secrets are set:

```bash
fly secrets list --app optionstrat-backend
```

**Required:**
- `DATABASE_URL` - Neon connection string
- `ALPACA_API_KEY` - Alpaca API key
- `ALPACA_SECRET_KEY` - Alpaca secret key
- `APP_MODE` - Should be "PAPER" for testing
- `JWT_SECRET` - For authentication

**Optional:**
- `HMAC_SECRET` - For webhook signature verification
- `WEBHOOK_SECRET` - Alternative to HMAC_SECRET

### Environment Variables

Verify in Fly.io dashboard or via CLI:

```bash
fly config show --app optionstrat-backend
```

---

## Monitoring Setup

### 1. Set Up Log Monitoring

**Option A: Fly.io Dashboard**
- Go to https://fly.io/dashboard
- Click `optionstrat-backend`
- Click `Monitoring` → `Logs`
- Keep this open during testing

**Option B: CLI**
```bash
fly logs --app optionstrat-backend -f
```

### 2. Set Up Database Monitoring

Create a bookmark in Neon SQL Editor with this query:

```sql
-- Webhook Health Check
SELECT 
    'Signals (1h)' as metric,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
    'Orders (1h)' as metric,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM orders
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
    'Failures (1h)' as metric,
    COUNT(*) as count,
    MAX(timestamp) as last_activity
FROM refactored_pipeline_failures
WHERE timestamp > NOW() - INTERVAL '1 hour';
```

Run this query every hour to monitor system health.

---

## Success Criteria

Deployment is successful when:

- [ ] Fly.io deployment completes without errors
- [ ] Test webhook returns 200 response
- [ ] Enhanced logging appears in Fly.io logs
- [ ] Correlation IDs are present in all log entries
- [ ] Test signal is created in database
- [ ] Diagnostic scripts execute successfully
- [ ] TradingView webhooks are received (if configured)
- [ ] No errors in Fly.io logs for 1 hour

---

## Next Steps After Deployment

1. **Monitor for 24 hours:**
   - Check Fly.io logs periodically
   - Run database health check query
   - Verify webhook activity

2. **Configure TradingView alerts:**
   - Set up alerts with correct webhook URL
   - Test with manual trigger
   - Monitor for automatic triggers

3. **Review and optimize:**
   - Review rejection reasons in database
   - Adjust risk limits if needed
   - Fine-tune decision logic

4. **Document any issues:**
   - Note any unexpected behavior
   - Update troubleshooting guide
   - Share findings with team

---

## Emergency Contacts

If critical issues arise:

1. **Rollback immediately** (see Rollback Plan above)
2. **Check Fly.io status:** https://status.fly.io
3. **Check Neon status:** https://neon.tech/status
4. **Review logs** for error patterns

---

## Deployment Complete! 🎉

Once all checks pass:

1. Mark deployment as successful
2. Update team on new diagnostic capabilities
3. Share documentation links:
   - [WEBHOOK_README.md](WEBHOOK_README.md)
   - [WEBHOOK_DIAGNOSTIC_GUIDE.md](WEBHOOK_DIAGNOSTIC_GUIDE.md)
   - [WEBHOOK_TROUBLESHOOTING.md](WEBHOOK_TROUBLESHOOTING.md)

4. Schedule follow-up review in 1 week to assess:
   - Webhook success rate
   - Common rejection reasons
   - System performance
   - Documentation improvements needed
