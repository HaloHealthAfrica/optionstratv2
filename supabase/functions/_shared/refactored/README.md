# Refactored Trading System Architecture

## Overview

This directory contains the refactored unified trading system architecture that consolidates fragmented decision logic, implements proper caching and error handling, and establishes comprehensive testing.

## Architecture

### Core Principles

1. **Single Decision Path** - All signals flow through one authoritative `DecisionOrchestrator`
2. **Clear Pipeline** - Signals progress through defined stages with error boundaries
3. **Proper Caching** - Eliminates redundant API calls with TTL-based caching
4. **Comprehensive Testing** - 38 property-based tests + 60+ unit tests + integration tests
5. **Full Observability** - Metrics, health checks, and audit trails

### Component Structure

```
refactored/
├── core/                    # Core types and configuration
│   ├── types.ts            # TypeScript interfaces
│   ├── config.ts           # Configuration management
│   └── index.ts            # Exports
│
├── cache/                   # Caching layer
│   ├── context-cache.ts    # Context data cache with TTL
│   ├── deduplication-cache.ts  # Signal deduplication
│   └── market-data-fetcher.ts  # Market data fetching
│
├── validation/              # Signal validation
│   └── signal-validator.ts # Validation pipeline
│
├── services/                # Business logic services
│   ├── gex-service.ts      # GEX signal processing
│   ├── confluence-calculator.ts  # Cross-signal confluence
│   ├── position-sizing-service.ts  # Position sizing
│   ├── risk-manager.ts     # Risk management
│   └── position-manager.ts # Position tracking
│
├── orchestrator/            # Decision orchestration
│   └── decision-orchestrator.ts  # Unified decision engine
│
├── pipeline/                # Signal processing pipeline
│   ├── signal-pipeline.ts  # Pipeline orchestration
│   └── signal-normalizer.ts  # Signal normalization
│
├── database/                # Database layer
│   └── entity-validation.ts  # Schema validation
│
└── monitoring/              # Observability
    ├── metrics-service.ts  # Performance metrics
    ├── health-check-service.ts  # Health monitoring
    ├── audit-logger.ts     # Audit trail
    ├── audit-query-service.ts  # Audit queries
    └── degraded-mode-tracker.ts  # Service health tracking
```

## Signal Processing Flow

```
1. RECEPTION
   ↓
2. NORMALIZATION (SignalNormalizer)
   ↓
3. VALIDATION (SignalValidator)
   ↓
4. DEDUPLICATION (DeduplicationCache)
   ↓
5. DECISION (DecisionOrchestrator)
   ├── Fetch Context (ContextCache)
   ├── Fetch GEX (GEXService)
   ├── Calculate Confidence (RiskManager)
   ├── Calculate Position Size (PositionSizingService)
   └── Make Decision
   ↓
6. EXECUTION (PositionManager)
```

## Key Components

### DecisionOrchestrator

The single authoritative decision engine for all entry and exit decisions.

**Entry Decision Flow:**
1. Fetch context data (cached)
2. Fetch GEX signal (with graceful degradation)
3. Calculate base confidence
4. Apply context adjustments
5. Apply positioning adjustments
6. Apply GEX adjustments
7. Clamp confidence to [0, 100]
8. Calculate position size
9. Return structured decision

**Exit Decision Flow:**
1. Fetch current market price
2. Calculate unrealized P&L
3. Check profit target
4. Check stop loss
5. Check GEX flip
6. Check time-based exit
7. Return highest priority exit reason

### ContextCache

Caches market context data (VIX, trend, bias, regime) with:
- 60-second TTL
- Request coalescing for concurrent requests
- Fallback to stale cache (< 5 minutes) on fetch failure
- Thread-safe operation

### DeduplicationCache

Prevents duplicate signal processing with:
- Signal fingerprinting (source + symbol + timestamp + direction)
- 60-second duplicate detection window
- 5-minute cache expiration
- Idempotent signal processing

### SignalValidator

Validates signals through ordered checks:
1. Cooldown check
2. Market hours check (9:30 AM - 3:30 PM ET)
3. MTF alignment check
4. Confluence check
5. Time filter check

Returns structured validation result with pass/fail for each check.

### PositionSizingService

Calculates position size in single pass:
1. Base sizing
2. Kelly criterion adjustment
3. Regime adjustment
4. Confluence adjustment
5. Maximum size enforcement
6. Return whole number of contracts

### RiskManager

Applies market condition filters:
- VIX-based position size reduction (> 30 = 50% reduction)
- Market hours enforcement
- Trend-based confidence adjustments
- Maximum exposure limits

### PositionManager

Tracks positions with:
- Entry price, time, quantity storage
- Unrealized P&L calculation
- Realized P&L calculation on close
- Duplicate position prevention
- Position query interface

## Configuration

Configuration is centralized in `core/config.ts`:

```typescript
const config = {
  validation: {
    cooldownSeconds: 180,
    marketHoursStart: "09:30",
    marketHoursEnd: "15:30",
    maxSignalAgeMinutes: 15,
  },
  risk: {
    maxVixForEntry: 40,
    vixPositionSizeReduction: 0.5,
    maxPositionSize: 10,
    maxTotalExposure: 50000,
  },
  sizing: {
    baseSize: 2,
    kellyFraction: 0.25,
    minSize: 1,
    maxSize: 10,
  },
  confidence: {
    baseConfidence: 70,
    contextAdjustmentRange: 20,
    positioningAdjustmentRange: 15,
    gexAdjustmentRange: 10,
  },
  cache: {
    contextTTLSeconds: 60,
    deduplicationTTLSeconds: 60,
  },
  gex: {
    maxStaleMinutes: 240,
    staleWeightReduction: 0.5,
  },
};
```

## Monitoring & Observability

### Health Checks

Access via `/health` endpoint:

- `GET /health` - Overall system health
- `GET /health/context` - Context cache status
- `GET /health/gex` - GEX service status
- `GET /health/database` - Database connectivity

### Metrics

Access via `/metrics` endpoint:

- `GET /metrics` - Full metrics snapshot
- `GET /metrics/signals` - Signal acceptance/rejection rates
- `GET /metrics/positions` - Position count, exposure, P&L
- `GET /metrics/latency` - Processing latency statistics

### Audit Trail

All signals, decisions, and trades are logged with:
- Full payload and timestamp
- Input data and calculated values
- Final decision and reasoning
- Queryable by date, symbol, or signal ID

## Testing

### Property-Based Tests (38 tests, 100+ iterations each)

Verify universal correctness properties:
- Confidence clamping [0, 100]
- Position sizing ordering
- Cache freshness guarantees
- Validation completeness
- Error resilience

### Unit Tests (60+ tests)

Test specific examples and edge cases:
- Individual component behavior
- Error conditions
- Boundary values
- Integration points

### Integration Tests (3 test suites)

Validate end-to-end flows:
- Complete signal processing
- Error scenario handling
- Duplicate signal rejection

Run tests:
```bash
deno task test
```

## Deployment

### Prerequisites

- Deno runtime installed
- Fly.io app configured
- Environment variables set:
  - `DATABASE_URL`
  - `WEBHOOK_SECRET`

### Deployment Steps

1. **Apply Database Migrations**
   ```bash
   psql "$DATABASE_URL" -f supabase/migrations/<latest>.sql
   ```

2. **Deploy Backend**
   ```bash
   flyctl deploy -a optionstrat-backend
   ```

3. **Verify Deployment**
   - Test webhook with sample signal
   - Check health endpoint
   - Monitor metrics
   - Review logs

### Environment Configuration

Development:
```bash
export NODE_ENV=development
```

Production:
```bash
export NODE_ENV=production
```

## Migration from Legacy System

See [MIGRATION.md](./MIGRATION.md) for detailed migration guide.

### Quick Migration Checklist

- [ ] Review migration guide
- [ ] Test in staging environment
- [ ] Backup current webhook handler
- [ ] Deploy refactored webhook handler
- [ ] Monitor logs for errors
- [ ] Verify signals processing correctly
- [ ] Check frontend displays
- [ ] Confirm audit logs working

## Troubleshooting

### Signal Not Processing

1. Check health endpoint: `GET /health`
2. Review webhook logs
3. Verify signal format matches schema
4. Check validation errors in database

### High Latency

1. Check metrics endpoint: `GET /metrics/latency`
2. Review context cache hit rate
3. Check database query performance
4. Monitor GEX service response time

### Degraded Mode

1. Check health endpoint for service status
2. Review degraded mode tracker
3. Check recent errors in logs
4. Verify external service availability

## Support

For issues or questions:

1. Review this README
2. Check [MIGRATION.md](./MIGRATION.md)
3. Review [END_TO_END_REVIEW.md](./END_TO_END_REVIEW.md)
4. Consult design document: `.kiro/specs/trading-system-refactor/design.md`

## License

Proprietary - All rights reserved
