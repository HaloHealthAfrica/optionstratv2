/**
 * Property-based tests for Signal Pipeline
 * Tests Properties 17, 18, 37
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { SignalPipeline } from './signal-pipeline.ts';
import { SignalNormalizer } from './signal-normalizer.ts';
import { SignalValidator } from '../validation/signal-validator.ts';
import { DeduplicationCache } from '../cache/deduplication-cache.ts';
import { DecisionOrchestrator } from '../orchestrator/decision-orchestrator.ts';
import { Signal } from '../core/types.ts';
import { defaultConfig } from '../core/config.ts';

describe('Signal Pipeline Property Tests', () => {
  let pipeline: SignalPipeline;
  let normalizer: SignalNormalizer;
  let mockValidator: any;
  let mockDeduplicationCache: any;
  let mockOrchestrator: any;
  let mockPositionManager: any;

  beforeEach(() => {
    normalizer = new SignalNormalizer();
    
    // Mock validator
    mockValidator = {
      validate: vi.fn().mockResolvedValue({
        valid: true,
        checks: {
          cooldown: true,
          marketHours: true,
          mtf: true,
          confluence: true,
          timeFilters: true,
        },
        details: {},
      }),
    };

    // Mock deduplication cache
    mockDeduplicationCache = {
      isDuplicate: vi.fn().mockReturnValue(false),
    };

    // Mock orchestrator
    mockOrchestrator = {
      orchestrateEntryDecision: vi.fn().mockResolvedValue({
        decision: 'ENTER',
        signal: {} as Signal,
        confidence: 75,
        positionSize: 2,
        reasoning: ['All checks passed'],
        calculations: {
          baseConfidence: 70,
          contextAdjustment: 5,
          positioningAdjustment: 0,
          gexAdjustment: 0,
          finalConfidence: 75,
          baseSizing: 2,
          kellyMultiplier: 1,
          regimeMultiplier: 1,
          confluenceMultiplier: 1,
          finalSize: 2,
        },
      }),
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
    };

    pipeline = new SignalPipeline(
      normalizer,
      mockValidator,
      mockDeduplicationCache,
      mockOrchestrator,
      mockPositionManager,
      defaultConfig
    );
  });

  /**
   * Property 17: Signal Tracking ID Assignment
   * For any signal entering the pipeline, the System SHALL assign a unique tracking ID
   * that persists throughout all pipeline stages.
   * Validates: Requirements 10.2
   */
  it('Property 17: Every signal receives a unique tracking ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            source: fc.constantFrom('TRADINGVIEW', 'GEX', 'MTF', 'MANUAL'),
            symbol: fc.constantFrom('SPY', 'QQQ', 'IWM', 'AAPL'),
            direction: fc.constantFrom('CALL', 'PUT'),
            timeframe: fc.constantFrom('5m', '15m', '1h', '4h'),
            price: fc.double({ min: 1, max: 1000 }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (rawSignals) => {
          const trackingIds = new Set<string>();
          
          for (const rawSignal of rawSignals) {
            const result = await pipeline.processSignal(rawSignal);
            
            // Must have a tracking ID
            expect(result.trackingId).toBeDefined();
            expect(result.trackingId).not.toBe('');
            expect(result.trackingId).not.toBe('unknown');
            
            // Tracking ID must be unique
            expect(trackingIds.has(result.trackingId)).toBe(false);
            trackingIds.add(result.trackingId);
            
            // Tracking ID must persist in the signal
            if (result.signal) {
              expect(result.signal.id).toBe(result.trackingId);
            }
          }
          
          // All tracking IDs must be unique
          expect(trackingIds.size).toBe(rawSignals.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 18: Pipeline Failure Recording
   * For any signal that fails at any pipeline stage, the System SHALL record
   * the failure with both the tracking ID and a non-empty failure reason.
   * Validates: Requirements 10.4
   */
  it('Property 18: Failed signals are recorded with tracking ID and reason', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          source: fc.constantFrom('TRADINGVIEW', 'GEX', 'MTF', 'MANUAL'),
          symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
          direction: fc.constantFrom('CALL', 'PUT'),
          timeframe: fc.constantFrom('5m', '15m', '1h'),
          failureStage: fc.constantFrom('VALIDATION', 'DEDUPLICATION', 'DECISION'),
        }),
        async (data) => {
          // Configure mock to fail at specified stage
          if (data.failureStage === 'VALIDATION') {
            mockValidator.validate.mockResolvedValueOnce({
              valid: false,
              checks: {
                cooldown: false,
                marketHours: true,
                mtf: true,
                confluence: true,
                timeFilters: true,
              },
              rejectionReason: 'Cooldown active',
              details: {},
            });
          } else if (data.failureStage === 'DEDUPLICATION') {
            mockDeduplicationCache.isDuplicate.mockReturnValueOnce(true);
          } else if (data.failureStage === 'DECISION') {
            mockOrchestrator.orchestrateEntryDecision.mockResolvedValueOnce({
              decision: 'REJECT',
              signal: {} as Signal,
              confidence: 0,
              positionSize: 0,
              reasoning: ['VIX too high'],
              calculations: {} as any,
            });
          }

          const rawSignal = {
            source: data.source,
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.timeframe,
          };

          const result = await pipeline.processSignal(rawSignal);

          // Must fail
          expect(result.success).toBe(false);
          
          // Must have tracking ID
          expect(result.trackingId).toBeDefined();
          expect(result.trackingId).not.toBe('');
          
          // Must have non-empty failure reason
          expect(result.failureReason).toBeDefined();
          expect(result.failureReason).not.toBe('');
          expect(result.failureReason!.length).toBeGreaterThan(0);
          
          // Failure should be recorded
          const failure = pipeline.getFailure(result.trackingId);
          expect(failure).toBeDefined();
          expect(failure!.trackingId).toBe(result.trackingId);
          expect(failure!.reason).toBe(result.failureReason);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 37: Individual Signal Failure Isolation
   * For any signal that fails during processing, the System SHALL continue
   * processing subsequent signals without interruption.
   * Validates: Requirements 19.4
   */
  it('Property 37: Individual signal failures do not prevent subsequent processing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            source: fc.constantFrom('TRADINGVIEW', 'GEX', 'MTF', 'MANUAL'),
            symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
            direction: fc.constantFrom('CALL', 'PUT'),
            timeframe: fc.constantFrom('5m', '15m', '1h'),
            shouldFail: fc.boolean(),
          }),
          { minLength: 3, maxLength: 10 }
        ),
        async (signals) => {
          // Configure mocks to fail some signals
          let validationCallCount = 0;
          mockValidator.validate.mockImplementation(async () => {
            const shouldFail = signals[validationCallCount]?.shouldFail;
            validationCallCount++;
            
            if (shouldFail) {
              return {
                valid: false,
                checks: {
                  cooldown: false,
                  marketHours: true,
                  mtf: true,
                  confluence: true,
                  timeFilters: true,
                },
                rejectionReason: 'Test failure',
                details: {},
              };
            }
            
            return {
              valid: true,
              checks: {
                cooldown: true,
                marketHours: true,
                mtf: true,
                confluence: true,
                timeFilters: true,
              },
              details: {},
            };
          });

          const rawSignals = signals.map(s => ({
            source: s.source,
            symbol: s.symbol,
            direction: s.direction,
            timeframe: s.timeframe,
          }));

          const results = await pipeline.processSignalBatch(rawSignals);

          // All signals must be processed
          expect(results.length).toBe(rawSignals.length);
          
          // Count successes and failures
          const successCount = results.filter(r => r.success).length;
          const failureCount = results.filter(r => !r.success).length;
          const expectedFailures = signals.filter(s => s.shouldFail).length;
          
          // Verify that failures didn't stop processing
          expect(successCount + failureCount).toBe(rawSignals.length);
          
          // Each result must have a tracking ID
          for (const result of results) {
            expect(result.trackingId).toBeDefined();
            expect(result.trackingId).not.toBe('');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('Signal Pipeline Unit Tests', () => {
  let pipeline: SignalPipeline;
  let normalizer: SignalNormalizer;
  let mockValidator: any;
  let mockDeduplicationCache: any;
  let mockOrchestrator: any;
  let mockPositionManager: any;

  beforeEach(() => {
    normalizer = new SignalNormalizer();
    
    mockValidator = {
      validate: vi.fn().mockResolvedValue({
        valid: true,
        checks: {
          cooldown: true,
          marketHours: true,
          mtf: true,
          confluence: true,
          timeFilters: true,
        },
        details: {},
      }),
    };

    mockDeduplicationCache = {
      isDuplicate: vi.fn().mockReturnValue(false),
    };

    mockOrchestrator = {
      orchestrateEntryDecision: vi.fn().mockResolvedValue({
        decision: 'ENTER',
        signal: {} as Signal,
        confidence: 75,
        positionSize: 2,
        reasoning: ['All checks passed'],
        calculations: {
          baseConfidence: 70,
          contextAdjustment: 5,
          positioningAdjustment: 0,
          gexAdjustment: 0,
          finalConfidence: 75,
          baseSizing: 2,
          kellyMultiplier: 1,
          regimeMultiplier: 1,
          confluenceMultiplier: 1,
          finalSize: 2,
        },
      }),
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
    };

    pipeline = new SignalPipeline(
      normalizer,
      mockValidator,
      mockDeduplicationCache,
      mockOrchestrator,
      mockPositionManager,
      defaultConfig
    );
  });

  it('should process valid signal successfully', async () => {
    const rawSignal = {
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      price: 450,
    };

    const result = await pipeline.processSignal(rawSignal);

    expect(result.success).toBe(true);
    expect(result.trackingId).toBeDefined();
    expect(result.signal).toBeDefined();
    expect(result.decision).toBeDefined();
  });

  it('should fail signal at validation stage', async () => {
    mockValidator.validate.mockResolvedValueOnce({
      valid: false,
      checks: {
        cooldown: false,
        marketHours: true,
        mtf: true,
        confluence: true,
        timeFilters: true,
      },
      rejectionReason: 'Cooldown active',
      details: {},
    });

    const rawSignal = {
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
    };

    const result = await pipeline.processSignal(rawSignal);

    expect(result.success).toBe(false);
    expect(result.failureReason).toContain('Cooldown');
    expect(result.stage).toBe('VALIDATION');
  });

  it('should fail signal at deduplication stage', async () => {
    mockDeduplicationCache.isDuplicate.mockReturnValueOnce(true);

    const rawSignal = {
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
    };

    const result = await pipeline.processSignal(rawSignal);

    expect(result.success).toBe(false);
    expect(result.failureReason).toContain('Duplicate');
    expect(result.stage).toBe('DEDUPLICATION');
  });

  it('should fail signal at decision stage', async () => {
    mockOrchestrator.orchestrateEntryDecision.mockResolvedValueOnce({
      decision: 'REJECT',
      signal: {} as Signal,
      confidence: 0,
      positionSize: 0,
      reasoning: ['VIX too high'],
      calculations: {} as any,
    });

    const rawSignal = {
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
    };

    const result = await pipeline.processSignal(rawSignal);

    expect(result.success).toBe(false);
    expect(result.failureReason).toContain('VIX');
    expect(result.stage).toBe('DECISION');
  });

  it('should record failures with tracking ID', async () => {
    mockValidator.validate.mockResolvedValueOnce({
      valid: false,
      checks: {
        cooldown: false,
        marketHours: true,
        mtf: true,
        confluence: true,
        timeFilters: true,
      },
      rejectionReason: 'Test failure',
      details: {},
    });

    const rawSignal = {
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
    };

    const result = await pipeline.processSignal(rawSignal);

    const failure = pipeline.getFailure(result.trackingId);
    expect(failure).toBeDefined();
    expect(failure!.trackingId).toBe(result.trackingId);
    expect(failure!.reason).toBe(result.failureReason);
  });

  it('should process batch with mixed success/failure', async () => {
    let callCount = 0;
    mockValidator.validate.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        return {
          valid: false,
          checks: {
            cooldown: false,
            marketHours: true,
            mtf: true,
            confluence: true,
            timeFilters: true,
          },
          rejectionReason: 'Test failure',
          details: {},
        };
      }
      return {
        valid: true,
        checks: {
          cooldown: true,
          marketHours: true,
          mtf: true,
          confluence: true,
          timeFilters: true,
        },
        details: {},
      };
    });

    const rawSignals = [
      { source: 'TRADINGVIEW', symbol: 'SPY', direction: 'CALL', timeframe: '5m', price: 450 },
      { source: 'TRADINGVIEW', symbol: 'QQQ', direction: 'PUT', timeframe: '15m', price: 380 },
      { source: 'TRADINGVIEW', symbol: 'IWM', direction: 'CALL', timeframe: '1h', price: 210 },
    ];

    const results = await pipeline.processSignalBatch(rawSignals);

    expect(results.length).toBe(3);
    expect(results.filter(r => r.success).length).toBe(2);
    expect(results.filter(r => !r.success).length).toBe(1);
  });

  it('should provide pipeline status', () => {
    const status = pipeline.getPipelineStatus();

    expect(status).toBeDefined();
    expect(status.RECEPTION).toBeDefined();
    expect(status.NORMALIZATION).toBeDefined();
    expect(status.VALIDATION).toBeDefined();
    expect(status.DEDUPLICATION).toBeDefined();
    expect(status.DECISION).toBeDefined();
    expect(status.EXECUTION).toBeDefined();
  });
});
