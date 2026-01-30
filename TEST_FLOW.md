# End-to-End Flow Testing Guide

**Date**: January 30, 2026  
**Purpose**: Verify complete data flow from webhook → signal → order → trade → position

---

## 🎯 Test Flow Overview

```
TradingView Webhook → Backend Processes Signal → Creates Order → 
Executes Trade (Paper) → Updates Position → Shows in Frontend
```

---

## Test 1: Send Test Webhook (Create Signal)

### Step 1.1: Send Webhook via curl

```bash
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "SPY",
    "action": "BUY",
    "strategy": "test-strategy",
    "timeframe": "5m",
    "price": 450.50,
    "signal_strength": 85,
    "timestamp": "2026-01-30T12:00:00Z"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "signal_id": "uuid-here",
  "message": "Signal processed successfully"
}
```

### Step 1.2: Verify in Frontend

1. Go to **Dashboard** page
2. Look at **Signals Table** (bottom of page)
3. Should see new signal:
   - Ticker: SPY
   - Action: BUY
   - Strategy: test-strategy
   - Status: PENDING or APPROVED

**Screenshot checkpoint**: Signal appears in table

---

## Test 2: Verify Signal Processing

### Step 2.1: Check Signal Details

In the **Signals Table**, you should see:
- ✅ Ticker: SPY
- ✅ Side: BUY
- ✅ Timeframe: 5m
- ✅ Strength: 85%
- ✅ Status: PENDING → APPROVED (may take a few seconds)

### Step 2.2: Check Backend Logs

```bash
fly logs --app optionstrat-backend
```

Look for:
```
[Webhook] Received signal for SPY
[Signal] Created signal: uuid-here
[Decision] Processing signal...
[Decision] Signal approved for execution
```

---

## Test 3: Verify Order Creation

### Step 3.1: Check Orders Page

1. Navigate to **Orders** page
2. Look at **Orders Tab**
3. Should see new order:
   - Symbol: SPY (with strike/expiration details)
   - Side: BUY
   - Qty: 1 (or configured quantity)
   - Status: PENDING → SUBMITTED → FILLED
   - Mode: PAPER

**Screenshot checkpoint**: Order appears with FILLED status

### Step 3.2: Check Order Details

Click the **eye icon** on the order to see details:
- ✅ Order ID
- ✅ Symbol details
- ✅ Quantity
- ✅ Fill price
- ✅ Timestamps (created, submitted, filled)
- ✅ Mode: PAPER

---

## Test 4: Verify Trade Execution

### Step 4.1: Check Trades Tab

1. Stay on **Orders** page
2. Click **Trades** tab
3. Should see executed trade:
   - Symbol: SPY
   - Side: BUY
   - Qty: 1
   - Price: ~$450.50 (or current market price)
   - Total Cost: calculated
   - Fees: $0.67 (paper trading simulation)

**Screenshot checkpoint**: Trade appears in table

### Step 4.2: Verify Trade Details

Trade should show:
- ✅ Execution time
- ✅ Execution price
- ✅ Commission ($0.65)
- ✅ Fees ($0.02)
- ✅ Total cost
- ✅ Mode: PAPER

---

## Test 5: Verify Position Creation

### Step 5.1: Check Positions Table

1. Go back to **Dashboard**
2. Look at **Positions Table**
3. Should see new position:
   - Underlying: SPY
   - Strike: (from order)
   - Type: CALL or PUT
   - Qty: 1
   - Entry Price: ~$450.50
   - Current P&L: $0.00 (just opened)
   - Status: OPEN

**Screenshot checkpoint**: Position appears in table

### Step 5.2: Check Position Details

Position should show:
- ✅ Entry time
- ✅ Entry price
- ✅ Current price (updating)
- ✅ Unrealized P&L
- ✅ % Change
- ✅ Days held: 0

---

## Test 6: Verify Analytics Update

### Step 6.1: Check Stats Cards

On **Dashboard**, stats should update:
- ✅ Total Positions: 1
- ✅ Open Positions: 1
- ✅ Total P&L: $0.00 (just opened)
- ✅ Win Rate: 0% (no closed positions yet)

### Step 6.2: Check History Page

1. Navigate to **History** page
2. **Overview Tab** should show:
   - Total P&L: $0.00
   - Today: $0.00
   - This Week: $0.00
   - This Month: $0.00

3. **Trade History Tab** should show:
   - 1 trade in the table
   - SPY trade details

---

## Test 7: Send Exit Signal (Close Position)

### Step 7.1: Send Exit Webhook

```bash
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "SPY",
    "action": "SELL",
    "strategy": "test-strategy",
    "timeframe": "5m",
    "price": 452.00,
    "signal_strength": 90,
    "timestamp": "2026-01-30T12:30:00Z"
  }'
```

**Expected**: Creates exit signal

### Step 7.2: Verify Exit Order

1. Go to **Orders** page
2. Should see new SELL order
3. Status: PENDING → FILLED
4. This closes the position

### Step 7.3: Verify Position Closed

1. Go to **Dashboard**
2. Position should show:
   - Status: CLOSED
   - Realized P&L: calculated (exit price - entry price)
   - Exit time: timestamp

### Step 7.4: Check Closed P&L

1. Go to **Orders** page
2. Click **Closed P&L** tab
3. Should see closed position:
   - Symbol: SPY
   - Entry: $450.50
   - Exit: $452.00
   - P&L: +$1.50 (or calculated amount)
   - % Gain: +0.33%

---

## Test 8: Verify Complete Analytics

### Step 8.1: Check Updated Stats

On **Dashboard**:
- ✅ Total Positions: 1
- ✅ Open Positions: 0
- ✅ Closed Positions: 1
- ✅ Total P&L: +$1.50
- ✅ Win Rate: 100%

### Step 8.2: Check History Charts

On **History** page:
- ✅ Cumulative P&L chart shows +$1.50
- ✅ Daily P&L bar shows +$1.50
- ✅ P&L by Underlying shows SPY: +$1.50
- ✅ Win Rate: 100%
- ✅ Profit Factor: calculated

---

## Test 9: Test Multiple Signals

### Step 9.1: Send Multiple Webhooks

```bash
# Signal 1: QQQ BUY
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "QQQ",
    "action": "BUY",
    "strategy": "momentum",
    "timeframe": "15m",
    "price": 380.00,
    "signal_strength": 80,
    "timestamp": "2026-01-30T13:00:00Z"
  }'

# Signal 2: IWM BUY
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "IWM",
    "action": "BUY",
    "strategy": "breakout",
    "timeframe": "30m",
    "price": 210.00,
    "signal_strength": 75,
    "timestamp": "2026-01-30T13:15:00Z"
  }'

# Signal 3: DIA BUY
curl -X POST https://optionstrat-backend.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "DIA",
    "action": "BUY",
    "strategy": "trend",
    "timeframe": "1h",
    "price": 420.00,
    "signal_strength": 85,
    "timestamp": "2026-01-30T13:30:00Z"
  }'
```

### Step 9.2: Verify Multiple Positions

1. **Dashboard** should show:
   - Open Positions: 3 (QQQ, IWM, DIA)
   - Signals: 4 total (SPY + 3 new)

2. **Positions Table** should show all 3 open positions

3. **Orders Page** should show 3 new orders

---

## Test 10: Test Market Positioning

### Step 10.1: Check Positioning Page

1. Navigate to **Positioning** page
2. Enter ticker: **SPY**
3. Select expiration: (next Friday)
4. Click **Analyze**

### Step 10.2: Verify Data Loads

Should see:
- ✅ Market Context Panel (if market data API configured)
- ✅ Put/Call Ratio card
- ✅ Max Pain card
- ✅ Gamma Exposure card
- ✅ Options Flow card (may show "no data" if Unusual Whales not configured)

**Note**: Some data may show "No data available" if market data APIs are not configured. This is expected.

---

## Test 11: Test Settings

### Step 11.1: Verify Trading Mode

1. Navigate to **Settings** page
2. **Trading Mode** tab should show:
   - ✅ Current Mode: PAPER
   - ✅ APP_MODE = LIVE: Disabled
   - ✅ ALLOW_LIVE_EXECUTION: Disabled
   - ✅ Warning banner about live trading

### Step 11.2: Verify Broker Config

1. Click **Brokers** tab
2. Should show:
   - ✅ Active Adapter: alpaca (or paper)
   - ✅ Alpaca: Configured
   - ✅ Preferred Broker: ALPACA

### Step 11.3: Test Exit Rules

1. Click **Exit Rules** tab
2. Should show current exit rules
3. Try editing a rule (e.g., profit target)
4. Click **Save**
5. Should see success message
6. Refresh page - changes should persist

---

## Test 12: Test Real-Time Updates (Polling)

### Step 12.1: Keep Dashboard Open

1. Open **Dashboard** in browser
2. Open **Browser DevTools** (F12)
3. Go to **Network** tab
4. Watch for repeated API calls

### Step 12.2: Verify Polling

Should see API calls every few seconds:
- `/health` - every 60 seconds
- `/stats` - every 30 seconds
- `/positions` - every 5 seconds
- `/signals` - every 10 seconds
- `/orders` - every 10 seconds

### Step 12.3: Send New Signal While Watching

1. Keep Dashboard open
2. Send a new webhook (use Test 1 command)
3. Watch the Signals Table
4. New signal should appear within 10 seconds (next polling cycle)

---

## 🐛 Common Issues & Solutions

### Issue 1: Webhook returns error

**Check:**
```bash
fly logs | grep webhook
```

**Common causes:**
- Missing HMAC_SECRET (if webhook verification enabled)
- Invalid JSON format
- Database connection issue

**Fix:**
- Verify JSON is valid
- Check backend logs for specific error
- Ensure DATABASE_URL is correct

### Issue 2: Signal created but no order

**Check:**
```bash
fly logs | grep decision
```

**Common causes:**
- Signal doesn't meet entry criteria
- Risk limits exceeded
- Market filters (time, MTF alignment)

**Fix:**
- Check signal strength threshold
- Verify risk limits in Settings
- Check if market is open (time filters)

### Issue 3: Order created but not filled

**Check:**
```bash
fly logs | grep order
```

**Common causes:**
- Paper adapter not configured
- Broker API error
- Invalid option symbol

**Fix:**
- Verify PREFERRED_BROKER is set
- Check broker credentials
- Verify option symbol format

### Issue 4: Data not updating in frontend

**Check:**
- Browser console for errors
- Network tab for failed requests
- Polling intervals

**Fix:**
- Clear browser cache
- Check VITE_API_URL is correct
- Verify backend is responding

---

## 📊 Success Criteria

Your system is working correctly if:

- [x] Webhooks create signals
- [x] Signals appear in dashboard within 10 seconds
- [x] Approved signals create orders
- [x] Orders execute as paper trades
- [x] Trades create/update positions
- [x] Positions show in dashboard
- [x] Analytics update correctly
- [x] All pages load without errors
- [x] Polling updates data automatically
- [x] Exit signals close positions
- [x] Closed positions show P&L

---

## 🎯 Next Steps After Testing

1. **Monitor for 24 hours** - Watch for any errors or issues
2. **Connect TradingView** - Set up real webhook URLs
3. **Test with real indicators** - Send actual trading signals
4. **Optimize settings** - Adjust risk limits, exit rules
5. **Paper trade for 1-2 weeks** - Build confidence
6. **Go live** - When ready for real money

---

## 📝 Test Results Template

Copy this and fill in as you test:

```
Test 1: Send Webhook
[ ] Webhook accepted (200 OK)
[ ] Signal appears in dashboard
[ ] Signal ID: _______________

Test 2: Signal Processing
[ ] Signal status: PENDING → APPROVED
[ ] Processing time: _____ seconds

Test 3: Order Creation
[ ] Order created
[ ] Order ID: _______________
[ ] Order status: FILLED

Test 4: Trade Execution
[ ] Trade appears in Trades tab
[ ] Trade ID: _______________
[ ] Execution price: $_______

Test 5: Position Creation
[ ] Position appears in dashboard
[ ] Position ID: _______________
[ ] Entry price: $_______

Test 6: Analytics Update
[ ] Stats cards updated
[ ] Total positions: _____
[ ] Open positions: _____

Test 7: Exit Signal
[ ] Exit webhook accepted
[ ] Exit order created
[ ] Position closed
[ ] Realized P&L: $_______

Test 8: Complete Analytics
[ ] Win rate: _____%
[ ] Total P&L: $_______
[ ] Charts updated

Test 9: Multiple Signals
[ ] 3 signals sent
[ ] 3 orders created
[ ] 3 positions open

Test 10: Market Positioning
[ ] Page loads
[ ] Data displays (or "no data" message)

Test 11: Settings
[ ] Trading mode shows PAPER
[ ] Broker config shows ALPACA
[ ] Exit rules can be edited

Test 12: Real-Time Updates
[ ] Polling working
[ ] Data updates automatically
[ ] No console errors
```

---

**Ready to start testing?** Begin with Test 1 and work through each test sequentially!
