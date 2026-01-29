/**
 * Integration Tests for Complete Signal Flow
 * Tests Requirements 10.1, 8.1, 8.2, 19.1, 19.2, 18.2, 18.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalPipeline } from './pipeline/signal-pipeline.ts';
import { SignalNormalizer } from './pipeline/signal-normalizer.ts';
import { SignalValidator } from './validation/signal-validator.ts';
import { DeduplicationCache } from './cache/deduplication-cache.ts';
import { DecisionOrchestrator } from './orchestrator/decision-orchestrator.ts';
import { ContextCache } from './cache/context-cache.ts';
import { GEXService } from './services/gex-service.ts';
import { PositionManager } from './services/position-manager.ts';
import { RiskManager } from './services/risk-manager.ts';
import { PositionSizingService } from './services/position-sizing-service.ts';
import { ConfluenceCalculator } from './services/confluence-calculator.ts';
import { defaultConfig } from './core/config.ts';
import type { ContextData, GEXSignal } from './core/types.ts';

describe('Integration Test 23.1: Complete Signal Flow', () => {
  let pipeline: SignalPipeline;
  let mockContextFetch: ReturnType<typeof vi.fn>;
  let mockGexService: any;
  let mockPositionManager: any;

  beforeEach(() => {
    // Mock context fetch
    mockContextFetch = vi.fn().mockResolvedValue({
      vix: 20,
      trend: 'BULLISH',
      bias: 0.5,
      regime: 'NORMAL',
      timestamp: new Date(),
    } as ContextData);

    // Mock GEX service
    mockGexService = {
      getSignalWithMetadata: vi.fn().mockResolvedValue({
        signal: {
          symbol: 'SPY',
          timeframe: '5m',
          strength: 0.7,
          direction: 'CALL',
          timestamp: new Date(),
          age: 1000,
        } as GEXSignal,
        isStale: false,
        effectiveWeight: 1,
      }),
      detectFlip: vi.fn().mockResolvedValue({ hasFlipped: false }),
    };

    // Mock position manager
    mockPositionManager = {
      openPosition: vi.fn().mockResolvedValue({
        success: true,
        position: {
          id: 'pos-123',
          signalId: 'sig-123',
          symbol: 'SPY',
          direction: 'CALL',
          quantity: 2,
          entryPrice: 450,
          entryTime: new Date(),
          status: 'OPEN',
        },
      }),
      getOpenPositions: vi.fn().mockResolvedValue([]),
      getPositionBySignalId: vi.fn().mockResolvedValue(null),
      closePosition: vi.fn().mockResolvedValue(true),
      calculateUnrealizedPnL: vi.fn().mockReturnValue(100),
    };

    // Create services
    const contextCache = new ContextCache(defaultConfig, mockContextFetch);
    const riskManager = new RiskManager(defaultConfig);
    const positionSizingService = new PositionSizingService(defaultConfig);
    const confluenceCalculator = new ConfluenceCalculator();

    const orchestrator = new DecisionOrchestrator(
      contextCache,
      mockGexService,
      mockPositionManager,
      riskManager,
      positionSizingService,
      confluenceCalculator,
      defaultConfig
    );

    const normalizer = new SignalNormalizer();
    const validator = new SignalValidator(defaultConfig);
    const deduplicationCache = new DeduplicationCache(defaultConfig);

    pipeline = new SignalPipeline(
      normalizer,
      validator,
      deduplicationCache,
      orchestrator,
      mockPositionManager,
      defaultConfig
    );
  });

  /**
   * Test complete signal flow from webhook to execution
   * Validates: Requirement 10.1
   */
  it('should process signal through complete pipeline: webhook → normalization → validation → decision → execution', async () => {
    const rawSignal = {
      source: 'TradingView',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date().toISOString(),
      price: 450,
      metadata: {
        score: 85,
        confidence: 0.85,
      },
    };

    const result = await pipeline.processSignal(rawSignal);

    // Verify signal was processed successfully
    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
    expect(result.signal).toBeDefined();
    expect(result.signal?.symbol).toBe('SPY');
    expect(result.signal?.direction).toBe('CALL');

    // Verify decision was made
    expect(result.decision).toBeDefined();
    expect(result.decision?.decision).toBe('ENTER');
    expect(result.decision?.confidence).toBeGreaterThan(0);
    expect(result.decision?.positionSize).toBeGreaterThan(0);

    // Verify all components were called
    expect(mockContextFetch).toHaveBeenCalled();
    expect(mockGexService.getSignalWithMetadata).toHaveBeenCalled();
    expect(mockPositionManager.openPosition).toHaveBeenCalled();
  });
});

describe('Integration Test 23.2: Error Scenario Handling', () => {
  let pipeline: SignalPipeline;
  let mockContextFetch: ReturnType<typeof vi.fn>;
  let mockGexService: any;
  let mockPositionManager: any;

  beforeEach(() => {
    mockContextFetch = vi.fn();
    mockGexService = {
      getSignalWithMetadata: vi.fn(),
      detectFlip: vi.fn(),
    };
    mockPositionManager = {
      openPosition: vi.fn(),
      getOpenPositions: vi.fn().mockResolvedValue([]),
      getPositionBySignalId: vi.fn().mockResolvedValue(null),
    };
  });

  /**
   * Test market data failure handling
   * Validates: Requirements 8.1
   */
  it('should reject signal when market data fetch fails', async () => {
    // Mock context fetch failure
    mockContextFetch.mockRejectedValue(new Error('Market data unavailable'));

    const contextCache = new ContextCache(defaultConfig, mockContextFetch);
    const riskManager = new RiskManager(defaultConfig);
    const positionSizingService = new PositionSizingService(defaultConfig);
    const confluenceCalculator = new ConfluenceCalculator();

    const orchestrator = new DecisionOrchestrator(
      contextCache,
      mockGexService,
      mockPositionManager,
      riskManager,
      positionSizingService,
      confluenceCalculator,
      defaultConfig
    );

    const normalizer = new SignalNormalizer();
    const validator = new SignalValidator(defaultConfig);
    const deduplicationCache = new DeduplicationCache(defaultConfig);

    pipeline = new SignalPipeline(
      normalizer,
      validator,
      deduplicationCache,
      orchestrator,
      mockPositionManager,
      defaultConfig
    );

    const rawSignal = {
      source: 'TradingView',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date().toISOString(),
      price: 450,
      metadata: { score: 85 },
    };

    const result = await pipeline.processSignal(rawSignal);

    // Verify signal was rejected due to market data failure
    expect(result.success).toBe(false);
    expect(result.failureReason).toContain('Market data');
    expect(mockPositionManager.openPosition).not.toHaveBeenCalled();
  });

  /**
   * Test GEX service failure handling with graceful degradation
   * Validates: Requirements 19.1
   */
  it('should process signal without GEX data when GEX service fails', async () => {
    // Mock successful context fetch
    mockContextFetch.mockResolvedValue({
      vix: 20,
      trend: 'BULLISH',
      bias: 0.5,
      regime: 'NORMAL',
      timestamp: new Date(),
    } as ContextData);

    // Mock GEX service failure
    mockGexService.getSignalWithMetadata.mockRejectedValue(new Error('GEX service unavailable'));

    mockPositionManager.openPosition.mockResolvedValue({
      success: true,
      position: {
        id: 'pos-123',
        signalId: 'sig-123',
        symbol: 'SPY',
        direction: 'CALL',
        quantity: 1,
        entryPrice: 450,
        entryTime: new Date(),
        status: 'OPEN',
      },
    });

    const contextCache = new ContextCache(defaultConfig, mockContextFetch);
    const riskManager = new RiskManager(defaultConfig);
    const positionSizingService = new PositionSizingService(defaultConfig);
    const confluenceCalculator = new ConfluenceCalculator();

    const orchestrator = new DecisionOrchestrator(
      contextCache,
      mockGexService,
      mockPositionManager,
      riskManager,
      positionSizingService,
      confluenceCalculator,
      defaultConfig
    );

    const normalizer = new SignalNormalizer();
    const validator = new SignalValidator(defaultConfig);
    const deduplicationCache = new DeduplicationCache(defaultConfig);

    pipeline = new SignalPipeline(
      normalizer,
      validator,
      deduplicationCache,
      orchestrator,
      mockPositionManager,
      defaultConfig
    );

    const rawSignal = {
      source: 'TradingView',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date().toISOString(),
      price: 450,
      metadata: { score: 85 },
    };

    const result = await pipeline.processSignal(rawSignal);

    // Verify signal was processed despite GEX failure (graceful degradation)
    expect(result.success).toBe(true);
    expect(result.decision?.decision).toBe('ENTER');
    expect(mockPositionManager.openPosition).toHaveBeenCalled();
  });

  /**
   * Test context data fallback
   * Validates: Requirements 19.2
   */
  it('should use stale cache when context fetch fails and cache < 5 minutes old', async () => {
    const staleContext: ContextData = {
      vix: 22,
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes old
    };

    // First call succeeds to populate cache
    mockContextFetch.mockResolvedValueOnce(staleContext);
    
    const contextCache = new ContextCache(defaultConfig, mockContextFetch);
    
    // Populate cache
    await contextCache.getContext();
    
    // Second call fails
    mockContextFetch.mockRejectedValueOnce(new Error('Network error'));
    
    // Should use stale cache
    const context = await contextCache.getContext();
    
    expect(context.vix).toBe(22);
    expect(context.trend).toBe('NEUTRAL');
  });
});

describe('Integration Test 23.3: Duplicate Signal Handling', () => {
  let pipeline: SignalPipeline;
  let mockContextFetch: ReturnType<typeof vi.fn>;
  let mockGexService: any;
  let mockPositionManager: any;

  beforeEach(() => {
    mockContextFetch = vi.fn().mockResolvedValue({
      vix: 20,
      trend: 'BULLISH',
      bias: 0.5,
      regime: 'NORMAL',
      timestamp: new Date(),
    } as ContextData);

    mockGexService = {
      getSignalWithMetadata: vi.fn().mockResolvedValue({
        signal: {
          symbol: 'SPY',
          timeframe: '5m',
          strength: 0.7,
          direction: 'CALL',
          timestamp: new Date(),
          age: 1000,
        } as GEXSignal,
        isStale: false,
        effectiveWeight: 1,
      }),
      detectFlip: vi.fn().mockResolvedValue({ hasFlipped: false }),
    };

    mockPositionManager = {
      openPosition: vi.fn().mockResolvedValue({
        success: true,
        position: {
          id: 'pos-123',
          signalId: 'sig-123',
          symbol: 'SPY',
          direction: 'CALL',
          quantity: 2,
          entryPrice: 450,
          entryTime: new Date(),
          status: 'OPEN',
        },
      }),
      getOpenPositions: vi.fn().mockResolvedValue([]),
      getPositionBySignalId: vi.fn().mockResolvedValue(null),
    };

    const contextCache = new ContextCache(defaultConfig, mockContextFetch);
    const riskManager = new RiskManager(defaultConfig);
    const positionSizingService = new PositionSizingService(defaultConfig);
    const confluenceCalculator = new ConfluenceCalculator();

    const orchestrator = new DecisionOrchestrator(
      contextCache,
      mockGexService,
      mockPositionManager,
      riskManager,
      positionSizingService,
      confluenceCalculator,
      defaultConfig
    );

    const normalizer = new SignalNormalizer();
    const validator = new SignalValidator(defaultConfig);
    const deduplicationCache = new DeduplicationCache(defaultConfig);

    pipeline = new SignalPipeline(
      normalizer,
      validator,
      deduplicationCache,
      orchestrator,
      mockPositionManager,
      defaultConfig
    );
  });

  /**
   * Test duplicate signal rejection
   * Validates: Requirements 18.2
   */
  it('should reject duplicate signals within 60 seconds', async () => {
    const rawSignal = {
      source: 'TradingView',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date().toISOString(),
      price: 450,
      metadata: { score: 85 },
    };

    // Process signal first time
    const result1 = await pipeline.processSignal(rawSignal);
    expect(result1.success).toBe(true);

    // Process same signal again immediately
    const result2 = await pipeline.processSignal(rawSignal);
    
    // Should be rejected as duplicate
    expect(result2.success).toBe(false);
    expect(result2.failureReason).toContain('duplicate');
    expect(result2.stage).toBe('DEDUPLICATION');
  });

  /**
   * Test signal processing after cache expiration
   * Validates: Requirements 18.4
   */
  it('should process signal after deduplication cache expires (5 minutes)', async () => {
    const rawSignal = {
      source: 'TradingView',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date().toISOString(),
      price: 450,
      metadata: { score: 85 },
    };

    // Process signal first time
    const result1 = await pipeline.processSignal(rawSignal);
    expect(result1.success).toBe(true);

    // Simulate 5 minutes passing (cache expiration)
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000 + 100));

    // Process same signal again after expiration
    const result2 = await pipeline.processSignal(rawSignal);
    
    // Should be processed (not rejected as duplicate)
    expect(result2.success).toBe(true);
    expect(result2.stage).not.toBe('DEDUPLICATION');
  });
});
