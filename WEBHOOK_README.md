# Webhook Integration - Quick Reference

## 🚀 Quick Start

### Test Your Webhook

```powershell
cd scripts
.\test-webhook.ps1
```

### Check If Webhooks Are Working

```powershell
# Set your database URL
$env:DATABASE_URL = "your-neon-connection-string"

# Run diagnostics
.\quick-webhook-diagnostic.ps1
```

---

## 📋 Documentation

| Document | Purpose |
|----------|---------|
| [WEBHOOK_DIAGNOSTIC_GUIDE.md](WEBHOOK_DIAGNOSTIC_GUIDE.md) | Step-by-step diagnostic guide with decision tree |
| [WEBHOOK_TROUBLESHOOTING.md](WEBHOOK_TROUBLESHOOTING.md) | Detailed troubleshooting for common issues |
| [WEBHOOK_DIAGNOSTIC_SUMMARY.md](WEBHOOK_DIAGNOSTIC_SUMMARY.md) | Implementation summary and monitoring guide |

---

## 🔧 Diagnostic Tools

### PowerShell Scripts

| Script | Purpose |
|--------|---------|
| `scripts/test-webhook.ps1` | Test webhook endpoint manually |
| `scripts/quick-webhook-diagnostic.ps1` | Automated diagnostic checks |
| `scripts/check-webhook-activity.ps1` | Database activity verification |

### SQL Queries

| File | Purpose |
|------|---------|
| `scripts/check-webhook-activity.sql` | All diagnostic SQL queries |

---

## 🐛 Common Issues

### No Webhooks Received

**Check:**
1. Fly.io logs: `fly logs --app optionstrat-backend`
2. TradingView webhook URL: `https://optionstrat-backend.fly.dev/webhook`
3. Test manually: `.\test-webhook.ps1`

**Fix:** Verify TradingView alert configuration

---

### HMAC Signature Failures

**Check:**
- Fly.io logs for: `Stage: HMAC_VERIFICATION, Status: FAILED`

**Fix:**
```bash
# Temporarily disable HMAC
fly secrets unset HMAC_SECRET --app optionstrat-backend
```

---

### Signals But No Orders

**Check:**
```sql
SELECT decision, COUNT(*) 
FROM refactored_decisions 
GROUP BY decision;
```

**Fix:**
- If no decisions: Check pipeline failures
- If decisions = 'SKIP': Check reasoning field
- Send context webhook if missing

---

### Orders But No Trades

**Check:**
```sql
SELECT status, COUNT(*) 
FROM orders 
GROUP BY status;
```

**Fix:**
- Verify Alpaca API keys
- Check adapter_logs table
- Verify APP_MODE=PAPER

---

## 📊 Monitoring

### Daily Health Check

```sql
-- Run in Neon SQL Editor
SELECT 
    'Signals (24h)' as metric,
    COUNT(*) as count
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Orders (24h)' as metric,
    COUNT(*) as count
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Trades (24h)' as metric,
    COUNT(*) as count
FROM trades
WHERE executed_at > NOW() - INTERVAL '24 hours';
```

### Check Fly.io Logs

```bash
# View recent logs
fly logs --app optionstrat-backend

# Filter for webhooks
fly logs --app optionstrat-backend | grep "WEBHOOK"

# Follow in real-time
fly logs --app optionstrat-backend -f
```

---

## 🔍 Diagnostic Flow

```
1. Test webhook manually
   ↓
2. Check Fly.io logs
   ↓
3. Check database (signals, orders, trades)
   ↓
4. Identify issue using decision tree
   ↓
5. Apply fix from troubleshooting guide
   ↓
6. Test again
```

---

## 📞 Getting Help

1. **Run diagnostics:**
   ```powershell
   .\quick-webhook-diagnostic.ps1
   ```

2. **Collect information:**
   - Fly.io logs (last 50 lines)
   - SQL summary query results
   - Correlation ID from test webhook

3. **Check documentation:**
   - [Diagnostic Guide](WEBHOOK_DIAGNOSTIC_GUIDE.md)
   - [Troubleshooting Guide](WEBHOOK_TROUBLESHOOTING.md)

---

## 🎯 TradingView Configuration

### Webhook URL
```
https://optionstrat-backend.fly.dev/webhook
```

### Alert Message Format
```json
{
  "action": "BUY",
  "ticker": "SPY",
  "strike": 580,
  "expiration": "2025-02-28",
  "type": "CALL",
  "qty": 1
}
```

### Alert Settings
- **Method:** POST
- **Content-Type:** application/json

---

## ✅ System Status

Check if your system is working:

| Check | Command | Expected Result |
|-------|---------|-----------------|
| Webhooks received | `fly logs \| grep RECEIPT` | See log entries |
| Signals created | SQL query | Count > 0 |
| Orders created | SQL query | Count > 0 |
| Trades executed | SQL query | Count > 0 |

---

## 🚀 Next Steps

1. **Deploy enhanced logging:**
   ```bash
   fly deploy --app optionstrat-backend
   ```

2. **Test webhook:**
   ```powershell
   .\test-webhook.ps1
   ```

3. **Monitor logs:**
   ```bash
   fly logs --app optionstrat-backend -f
   ```

4. **Set up TradingView alerts** with correct webhook configuration

---

For detailed information, see the full documentation files listed above.
