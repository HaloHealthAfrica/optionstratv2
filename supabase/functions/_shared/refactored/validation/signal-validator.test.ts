/**
 * Property-based tests for Signal Validator
 * Tests Properties 4, 5, 26
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { SignalValidator } from './signal-validator.ts';
import { Signal, SignalSource, Direction } from '../core/types.ts';
import { defaultConfig } from '../core/config.ts';

describe('Signal Validator Property Tests', () => {
  let validator: SignalValidator;

  beforeEach(() => {
    validator = new SignalValidator(defaultConfig);
  });

  /**
   * Property 4: Validation Result Completeness
   * For any signal validation result, the result SHALL include a checks object
   * containing pass/fail status for all validation filters (cooldown, marketHours,
   * mtf, confluence, timeFilters), and if rejected, SHALL include a non-empty rejection reason.
   * Validates: Requirements 4.1, 4.4
   */
  it('Property 4: Validation result includes all checks and rejection reason', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          source: fc.constantFrom('TRADINGVIEW', 'GEX', 'MTF', 'MANUAL') as fc.Arbitrary<SignalSource>,
          symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
          direction: fc.constantFrom('CALL', 'PUT') as fc.Arbitrary<Direction>,
          timeframe: fc.constantFrom('5m', '15m', '1h'),
          timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
        }),
        async (signalData) => {
          validator.clearCooldowns();

          const signal: Signal = {
            id: 'test-1',
            source: signalData.source,
            symbol: signalData.symbol,
            direction: signalData.direction,
            timeframe: signalData.timeframe,
            timestamp: signalData.timestamp,
            metadata: {},
          };

          const result = await validator.validate(signal);

          // Result must have checks object
          expect(result.checks).toBeDefined();
          
          // Checks must include all required fields
          expect(result.checks).toHaveProperty('cooldown');
          expect(result.checks).toHaveProperty('marketHours');
          expect(result.checks).toHaveProperty('mtf');
          expect(result.checks).toHaveProperty('confluence');
          expect(result.checks).toHaveProperty('timeFilters');

          // Each check must be boolean
          expect(typeof result.checks.cooldown).toBe('boolean');
          expect(typeof result.checks.marketHours).toBe('boolean');
          expect(typeof result.checks.mtf).toBe('boolean');
          expect(typeof result.checks.confluence).toBe('boolean');
          expect(typeof result.checks.timeFilters).toBe('boolean');

          // If rejected, must have non-empty rejection reason
          if (!result.valid) {
            expect(result.rejectionReason).toBeDefined();
            expect(result.rejectionReason).not.toBe('');
            expect(result.rejectionReason!.length).toBeGreaterThan(0);
          }

          // Details must be present
          expect(result.details).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Validation Check Ordering
   * For any signal that fails multiple validation checks, the Signal_Validation component
   * SHALL return the rejection reason from the first failed check in the documented order
   * (cooldown → marketHours → mtf → confluence → timeFilters).
   * Validates: Requirements 4.3
   */
  it('Property 5: Validation returns first failed check in order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          source: fc.constantFrom('TRADINGVIEW', 'GEX') as fc.Arbitrary<SignalSource>,
          symbol: fc.constantFrom('SPY', 'QQQ'),
          direction: fc.constantFrom('CALL', 'PUT') as fc.Arbitrary<Direction>,
          timeframe: fc.constantFrom('5m', '15m'),
        }),
        async (signalData) => {
          validator.clearCooldowns();

          // Create signal that will fail market hours (outside 9:30-15:30 ET)
          const outsideMarketHours = new Date('2024-06-15T08:00:00Z'); // 3 AM ET

          const signal: Signal = {
            id: 'test-1',
            source: signalData.source,
            symbol: signalData.symbol,
            direction: signalData.direction,
            timeframe: signalData.timeframe,
            timestamp: outsideMarketHours,
            metadata: {
              mtf_aligned: false, // Would fail MTF check
              confluence: 0.3,    // Would fail confluence check
            },
          };

          const result = await validator.validate(signal);

          // Should fail on market hours (second check)
          expect(result.valid).toBe(false);
          expect(result.checks.cooldown).toBe(true); // First check passes
          expect(result.checks.marketHours).toBe(false); // Second check fails
          expect(result.rejectionReason).toBe('Outside market hours');

          // Subsequent checks should not be evaluated (short-circuit)
          // They will be false because validation stopped
          expect(result.checks.mtf).toBe(false);
          expect(result.checks.confluence).toBe(false);
          expect(result.checks.timeFilters).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26: Market Hours Signal Rejection
   * For any entry signal received outside market hours (before 9:30 AM ET or after 3:30 PM ET),
   * the System SHALL reject the signal with market hours as the rejection reason.
   * Validates: Requirements 13.2
   */
  it('Property 26: Signals outside market hours are rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          source: fc.constantFrom('TRADINGVIEW', 'GEX', 'MTF') as fc.Arbitrary<SignalSource>,
          symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
          direction: fc.constantFrom('CALL', 'PUT') as fc.Arbitrary<Direction>,
          timeframe: fc.constantFrom('5m', '15m', '1h'),
          hour: fc.integer({ min: 0, max: 23 }),
        }),
        async (data) => {
          validator.clearCooldowns();

          // Create timestamp with specific hour (UTC)
          const timestamp = new Date('2024-06-15T00:00:00Z');
          timestamp.setUTCHours(data.hour);

          const signal: Signal = {
            id: 'test-1',
            source: data.source,
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.timeframe,
            timestamp,
            metadata: {},
          };

          const result = await validator.validate(signal);

          // Market hours in UTC: 14:30 - 20:30 (9:30 AM - 3:30 PM ET)
          const isWithinMarketHours = data.hour >= 14 && data.hour <= 20;

          if (!isWithinMarketHours) {
            // Signal outside market hours should be rejected
            // (unless it fails cooldown first)
            if (result.checks.cooldown) {
              expect(result.valid).toBe(false);
              expect(result.checks.marketHours).toBe(false);
              expect(result.rejectionReason).toBe('Outside market hours');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Cooldown prevents rapid signals
   */
  it('Property: Cooldown prevents signals within cooldown period', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          source: fc.constantFrom('TRADINGVIEW', 'GEX') as fc.Arbitrary<SignalSource>,
          symbol: fc.constantFrom('SPY', 'QQQ'),
          direction: fc.constantFrom('CALL', 'PUT') as fc.Arbitrary<Direction>,
          timeframe: fc.constantFrom('5m', '15m'),
        }),
        async (data) => {
          validator.clearCooldowns();

          const timestamp = new Date('2024-06-15T15:00:00Z'); // Within market hours

          const signal1: Signal = {
            id: 'test-1',
            source: data.source,
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.timeframe,
            timestamp,
            metadata: {},
          };

          const signal2: Signal = {
            id: 'test-2',
            source: data.source,
            symbol: data.symbol,
            direction: data.direction,
            timeframe: data.timeframe,
            timestamp,
            metadata: {},
          };

          // First signal should pass cooldown
          const result1 = await validator.validate(signal1);
          expect(result1.checks.cooldown).toBe(true);

          // Second signal immediately after should fail cooldown
          const result2 = await validator.validate(signal2);
          expect(result2.valid).toBe(false);
          expect(result2.checks.cooldown).toBe(false);
          expect(result2.rejectionReason).toBe('Cooldown active');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Signal Validator Unit Tests', () => {
  let validator: SignalValidator;

  beforeEach(() => {
    validator = new SignalValidator(defaultConfig);
  });

  it('should pass validation for valid signal', async () => {
    const signal: Signal = {
      id: 'test-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date('2024-06-15T15:00:00Z'), // Within market hours
      metadata: {
        mtf_aligned: true,
        confluence: 0.8,
      },
    };

    const result = await validator.validate(signal);
    expect(result.valid).toBe(true);
  });

  it('should reject signal outside market hours', async () => {
    const signal: Signal = {
      id: 'test-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date('2024-06-15T08:00:00Z'), // Before market hours
      metadata: {},
    };

    const result = await validator.validate(signal);
    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toBe('Outside market hours');
  });

  it('should reject signal with low confluence', async () => {
    const signal: Signal = {
      id: 'test-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: new Date('2024-06-15T15:00:00Z'),
      metadata: {
        mtf_aligned: true,
        confluence: 0.3, // Below threshold
      },
    };

    const result = await validator.validate(signal);
    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toBe('Insufficient confluence');
  });

  it('should reject old signal', async () => {
    const oldTimestamp = new Date();
    oldTimestamp.setMinutes(oldTimestamp.getMinutes() - 10); // 10 minutes old

    const signal: Signal = {
      id: 'test-1',
      source: 'TRADINGVIEW',
      symbol: 'SPY',
      direction: 'CALL',
      timeframe: '5m',
      timestamp: oldTimestamp,
      metadata: {},
    };

    const result = await validator.validate(signal);
    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toBe('Signal too old');
  });
});
