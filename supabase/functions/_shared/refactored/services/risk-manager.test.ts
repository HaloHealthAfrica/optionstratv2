/**
 * Property-based tests for Risk Manager
 * Tests Property 27 and unit tests for VIX reduction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { RiskManager } from './risk-manager.ts';
import { Signal, ContextData, Trend, Regime } from '../core/types.ts';
import { defaultConfig } from '../core/config.ts';

describe('Risk Manager Property Tests', () => {
  let riskManager: RiskManager;

  beforeEach(() => {
    riskManager = new RiskManager(defaultConfig);
  });

  /**
   * Property 27: Market Filter Precedence
   * For any signal, the System SHALL apply market condition filters
   * (VIX, market hours, trend) before calculating position sizes.
   * Validates: Requirements 13.4
   */
  it('Property 27: Market filters are applied before position sizing', () => {
    fc.assert(
      fc.property(
        fc.record({
          vix: fc.double({ min: 0, max: 100 }),
          trend: fc.constantFrom('BULLISH', 'BEARISH', 'NEUTRAL') as fc.Arbitrary<Trend>,
          bias: fc.double({ min: -1, max: 1 }),
          regime: fc.constantFrom('LOW_VOL', 'HIGH_VOL', 'NORMAL') as fc.Arbitrary<Regime>,
          direction: fc.constantFrom('CALL', 'PUT'),
        }),
        (data) => {
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

          const filterResult = riskManager.applyMarketFilters(signal, context);

          // Filters must be checked
          expect(filterResult.filters).toBeDefined();
          expect(filterResult.filters.vixCheck).toBeDefined();
          expect(filterResult.filters.marketHoursCheck).toBeDefined();
          expect(filterResult.filters.trendCheck).toBeDefined();

          // If VIX exceeds max, signal should be rejected
          if (data.vix > defaultConfig.risk.maxVixForEntry) {
            expect(filterResult.passed).toBe(false);
            expect(filterResult.rejectionReason).toBeDefined();
          }

          // Position size multiplier should be defined
          expect(filterResult.positionSizeMultiplier).toBeDefined();
          expect(filterResult.positionSizeMultiplier).toBeGreaterThan(0);
          expect(filterResult.positionSizeMultiplier).toBeLessThanOrEqual(1);

          // If VIX > 30, position size should be reduced
          if (data.vix > 30) {
            expect(filterResult.positionSizeMultiplier).toBeLessThan(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Context adjustments are bounded
   */
  it('Property: Context adjustments are within configured range', () => {
    fc.assert(
      fc.property(
        fc.record({
          vix: fc.double({ min: 0, max: 100 }),
          trend: fc.constantFrom('BULLISH', 'BEARISH', 'NEUTRAL') as fc.Arbitrary<Trend>,
          bias: fc.double({ min: -1, max: 1 }),
          regime: fc.constantFrom('LOW_VOL', 'HIGH_VOL', 'NORMAL') as fc.Arbitrary<Regime>,
          direction: fc.constantFrom('CALL', 'PUT'),
        }),
        (data) => {
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

          const contextAdj = riskManager.calculateContextAdjustment(signal, context);
          const positioningAdj = riskManager.calculatePositioningAdjustment(context);

          // Context adjustment must be within range
          expect(contextAdj).toBeGreaterThanOrEqual(-defaultConfig.confidence.contextAdjustmentRange);
          expect(contextAdj).toBeLessThanOrEqual(defaultConfig.confidence.contextAdjustmentRange);

          // Positioning adjustment must be within range
          expect(positioningAdj).toBeGreaterThanOrEqual(-defaultConfig.confidence.positioningAdjustmentRange);
          expect(positioningAdj).toBeLessThanOrEqual(defaultConfig.confidence.positioningAdjustmentRange);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Counter-trend signals reduce confidence
   */
  it('Property: Counter-trend signals have negative context adjustment', () => {
    fc.assert(
      fc.property(
        fc.record({
          vix: fc.double({ min: 15, max: 30 }), // Normal VIX range
          bias: fc.double({ min: -0.5, max: 0.5 }), // Neutral bias
          regime: fc.constantFrom('NORMAL') as fc.Arbitrary<Regime>,
        }),
        (data) => {
          // Bullish signal with bearish trend
          const bullishSignal: Signal = {
            id: 'test',
            source: 'TRADINGVIEW',
            symbol: 'SPY',
            direction: 'CALL',
            timeframe: '5m',
            timestamp: new Date(),
            metadata: {},
          };

          const bearishContext: ContextData = {
            vix: data.vix,
            trend: 'BEARISH',
            bias: data.bias,
            regime: data.regime,
            timestamp: new Date(),
          };

          const adjustment = riskManager.calculateContextAdjustment(bullishSignal, bearishContext);

          // Counter-trend should reduce confidence (negative adjustment)
          expect(adjustment).toBeLessThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Risk Manager Unit Tests', () => {
  let riskManager: RiskManager;

  beforeEach(() => {
    riskManager = new RiskManager(defaultConfig);
  });

  /**
   * Unit test for VIX position size reduction
   * Requirement 13.1: VIX > 30 reduces position size by 50%
   */
  it('should reduce position size by 50% when VIX > 30', () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const highVixContext: ContextData = {
      vix: 35,
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const filterResult = riskManager.applyMarketFilters(signal, highVixContext);

    expect(filterResult.positionSizeMultiplier).toBe(0.5);
  });

  it('should not reduce position size when VIX <= 30', () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const normalVixContext: ContextData = {
      vix: 20,
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const filterResult = riskManager.applyMarketFilters(signal, normalVixContext);

    expect(filterResult.positionSizeMultiplier).toBe(1.0);
  });

  it('should reject signal when VIX exceeds maximum', () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const extremeVixContext: ContextData = {
      vix: 60,
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const filterResult = riskManager.applyMarketFilters(signal, extremeVixContext);

    expect(filterResult.passed).toBe(false);
    expect(filterResult.rejectionReason).toContain('VIX too high');
  });

  it('should reduce confidence for counter-trend signals by 20 points', () => {
    const bullishSignal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const bearishContext: ContextData = {
      vix: 20,
      trend: 'BEARISH',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const adjustment = riskManager.calculateContextAdjustment(bullishSignal, bearishContext);

    // Should include -20 for counter-trend
    expect(adjustment).toBeLessThanOrEqual(-20);
  });

  it('should increase confidence for trend-aligned signals', () => {
    const bullishSignal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const bullishContext: ContextData = {
      vix: 20,
      trend: 'BULLISH',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const adjustment = riskManager.calculateContextAdjustment(bullishSignal, bullishContext);

    // Should be positive for trend alignment
    expect(adjustment).toBeGreaterThan(0);
  });

  it('should adjust confidence based on VIX levels', () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const lowVixContext: ContextData = {
      vix: 12,
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const highVixContext: ContextData = {
      vix: 35,
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const lowVixAdj = riskManager.calculateContextAdjustment(signal, lowVixContext);
    const highVixAdj = riskManager.calculateContextAdjustment(signal, highVixContext);

    // Low VIX should increase confidence
    expect(lowVixAdj).toBeGreaterThan(0);
    // High VIX should decrease confidence
    expect(highVixAdj).toBeLessThan(0);
  });

  it('should adjust confidence based on regime', () => {
    const lowVolContext: ContextData = {
      vix: 20,
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'LOW_VOL',
      timestamp: new Date(),
    };

    const highVolContext: ContextData = {
      vix: 20,
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'HIGH_VOL',
      timestamp: new Date(),
    };

    const lowVolAdj = riskManager.calculatePositioningAdjustment(lowVolContext);
    const highVolAdj = riskManager.calculatePositioningAdjustment(highVolContext);

    // Low vol should increase confidence
    expect(lowVolAdj).toBeGreaterThan(0);
    // High vol should decrease confidence
    expect(highVolAdj).toBeLessThan(0);
  });

  it('should calculate all adjustments correctly', () => {
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
      regime: 'LOW_VOL',
      timestamp: new Date(),
    };

    const adjustments = riskManager.calculateAllAdjustments(signal, context);

    expect(adjustments.contextAdjustment).toBeDefined();
    expect(adjustments.positioningAdjustment).toBeDefined();
    expect(adjustments.totalAdjustment).toBe(
      adjustments.contextAdjustment + adjustments.positioningAdjustment
    );
  });

  it('should assess risk level correctly', () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const lowRiskContext: ContextData = {
      vix: 15,
      trend: 'BULLISH',
      bias: 0.5,
      regime: 'LOW_VOL',
      timestamp: new Date(),
    };

    const highRiskContext: ContextData = {
      vix: 40,
      trend: 'BEARISH',
      bias: -0.5,
      regime: 'HIGH_VOL',
      timestamp: new Date(),
    };

    const lowRiskAssessment = riskManager.getRiskAssessment(signal, lowRiskContext);
    const highRiskAssessment = riskManager.getRiskAssessment(signal, highRiskContext);

    expect(lowRiskAssessment.riskLevel).toBe('LOW');
    expect(highRiskAssessment.riskLevel).toBe('HIGH');
    expect(highRiskAssessment.factors.length).toBeGreaterThan(0);
  });

  it('should identify signals for rejection', () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const extremeContext: ContextData = {
      vix: 60,
      trend: 'BEARISH',
      bias: -1,
      regime: 'HIGH_VOL',
      timestamp: new Date(),
    };

    const rejection = riskManager.shouldRejectSignal(signal, extremeContext);

    expect(rejection.reject).toBe(true);
    expect(rejection.reason).toBeDefined();
  });
});
