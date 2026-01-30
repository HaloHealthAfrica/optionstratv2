# Webhook Diagnostic System - Implementation Summary

## Overview

This document summarizes the webhook diagnostic enhancements implemented to help diagnose and fix webhook integration issues.

---

## What Was Implemented

### 1. Enhanced Webhook Logging ✅

**File:** `optionstrat-main/supabase/functions/webhook/index.ts`

Added comprehensive stage-by-stage logging with correlation IDs:

- **RECEIPT** - Webhook received with method and headers
- **HMAC_VERIFICATION** - Signature verification status
- **JSON_PARSING** - JSON parsing results
- **CONTEXT_WEBHOOK** - Context webhook processing
- **SIGNAL_PARSING** - Signal parsing with source detection
- **SIGNAL_STORAGE** - Signal storage and duplicate detection
- **PIPELINE_PROCESSING** - Pipeline processing status
- **DECISION_MADE** - Decision results with confidence
- **ORDER_CREATION** - Order preparation and submission
- **ORDER_SUBMISSION** - Adapter submission results
- **TRADE_EXECUTION** - Trade execution details
- **ERROR_HANDLING** - Comprehensive error logging

**Log Format:**
```
[correlation_id] Stage: STAGE_NAME, Status: STATUS, Details: ...
```

### 2. Diagnostic SQL Queries ✅

**File:** `optionstrat-main/scripts/check-webhook-activity.sql`

Comprehensive queries to check:
- Recent signals (last 24 hours)
- Signal count by hour
- Signal count by source
- Recent orders
- Signal-to-order conversion rate
- Active positions
- Recent trades
- Signal processing errors
- Pipeline failures
- Decision records
- Quick summary across all tables

### 3. PowerShell Diagnostic Scripts ✅

**Files:**
- `optionstrat-main/scripts/quick-webhook-diagnostic.ps1` - Automated diagnostic checks
- `optionstrat-main/scripts/test-webhook.ps1` - Manual webhook testing
- `optionstrat-main/scripts/check-webhook-activity.ps1` - Database activity checking

**Features:**
- Database connection testing
- Fly.io log checking instructions
- Diagnostic query execution
- Health report generation
- Troubleshooting guidance

### 4. Comprehensive Documentation ✅

**Files:**
- `optionstrat-main/WEBHOOK_DIAGNOSTIC_GUIDE.md` - Step-by-step diagnostic guide
- `optionstrat-main/WEBHOOK_TROUBLESHOOTING.md` - Detailed troubleshooting guide

**Contents:**
- Quick diagnostic steps
- Common issues and solutions
- Log interpretation guide
- Database query examples
- TradingView configuration guide
- Manual testing procedures

---

## How to Use the Diagnostic System

### Quick Start (5 Minutes)

1. **Test the webhook endpoint:**
   ```powershell
   cd optionstrat-main/scripts
   .\test-webhook.ps1
   ```

2. **Check Fly.io logs:**
   - Go to https://fly.io/dashboard
   - Click `optionstrat-backend` → `Monitoring` → `Logs`
   - Look for `[correlation_id]` entries

3. **Check database:**
   - Go to https://console.neon.tech
   - Run the quick summary query from `check-webhook-activity.sql`

### Full Diagnostic Flow

1. **Run automated diagnostic:**
   ```powershell
   $env:DATABASE_URL = "your-neon-connection-string"
   .\quick-webhook-diagnostic.ps1
   ```

2. **Follow the decision tree:**
   - No logs → TradingView config issue
   - Logs but no signals → HMAC or parsing issue
   - Signals but no orders → Decision logic issue
   - Orders but no trades → Alpaca connection issue

3. **Apply fixes from troubleshooting guide**

---

## Diagnostic Decision Tree

```
Are webhooks in Fly.io logs?
├─ NO → Check TradingView webhook configuration
│       URL: https://optionstrat-backend.fly.dev/webhook
│       Method: POST
│       Content-Type: application/json
│
└─ YES → Are signals in database?
    ├─ NO → Check for HMAC failures or parsing errors
    │       - Review logs for "Invalid signature"
    │       - Review logs for "Invalid JSON payload"
    │       - Temporarily disable HMAC: fly secrets unset HMAC_SECRET
    │
    └─ YES → Are orders in database?
        ├─ NO → Check decision logic
        │       - Query refactored_decisions table
        │       - Check if decisions are SKIP
        │       - Verify context data exists
        │       - Check risk limits
        │
        └─ YES → Are trades in database?
            ├─ NO → Check Alpaca connection
            │       - Verify ALPACA_API_KEY
            │       - Verify ALPACA_SECRET_KEY
            │       - Check adapter_logs table
            │
            └─ YES → ✅ System is working!
```

---

## Key Features

### Correlation ID Tracking

Every webhook gets a unique correlation ID that appears in all logs:

```
[abc-123-xyz] Stage: RECEIPT, Status: RECEIVED
[abc-123-xyz] Stage: HMAC_VERIFICATION, Status: SKIPPED
[abc-123-xyz] Stage: JSON_PARSING, Status: SUCCESS
[abc-123-xyz] Stage: SIGNAL_STORAGE, Status: SUCCESS
```

This makes it easy to trace a single webhook through the entire system.

### Stage-by-Stage Visibility

Each processing stage logs its status:
- **RECEIVED** - Stage started
- **SUCCESS** - Stage completed successfully
- **FAILED** - Stage failed with reason
- **SKIPPED** - Stage skipped (e.g., HMAC when not configured)

### Comprehensive Error Details

All errors include:
- Correlation ID
- Stage where error occurred
- Error message
- Stack trace (for exceptions)
- Relevant context (payload, signal ID, etc.)

---

## Common Issues & Quick Fixes

### Issue 1: No Webhooks Received

**Quick Fix:**
```bash
# Test webhook manually
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{"action":"BUY","ticker":"SPY","strike":580,"expiration":"2025-02-28","type":"CALL","qty":1}'
```

If this works but TradingView doesn't, check TradingView alert configuration.

### Issue 2: HMAC Failures

**Quick Fix:**
```bash
# Temporarily disable HMAC
fly secrets unset HMAC_SECRET --app optionstrat-backend

# Test webhook
.\test-webhook.ps1

# Re-enable HMAC
fly secrets set HMAC_SECRET="your-secret" --app optionstrat-backend
```

### Issue 3: No Context Data

**Quick Fix:**
```bash
# Send context webhook
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CONTEXT",
    "ticker": "SPY",
    "price": 580.50,
    "timestamp": "2025-01-30T12:00:00Z",
    "volatility": {"vix": 15.5, "vix_regime": "NORMAL"},
    "market": {"spy_trend": "BULLISH", "market_bias": "BULLISH"}
  }'
```

---

## Monitoring & Maintenance

### Daily Checks

1. **Check webhook activity:**
   ```sql
   SELECT COUNT(*) FROM refactored_signals 
   WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

2. **Check conversion rate:**
   ```sql
   SELECT 
       COUNT(DISTINCT s.id) as signals,
       COUNT(DISTINCT o.id) as orders,
       ROUND(COUNT(DISTINCT o.id)::numeric / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 2) as conversion_rate
   FROM refactored_signals s
   LEFT JOIN orders o ON o.signal_id = s.metadata->>'original_signal_id'
   WHERE s.created_at > NOW() - INTERVAL '24 hours';
   ```

3. **Check for errors:**
   ```sql
   SELECT COUNT(*) FROM refactored_pipeline_failures 
   WHERE timestamp > NOW() - INTERVAL '24 hours';
   ```

### Weekly Checks

1. **Review rejection reasons:**
   ```sql
   SELECT 
       reason,
       COUNT(*) as count
   FROM refactored_pipeline_failures
   WHERE timestamp > NOW() - INTERVAL '7 days'
   GROUP BY reason
   ORDER BY count DESC;
   ```

2. **Review decision distribution:**
   ```sql
   SELECT 
       decision,
       COUNT(*) as count,
       AVG(confidence) as avg_confidence
   FROM refactored_decisions
   WHERE created_at > NOW() - INTERVAL '7 days'
   GROUP BY decision;
   ```

---

## Next Steps

### Immediate Actions

1. **Deploy enhanced logging to Fly.io:**
   ```bash
   cd optionstrat-main
   fly deploy --app optionstrat-backend
   ```

2. **Test webhook flow:**
   ```powershell
   .\scripts\test-webhook.ps1
   ```

3. **Check Fly.io logs for detailed output:**
   ```bash
   fly logs --app optionstrat-backend
   ```

### Ongoing Monitoring

1. Set up alerts for:
   - Zero webhook activity for > 1 hour
   - High rejection rate (> 50%)
   - Pipeline failures

2. Review logs weekly to identify patterns

3. Update risk limits based on performance

---

## Files Reference

### Scripts
- `scripts/test-webhook.ps1` - Test webhook endpoint
- `scripts/quick-webhook-diagnostic.ps1` - Automated diagnostics
- `scripts/check-webhook-activity.ps1` - Database activity check
- `scripts/check-webhook-activity.sql` - SQL diagnostic queries

### Documentation
- `WEBHOOK_DIAGNOSTIC_GUIDE.md` - Step-by-step guide
- `WEBHOOK_TROUBLESHOOTING.md` - Detailed troubleshooting
- `WEBHOOK_DIAGNOSTIC_SUMMARY.md` - This file

### Code
- `supabase/functions/webhook/index.ts` - Enhanced webhook handler

---

## Support

If you encounter issues not covered in this documentation:

1. Collect diagnostic information:
   - Run `.\quick-webhook-diagnostic.ps1`
   - Copy Fly.io logs for a specific correlation ID
   - Run SQL summary query

2. Check the troubleshooting guide for your specific issue

3. Review Fly.io logs for the complete webhook flow using correlation ID

The enhanced logging and diagnostic tools should make it much easier to identify and fix webhook integration issues.
