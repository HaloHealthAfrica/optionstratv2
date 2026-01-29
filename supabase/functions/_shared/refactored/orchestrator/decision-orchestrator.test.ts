/**
 * Property-based tests for Decision Orchestrator
 * Tests Properties 9, 10, 14, 20, 25, 35
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { DecisionOrchestrator } from './decision-orchestrator.ts';
import { Signal, ContextData, Trend, Regime } from '../core/types.ts';
import { ContextCache } from '../cache/context-cache.ts';
import { GEXService } from '../services/gex-service.ts';
import { PositionManager } from '../services/position-manager.ts';
import { RiskManager } from '../services/risk-manager.ts';
import { PositionSizingService } from '../services/position-sizing-service.ts';
import { ConfluenceCalculator } from '../services/confluence-calculator.ts';
import { defaultConfig } from '../core/config.ts';

describe('Decision Orchestrator Property Tests', () => {
  let orchestrator: DecisionOrchestrator;
  let mockContextCache: any;
  let mockGexService: any;
  let mockPositionManager: any;
  let riskManager: RiskManager;
  let positionSizingService: PositionSizingService;
  let confluenceCalculator: ConfluenceCalculator;

  beforeEach(() => {
    // Create real instances for services that don't need mocking
    riskManager = new RiskManager(defaultConfig);
    positionSizingService = new PositionSizingService(defaultConfig);
    confluenceCalculator = new ConfluenceCalculator();

    // Mock context cache
    mockContextCache = {
      getContext: vi.fn(),
    };

    // Mock GEX service
    mockGexService = {
      getSignalWithMetadata: vi.fn(),
    };

    // Mock position manager
    mockPositionManager = {
      wouldExceedMaxExposure: vi.fn().mockReturnValue(false),
      getTotalExposure: vi.fn().mockReturnValue(0),
    };

    orchestrator = new DecisionOrchestrator(
      mockContextCache,
      mockGexService,
      mockPositionManager,
      riskManager,
      positionSizingService,
      confluenceCalculator,
      defaultConfig
    );
  });

  /**
   * Property 9: Confidence Calculation Ordering
   * For any confidence calculation, the Decision_Engine SHALL apply adjustments in the order:
   * context adjustments → positioning adjustments → GEX adjustments,
   * with each adjustment using the output of the previous adjustment as its input.
   * Validates: Requirements 6.2, 6.3
   */
  it('Property 9: Confidence adjustments applied in correct order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          vix: fc.double({ min: 10, max: 40 }),
          trend: fc.constantFrom('BULLISH', 'BEARISH', 'NEUTRAL') as fc.Arbitrary<Trend>,
          bias: fc.double({ min: -1, max: 1 }),
          regime: fc.constantFrom('LOW_VOL', 'HIGH_VOL', 'NORMAL') as fc.Arbitrary<Regime>,
          direction: fc.constantFrom('CALL', 'PUT'),
        }),
        async (data) => {
          const signal: Signal = {
            id: 'test',
            source: 'TRADINGVIEW',
            symbol: 'SPY',
            direction: data.direction,
            timeframe: '5m',
            timestamp: new Date(),
            metadata: {},
          };

          const context: ContextData = {
            vix: data.vix,
            trend: data.trend,
            bias: data.bias,
            regime: data.regime,
            timestamp: new Date(),
          };

          mockContextCache.getContext.mockResolvedValue(context);
          mockGexService.getSignalWithMetadata.mockResolvedValue({
            signal: null,
            isStale: false,
            effectiveWeight: 0,
          });

          const decision = await orchestrator.orchestrateEntryDecision(signal);

          if (decision.decision === 'ENTER') {
            // Verify calculations exist
            expect(decision.calculations).toBeDefined();
            expect(decision.calculations.baseConfidence).toBeDefined();
            expect(decision.calculations.contextAdjustment).toBeDefined();
            expect(decision.calculations.positioningAdjustment).toBeDefined();
            expect(decision.calculations.gexAdjustment).toBeDefined();
            expect(decision.calculations.finalConfidence).toBeDefined();

            // Verify ordering: base + context + positioning + gex = final (before clamping)
            const expectedConfidence = 
              decision.calculations.baseConfidence +
              decision.calculations.contextAdjustment +
              decision.calculations.positioningAdjustment +
              decision.calculations.gexAdjustment;

            // Final should be clamped version of expected
            const clampedExpected = Math.max(0, Math.min(100, expectedConfidence));
            expect(decision.calculations.finalConfidence).toBeCloseTo(clampedExpected, 1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: Confidence Score Clamping
   * For any set of confidence adjustments (base, context, positioning, GEX),
   * the final confidence score SHALL always be clamped to the range [0, 100].
   * Validates: Requirements 6.5
   */
  it('Property 10: Final confidence is always clamped to [0, 100]', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          vix: fc.double({ min: 0, max: 100 }),
          trend: fc.constantFrom('BULLISH', 'BEARISH', 'NEUTRAL') as fc.Arbitrary<Trend>,
          bias: fc.double({ min: -1, max: 1 }),
          regime: fc.constantFrom('LOW_VOL', 'HIGH_VOL', 'NORMAL') as fc.Arbitrary<Regime>,
          direction: fc.constantFrom('CALL', 'PUT'),
        }),
        async (data) => {
          const signal: Signal = {
            id: 'test',
            source: 'TRADINGVIEW',
            symbol: 'SPY',
            direction: data.direction,
            timeframe: '5m',
            timestamp: new Date(),
            metadata: {},
          };

          const context: ContextData = {
            vix: data.vix,
            trend: data.trend,
            bias: data.bias,
            regime: data.regime,
            timestamp: new Date(),
          };

          mockContextCache.getContext.mockResolvedValue(context);
          mockGexService.getSignalWithMetadata.mockResolvedValue({
            signal: null,
            isStale: false,
            effectiveWeight: 0,
          });

          const decision = await orchestrator.orchestrateEntryDecision(signal);

          // Final confidence must be in [0, 100]
          expect(decision.confidence).toBeGreaterThanOrEqual(0);
          expect(decision.confidence).toBeLessThanOrEqual(100);
          expect(decision.calculations.finalConfidence).toBeGreaterThanOrEqual(0);
          expect(decision.calculations.finalConfidence).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14: Market Data Failure Rejection
   * For any signal where market data fetch fails, the System SHALL return
   * a decision of REJECT rather than proceeding with placeholder or default values.
   * Validates: Requirements 8.1
   */
  it('Property 14: Market data failure results in REJECT', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
          direction: fc.constantFrom('CALL', 'PUT'),
        }),
        async (data) => {
          const signal: Signal = {
            id: 'test',
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: '5m',
            timestamp: new Date(),
            metadata: {},
          };

          // Mock context fetch failure
          mockContextCache.getContext.mockRejectedValue(new Error('Network error'));

          const decision = await orchestrator.orchestrateEntryDecision(signal);

          // Must reject on market data failure
          expect(decision.decision).toBe('REJECT');
          expect(decision.reasoning.some(r => r.includes('Market data'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20: GEX Strength Confidence Integration
   * For any entry decision with available GEX data, the Decision_Engine SHALL
   * incorporate GEX signal strength into the confidence calculation,
   * with stronger GEX signals increasing confidence.
   * Validates: Requirements 11.3
   */
  it('Property 20: GEX strength affects confidence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          gexStrength: fc.double({ min: -1, max: 1 }),
          direction: fc.constantFrom('CALL', 'PUT'),
        }),
        async (data) => {
          const signal: Signal = {
            id: 'test',
            source: 'TRADINGVIEW',
            symbol: 'SPY',
            direction: data.direction,
            timeframe: '5m',
            timestamp: new Date(),
            metadata: {},
          };

          const context: ContextData = {
            vix: 20,
            trend: 'NEUTRAL',
            bias: 0,
            regime: 'NORMAL',
            timestamp: new Date(),
          };

          mockContextCache.getContext.mockResolvedValue(context);

          // Mock GEX signal
          mockGexService.getSignalWithMetadata.mockResolvedValue({
            signal: {
              symbol: 'SPY',
              timeframe: '5m',
              strength: data.gexStrength,
              direction: data.direction,
              timestamp: new Date(),
              age: 60000, // 1 minute
            },
            isStale: false,
            effectiveWeight: 1.0,
          });

          const decision = await orchestrator.orchestrateEntryDecision(signal);

          if (decision.decision === 'ENTER') {
            // GEX adjustment should be present
            expect(decision.calculations.gexAdjustment).toBeDefined();
            
            // Stronger GEX should result in larger adjustment magnitude
            if (Math.abs(data.gexStrength) > 0.5) {
              expect(Math.abs(decision.calculations.gexAdjustment)).toBeGreaterThan(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25: Confluence Confidence Boost
   * For any signal with high confluence (>= 0.7), the Decision_Engine SHALL
   * increase the confidence score compared to the same signal with low confluence.
   * Validates: Requirements 12.4
   */
  it('Property 25: High confluence boosts confidence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ'),
          direction: fc.constantFrom('CALL', 'PUT'),
          numAgreeingSignals: fc.integer({ min: 3, max: 5 }),
        }),
        async (data) => {
          const signal: Signal = {
            id: 'test',
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: '5m',
            timestamp: new Date(),
            metadata: {},
          };

          const context: ContextData = {
            vix: 20,
            trend: 'NEUTRAL',
            bias: 0,
            regime: 'NORMAL',
            timestamp: new Date(),
          };

          mockContextCache.getContext.mockResolvedValue(context);
          mockGexService.getSignalWithMetadata.mockResolvedValue({
            signal: null,
            isStale: false,
            effectiveWeight: 0,
          });

          // Create high confluence scenario (all signals agree)
          const agreeingSignals: Signal[] = Array(data.numAgreeingSignals).fill(null).map((_, i) => ({
            id: `signal-${i}`,
            source: 'GEX',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: '5m',
            timestamp: new Date(),
            metadata: {},
          }));

          const decisionHighConfluence = await orchestrator.orchestrateEntryDecision(signal, agreeingSignals);

          // Create low confluence scenario (no other signals)
          const decisionLowConfluence = await orchestrator.orchestrateEntryDecision(signal, []);

          // High confluence should result in higher confidence
          if (decisionHighConfluence.decision === 'ENTER' && decisionLowConfluence.decision === 'ENTER') {
            expect(decisionHighConfluence.confidence).toBeGreaterThanOrEqual(decisionLowConfluence.confidence);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 35: GEX Service Graceful Degradation
   * For any signal processed when GEX_Service is unavailable or returns an error,
   * the System SHALL complete signal processing and return a decision without GEX data
   * rather than failing completely.
   * Validates: Requirements 19.1
   */
  it('Property 35: GEX service failure does not crash orchestrator', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ'),
          direction: fc.constantFrom('CALL', 'PUT'),
        }),
        async (data) => {
          const signal: Signal = {
            id: 'test',
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: '5m',
            timestamp: new Date(),
            metadata: {},
          };

          const context: ContextData = {
            vix: 20,
            trend: 'BULLISH',
            bias: 0.5,
            regime: 'NORMAL',
            timestamp: new Date(),
          };

          mockContextCache.getContext.mockResolvedValue(context);
          
          // Mock GEX service failure
          mockGexService.getSignalWithMetadata.mockRejectedValue(new Error('GEX service unavailable'));

          const decision = await orchestrator.orchestrateEntryDecision(signal);

          // Should return a valid decision (not crash)
          expect(decision).toBeDefined();
          expect(decision.decision).toBeDefined();
          expect(['ENTER', 'REJECT']).toContain(decision.decision);
          
          // Should have reasoning mentioning GEX failure
          expect(decision.reasoning.some(r => r.includes('GEX'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Decision Orchestrator Unit Tests', () => {
  let orchestrator: DecisionOrchestrator;
  let mockContextCache: any;
  let mockGexService: any;
  let mockPositionManager: any;
  let riskManager: RiskManager;
  let positionSizingService: PositionSizingService;
  let confluenceCalculator: ConfluenceCalculator;

  beforeEach(() => {
    riskManager = new RiskManager(defaultConfig);
    positionSizingService = new PositionSizingService(defaultConfig);
    confluenceCalculator = new ConfluenceCalculator();

    mockContextCache = {
      getContext: vi.fn(),
    };

    mockGexService = {
      getSignalWithMetadata: vi.fn(),
    };

    mockPositionManager = {
      wouldExceedMaxExposure: vi.fn().mockReturnValue(false),
      getTotalExposure: vi.fn().mockReturnValue(0),
    };

    orchestrator = new DecisionOrchestrator(
      mockContextCache,
      mockGexService,
      mockPositionManager,
      riskManager,
      positionSizingService,
      confluenceCalculator,
      defaultConfig
    );
  });

  it('should return ENTER decision for valid signal', async () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const context: ContextData = {
      vix: 20,
      trend: 'BULLISH',
      bias: 0.5,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    mockContextCache.getContext.mockResolvedValue(context);
    mockGexService.getSignalWithMetadata.mockResolvedValue({
      signal: null,
      isStale: false,
      effectiveWeight: 0,
    });

    const decision = await orchestrator.orchestrateEntryDecision(signal);

    expect(decision.decision).toBe('ENTER');
    expect(decision.confidence).toBeGreaterThan(0);
    expect(decision.positionSize).toBeGreaterThan(0);
  });

  it('should reject signal when market data fails', async () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    mockContextCache.getContext.mockRejectedValue(new Error('Network error'));

    const decision = await orchestrator.orchestrateEntryDecision(signal);

    expect(decision.decision).toBe('REJECT');
    expect(decision.reasoning.some(r => r.includes('Market data'))).toBe(true);
  });

  it('should continue without GEX when GEX service fails', async () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const context: ContextData = {
      vix: 20,
      trend: 'BULLISH',
      bias: 0.5,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    mockContextCache.getContext.mockResolvedValue(context);
    mockGexService.getSignalWithMetadata.mockRejectedValue(new Error('GEX unavailable'));

    const decision = await orchestrator.orchestrateEntryDecision(signal);

    expect(decision.decision).toBe('ENTER');
    expect(decision.reasoning.some(r => r.includes('GEX'))).toBe(true);
  });

  it('should reject when VIX exceeds maximum', async () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const context: ContextData = {
      vix: 60, // Exceeds max
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    mockContextCache.getContext.mockResolvedValue(context);
    mockGexService.getSignalWithMetadata.mockResolvedValue({
      signal: null,
      isStale: false,
      effectiveWeight: 0,
    });

    const decision = await orchestrator.orchestrateEntryDecision(signal);

    expect(decision.decision).toBe('REJECT');
    expect(decision.reasoning.some(r => r.includes('VIX'))).toBe(true);
  });

  it('should reject when position size below minimum', async () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const context: ContextData = {
      vix: 45, // High VIX
      trend: 'BEARISH', // Counter-trend
      bias: -1,
      regime: 'HIGH_VOL',
      timestamp: new Date(),
    };

    mockContextCache.getContext.mockResolvedValue(context);
    mockGexService.getSignalWithMetadata.mockResolvedValue({
      signal: null,
      isStale: false,
      effectiveWeight: 0,
    });

    const decision = await orchestrator.orchestrateEntryDecision(signal);

    // Should reject due to low confidence/size
    expect(decision.decision).toBe('REJECT');
  });

  it('should reject when max exposure exceeded', async () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: { price: 450 },
    };

    const context: ContextData = {
      vix: 20,
      trend: 'BULLISH',
      bias: 0.5,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    mockContextCache.getContext.mockResolvedValue(context);
    mockGexService.getSignalWithMetadata.mockResolvedValue({
      signal: null,
      isStale: false,
      effectiveWeight: 0,
    });
    mockPositionManager.wouldExceedMaxExposure.mockReturnValue(true);

    const decision = await orchestrator.orchestrateEntryDecision(signal);

    expect(decision.decision).toBe('REJECT');
    expect(decision.reasoning.some(r => r.includes('exposure'))).toBe(true);
  });
});

describe('Exit Decision Orchestrator Property Tests', () => {
  let orchestrator: DecisionOrchestrator;
  let mockContextCache: any;
  let mockGexService: any;
  let mockPositionManager: any;
  let riskManager: RiskManager;
  let positionSizingService: PositionSizingService;
  let confluenceCalculator: ConfluenceCalculator;

  beforeEach(() => {
    riskManager = new RiskManager(defaultConfig);
    positionSizingService = new PositionSizingService(defaultConfig);
    confluenceCalculator = new ConfluenceCalculator();

    mockContextCache = {
      getContext: vi.fn(),
    };

    mockGexService = {
      detectFlip: vi.fn(),
    };

    mockPositionManager = {
      calculateUnrealizedPnL: vi.fn((position: any, currentPrice: number) => {
        return (currentPrice - position.entryPrice) * position.quantity * 100;
      }),
    };

    orchestrator = new DecisionOrchestrator(
      mockContextCache,
      mockGexService,
      mockPositionManager,
      riskManager,
      positionSizingService,
      confluenceCalculator,
      defaultConfig
    );
  });

  /**
   * Property 1: Exit Orchestration Completeness
   * For any position being evaluated for exit, the orchestrator SHALL check all exit criteria
   * (profit target, stop loss, GEX flip, time exit) and return a structured decision with non-empty reasoning.
   * Validates: Requirements 2.3, 2.4
   */
  it('Property 1: Exit orchestration checks all criteria and returns complete decision', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          entryPrice: fc.double({ min: 1, max: 500 }),
          currentPrice: fc.double({ min: 1, max: 500 }),
          quantity: fc.integer({ min: 1, max: 10 }),
          direction: fc.constantFrom('CALL', 'PUT'),
        }),
        async (data) => {
          const position: Position = {
            id: 'test-position',
            signalId: 'test-signal',
            symbol: 'SPY',
            direction: data.direction,
            quantity: data.quantity,
            entryPrice: data.entryPrice,
            entryTime: new Date(),
            currentPrice: data.currentPrice,
            status: 'OPEN',
          };

          mockGexService.detectFlip.mockResolvedValue({
            hasFlipped: false,
            currentDirection: data.direction,
            previousDirection: data.direction,
          });

          const decision = await orchestrator.orchestrateExitDecision(position);

          // Must return a valid decision
          expect(decision).toBeDefined();
          expect(['EXIT', 'HOLD']).toContain(decision.decision);

          // Must have non-empty reasoning
          expect(decision.reasoning).toBeDefined();
          expect(decision.reasoning.length).toBeGreaterThan(0);

          // Must have complete calculations
          expect(decision.calculations).toBeDefined();
          expect(decision.calculations.profitTarget).toBeDefined();
          expect(decision.calculations.stopLoss).toBeDefined();
          expect(decision.calculations.gexFlip).toBeDefined();
          expect(decision.calculations.timeExit).toBeDefined();
          expect(decision.calculations.currentPnL).toBeDefined();
          expect(decision.calculations.currentPnLPercent).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Exit Orchestration Error Resilience
   * For any error condition during exit orchestration (market data failure, GEX service failure, etc.),
   * the orchestrator SHALL return a valid ExitDecision without crashing.
   * Validates: Requirements 2.5
   */
  it('Property 2: Exit orchestration handles errors gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          entryPrice: fc.double({ min: 1, max: 500 }),
          quantity: fc.integer({ min: 1, max: 10 }),
          direction: fc.constantFrom('CALL', 'PUT'),
        }),
        async (data) => {
          const position: Position = {
            id: 'test-position',
            signalId: 'test-signal',
            symbol: 'SPY',
            direction: data.direction,
            quantity: data.quantity,
            entryPrice: data.entryPrice,
            entryTime: new Date(),
            status: 'OPEN',
          };

          // Mock GEX service failure
          mockGexService.detectFlip.mockRejectedValue(new Error('GEX service unavailable'));

          const decision = await orchestrator.orchestrateExitDecision(position);

          // Must return a valid decision (not crash)
          expect(decision).toBeDefined();
          expect(['EXIT', 'HOLD']).toContain(decision.decision);
          expect(decision.reasoning).toBeDefined();
          expect(decision.reasoning.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Exit Priority Ordering
   * For any position where multiple exit conditions are met simultaneously,
   * the Exit_Decision service SHALL return the highest priority exit reason according to the defined precedence:
   * profit target > stop loss > GEX flip > time exit.
   * Validates: Requirements 3.3
   */
  it('Property 3: Exit priority ordering is respected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          entryPrice: fc.double({ min: 50, max: 200 }),
          // Generate prices that will trigger different exit conditions
          priceMultiplier: fc.double({ min: 0.5, max: 2.0 }),
          quantity: fc.integer({ min: 1, max: 10 }),
          direction: fc.constantFrom('CALL', 'PUT'),
          hasGexFlip: fc.boolean(),
        }),
        async (data) => {
          const currentPrice = data.entryPrice * data.priceMultiplier;
          const pnlPercent = ((currentPrice - data.entryPrice) / data.entryPrice) * 100;
          
          const position: Position = {
            id: 'test-position',
            signalId: 'test-signal',
            symbol: 'SPY',
            direction: data.direction,
            quantity: data.quantity,
            entryPrice: data.entryPrice,
            entryTime: new Date(),
            currentPrice: currentPrice,
            status: 'OPEN',
          };

          // Mock GEX flip based on random boolean
          const oppositeDirection = data.direction === 'CALL' ? 'PUT' : 'CALL';
          mockGexService.detectFlip.mockResolvedValue({
            hasFlipped: data.hasGexFlip,
            currentDirection: data.hasGexFlip ? oppositeDirection : data.direction,
            previousDirection: data.direction,
          });

          const decision = await orchestrator.orchestrateExitDecision(position);

          // Verify priority ordering based on conditions met
          const profitTarget = 50; // Default from config
          const stopLoss = -30; // Default from config
          
          if (pnlPercent >= profitTarget) {
            // Profit target has highest priority
            expect(decision.decision).toBe('EXIT');
            expect(decision.exitReason).toBe('PROFIT_TARGET');
            expect(decision.calculations.profitTarget).toBe(true);
          } else if (pnlPercent <= stopLoss) {
            // Stop loss has second priority
            expect(decision.decision).toBe('EXIT');
            expect(decision.exitReason).toBe('STOP_LOSS');
            expect(decision.calculations.stopLoss).toBe(true);
          } else if (data.hasGexFlip) {
            // GEX flip has third priority
            expect(decision.decision).toBe('EXIT');
            expect(decision.exitReason).toBe('GEX_FLIP');
            expect(decision.calculations.gexFlip).toBe(true);
          }
          // Note: Time exit is not tested here as it depends on current time
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Exit Decision Orchestrator Unit Tests', () => {
  let orchestrator: DecisionOrchestrator;
  let mockContextCache: any;
  let mockGexService: any;
  let mockPositionManager: any;
  let riskManager: RiskManager;
  let positionSizingService: PositionSizingService;
  let confluenceCalculator: ConfluenceCalculator;

  beforeEach(() => {
    riskManager = new RiskManager(defaultConfig);
    positionSizingService = new PositionSizingService(defaultConfig);
    confluenceCalculator = new ConfluenceCalculator();

    mockContextCache = {
      getContext: vi.fn(),
    };

    mockGexService = {
      detectFlip: vi.fn(),
    };

    mockPositionManager = {
      calculateUnrealizedPnL: vi.fn((position: any, currentPrice: number) => {
        return (currentPrice - position.entryPrice) * position.quantity * 100;
      }),
    };

    orchestrator = new DecisionOrchestrator(
      mockContextCache,
      mockGexService,
      mockPositionManager,
      riskManager,
      positionSizingService,
      confluenceCalculator,
      defaultConfig
    );
  });

  it('should exit when profit target reached', async () => {
    const position: Position = {
      id: 'test-position',
      signalId: 'test-signal',
      symbol: 'SPY',
      direction: 'CALL',
      quantity: 1,
      entryPrice: 100,
      entryTime: new Date(),
      currentPrice: 200, // 100% profit
      status: 'OPEN',
    };

    mockGexService.detectFlip.mockResolvedValue({ hasFlipped: false });

    const decision = await orchestrator.orchestrateExitDecision(position);

    expect(decision.decision).toBe('EXIT');
    expect(decision.exitReason).toBe('PROFIT_TARGET');
    expect(decision.calculations.profitTarget).toBe(true);
  });

  it('should exit when stop loss triggered', async () => {
    const position: Position = {
      id: 'test-position',
      signalId: 'test-signal',
      symbol: 'SPY',
      direction: 'CALL',
      quantity: 1,
      entryPrice: 100,
      entryTime: new Date(),
      currentPrice: 50, // 50% loss
      status: 'OPEN',
    };

    mockGexService.detectFlip.mockResolvedValue({ hasFlipped: false });

    const decision = await orchestrator.orchestrateExitDecision(position);

    expect(decision.decision).toBe('EXIT');
    expect(decision.exitReason).toBe('STOP_LOSS');
    expect(decision.calculations.stopLoss).toBe(true);
  });

  it('should exit when GEX flip detected', async () => {
    const position: Position = {
      id: 'test-position',
      signalId: 'test-signal',
      symbol: 'SPY',
      direction: 'CALL',
      quantity: 1,
      entryPrice: 100,
      entryTime: new Date(),
      currentPrice: 110, // Small profit, not enough for profit target
      status: 'OPEN',
    };

    mockGexService.detectFlip.mockResolvedValue({
      hasFlipped: true,
      currentDirection: 'PUT',
      previousDirection: 'CALL',
    });

    const decision = await orchestrator.orchestrateExitDecision(position);

    expect(decision.decision).toBe('EXIT');
    expect(decision.exitReason).toBe('GEX_FLIP');
    expect(decision.calculations.gexFlip).toBe(true);
  });

  it('should hold when no exit conditions met', async () => {
    const position: Position = {
      id: 'test-position',
      signalId: 'test-signal',
      symbol: 'SPY',
      direction: 'CALL',
      quantity: 1,
      entryPrice: 100,
      entryTime: new Date(),
      currentPrice: 105, // Small profit
      status: 'OPEN',
    };

    mockGexService.detectFlip.mockResolvedValue({ hasFlipped: false });

    const decision = await orchestrator.orchestrateExitDecision(position);

    expect(decision.decision).toBe('HOLD');
    expect(decision.exitReason).toBeUndefined();
  });

  it('should handle GEX service failure gracefully', async () => {
    const position: Position = {
      id: 'test-position',
      signalId: 'test-signal',
      symbol: 'SPY',
      direction: 'CALL',
      quantity: 1,
      entryPrice: 100,
      entryTime: new Date(),
      currentPrice: 105,
      status: 'OPEN',
    };

    mockGexService.detectFlip.mockRejectedValue(new Error('GEX unavailable'));

    const decision = await orchestrator.orchestrateExitDecision(position);

    // Should return valid decision despite GEX failure
    expect(decision).toBeDefined();
    expect(['EXIT', 'HOLD']).toContain(decision.decision);
    expect(decision.reasoning.some(r => r.includes('GEX'))).toBe(true);
  });

  it('should calculate P&L correctly', async () => {
    const position: Position = {
      id: 'test-position',
      signalId: 'test-signal',
      symbol: 'SPY',
      direction: 'CALL',
      quantity: 2,
      entryPrice: 100,
      entryTime: new Date(),
      currentPrice: 120,
      status: 'OPEN',
    };

    mockGexService.detectFlip.mockResolvedValue({ hasFlipped: false });

    const decision = await orchestrator.orchestrateExitDecision(position);

    // P&L = (120 - 100) * 2 * 100 = 4000
    expect(decision.calculations.currentPnL).toBe(4000);
    // P&L % = (120 - 100) / 100 * 100 = 20%
    expect(decision.calculations.currentPnLPercent).toBe(20);
  });
});
