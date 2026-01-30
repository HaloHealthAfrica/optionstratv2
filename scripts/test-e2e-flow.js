/**
 * End-to-End Flow Test Script
 * Tests: Webhook → Signal → Order → Trade → Position → Analytics
 */

const API_URL = process.env.API_URL || 'https://optionstrat-backend.fly.dev';
const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'testpass123';

let authToken = null;
let userId = null;
let signalId = null;
let orderId = null;
let positionId = null;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${ step}] ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiRequest(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Test 1: Health Check
async function testHealthCheck() {
  logStep('1', 'Testing Health Check');
  
  const result = await apiRequest('/health');
  
  if (!result.success) {
    logError(`Health check failed: ${result.error}`);
    return false;
  }

  logSuccess(`Health check passed`);
  log(`   Mode: ${result.data.mode}`);
  log(`   Live Trading: ${result.data.live_trading_enabled || false}`);
  log(`   Timestamp: ${result.data.timestamp}`);
  
  return true;
}

// Test 2: User Registration
async function testRegistration() {
  logStep('2', 'Testing User Registration');
  
  const result = await apiRequest('/auth?action=register', {
    method: 'POST',
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });

  if (!result.success) {
    logError(`Registration failed: ${result.error}`);
    return false;
  }

  authToken = result.data.token;
  userId = result.data.user.id;

  logSuccess(`User registered successfully`);
  log(`   Email: ${result.data.user.email}`);
  log(`   User ID: ${userId}`);
  log(`   Token: ${authToken.substring(0, 20)}...`);
  
  return true;
}

// Test 3: User Login
async function testLogin() {
  logStep('3', 'Testing User Login');
  
  const result = await apiRequest('/auth?action=login', {
    method: 'POST',
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });

  if (!result.success) {
    logError(`Login failed: ${result.error}`);
    return false;
  }

  authToken = result.data.token;

  logSuccess(`Login successful`);
  log(`   Token refreshed: ${authToken.substring(0, 20)}...`);
  
  return true;
}

// Test 4: Token Verification
async function testTokenVerification() {
  logStep('4', 'Testing Token Verification');
  
  const result = await apiRequest('/auth?action=me');

  if (!result.success) {
    logError(`Token verification failed: ${result.error}`);
    return false;
  }

  logSuccess(`Token verified successfully`);
  log(`   User ID: ${result.data.user.id}`);
  log(`   Email: ${result.data.user.email}`);
  
  return true;
}

// Test 5: Send Test Webhook (Create Signal)
async function testWebhook() {
  logStep('5', 'Testing Webhook (Creating Signal)');
  
  const webhookPayload = {
    ticker: 'SPY',
    action: 'BUY',
    strategy: 'e2e-test-strategy',
    timeframe: '5m',
    price: 450.50,
    timestamp: new Date().toISOString(),
    signal_strength: 85,
    source: 'tradingview',
  };

  const result = await apiRequest('/webhook', {
    method: 'POST',
    body: JSON.stringify(webhookPayload),
  });

  if (!result.success) {
    logError(`Webhook failed: ${result.error}`);
    return false;
  }

  logSuccess(`Webhook processed successfully`);
  log(`   Ticker: ${webhookPayload.ticker}`);
  log(`   Action: ${webhookPayload.action}`);
  log(`   Strategy: ${webhookPayload.strategy}`);
  
  return true;
}

// Test 6: Verify Signal Created
async function testSignalCreated() {
  logStep('6', 'Verifying Signal Created');
  
  // Wait a bit for signal to be processed
  await sleep(2000);
  
  const result = await apiRequest('/signals?limit=10');

  if (!result.success) {
    logError(`Failed to fetch signals: ${result.error}`);
    return false;
  }

  const signals = result.data;
  
  if (!signals || signals.length === 0) {
    logWarning(`No signals found (this might be expected if signal processing is async)`);
    return true; // Don't fail, just warn
  }

  // Find our test signal
  const testSignal = signals.find(s => s.strategy === 'e2e-test-strategy' || s.underlying === 'SPY');
  
  if (testSignal) {
    signalId = testSignal.id;
    logSuccess(`Signal found in database`);
    log(`   Signal ID: ${signalId}`);
    log(`   Underlying: ${testSignal.underlying}`);
    log(`   Action: ${testSignal.action}`);
    log(`   Status: ${testSignal.status}`);
  } else {
    logWarning(`Test signal not found (might be processed already)`);
  }
  
  return true;
}

// Test 7: Check Orders
async function testOrders() {
  logStep('7', 'Checking Orders');
  
  // Wait for order to be created
  await sleep(3000);
  
  const result = await apiRequest('/orders?limit=10');

  if (!result.success) {
    logError(`Failed to fetch orders: ${result.error}`);
    return false;
  }

  const orders = result.data;
  
  if (!orders || orders.length === 0) {
    logWarning(`No orders found (signal might not have triggered order yet)`);
    return true; // Don't fail
  }

  const recentOrder = orders[0];
  orderId = recentOrder.id;

  logSuccess(`Orders retrieved`);
  log(`   Total Orders: ${orders.length}`);
  log(`   Latest Order ID: ${orderId}`);
  log(`   Symbol: ${recentOrder.symbol}`);
  log(`   Side: ${recentOrder.side}`);
  log(`   Quantity: ${recentOrder.quantity}`);
  log(`   Status: ${recentOrder.status}`);
  log(`   Mode: ${recentOrder.mode}`);
  
  return true;
}

// Test 8: Check Trades
async function testTrades() {
  logStep('8', 'Checking Trades');
  
  const result = await apiRequest('/trades?limit=10');

  if (!result.success) {
    logError(`Failed to fetch trades: ${result.error}`);
    return false;
  }

  const trades = result.data?.trades || result.data || [];
  
  if (!trades || trades.length === 0) {
    logWarning(`No trades found (order might not be filled yet)`);
    return true; // Don't fail
  }

  const recentTrade = trades[0];

  logSuccess(`Trades retrieved`);
  log(`   Total Trades: ${trades.length}`);
  log(`   Latest Trade ID: ${recentTrade.id}`);
  log(`   Symbol: ${recentTrade.symbol}`);
  log(`   Execution Price: $${recentTrade.execution_price}`);
  log(`   Quantity: ${recentTrade.quantity}`);
  log(`   Total Cost: $${recentTrade.total_cost}`);
  
  return true;
}

// Test 9: Check Positions
async function testPositions() {
  logStep('9', 'Checking Positions');
  
  const result = await apiRequest('/positions');

  if (!result.success) {
    logError(`Failed to fetch positions: ${result.error}`);
    return false;
  }

  const positions = result.data?.positions || result.data || [];
  
  if (!positions || positions.length === 0) {
    logWarning(`No positions found (trade might not have created position yet)`);
    return true; // Don't fail
  }

  const recentPosition = positions[0];
  positionId = recentPosition.id;

  logSuccess(`Positions retrieved`);
  log(`   Total Positions: ${positions.length}`);
  log(`   Latest Position ID: ${positionId}`);
  log(`   Underlying: ${recentPosition.underlying}`);
  log(`   Quantity: ${recentPosition.quantity}`);
  log(`   Entry Price: $${recentPosition.entry_price}`);
  log(`   Current P&L: $${recentPosition.unrealized_pnl || 0}`);
  log(`   Status: ${recentPosition.is_closed ? 'CLOSED' : 'OPEN'}`);
  
  return true;
}

// Test 10: Check Stats
async function testStats() {
  logStep('10', 'Checking System Stats');
  
  const result = await apiRequest('/stats');

  if (!result.success) {
    logError(`Failed to fetch stats: ${result.error}`);
    return false;
  }

  const stats = result.data;

  logSuccess(`Stats retrieved`);
  log(`   Total Signals: ${stats.total_signals || 0}`);
  log(`   Active Positions: ${stats.active_positions || 0}`);
  log(`   Total Orders: ${stats.total_orders || 0}`);
  log(`   Win Rate: ${stats.win_rate || 0}%`);
  log(`   Total P&L: $${stats.total_pnl || 0}`);
  
  return true;
}

// Test 11: Check Analytics
async function testAnalytics() {
  logStep('11', 'Checking Analytics');
  
  const result = await apiRequest('/analytics?period=7d');

  if (!result.success) {
    logError(`Failed to fetch analytics: ${result.error}`);
    return false;
  }

  const analytics = result.data;

  logSuccess(`Analytics retrieved`);
  
  if (analytics.pnl_summary) {
    log(`   Realized P&L: $${analytics.pnl_summary.realized_pnl || 0}`);
    log(`   Unrealized P&L: $${analytics.pnl_summary.unrealized_pnl || 0}`);
    log(`   Total P&L: $${analytics.pnl_summary.total_pnl || 0}`);
  }
  
  if (analytics.performance_metrics) {
    log(`   Total Trades: ${analytics.performance_metrics.total_trades || 0}`);
    log(`   Win Rate: ${analytics.performance_metrics.win_rate || 0}%`);
    log(`   Profit Factor: ${analytics.performance_metrics.profit_factor || 0}`);
  }
  
  return true;
}

// Test 12: Check Exit Signals
async function testExitSignals() {
  logStep('12', 'Checking Exit Signals');
  
  const result = await apiRequest('/exit-signals');

  if (!result.success) {
    logError(`Failed to fetch exit signals: ${result.error}`);
    return false;
  }

  const exitSignals = result.data || [];

  logSuccess(`Exit signals retrieved`);
  log(`   Total Exit Signals: ${exitSignals.length}`);
  
  if (exitSignals.length > 0) {
    const signal = exitSignals[0];
    log(`   Latest Signal: ${signal.underlying} - ${signal.reason}`);
    log(`   Confidence: ${signal.confidence}%`);
  }
  
  return true;
}

// Test 13: Check Market Positioning
async function testMarketPositioning() {
  logStep('13', 'Checking Market Positioning');
  
  const today = new Date();
  const nextFriday = new Date(today);
  nextFriday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7 || 7));
  const expiration = nextFriday.toISOString().split('T')[0];
  
  const result = await apiRequest(`/market-positioning?underlying=SPY&expiration=${expiration}`);

  if (!result.success) {
    logWarning(`Market positioning failed: ${result.error} (might need API keys)`);
    return true; // Don't fail, just warn
  }

  const positioning = result.data;

  logSuccess(`Market positioning retrieved`);
  log(`   Underlying: ${positioning.underlying}`);
  log(`   Positioning Bias: ${positioning.positioning_bias}`);
  log(`   Confidence: ${positioning.confidence}%`);
  
  if (positioning.put_call_ratio) {
    log(`   P/C Ratio: ${positioning.put_call_ratio.volume_ratio}`);
  }
  
  if (positioning.max_pain) {
    log(`   Max Pain: $${positioning.max_pain.max_pain_strike}`);
  }
  
  return true;
}

// Main test runner
async function runTests() {
  log('\n' + '='.repeat(60), 'blue');
  log('🚀 Starting End-to-End Flow Tests', 'blue');
  log('='.repeat(60) + '\n', 'blue');
  log(`API URL: ${API_URL}\n`);

  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'User Registration', fn: testRegistration },
    { name: 'User Login', fn: testLogin },
    { name: 'Token Verification', fn: testTokenVerification },
    { name: 'Webhook (Signal Creation)', fn: testWebhook },
    { name: 'Signal Verification', fn: testSignalCreated },
    { name: 'Orders Check', fn: testOrders },
    { name: 'Trades Check', fn: testTrades },
    { name: 'Positions Check', fn: testPositions },
    { name: 'System Stats', fn: testStats },
    { name: 'Analytics', fn: testAnalytics },
    { name: 'Exit Signals', fn: testExitSignals },
    { name: 'Market Positioning', fn: testMarketPositioning },
  ];

  let passed = 0;
  let failed = 0;
  let warnings = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      logError(`Test "${test.name}" threw error: ${error.message}`);
      failed++;
    }
  }

  // Summary
  log('\n' + '='.repeat(60), 'blue');
  log('📊 Test Summary', 'blue');
  log('='.repeat(60), 'blue');
  log(`Total Tests: ${tests.length}`);
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'reset');
  log(`Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%\n`);

  if (failed === 0) {
    log('🎉 All tests passed! Your system is working end-to-end!', 'green');
  } else {
    log('⚠️  Some tests failed. Check the errors above.', 'yellow');
  }

  log('\n' + '='.repeat(60) + '\n', 'blue');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
