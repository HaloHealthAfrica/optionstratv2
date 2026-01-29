/**
 * Property-based tests for GEX Service
 * Tests Properties 19, 21
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { GEXService } from './gex-service.ts';
import { GEXSignal, Direction } from '../core/types.ts';
import { defaultConfig } from '../core/config.ts';

describe('GEX Service Property Tests', () => {
  let mockSupabaseClient: any;
  let gexService: GEXService;

  beforeEach(() => {
    mockSupabaseClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };
    gexService = new GEXService(mockSupabaseClient, defaultConfig);
  });

  /**
   * Property 19: Stale GEX Signal Weight Reduction
   * For any GEX signal older than 4 hours, the System SHALL reduce its weight
   * in confidence calculations compared to fresh GEX signals.
   * Validates: Requirements 11.2
   */
  it('Property 19: Stale GEX signals have reduced weight', () => {
    fc.assert(
      fc.property(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
          timeframe: fc.constantFrom('5m', '15m', '1h'),
          strength: fc.double({ min: -1, max: 1 }),
          direction: fc.constantFrom('CALL', 'PUT') as fc.Arbitrary<Direction>,
          ageHours: fc.double({ min: 0, max: 24 }),
        }),
        (data) => {
          const ageMs = data.ageHours * 60 * 60 * 1000;
          const timestamp = new Date(Date.now() - ageMs);

          const gexSignal: GEXSignal = {
            symbol: data.symbol,
            timeframe: data.timeframe,
            strength: data.strength,
            direction: data.direction,
            timestamp,
            age: ageMs,
          };

          const isStale = gexService.isStale(gexSignal);
          const effectiveWeight = gexService.calculateEffectiveWeight(gexSignal);

          // Signals older than 4 hours should be stale
          const maxStaleHours = defaultConfig.gex.maxStaleMinutes / 60;
          if (data.ageHours > maxStaleHours) {
            expect(isStale).toBe(true);
            // Stale signals should have reduced weight
            expect(effectiveWeight).toBeLessThan(1.0);
            expect(effectiveWeight).toBe(1 - defaultConfig.gex.staleWeightReduction);
          } else {
            expect(isStale).toBe(false);
            // Fresh signals should have full weight
            expect(effectiveWeight).toBe(1.0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 21: GEX Flip Exit Trigger
   * For any open position where a GEX flip signal occurs (GEX direction reverses),
   * the Exit_Decision service SHALL return an EXIT decision with GEX flip as the exit reason.
   * Validates: Requirements 11.4
   */
  it('Property 21: GEX flip is detected when direction changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          symbol: fc.constantFrom('SPY', 'QQQ', 'IWM'),
          timeframe: fc.constantFrom('5m', '15m', '1h'),
          currentDirection: fc.constantFrom('CALL', 'PUT'),
          previousDirection: fc.constantFrom('CALL', 'PUT'),
        }),
        async (data) => {
          // Mock database response with two signals
          mockSupabaseClient.limit.mockResolvedValue({
            data: [
              {
                symbol: data.symbol,
                timeframe: data.timeframe,
                direction: data.currentDirection,
                strength: 0.5,
                timestamp: new Date().toISOString(),
              },
              {
                symbol: data.symbol,
                timeframe: data.timeframe,
                direction: data.previousDirection,
                strength: 0.5,
                timestamp: new Date(Date.now() - 60000).toISOString(),
              },
            ],
            error: null,
          });

          const flipResult = await gexService.detectFlip(data.symbol, data.timeframe);

          // Flip should be detected when directions differ
          const expectedFlip = data.currentDirection !== data.previousDirection;
          expect(flipResult.hasFlipped).toBe(expectedFlip);

          if (expectedFlip) {
            expect(flipResult.currentDirection).toBe(data.currentDirection);
            expect(flipResult.previousDirection).toBe(data.previousDirection);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Weight reduction is consistent
   */
  it('Property: Weight reduction is consistent for same staleness', () => {
    fc.assert(
      fc.property(
        fc.record({
          ageHours: fc.double({ min: 5, max: 24 }), // Always stale
          symbol: fc.constantFrom('SPY', 'QQQ'),
          strength: fc.double({ min: -1, max: 1 }),
        }),
        (data) => {
          const ageMs = data.ageHours * 60 * 60 * 1000;
          const timestamp = new Date(Date.now() - ageMs);

          const signal1: GEXSignal = {
            symbol: data.symbol,
            timeframe: '5m',
            strength: data.strength,
            direction: 'CALL',
            timestamp,
            age: ageMs,
          };

          const signal2: GEXSignal = {
            symbol: data.symbol,
            timeframe: '15m',
            strength: data.strength,
            direction: 'PUT',
            timestamp,
            age: ageMs,
          };

          const weight1 = gexService.calculateEffectiveWeight(signal1);
          const weight2 = gexService.calculateEffectiveWeight(signal2);

          // Same age should produce same weight regardless of other properties
          expect(weight1).toBe(weight2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('GEX Service Unit Tests', () => {
  let mockSupabaseClient: any;
  let gexService: GEXService;

  beforeEach(() => {
    mockSupabaseClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };
    gexService = new GEXService(mockSupabaseClient, defaultConfig);
  });

  it('should fetch latest GEX signal', async () => {
    const mockData = {
      symbol: 'SPY',
      timeframe: '5m',
      strength: 0.75,
      direction: 'CALL',
      timestamp: new Date().toISOString(),
    };

    mockSupabaseClient.single.mockResolvedValue({
      data: mockData,
      error: null,
    });

    const signal = await gexService.getLatestSignal('SPY', '5m');

    expect(signal).not.toBeNull();
    expect(signal!.symbol).toBe('SPY');
    expect(signal!.strength).toBe(0.75);
    expect(signal!.direction).toBe('CALL');
  });

  it('should return null when no GEX signal exists', async () => {
    mockSupabaseClient.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });

    const signal = await gexService.getLatestSignal('SPY', '5m');
    expect(signal).toBeNull();
  });

  it('should detect stale signals correctly', () => {
    const freshSignal: GEXSignal = {
      symbol: 'SPY',
      timeframe: '5m',
      strength: 0.5,
      direction: 'CALL',
      timestamp: new Date(),
      age: 60 * 60 * 1000, // 1 hour
    };

    const staleSignal: GEXSignal = {
      symbol: 'SPY',
      timeframe: '5m',
      strength: 0.5,
      direction: 'CALL',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
      age: 5 * 60 * 60 * 1000, // 5 hours
    };

    expect(gexService.isStale(freshSignal)).toBe(false);
    expect(gexService.isStale(staleSignal)).toBe(true);
  });

  it('should calculate effective weight correctly', () => {
    const freshSignal: GEXSignal = {
      symbol: 'SPY',
      timeframe: '5m',
      strength: 0.5,
      direction: 'CALL',
      timestamp: new Date(),
      age: 60 * 60 * 1000, // 1 hour
    };

    const staleSignal: GEXSignal = {
      symbol: 'SPY',
      timeframe: '5m',
      strength: 0.5,
      direction: 'CALL',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
      age: 5 * 60 * 60 * 1000, // 5 hours
    };

    expect(gexService.calculateEffectiveWeight(freshSignal)).toBe(1.0);
    expect(gexService.calculateEffectiveWeight(staleSignal)).toBe(0.5); // 1 - 0.5 reduction
  });

  it('should detect GEX flip', async () => {
    mockSupabaseClient.limit.mockResolvedValue({
      data: [
        {
          symbol: 'SPY',
          timeframe: '5m',
          direction: 'PUT',
          strength: 0.5,
          timestamp: new Date().toISOString(),
        },
        {
          symbol: 'SPY',
          timeframe: '5m',
          direction: 'CALL',
          strength: 0.5,
          timestamp: new Date(Date.now() - 60000).toISOString(),
        },
      ],
      error: null,
    });

    const flipResult = await gexService.detectFlip('SPY', '5m');

    expect(flipResult.hasFlipped).toBe(true);
    expect(flipResult.currentDirection).toBe('PUT');
    expect(flipResult.previousDirection).toBe('CALL');
  });

  it('should handle insufficient data for flip detection', async () => {
    mockSupabaseClient.limit.mockResolvedValue({
      data: [
        {
          symbol: 'SPY',
          timeframe: '5m',
          direction: 'CALL',
          strength: 0.5,
          timestamp: new Date().toISOString(),
        },
      ],
      error: null,
    });

    const flipResult = await gexService.detectFlip('SPY', '5m');

    expect(flipResult.hasFlipped).toBe(false);
  });

  it('should get signal age in hours', () => {
    const signal: GEXSignal = {
      symbol: 'SPY',
      timeframe: '5m',
      strength: 0.5,
      direction: 'CALL',
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
      age: 3 * 60 * 60 * 1000, // 3 hours
    };

    const ageHours = gexService.getSignalAgeHours(signal);
    expect(ageHours).toBeCloseTo(3, 1);
  });
});
