#!/bin/bash

# Production Launch Validation Script
# This script validates all critical systems before going live

set -e

BACKEND_URL="${BACKEND_URL:-https://optionstrat-backend.fly.dev}"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="SecureTestPass123!"

echo ""
echo "🚀 Production Launch Validation"
echo "=================================="
echo ""
echo "Backend URL: $BACKEND_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Helper function
test_endpoint() {
  local name=$1
  local result=$2
  
  if [ $result -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}: $name"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: $name"
    ((FAILED++))
  fi
}

# 1. Health Check
echo "1️⃣  Testing Health Endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/health")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "$HEALTH_BODY" | jq . 2>/dev/null || echo "$HEALTH_BODY"
  test_endpoint "Health endpoint" 0
else
  echo "HTTP $HTTP_CODE"
  test_endpoint "Health endpoint" 1
fi
echo ""

# 2. Database Connection
echo "2️⃣  Testing Database Connection..."
DB_STATUS=$(echo "$HEALTH_BODY" | jq -r '.database_connected // "unknown"' 2>/dev/null)
if [ "$DB_STATUS" = "true" ]; then
  test_endpoint "Database connection" 0
else
  test_endpoint "Database connection" 1
fi
echo ""

# 3. Authentication - Register
echo "3️⃣  Testing Authentication - Register..."
REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")
REGISTER_CODE=$(echo "$REGISTER_RESPONSE" | tail -n1)
REGISTER_BODY=$(echo "$REGISTER_RESPONSE" | head -n-1)

if [ "$REGISTER_CODE" = "200" ] || [ "$REGISTER_CODE" = "201" ]; then
  echo "$REGISTER_BODY" | jq . 2>/dev/null || echo "$REGISTER_BODY"
  test_endpoint "User registration" 0
else
  echo "HTTP $REGISTER_CODE"
  echo "$REGISTER_BODY"
  test_endpoint "User registration" 1
fi
echo ""

# 4. Authentication - Login
echo "4️⃣  Testing Authentication - Login..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")
LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | head -n-1)

if [ "$LOGIN_CODE" = "200" ]; then
  TOKEN=$(echo "$LOGIN_BODY" | jq -r '.token // .access_token // ""' 2>/dev/null)
  if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo "Token received: ${TOKEN:0:20}..."
    test_endpoint "User login" 0
  else
    echo "No token in response"
    test_endpoint "User login" 1
  fi
else
  echo "HTTP $LOGIN_CODE"
  echo "$LOGIN_BODY"
  test_endpoint "User login" 1
fi
echo ""

# 5. Protected Endpoint
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo "5️⃣  Testing Protected Endpoint..."
  ME_RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/auth/me" \
    -H "Authorization: Bearer $TOKEN")
  ME_CODE=$(echo "$ME_RESPONSE" | tail -n1)
  ME_BODY=$(echo "$ME_RESPONSE" | head -n-1)

  if [ "$ME_CODE" = "200" ]; then
    echo "$ME_BODY" | jq . 2>/dev/null || echo "$ME_BODY"
    test_endpoint "Protected endpoint" 0
  else
    echo "HTTP $ME_CODE"
    test_endpoint "Protected endpoint" 1
  fi
  echo ""
fi

# 6. Webhook Endpoint
echo "6️⃣  Testing Webhook Endpoint..."
WEBHOOK_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "test_validation",
    "symbol": "SPY",
    "direction": "CALL",
    "timeframe": "5m",
    "signal_strength": 0.85
  }')
WEBHOOK_CODE=$(echo "$WEBHOOK_RESPONSE" | tail -n1)
WEBHOOK_BODY=$(echo "$WEBHOOK_RESPONSE" | head -n-1)

if [ "$WEBHOOK_CODE" = "200" ]; then
  echo "$WEBHOOK_BODY" | jq . 2>/dev/null || echo "$WEBHOOK_BODY"
  test_endpoint "Webhook endpoint" 0
else
  echo "HTTP $WEBHOOK_CODE"
  echo "$WEBHOOK_BODY"
  test_endpoint "Webhook endpoint" 1
fi
echo ""

# 7. Exit Worker (Dry Run)
echo "7️⃣  Testing Exit Worker (Dry Run)..."
EXIT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/refactored-exit-worker?dry_run=true")
EXIT_CODE=$(echo "$EXIT_RESPONSE" | tail -n1)
EXIT_BODY=$(echo "$EXIT_RESPONSE" | head -n-1)

if [ "$EXIT_CODE" = "200" ]; then
  echo "$EXIT_BODY" | jq . 2>/dev/null || echo "$EXIT_BODY"
  test_endpoint "Exit worker" 0
else
  echo "HTTP $EXIT_CODE"
  echo "$EXIT_BODY"
  test_endpoint "Exit worker" 1
fi
echo ""

# 8. Positions Endpoint
echo "8️⃣  Testing Positions Endpoint..."
POSITIONS_RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/positions")
POSITIONS_CODE=$(echo "$POSITIONS_RESPONSE" | tail -n1)
POSITIONS_BODY=$(echo "$POSITIONS_RESPONSE" | head -n-1)

if [ "$POSITIONS_CODE" = "200" ]; then
  POSITION_COUNT=$(echo "$POSITIONS_BODY" | jq '.positions | length // 0' 2>/dev/null || echo "0")
  echo "Positions found: $POSITION_COUNT"
  test_endpoint "Positions endpoint" 0
else
  echo "HTTP $POSITIONS_CODE"
  test_endpoint "Positions endpoint" 1
fi
echo ""

# 9. Signals Endpoint
echo "9️⃣  Testing Signals Endpoint..."
SIGNALS_RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/signals?limit=10")
SIGNALS_CODE=$(echo "$SIGNALS_RESPONSE" | tail -n1)
SIGNALS_BODY=$(echo "$SIGNALS_RESPONSE" | head -n-1)

if [ "$SIGNALS_CODE" = "200" ]; then
  SIGNAL_COUNT=$(echo "$SIGNALS_BODY" | jq '.signals | length // 0' 2>/dev/null || echo "0")
  echo "Signals found: $SIGNAL_COUNT"
  test_endpoint "Signals endpoint" 0
else
  echo "HTTP $SIGNALS_CODE"
  test_endpoint "Signals endpoint" 1
fi
echo ""

# Summary
echo "=================================="
echo "📊 Validation Summary"
echo "=================================="
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed! Ready for production.${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}⚠️  Some tests failed. Please review and fix before going live.${NC}"
  echo ""
  exit 1
fi
