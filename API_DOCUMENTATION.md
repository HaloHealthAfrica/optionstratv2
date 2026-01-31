# Optionstrat API Documentation

**Version:** 2.0.0  
**Base URL:** `https://optionstratv2.fly.dev`  
**Runtime:** Node.js 20 + Express

---

## Table of Contents

1. [Authentication](#authentication)
2. [Endpoints](#endpoints)
   - [Health](#health)
   - [Authentication](#authentication-endpoints)
   - [Signals](#signals)
   - [Orders](#orders)
   - [Positions](#positions)
   - [Stats](#stats)
   - [Analytics](#analytics)
   - [Webhook](#webhook)
3. [Error Handling](#error-handling)
4. [Rate Limiting](#rate-limiting)

---

## Authentication

Most endpoints require JWT authentication. Include the token in the `Authorization` header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Getting a Token

Use the `/auth?action=login` or `/auth?action=register` endpoints to obtain a JWT token.

---

## Endpoints

### Health

#### GET /health

Check API health and get system information.

**Authentication:** Not required

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-30T21:44:30.955Z",
  "version": "2.0.0",
  "runtime": "Node.js",
  "endpoints": ["health", "auth", "signals", ...]
}
```

---

### Authentication Endpoints

#### POST /auth?action=register

Register a new user account.

**Authentication:** Not required

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Error Responses:**
- `400` - Email and password required
- `409` - Email already registered

---

#### POST /auth?action=login

Login to existing account.

**Authentication:** Not required

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Error Responses:**
- `400` - Email and password required
- `401` - Invalid credentials

---

#### GET /auth?action=me

Get current user information.

**Authentication:** Required

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Error Responses:**
- `401` - Missing token
- `401` - Invalid token

---

### Signals

#### GET /signals

Get list of trading signals.

**Authentication:** Required

**Query Parameters:**
- `limit` (optional) - Number of signals to return (default: 100)
- `status` (optional) - Filter by status (RECEIVED, EXECUTED, REJECTED)

**Response:**
```json
[
  {
    "id": "uuid",
    "underlying": "SPY",
    "action": "BUY",
    "option_type": "CALL",
    "strike": 450,
    "expiration": "2026-02-21",
    "timeframe": "5m",
    "status": "RECEIVED",
    "created_at": "2026-01-30T21:00:00Z",
    "metadata": {}
  }
]
```

---

### Orders

#### GET /orders

Get list of orders.

**Authentication:** Required

**Query Parameters:**
- `limit` (optional) - Number of orders to return (default: 100)
- `status` (optional) - Filter by status (PENDING, FILLED, CANCELLED)

**Response:**
```json
[
  {
    "id": "uuid",
    "signal_id": "uuid",
    "symbol": "SPY260221C00450000",
    "side": "BUY_TO_OPEN",
    "quantity": 1,
    "order_type": "MARKET",
    "status": "FILLED",
    "filled_price": 5.25,
    "created_at": "2026-01-30T21:00:00Z"
  }
]
```

---

### Positions

#### GET /positions

Get list of positions.

**Authentication:** Required

**Query Parameters:**
- `limit` (optional) - Number of positions to return (default: 100)
- `status` (optional) - Filter by status (OPEN, CLOSED)

**Response:**
```json
[
  {
    "id": "uuid",
    "underlying": "SPY",
    "option_type": "CALL",
    "strike": 450,
    "expiration": "2026-02-21",
    "quantity": 1,
    "entry_price": 5.25,
    "current_price": 5.50,
    "pnl": 25.00,
    "status": "OPEN",
    "created_at": "2026-01-30T21:00:00Z"
  }
]
```

---

### Stats

#### GET /stats

Get system statistics and metrics.

**Authentication:** Required

**Response:**
```json
{
  "signals": {
    "total_signals": 1250,
    "executed_signals": 980,
    "rejected_signals": 270,
    "signals_24h": 45
  },
  "positions": {
    "total_positions": 850,
    "open_positions": 12,
    "closed_positions": 838,
    "total_pnl": 15420.50
  },
  "orders": {
    "total_orders": 1700,
    "filled_orders": 1650,
    "pending_orders": 5,
    "orders_24h": 38
  },
  "recent_performance": [
    {
      "date": "2026-01-30",
      "trades": 15,
      "daily_pnl": 450.25
    }
  ],
  "timestamp": "2026-01-30T21:00:00Z"
}
```

---

### Analytics

#### GET /analytics

Get advanced analytics and insights.

**Authentication:** Required

**Query Parameters:**
- `period` (optional) - Time period (7d, 30d, 90d, 1y) - default: 30d
- `metric` (optional) - Specific metric (all, winrate, pnl, symbols, strategies, time) - default: all

**Response:**
```json
{
  "period": "30d",
  "analytics": {
    "win_rate": {
      "wins": 520,
      "losses": 318,
      "breakeven": 0,
      "win_rate_pct": 62.05
    },
    "pnl_distribution": {
      "avg_pnl": 18.40,
      "max_win": 850.00,
      "max_loss": -320.00,
      "pnl_stddev": 125.50,
      "total_pnl": 15420.50
    },
    "symbol_performance": [
      {
        "symbol": "SPY",
        "trades": 450,
        "total_pnl": 8250.00,
        "avg_pnl": 18.33,
        "win_rate_pct": 65.50
      }
    ],
    "strategy_performance": [
      {
        "strategy": "tradingview",
        "trades": 650,
        "total_pnl": 12000.00,
        "avg_pnl": 18.46,
        "win_rate_pct": 63.20
      }
    ],
    "time_analysis": [
      {
        "hour": 9,
        "trades": 85,
        "total_pnl": 1250.00,
        "avg_pnl": 14.71
      }
    ]
  },
  "generated_at": "2026-01-30T21:00:00Z"
}
```

---

### Webhook

#### POST /webhook

Receive trading signals from TradingView or other sources.

**Authentication:** Not required (uses HMAC signature verification)

**Headers:**
- `Content-Type: application/json`
- `X-Webhook-Signature` (optional) - HMAC signature for verification

**Request Body:**
```json
{
  "ticker": "SPY",
  "action": "BUY",
  "direction": "CALL",
  "strike": 450,
  "expiration": "2026-02-21",
  "timeframe": "5m",
  "price": 5.25,
  "timestamp": "2026-01-30T21:00:00Z"
}
```

**Response (Success):**
```json
{
  "status": "ACCEPTED",
  "message": "Signal received and queued for processing",
  "request_id": "uuid",
  "signal_id": "uuid",
  "processing_time_ms": 45
}
```

**Response (Validation Error):**
```json
{
  "status": "REJECTED",
  "validation_errors": [
    "Invalid action: \"INVALID\". Must be BUY, SELL, CLOSE, LONG, SHORT, EXIT"
  ],
  "request_id": "uuid"
}
```

**Response (Duplicate):**
```json
{
  "status": "DUPLICATE",
  "message": "Signal already processed",
  "request_id": "uuid",
  "signal_id": "uuid"
}
```

**Error Responses:**
- `400` - Validation errors
- `401` - Invalid HMAC signature
- `500` - Internal server error

---

## Error Handling

All endpoints return errors in a consistent format:

```json
{
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `404` - Not Found
- `409` - Conflict (e.g., email already exists)
- `500` - Internal Server Error

---

## Rate Limiting

Currently, there is no rate limiting implemented. This may be added in future versions.

---

## CORS

The API supports CORS with the following configuration:

- **Allowed Origins:** `*` (all origins)
- **Allowed Methods:** `GET, POST, PUT, DELETE, OPTIONS`
- **Allowed Headers:** `Content-Type, Authorization, apikey`

---

## Webhook Security

### HMAC Signature Verification

To secure webhook endpoints, you can enable HMAC signature verification:

1. Set the `HMAC_SECRET` environment variable
2. Include the signature in the `X-Webhook-Signature` header
3. The signature is calculated as: `HMAC-SHA256(JSON.stringify(payload), secret)`

**Example (Node.js):**
```javascript
const crypto = require('crypto');

const payload = { ticker: 'SPY', action: 'BUY' };
const secret = 'your-hmac-secret';

const hmac = crypto.createHmac('sha256', secret);
hmac.update(JSON.stringify(payload));
const signature = hmac.digest('hex');

// Include in request header:
// X-Webhook-Signature: <signature>
```

---

## Examples

### cURL Examples

#### Login
```bash
curl -X POST https://optionstratv2.fly.dev/auth?action=login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

#### Get Signals
```bash
curl https://optionstratv2.fly.dev/signals \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Send Webhook
```bash
curl -X POST https://optionstratv2.fly.dev/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "SPY",
    "action": "BUY",
    "direction": "CALL",
    "strike": 450,
    "expiration": "2026-02-21",
    "timeframe": "5m"
  }'
```

### JavaScript Examples

#### Login
```javascript
const response = await fetch('https://optionstratv2.fly.dev/auth?action=login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { token } = await response.json();
```

#### Get Signals
```javascript
const response = await fetch('https://optionstratv2.fly.dev/signals', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const signals = await response.json();
```

---

## Support

For issues or questions:
- **GitHub:** https://github.com/HaloHealthAfrica/optionstratv2
- **Email:** support@optionstrat.com

---

**Last Updated:** January 30, 2026  
**API Version:** 2.0.0
