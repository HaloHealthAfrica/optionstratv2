/**
 * Property-based tests for Confluence Calculator
 * Tests Properties 22, 23, 24
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ConfluenceCalculator } from './confluence-calculator.ts';
import { Signal, SignalSource, Direction } from '../core/types.ts';

describe('Confluence Calculator Property Tests', () => {
  let calculator: ConfluenceCalculator;

  beforeEach(() => {
    calculator = new ConfluenceCalculator();
  });

  /**
   * Property 22: Confluence Calculation Formula
   * For any set of signals for the same symbol and timeframe, the confluence score
   * SHALL equal the number of signals agreeing on direction divided by the total number of signals.
   * Validates: Requirements 12.1
   */
  it('Property 22: Confluence equals agreeing signals / total signals', () => {
    fc.assert(
      fc.property(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
          timeframe: fc.constantFrom('5m', '15m', '1h'),
          targetDirection: fc.constantFrom('CALL', 'PUT') as fc.Arbitrary<Direction>,
          numAgreeing: fc.integer({ min: 0, max: 10 }),
          numDisagreeing: fc.integer({ min: 0, max: 10 }),
        }),
        (data) => {
          // Skip if no signals
          if (data.numAgreeing === 0 && data.numDisagreeing === 0) {
            return true;
          }

          const oppositeDirection: Direction = data.targetDirection === 'CALL' ? 'PUT' : 'CALL';

          // Create target signal
          const targetSignal: Signal = {
            id: 'target',
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.targetDirection,
            timeframe: data.timeframe,
            timestamp: new Date(),
            metadata: {},
          };

          // Create agreeing signals
          const agreeingSignals: Signal[] = Array(data.numAgreeing).fill(null).map((_, i) => ({
            id: `agreeing-${i}`,
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.targetDirection,
            timeframe: data.timeframe,
            timestamp: new Date(),
            metadata: {},
          }));

          // Create disagreeing signals
          const disagreeingSignals: Signal[] = Array(data.numDisagreeing).fill(null).map((_, i) => ({
            id: `disagreeing-${i}`,
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: oppositeDirection,
            timeframe: data.timeframe,
            timestamp: new Date(),
            metadata: {},
          }));

          const allSignals = [...agreeingSignals, ...disagreeingSignals];

          // Calculate simple (unweighted) confluence
          const confluence = calculator.calculateSimpleConfluence(targetSignal, allSignals);

          // Expected: agreeing / total
          const expectedConfluence = data.numAgreeing / (data.numAgreeing + data.numDisagreeing);

          expect(confluence).toBeCloseTo(expectedConfluence, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23: Confluence Timeframe Isolation
   * For any confluence calculation, only signals from the same timeframe SHALL contribute
   * to the confluence score; signals from different timeframes SHALL be excluded.
   * Validates: Requirements 12.2
   */
  it('Property 23: Only same timeframe signals contribute to confluence', () => {
    fc.assert(
      fc.property(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ'),
          targetTimeframe: fc.constantFrom('5m', '15m', '1h'),
          otherTimeframe: fc.constantFrom('5m', '15m', '1h', '4h'),
          direction: fc.constantFrom('CALL', 'PUT') as fc.Arbitrary<Direction>,
          numSameTimeframe: fc.integer({ min: 1, max: 5 }),
          numDifferentTimeframe: fc.integer({ min: 1, max: 5 }),
        }),
        (data) => {
          // Ensure timeframes are different
          if (data.targetTimeframe === data.otherTimeframe) {
            return true;
          }

          const targetSignal: Signal = {
            id: 'target',
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.targetTimeframe,
            timestamp: new Date(),
            metadata: {},
          };

          // Signals with same timeframe
          const sameTimeframeSignals: Signal[] = Array(data.numSameTimeframe).fill(null).map((_, i) => ({
            id: `same-${i}`,
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.targetTimeframe,
            timestamp: new Date(),
            metadata: {},
          }));

          // Signals with different timeframe (should be excluded)
          const differentTimeframeSignals: Signal[] = Array(data.numDifferentTimeframe).fill(null).map((_, i) => ({
            id: `different-${i}`,
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.otherTimeframe,
            timestamp: new Date(),
            metadata: {},
          }));

          const allSignals = [...sameTimeframeSignals, ...differentTimeframeSignals];

          const confluence = calculator.calculateSimpleConfluence(targetSignal, allSignals);

          // Confluence should be 1.0 because all same-timeframe signals agree
          // Different timeframe signals should be excluded
          expect(confluence).toBe(1.0);

          // Verify contributing sources only includes same timeframe
          const contributors = calculator.getContributingSources(targetSignal, allSignals);
          expect(contributors.total).toBe(data.numSameTimeframe);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24: Confluence Source Weighting
   * For any confluence calculation, signals from more reliable sources SHALL have
   * higher weight than signals from less reliable sources.
   * Validates: Requirements 12.3
   */
  it('Property 24: More reliable sources have higher weight', () => {
    fc.assert(
      fc.property(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ'),
          timeframe: fc.constantFrom('5m', '15m'),
          direction: fc.constantFrom('CALL', 'PUT') as fc.Arbitrary<Direction>,
        }),
        (data) => {
          const targetSignal: Signal = {
            id: 'target',
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.timeframe,
            timestamp: new Date(),
            metadata: {},
          };

          // Create signals from different sources, all agreeing
          const highReliabilitySignal: Signal = {
            id: 'high-reliability',
            source: 'TRADINGVIEW', // Weight: 1.0
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.timeframe,
            timestamp: new Date(),
            metadata: {},
          };

          const lowReliabilitySignal: Signal = {
            id: 'low-reliability',
            source: 'MANUAL', // Weight: 0.7
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.timeframe,
            timestamp: new Date(),
            metadata: {},
          };

          // Calculate confluence with only high reliability source
          const confluenceHigh = calculator.calculateConfluence(targetSignal, [highReliabilitySignal]);

          // Calculate confluence with only low reliability source
          const confluenceLow = calculator.calculateConfluence(targetSignal, [lowReliabilitySignal]);

          // Both should be 1.0 when all signals agree
          expect(confluenceHigh).toBe(1.0);
          expect(confluenceLow).toBe(1.0);

          // Now test with mixed agreement
          const oppositeDirection: Direction = data.direction === 'CALL' ? 'PUT' : 'CALL';

          const disagreeingHighReliability: Signal = {
            id: 'disagreeing-high',
            source: 'TRADINGVIEW', // Weight: 1.0
            symbol: data.symbol,
            direction: oppositeDirection,
            timeframe: data.timeframe,
            timestamp: new Date(),
            metadata: {},
          };

          const disagreeingLowReliability: Signal = {
            id: 'disagreeing-low',
            source: 'MANUAL', // Weight: 0.7
            symbol: data.symbol,
            direction: oppositeDirection,
            timeframe: data.timeframe,
            timestamp: new Date(),
            metadata: {},
          };

          // 1 agreeing high reliability vs 1 disagreeing high reliability = 0.5
          const confluenceMixedHigh = calculator.calculateConfluence(
            targetSignal,
            [highReliabilitySignal, disagreeingHighReliability]
          );

          // 1 agreeing low reliability vs 1 disagreeing low reliability = 0.5
          const confluenceMixedLow = calculator.calculateConfluence(
            targetSignal,
            [lowReliabilitySignal, disagreeingLowReliability]
          );

          // Both should be 0.5 when equal weights disagree
          expect(confluenceMixedHigh).toBeCloseTo(0.5, 5);
          expect(confluenceMixedLow).toBeCloseTo(0.5, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Confluence is bounded [0, 1]
   */
  it('Property: Confluence is always between 0 and 1', () => {
    fc.assert(
      fc.property(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
          timeframe: fc.constantFrom('5m', '15m', '1h'),
          direction: fc.constantFrom('CALL', 'PUT') as fc.Arbitrary<Direction>,
          numSignals: fc.integer({ min: 1, max: 20 }),
        }),
        (data) => {
          const targetSignal: Signal = {
            id: 'target',
            source: 'TRADINGVIEW',
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.timeframe,
            timestamp: new Date(),
            metadata: {},
          };

          // Create random signals
          const signals: Signal[] = Array(data.numSignals).fill(null).map((_, i) => ({
            id: `signal-${i}`,
            source: i % 2 === 0 ? 'TRADINGVIEW' : 'GEX',
            symbol: data.symbol,
            direction: i % 3 === 0 ? data.direction : (data.direction === 'CALL' ? 'PUT' : 'CALL'),
            timeframe: data.timeframe,
            timestamp: new Date(),
            metadata: {},
          }));

          const confluence = calculator.calculateConfluence(targetSignal, signals);

          expect(confluence).toBeGreaterThanOrEqual(0);
          expect(confluence).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Confluence Calculator Unit Tests', () => {
  let calculator: ConfluenceCalculator;

  beforeEach(() => {
    calculator = new ConfluenceCalculator();
  });

  it('should calculate 100% confluence when all signals agree', () => {
    const targetSignal: Signal = {
      id: 'target',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const signals: Signal[] = [
      { ...targetSignal, id: 'signal-1', source: 'GEX' },
      { ...targetSignal, id: 'signal-2', source: 'MTF' },
    ];

    const confluence = calculator.calculateConfluence(targetSignal, signals);
    expect(confluence).toBe(1.0);
  });

  it('should calculate 0% confluence when all signals disagree', () => {
    const targetSignal: Signal = {
      id: 'target',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const signals: Signal[] = [
      { ...targetSignal, id: 'signal-1', source: 'GEX', direction: 'PUT' },
      { ...targetSignal, id: 'signal-2', source: 'MTF', direction: 'PUT' },
    ];

    const confluence = calculator.calculateConfluence(targetSignal, signals);
    expect(confluence).toBe(0);
  });

  it('should exclude different timeframe signals', () => {
    const targetSignal: Signal = {
      id: 'target',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const signals: Signal[] = [
      { ...targetSignal, id: 'signal-1', timeframe: '5m' },
      { ...targetSignal, id: 'signal-2', timeframe: '15m' }, // Different timeframe
    ];

    const confluence = calculator.calculateConfluence(targetSignal, signals);
    expect(confluence).toBe(1.0); // Only 5m signal counts
  });

  it('should return 0 for empty signal list', () => {
    const targetSignal: Signal = {
      id: 'target',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const confluence = calculator.calculateConfluence(targetSignal, []);
    expect(confluence).toBe(0);
  });

  it('should identify contributing sources', () => {
    const targetSignal: Signal = {
      id: 'target',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date(),
      metadata: {},
    };

    const signals: Signal[] = [
      { ...targetSignal, id: 'signal-1', source: 'GEX', direction: 'CALL' },
      { ...targetSignal, id: 'signal-2', source: 'MTF', direction: 'PUT' },
    ];

    const contributors = calculator.getContributingSources(targetSignal, signals);

    expect(contributors.agreeing).toContain('GEX');
    expect(contributors.disagreeing).toContain('MTF');
    expect(contributors.total).toBe(2);
  });

  it('should categorize confluence levels', () => {
    expect(calculator.getConfluenceCategory(0.8)).toBe('HIGH');
    expect(calculator.getConfluenceCategory(0.6)).toBe('MEDIUM');
    expect(calculator.getConfluenceCategory(0.3)).toBe('LOW');
  });

  it('should check threshold', () => {
    expect(calculator.meetsThreshold(0.7, 0.5)).toBe(true);
    expect(calculator.meetsThreshold(0.3, 0.5)).toBe(false);
  });
});
