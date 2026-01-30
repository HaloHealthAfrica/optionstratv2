#!/bin/bash

# Pre-Launch Validation Script
# Run this before switching to live trading

set -e

echo ""
echo "🚀 Pre-Launch Validation Script"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="${BACKEND_URL:-https://optionstrat-backend.fly.dev}"
TEST_EMAIL="${TEST_EMAIL:-test@example.com}"
TEST_PASSWORD="${TEST_PASSWORD:-TestPassword123!}"

# Track results
PASSED=0
FAILED=0

# Helper functions
pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  PASSED=$((PASSED + 1))
}

fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  FAILED=$((FAILED + 1))
}

warn() {
  echo -e "${YELLOW}⚠️  WARN${NC}: $1"
}

# 1. Database Connection
echo "1️⃣ Checking database connection..."
if [ -z "$DATABASE_URL" ]; then
  fail "DATABASE_URL not set"
else
  if psql "$DATABASE_URL" -c "SELECT 'Database connected' as status;" > /dev/null 2>&1; then
    pass "Database connection"
  else
    fail "Database connection"
  fi
fi
echo ""

# 2. Health Endpoint
echo "2️⃣ Checking health endpoint..."
HEALTH_RESPONSE=$(curl -s -f "$BACKEND_URL/health" || echo "FAILED")
if [ "$HEALTH_RESPONSE" = "FAILED" ]; then
  fail "Health endpoint not responding"
else
  pass "Health endpoint responding"
  echo "   Response: $(echo $HEALTH_RESPONSE | jq -c '.')"
fi
echo ""

# 3. Database Tables
echo "3️⃣ Verifying database tables..."
if [ ! -z "$DATABASE_URL" ]; then
  # Check app_users
  if psql "$DATABASE_URL" -c "SELECT 1 FROM app_users LIMIT 1;" > /dev/null 2>&1; then
    pass "app_users table exists"
  else
    fail "app_users table missing"
  fi

  # Check orders columns
  COLUMNS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'orders' AND column_name IN ('refactored_position_id', 'exit_action', 'exit_quantity');")
  if [ "$COLUMNS" -eq 3 ]; then
    pass "orders exit metadata columns (3/3)"
  else
    fail "orders exit metadata columns ($COLUMNS/3)"
  fi

  # Check refactored tables
  REFACTORED_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'refactored_%';")
  if [ "$REFACTORED_COUNT" -ge 7 ]; then
    pass "refactored_* tables ($REFACTORED_COUNT)"
  else
    fail "refactored_* tables ($REFACTORED_COUNT/7)"
  fi
fi
echo ""

# 4. Authentication
echo "4️⃣ Testing authentication..."

# Register (may fail if user exists, that's ok)
REGISTER_RESPONSE=$(curl -s -X POST "$BACKEND_URL/auth" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"register\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" || echo '{"success":false}')

# Login
LOGIN_RESPONSE=$(curl -s -X POST "$BACKEND_URL/auth" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"login\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" || echo '{"success":false}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token // empty')

if [ ! -z "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  pass "User login"
  
  # Test token validation
  ME_RESPONSE=$(curl -s "$BACKEND_URL/auth?action=me" \
    -H "Authorization: Bearer $TOKEN" || echo '{"success":false}')
  
  USER_EMAIL=$(echo $ME_RESPONSE | jq -r '.email // empty')
  
  if [ "$USER_EMAIL" = "$TEST_EMAIL" ]; then
    pass "Token validation"
  else
    fail "Token validation"
  fi
else
  fail "User login"
  warn "Auth endpoint may not be implemented yet"
fi
echo ""

# 5. Webhook Endpoint
echo "5️⃣ Testing webhook endpoint..."
WEBHOOK_RESPONSE=$(curl -s -f -X POST "$BACKEND_URL/webhook" \
  -H "Content-Type: application/json" \
  -d '{"source":"test","symbol":"SPY","direction":"CALL","timeframe":"5m","action":"BUY","price":450.50}' || echo "FAILED")

if [ "$WEBHOOK_RESPONSE" != "FAILED" ]; then
  pass "Webhook endpoint"
  SIGNAL_ID=$(echo $WEBHOOK_RESPONSE | jq -r '.signal_id // empty')
  if [ ! -z "$SIGNAL_ID" ]; then
    echo "   Signal ID: $SIGNAL_ID"
  fi
else
  fail "Webhook endpoint"
fi
echo ""

# 6. Exit Worker
echo "6️⃣ Testing exit worker (dry run)..."
EXIT_RESPONSE=$(curl -s -f -X POST "$BACKEND_URL/refactored-exit-worker?dry_run=true" || echo "FAILED")

if [ "$EXIT_RESPONSE" != "FAILED" ]; then
  pass "Exit worker endpoint"
  PROCESSED=$(echo $EXIT_RESPONSE | jq -r '.processed // 0')
  echo "   Processed: $PROCESSED positions"
else
  fail "Exit worker endpoint"
fi
echo ""

# 7. Environment Variables Check
echo "7️⃣ Checking environment variables..."
echo "   Note: Run 'fly secrets list -a optionstrat-backend' to verify"
warn "Manual verification required for:"
echo "   - DATABASE_URL"
echo "   - JWT_SECRET"
echo "   - APP_MODE"
echo "   - ALLOW_LIVE_EXECUTION"
echo "   - PREFERRED_BROKER"
echo "   - Broker credentials (TRADIER_* or ALPACA_*)"
echo ""

# Summary
echo "================================"
echo "📊 Validation Summary"
echo "================================"
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 All checks passed!${NC}"
  echo -e "${GREEN}✅ Ready for live trading!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Verify environment variables: fly secrets list -a optionstrat-backend"
  echo "  2. Set APP_MODE=LIVE and ALLOW_LIVE_EXECUTION=true"
  echo "  3. Deploy: fly deploy"
  echo "  4. Monitor logs: fly logs -a optionstrat-backend --follow"
  exit 0
else
  echo -e "${RED}❌ Some checks failed!${NC}"
  echo -e "${YELLOW}⚠️  Fix issues before going live${NC}"
  echo ""
  echo "Review the failures above and:"
  echo "  1. Run migrations if database checks failed"
  echo "  2. Deploy backend if endpoints are not responding"
  echo "  3. Set environment variables if auth/broker checks failed"
  exit 1
fi
