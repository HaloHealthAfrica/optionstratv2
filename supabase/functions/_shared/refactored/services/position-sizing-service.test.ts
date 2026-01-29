/**
 * Property-based tests for Position Sizing Service
 * Tests Properties 11, 12, 13
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { PositionSizingService } from './position-sizing-service.ts';
import { Signal, ContextData, Regime } from '../core/types.ts';
import { defaultConfig } from '../core/config.ts';

describe('Position Sizing Service Property Tests', () => {
  let service: PositionSizingService;

  beforeEach(() => {
    service = new PositionSizingService(defaultConfig);
  });

  /**
   * Property 11: Position Sizing Calculation Ordering
   * For any position size calculation, the Position_Sizing service SHALL apply multipliers
   * in the order: base sizing → Kelly criterion → regime adjustments → confluence adjustments,
   * with each step using the output of the previous step.
   * Validates: Requirements 7.2
   */
  it('Property 11: Sizing applies multipliers in correct order', () => {
    fc.assert(
      fc.property(
        fc.record({
          confidence: fc.integer({ min: 0, max: 100 }),
          regime: fc.constantFrom('LOW_VOL', 'HIGH_VOL', 'NORMAL') as fc.Arbitrary<Regime>,
          confluenceScore: fc.double({ min: 0, max: 1 }),
        }),
        (data) => {
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
            trend: 'NEUTRAL',
            bias: 0,
            regime: data.regime,
            timestamp: new Date(),
          };

          const result = service.calculateSize(signal, data.confidence, context, data.confluenceScore);

          // Verify ordering: each step uses output of previous step
          expect(result.calculation.afterBase).toBe(result.calculation.baseSize);
          
          expect(result.calculation.afterKelly).toBeCloseTo(
            result.calculation.afterBase * result.calculation.kellyMultiplier,
            5
          );
          
          expect(result.calculation.afterRegime).toBeCloseTo(
            result.calculation.afterKelly * result.calculation.regimeMultiplier,
            5
          );
          
          expect(result.calculation.afterConfluence).toBeCloseTo(
            result.calculation.afterRegime * result.calculation.confluenceMultiplier,
            5
          );

          // Final size should be floor of afterConfluence (or capped at max)
          const expectedFinal = Math.min(result.calculation.afterConfluence, defaultConfig.sizing.maxSize);
          if (expectedFinal >= defaultConfig.sizing.minSize) {
            expect(result.calculation.finalSize).toBe(Math.floor(expectedFinal));
          } else {
            expect(result.calculation.finalSize).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12: Position Size Maximum Enforcement
   * For any set of sizing multipliers and adjustments, the final position size
   * SHALL never exceed the configured maximum position size limit.
   * Validates: Requirements 7.4
   */
  it('Property 12: Final size never exceeds maximum', () => {
    fc.assert(
      fc.property(
        fc.record({
          confidence: fc.integer({ min: 0, max: 100 }),
          regime: fc.constantFrom('LOW_VOL', 'HIGH_VOL', 'NORMAL') as fc.Arbitrary<Regime>,
          confluenceScore: fc.double({ min: 0, max: 1 }),
        }),
        (data) => {
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
            trend: 'NEUTRAL',
            bias: 0,
            regime: data.regime,
            timestamp: new Date(),
          };

          const result = service.calculateSize(signal, data.confidence, context, data.confluenceScore);

          // Final size must never exceed max
          expect(result.size).toBeLessThanOrEqual(defaultConfig.sizing.maxSize);
          expect(result.calculation.finalSize).toBeLessThanOrEqual(defaultConfig.sizing.maxSize);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13: Position Size Integer Constraint
   * For any position size calculation, the result SHALL be a whole number (integer) of contracts.
   * Validates: Requirements 7.5
   */
  it('Property 13: Final size is always an integer', () => {
    fc.assert(
      fc.property(
        fc.record({
          confidence: fc.integer({ min: 0, max: 100 }),
          regime: fc.constantFrom('LOW_VOL', 'HIGH_VOL', 'NORMAL') as fc.Arbitrary<Regime>,
          confluenceScore: fc.double({ min: 0, max: 1 }),
        }),
        (data) => {
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
            trend: 'NEUTRAL',
            bias: 0,
            regime: data.regime,
            timestamp: new Date(),
          };

          const result = service.calculateSize(signal, data.confidence, context, data.confluenceScore);

          // Final size must be an integer
          expect(Number.isInteger(result.size)).toBe(true);
          expect(Number.isInteger(result.calculation.finalSize)).toBe(true);
          expect(result.size).toBe(result.calculation.finalSize);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Size is non-negative
   */
  it('Property: Size is always non-negative', () => {
    fc.assert(
      fc.property(
        fc.record({
          confidence: fc.integer({ min: 0, max: 100 }),
          regime: fc.constantFrom('LOW_VOL', 'HIGH_VOL', 'NORMAL') as fc.Arbitrary<Regime>,
          confluenceScore: fc.double({ min: 0, max: 1 }),
        }),
        (data) => {
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
            trend: 'NEUTRAL',
            bias: 0,
            regime: data.regime,
            timestamp: new Date(),
          };

          const result = service.calculateSize(signal, data.confidence, context, data.confluenceScore);

          expect(result.size).toBeGreaterThanOrEqual(0);
          expect(result.calculation.finalSize).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Higher confidence increases size
   */
  it('Property: Higher confidence generally increases size', () => {
    fc.assert(
      fc.property(
        fc.record({
          lowConfidence: fc.integer({ min: 0, max: 40 }),
          highConfidence: fc.integer({ min: 60, max: 100 }),
          regime: fc.constantFrom('NORMAL') as fc.Arbitrary<Regime>,
          confluenceScore: fc.double({ min: 0.5, max: 1 }),
        }),
        (data) => {
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
            trend: 'NEUTRAL',
            bias: 0,
            regime: data.regime,
            timestamp: new Date(),
          };

          const lowResult = service.calculateSize(signal, data.lowConfidence, context, data.confluenceScore);
          const highResult = service.calculateSize(signal, data.highConfidence, context, data.confluenceScore);

          // Higher confidence should result in higher or equal size (before max cap)
          if (lowResult.calculation.afterConfluence < defaultConfig.sizing.maxSize &&
              highResult.calculation.afterConfluence < defaultConfig.sizing.maxSize) {
            expect(highResult.size).toBeGreaterThanOrEqual(lowResult.size);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Position Sizing Service Unit Tests', () => {
  let service: PositionSizingService;

  beforeEach(() => {
    service = new PositionSizingService(defaultConfig);
  });

  it('should calculate size with base parameters', () => {
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
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const result = service.calculateSize(signal, 50, context, 0.5);

    expect(result.size).toBeGreaterThan(0);
    expect(Number.isInteger(result.size)).toBe(true);
  });

  it('should apply Kelly multiplier based on confidence', () => {
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
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const lowConfResult = service.calculateSize(signal, 20, context, 0.5);
    const highConfResult = service.calculateSize(signal, 80, context, 0.5);

    // Higher confidence should have higher Kelly multiplier
    expect(highConfResult.calculation.kellyMultiplier).toBeGreaterThan(
      lowConfResult.calculation.kellyMultiplier
    );
  });

  it('should reduce size in high volatility regime', () => {
    const signal: Signal = {
      id: 'test',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const normalContext: ContextData = {
      vix: 20,
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const highVolContext: ContextData = {
      ...normalContext,
      regime: 'HIGH_VOL',
    };

    const normalResult = service.calculateSize(signal, 50, normalContext, 0.5);
    const highVolResult = service.calculateSize(signal, 50, highVolContext, 0.5);

    expect(highVolResult.calculation.regimeMultiplier).toBeLessThan(
      normalResult.calculation.regimeMultiplier
    );
  });

  it('should increase size with higher confluence', () => {
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
      trend: 'NEUTRAL',
      bias: 0,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    const lowConfluenceResult = service.calculateSize(signal, 50, context, 0.2);
    const highConfluenceResult = service.calculateSize(signal, 50, context, 0.9);

    expect(highConfluenceResult.calculation.confluenceMultiplier).toBeGreaterThan(
      lowConfluenceResult.calculation.confluenceMultiplier
    );
  });

  it('should enforce maximum size limit', () => {
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
      vix: 10,
      trend: 'BULLISH',
      bias: 1,
      regime: 'LOW_VOL', // Increases size
      timestamp: new Date(),
    };

    // High confidence and high confluence to push size up
    const result = service.calculateSize(signal, 100, context, 1.0);

    expect(result.size).toBeLessThanOrEqual(defaultConfig.sizing.maxSize);
  });

  it('should return 0 for size below minimum', () => {
    // Create config with high minimum
    const customConfig = {
      ...defaultConfig,
      sizing: {
        ...defaultConfig.sizing,
        minSize: 5,
      },
    };

    const customService = new PositionSizingService(customConfig);

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
      vix: 50,
      trend: 'BEARISH',
      bias: -1,
      regime: 'HIGH_VOL', // Decreases size
      timestamp: new Date(),
    };

    // Low confidence and low confluence
    const result = customService.calculateSize(signal, 10, context, 0.1);

    // Should return 0 if below minimum
    if (result.calculation.afterConfluence < customConfig.sizing.minSize) {
      expect(result.size).toBe(0);
    }
  });

  it('should categorize sizing correctly', () => {
    expect(service.getSizingCategory(0)).toBe('NONE');
    expect(service.getSizingCategory(1)).toBe('SMALL');
    expect(service.getSizingCategory(3)).toBe('MEDIUM');
    expect(service.getSizingCategory(8)).toBe('LARGE');
  });

  it('should validate sizing parameters', () => {
    const validResult = service.validateSizingParams(50, 0.5);
    expect(validResult.valid).toBe(true);

    const invalidConfidence = service.validateSizingParams(150, 0.5);
    expect(invalidConfidence.valid).toBe(false);

    const invalidConfluence = service.validateSizingParams(50, 1.5);
    expect(invalidConfluence.valid).toBe(false);
  });
});
