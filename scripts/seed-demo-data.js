import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const now = new Date();

const demoSignals = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    symbol: "SPY",
    action: "BUY",
    direction: "CALL",
    timeframe: "5m",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    symbol: "QQQ",
    action: "SELL",
    direction: "PUT",
    timeframe: "15m",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    symbol: "AAPL",
    action: "BUY",
    direction: "CALL",
    timeframe: "1h",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    symbol: "MSFT",
    action: "SELL",
    direction: "PUT",
    timeframe: "30m",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    symbol: "NVDA",
    action: "BUY",
    direction: "CALL",
    timeframe: "4h",
  },
];

const demoOrders = [
  {
    id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    signal_id: demoSignals[0].id,
    underlying: "SPY",
    symbol: "SPY",
    strike: 500,
    expiration: "2026-02-20",
    option_type: "CALL",
    side: "BUY_TO_OPEN",
    quantity: 2,
    order_type: "LIMIT",
    limit_price: 2.15,
    mode: "PAPER",
    status: "FILLED",
    filled_quantity: 2,
    avg_fill_price: 2.1,
  },
  {
    id: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    signal_id: demoSignals[1].id,
    underlying: "QQQ",
    symbol: "QQQ",
    strike: 420,
    expiration: "2026-02-20",
    option_type: "PUT",
    side: "SELL_TO_OPEN",
    quantity: 1,
    order_type: "MARKET",
    limit_price: null,
    mode: "PAPER",
    status: "PENDING",
    filled_quantity: 0,
    avg_fill_price: null,
  },
];

const demoTrades = [
  {
    id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    order_id: demoOrders[0].id,
    broker_trade_id: "TRD-001",
    execution_price: 2.1,
    quantity: 2,
    commission: 1.2,
    fees: 0.35,
    total_cost: 420,
    underlying: "SPY",
    symbol: "SPY",
    strike: 500,
    expiration: "2026-02-20",
    option_type: "CALL",
    executed_at: new Date(now.getTime() - 1000 * 60 * 60).toISOString(),
  },
];

const demoPositions = [
  {
    id: "ccccccc1-cccc-4ccc-8ccc-ccccccccccc1",
    symbol: "SPY_2026-02-20_500C",
    underlying: "SPY",
    strike: 500,
    expiration: "2026-02-20",
    option_type: "CALL",
    quantity: 2,
    avg_open_price: 2.1,
    total_cost: 420,
    current_price: 2.35,
    market_value: 470,
    unrealized_pnl: 50,
    unrealized_pnl_percent: 11.9,
    realized_pnl: 0,
    delta: 0.45,
    gamma: 0.08,
    theta: -0.03,
    vega: 0.12,
    implied_volatility: 0.22,
    is_closed: false,
    closed_at: null,
    opened_at: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString(),
    last_updated: now.toISOString(),
    created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "ccccccc2-cccc-4ccc-8ccc-ccccccccccc2",
    symbol: "AAPL_2026-02-20_200C",
    underlying: "AAPL",
    strike: 200,
    expiration: "2026-02-20",
    option_type: "CALL",
    quantity: 1,
    avg_open_price: 3.5,
    total_cost: 350,
    current_price: 0.0,
    market_value: 0.0,
    unrealized_pnl: 0.0,
    unrealized_pnl_percent: 0.0,
    realized_pnl: 45,
    delta: 0.0,
    gamma: 0.0,
    theta: 0.0,
    vega: 0.0,
    implied_volatility: 0.0,
    is_closed: true,
    closed_at: new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString(),
    opened_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    last_updated: new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString(),
    created_at: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
];

const demoRefactoredSignals = demoSignals.map((signal) => ({
  id: signal.id,
  source: "TRADINGVIEW",
  symbol: signal.symbol,
  direction: signal.direction,
  timeframe: signal.timeframe,
  timestamp: now.toISOString(),
  metadata: {
    action: signal.action,
    timeframe: signal.timeframe,
  },
  validation_result: { valid: true, stage: "INGESTION" },
}));

const demoRefactoredPositions = [
  {
    id: "ddddddd1-dddd-4ddd-8ddd-ddddddddddd1",
    signal_id: demoSignals[0].id,
    symbol: "SPY",
    direction: "CALL",
    quantity: 2,
    entry_price: 2.1,
    entry_time: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString(),
    current_price: 2.35,
    unrealized_pnl: 50,
    exit_price: null,
    exit_time: null,
    realized_pnl: null,
    status: "OPEN",
    underlying: "SPY",
    strike: 500,
    expiration: "2026-02-20",
    option_type: "CALL",
    timeframe: "5m",
  },
  {
    id: "ddddddd2-dddd-4ddd-8ddd-ddddddddddd2",
    signal_id: demoSignals[2].id,
    symbol: "AAPL",
    direction: "CALL",
    quantity: 1,
    entry_price: 3.5,
    entry_time: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    current_price: null,
    unrealized_pnl: null,
    exit_price: 3.95,
    exit_time: new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString(),
    realized_pnl: 45,
    status: "CLOSED",
    underlying: "AAPL",
    strike: 200,
    expiration: "2026-02-20",
    option_type: "CALL",
    timeframe: "1h",
  },
];

const demoRiskViolations = [
  {
    id: "eeeeeee1-eeee-4eee-8eee-eeeeeeeeeee1",
    signal_id: demoSignals[1].id,
    order_id: demoOrders[1].id,
    violation_type: "MAX_POSITION_VALUE",
    rule_violated: "max_position_value",
    current_value: 15000,
    limit_value: 10000,
    severity: "WARNING",
    action_taken: "LOGGED",
  },
];

function buildSnapshots() {
  const snapshots = [];
  for (let i = 10; i >= 1; i -= 1) {
    const snapshotAt = new Date(now.getTime() - 1000 * 60 * 60 * 24 * i);
    const totalValue = 100000 + (10 - i) * 750;
    snapshots.push({
      id: `fffffff${i}-ffff-4fff-8fff-fffffffffff${i}`,
      total_value: totalValue,
      cash_balance: 80000,
      buying_power: 120000,
      margin_used: 0,
      day_pnl: (i % 2 === 0 ? 1 : -1) * 150,
      day_pnl_percent: (i % 2 === 0 ? 1 : -1) * 0.15,
      total_pnl: totalValue - 100000,
      total_pnl_percent: ((totalValue - 100000) / 100000) * 100,
      total_delta: 12.5,
      total_gamma: 0.8,
      total_theta: -1.2,
      total_vega: 3.4,
      open_positions_count: 1,
      total_positions_value: 2000,
      mode: "PAPER",
      snapshot_at: snapshotAt.toISOString(),
    });
  }
  return snapshots;
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const signal of demoSignals) {
      const signalHash = `${signal.symbol}-${signal.direction}-${signal.action}-${signal.timeframe}`;
      await client.query(
        `INSERT INTO signals (
          id, source, signal_hash, raw_payload, signature_verified,
          action, underlying, strike, expiration, option_type, quantity,
          strategy_type, status, validation_errors, processed_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, NULL, NULL, $9, NULL, NULL, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        [
          signal.id,
          "tradingview",
          signalHash,
          JSON.stringify(signal),
          false,
          signal.action,
          signal.symbol,
          signal.direction,
          "PENDING",
        ]
      );
    }

    for (const signal of demoRefactoredSignals) {
      await client.query(
        `INSERT INTO refactored_signals (
          id, source, symbol, direction, timeframe, timestamp, metadata, validation_result, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id) DO NOTHING`,
        [
          signal.id,
          signal.source,
          signal.symbol,
          signal.direction,
          signal.timeframe,
          signal.timestamp,
          JSON.stringify(signal.metadata),
          JSON.stringify(signal.validation_result),
        ]
      );
    }

    for (const order of demoOrders) {
      await client.query(
        `INSERT INTO orders (
          id, signal_id, broker_order_id, client_order_id, underlying, symbol, strike, expiration,
          option_type, side, quantity, order_type, limit_price, stop_price, time_in_force, mode,
          status, filled_quantity, avg_fill_price, strategy_id, leg_number, rejection_reason,
          error_message, broker_response, submitted_at, filled_at, cancelled_at, created_at, updated_at
        ) VALUES (
          $1, $2, NULL, NULL, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, NULL, 'DAY', $12,
          $13, $14, $15, NULL, NULL, NULL,
          NULL, NULL, NOW(), NULL, NULL, NOW(), NOW()
        ) ON CONFLICT (id) DO NOTHING`,
        [
          order.id,
          order.signal_id,
          order.underlying,
          order.symbol,
          order.strike,
          order.expiration,
          order.option_type,
          order.side,
          order.quantity,
          order.order_type,
          order.limit_price,
          order.mode,
          order.status,
          order.filled_quantity,
          order.avg_fill_price,
        ]
      );
    }

    for (const trade of demoTrades) {
      await client.query(
        `INSERT INTO trades (
          id, order_id, broker_trade_id, execution_price, quantity, commission, fees, total_cost,
          underlying, symbol, strike, expiration, option_type, executed_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (id) DO NOTHING`,
        [
          trade.id,
          trade.order_id,
          trade.broker_trade_id,
          trade.execution_price,
          trade.quantity,
          trade.commission,
          trade.fees,
          trade.total_cost,
          trade.underlying,
          trade.symbol,
          trade.strike,
          trade.expiration,
          trade.option_type,
          trade.executed_at,
        ]
      );
    }

    for (const position of demoPositions) {
      await client.query(
        `INSERT INTO positions (
          id, symbol, underlying, strike, expiration, option_type, quantity, avg_open_price, total_cost,
          current_price, market_value, unrealized_pnl, unrealized_pnl_percent, realized_pnl,
          delta, gamma, theta, vega, implied_volatility, is_closed, closed_at, opened_at, last_updated, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        ) ON CONFLICT (id) DO NOTHING`,
        [
          position.id,
          position.symbol,
          position.underlying,
          position.strike,
          position.expiration,
          position.option_type,
          position.quantity,
          position.avg_open_price,
          position.total_cost,
          position.current_price,
          position.market_value,
          position.unrealized_pnl,
          position.unrealized_pnl_percent,
          position.realized_pnl,
          position.delta,
          position.gamma,
          position.theta,
          position.vega,
          position.implied_volatility,
          position.is_closed,
          position.closed_at,
          position.opened_at,
          position.last_updated,
          position.created_at,
        ]
      );
    }

    for (const position of demoRefactoredPositions) {
      await client.query(
        `INSERT INTO refactored_positions (
          id, signal_id, symbol, direction, quantity, entry_price, entry_time,
          current_price, unrealized_pnl, exit_price, exit_time, realized_pnl, status,
          underlying, strike, expiration, option_type, timeframe, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, NOW(), NOW()
        ) ON CONFLICT (id) DO NOTHING`,
        [
          position.id,
          position.signal_id,
          position.symbol,
          position.direction,
          position.quantity,
          position.entry_price,
          position.entry_time,
          position.current_price,
          position.unrealized_pnl,
          position.exit_price,
          position.exit_time,
          position.realized_pnl,
          position.status,
          position.underlying,
          position.strike,
          position.expiration,
          position.option_type,
          position.timeframe,
        ]
      );
    }

    for (const violation of demoRiskViolations) {
      await client.query(
        `INSERT INTO risk_violations (
          id, signal_id, order_id, violation_type, rule_violated, current_value, limit_value,
          severity, action_taken, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (id) DO NOTHING`,
        [
          violation.id,
          violation.signal_id,
          violation.order_id,
          violation.violation_type,
          violation.rule_violated,
          violation.current_value,
          violation.limit_value,
          violation.severity,
          violation.action_taken,
        ]
      );
    }

    for (const snapshot of buildSnapshots()) {
      await client.query(
        `INSERT INTO portfolio_snapshots (
          id, total_value, cash_balance, buying_power, margin_used, day_pnl, day_pnl_percent,
          total_pnl, total_pnl_percent, total_delta, total_gamma, total_theta, total_vega,
          open_positions_count, total_positions_value, mode, snapshot_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, NOW()
        ) ON CONFLICT (id) DO NOTHING`,
        [
          snapshot.id,
          snapshot.total_value,
          snapshot.cash_balance,
          snapshot.buying_power,
          snapshot.margin_used,
          snapshot.day_pnl,
          snapshot.day_pnl_percent,
          snapshot.total_pnl,
          snapshot.total_pnl_percent,
          snapshot.total_delta,
          snapshot.total_gamma,
          snapshot.total_theta,
          snapshot.total_vega,
          snapshot.open_positions_count,
          snapshot.total_positions_value,
          snapshot.mode,
          snapshot.snapshot_at,
        ]
      );
    }

    await client.query("COMMIT");
    console.log("✅ Demo data seeded successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Failed to seed demo data:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
