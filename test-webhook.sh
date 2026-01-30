#!/bin/bash

# Test Webhook Script
# Usage: ./test-webhook.sh

BACKEND_URL="https://optionstrat-backend.fly.dev"

echo "========================================="
echo "Testing OptionStrat Backend"
echo "========================================="
echo ""

# Test 1: Health Check
echo "Test 1: Health Check"
echo "-------------------"
curl -s "$BACKEND_URL/health" | jq '.'
echo ""
echo ""

# Test 2: Send BUY Signal for SPY
echo "Test 2: Send BUY Signal (SPY)"
echo "----------------------------"
curl -s -X POST "$BACKEND_URL/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "SPY",
    "action": "BUY",
    "strategy": "test-strategy",
    "timeframe": "5m",
    "price": 450.50,
    "signal_strength": 85,
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }' | jq '.'
echo ""
echo ""

# Wait 5 seconds
echo "Waiting 5 seconds for signal processing..."
sleep 5
echo ""

# Test 3: Check Signals
echo "Test 3: Check Signals"
echo "--------------------"
curl -s "$BACKEND_URL/signals?limit=5" | jq '.'
echo ""
echo ""

# Test 4: Check Orders
echo "Test 4: Check Orders"
echo "-------------------"
curl -s "$BACKEND_URL/orders?limit=5" | jq '.'
echo ""
echo ""

# Test 5: Check Positions
echo "Test 5: Check Positions"
echo "----------------------"
curl -s "$BACKEND_URL/positions?limit=5" | jq '.'
echo ""
echo ""

echo "========================================="
echo "Testing Complete!"
echo "========================================="
echo ""
echo "Next Steps:"
echo "1. Check your frontend at: https://optionstratv2.vercel.app"
echo "2. Look for the signal in the Signals table"
echo "3. Check Orders page for new order"
echo "4. Check Dashboard for new position"
echo ""
