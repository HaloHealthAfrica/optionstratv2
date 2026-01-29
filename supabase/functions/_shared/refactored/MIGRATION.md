# Migration Guide: Legacy to Refactored Architecture

## Overview

This document guides the migration from legacy decision engines to the refactored unified architecture.

## Deprecated Components

### Legacy Decision Engines (DEPRECATED)

The following files are deprecated and should no longer be used:

- `_shared/decision-engine.ts` - Original decision engine
- `_shared/enhanced-decision-engine.ts` - Enhanced decision engine with market data

**Replacement:** Use `refactored/orchestrator/decision-orchestrator.ts`

### Legacy Exit Logic (DEPRECATED - See Task 22.2)

The following exit logic files are deprecated:

- `_shared/gex-signals/exit-decision-service.ts`
- `_shared/enhanced-exit/exit-service.ts`
- `_shared/exit-rules.ts`

**Replacement:** Use `DecisionOrchestrator.orchestrateExitDecision()`

## Authoritative Components

### Decision Making

**DecisionOrchestrator** is the single authoritative decision engine for all entry and exit decisions.

Location: `refactored/orchestrator/decision-orchestrator.ts`

```typescript
import { DecisionOrchestrator } from './refactored/orchestrator/decision-orchestrator.ts';

// Create orchestrator with dependencies
const orchestrator = new DecisionOrchestrator(
  contextCache,
  gexService,
  positionManager,
  riskManager,
  positionSizingService,
  config
);

// Entry decisions
const entryDecision = await orchestrator.orchestrateEntryDecision(signal);

// Exit decisions
const exitDecision = await orchestrator.orchestrateExitDecision(position);
```

### Signal Processing

**SignalPipeline** handles all signal processing from reception to execution.

Location: `refactored/pipeline/signal-pipeline.ts`

```typescript
import { SignalPipeline } from './refactored/pipeline/signal-pipeline.ts';

const pipeline = new SignalPipeline(
  signalNormalizer,
  signalValidator,
  deduplicationCache,
  decisionOrchestrator,
  positionManager,
  config
);

await pipeline.processSignal(rawSignal);
```

## Migration Steps

### Step 1: Update Imports

Replace legacy imports:

```typescript
// OLD - DEPRECATED
import { evaluateSignal } from '../_shared/decision-engine.ts';
import { evaluateSignalWithMarketData } from '../_shared/enhanced-decision-engine.ts';

// NEW - AUTHORITATIVE
import { DecisionOrchestrator } from '../_shared/refactored/orchestrator/decision-orchestrator.ts';
```

### Step 2: Update Function Calls

Replace legacy function calls:

```typescript
// OLD - DEPRECATED
const decision = evaluateSignal({
  signal,
  riskLimits,
  openPositions,
  dailyPnL,
  weeklyPnL,
  totalPnL,
});

// NEW - AUTHORITATIVE
const decision = await orchestrator.orchestrateEntryDecision(signal);
```

### Step 3: Update Exit Logic

Replace legacy exit logic:

```typescript
// OLD - DEPRECATED
import { evaluateExit } from '../_shared/exit-rules.ts';

// NEW - AUTHORITATIVE
const exitDecision = await orchestrator.orchestrateExitDecision(position);
```

### Step 4: Use Signal Pipeline

Route all signals through the unified pipeline:

```typescript
// In webhook handler
import { SignalPipeline } from '../_shared/refactored/pipeline/signal-pipeline.ts';

// Process signal through pipeline
await pipeline.processSignal(incomingSignal);
```

## Key Differences

### Unified Architecture

- **Single decision path**: All decisions go through DecisionOrchestrator
- **Clear pipeline**: Signals flow through defined stages
- **Proper error handling**: Each stage has error boundaries
- **Comprehensive logging**: All decisions are audited

### Improved Caching

- **Context Cache**: Eliminates redundant API calls
- **Deduplication Cache**: Prevents duplicate signal processing
- **Request Coalescing**: Handles concurrent requests efficiently

### Better Observability

- **Metrics**: Track latency, acceptance rates, rejection reasons
- **Health Checks**: Monitor component health
- **Audit Trail**: Complete history of all decisions

## Configuration

The refactored system uses centralized configuration:

Location: `refactored/core/config.ts`

```typescript
import { defaultConfig } from './refactored/core/config.ts';

// Use default config or customize
const config = {
  ...defaultConfig,
  validation: {
    ...defaultConfig.validation,
    cooldownSeconds: 120,
  },
};
```

## Testing

The refactored system includes comprehensive tests:

- **Property-based tests**: Verify universal correctness properties
- **Unit tests**: Test specific examples and edge cases
- **Integration tests**: Validate end-to-end flows

Run tests:
```bash
deno task test
```

## Timeline

- **Current**: Legacy code marked as deprecated
- **Next Release**: Legacy code will be removed
- **Action Required**: Migrate to refactored architecture before next release

## Support

For questions or issues during migration:

1. Review this migration guide
2. Check the refactored component documentation
3. Review test files for usage examples
4. Consult the design document: `.kiro/specs/trading-system-refactor/design.md`
