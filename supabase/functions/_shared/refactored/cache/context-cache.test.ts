/**
 * Property-based tests for Context Cache
 * Tests Properties 6, 7, 8, 36
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ContextCache } from './context-cache.ts';
import { ContextData, Config } from '../core/types.ts';
import { defaultConfig } from '../core/config.ts';

describe('Context Cache Property Tests', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let cache: ContextCache;
  let config: Config;

  beforeEach(() => {
    config = { ...defaultConfig };
    mockFetch = vi.fn();
    cache = new ContextCache(config, mockFetch);
  });

  /**
   * Property 6: Context Cache Freshness
   * For any two context data requests made within 60 seconds,
   * the Cache SHALL return identical data without fetching fresh data on the second request.
   * Validates: Requirements 5.2
   */
  it('Property 6: Cache returns identical data for requests within TTL', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          vix: fc.double({ min: 0, max: 100 }),
          bias: fc.double({ min: -1, max: 1 }),
        }),
        async (contextValues) => {
          // Reset for each test
          cache.clear();
          mockFetch.mockClear();

          const mockData: ContextData = {
            vix: contextValues.vix,
            trend: 'NEUTRAL',
            bias: contextValues.bias,
            regime: 'NORMAL',
            timestamp: new Date(),
          };

          mockFetch.mockResolvedValue(mockData);

          // First request
          const data1 = await cache.getContext();
          
          // Second request within TTL
          const data2 = await cache.getContext();

          // Should only fetch once
          expect(mockFetch).toHaveBeenCalledTimes(1);
          
          // Should return identical data
          expect(data1).toEqual(data2);
          expect(data1.vix).toBe(data2.vix);
          expect(data1.bias).toBe(data2.bias);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: Context Cache Staleness Handling
   * For any context data request where cached data is older than 60 seconds or missing,
   * the Cache SHALL fetch fresh data and update the cache before returning.
   * Validates: Requirements 5.3
   */
  it('Property 7: Cache fetches fresh data when stale or missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          vix1: fc.double({ min: 0, max: 100 }),
          vix2: fc.double({ min: 0, max: 100 }),
        }),
        async (values) => {
          // Reset for each test
          cache.clear();
          mockFetch.mockClear();

          const mockData1: ContextData = {
            vix: values.vix1,
            trend: 'NEUTRAL',
            bias: 0,
            regime: 'NORMAL',
            timestamp: new Date(),
          };

          const mockData2: ContextData = {
            vix: values.vix2,
            trend: 'BULLISH',
            bias: 0.5,
            regime: 'HIGH_VOL',
            timestamp: new Date(),
          };

          mockFetch.mockResolvedValueOnce(mockData1);

          // First request - cache miss
          await cache.getContext();
          expect(mockFetch).toHaveBeenCalledTimes(1);

          // Simulate cache expiration by waiting TTL + 1ms
          await new Promise(resolve => setTimeout(resolve, config.cache.contextTTLSeconds * 1000 + 10));

          mockFetch.mockResolvedValueOnce(mockData2);

          // Second request after TTL - should fetch fresh
          const data2 = await cache.getContext();
          expect(mockFetch).toHaveBeenCalledTimes(2);
          expect(data2.vix).toBe(values.vix2);
        }
      ),
      { numRuns: 50 } // Reduced runs due to timeouts
    );
  });

  /**
   * Property 8: Context Cache Request Coalescing
   * For any set of concurrent context data requests arriving while no cached data exists,
   * the Cache SHALL perform exactly one fetch operation and return the same data to all requesters.
   * Validates: Requirements 5.4
   */
  it('Property 8: Cache coalesces concurrent requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        fc.record({
          vix: fc.double({ min: 0, max: 100 }),
          bias: fc.double({ min: -1, max: 1 }),
        }),
        async (numRequests, contextValues) => {
          // Reset for each test
          cache.clear();
          mockFetch.mockClear();

          const mockData: ContextData = {
            vix: contextValues.vix,
            trend: 'NEUTRAL',
            bias: contextValues.bias,
            regime: 'NORMAL',
            timestamp: new Date(),
          };

          // Add delay to simulate slow fetch
          mockFetch.mockImplementation(() => 
            new Promise(resolve => setTimeout(() => resolve(mockData), 50))
          );

          // Fire multiple concurrent requests
          const promises = Array(numRequests).fill(null).map(() => cache.getContext());
          const results = await Promise.all(promises);

          // Should only fetch once despite multiple concurrent requests
          expect(mockFetch).toHaveBeenCalledTimes(1);

          // All results should be identical
          for (let i = 1; i < results.length; i++) {
            expect(results[i]).toEqual(results[0]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 36: Context Data Fallback
   * For any context data fetch failure, if cached context data exists and is less than 5 minutes old,
   * the System SHALL use the cached data rather than rejecting the signal.
   * Validates: Requirements 19.2
   */
  it('Property 36: Cache falls back to stale data on fetch failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          vix: fc.double({ min: 0, max: 100 }),
          bias: fc.double({ min: -1, max: 1 }),
          cacheAgeSeconds: fc.integer({ min: 61, max: 299 }), // Between TTL and 5 minutes
        }),
        async (values) => {
          // Reset for each test
          cache.clear();
          mockFetch.mockClear();

          const cachedData: ContextData = {
            vix: values.vix,
            trend: 'NEUTRAL',
            bias: values.bias,
            regime: 'NORMAL',
            timestamp: new Date(),
          };

          // First request - populate cache
          mockFetch.mockResolvedValueOnce(cachedData);
          await cache.getContext();
          expect(mockFetch).toHaveBeenCalledTimes(1);

          // Wait for cache to become stale but within 5-minute fallback window
          await new Promise(resolve => setTimeout(resolve, values.cacheAgeSeconds * 1000));

          // Second request - fetch fails
          mockFetch.mockRejectedValueOnce(new Error('Network error'));

          // Should fall back to stale cache
          const fallbackData = await cache.getContext();
          
          // Should have attempted to fetch (and failed)
          expect(mockFetch).toHaveBeenCalledTimes(2);
          
          // Should return the cached data
          expect(fallbackData.vix).toBe(values.vix);
          expect(fallbackData.bias).toBe(values.bias);
        }
      ),
      { numRuns: 50 } // Reduced runs due to timeouts
    );
  });
});

describe('Context Cache Unit Tests', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let cache: ContextCache;
  let config: Config;

  beforeEach(() => {
    config = { ...defaultConfig };
    mockFetch = vi.fn();
    cache = new ContextCache(config, mockFetch);
  });

  it('should return fresh cache when available', async () => {
    const mockData: ContextData = {
      vix: 20,
      trend: 'BULLISH',
      bias: 0.5,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    mockFetch.mockResolvedValue(mockData);

    const data = await cache.getContext();
    expect(data).toEqual(mockData);
    expect(cache.hasFreshCache()).toBe(true);
  });

  it('should handle fetch errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(cache.getContext()).rejects.toThrow('Network error');
  });

  it('should report cache age correctly', async () => {
    const mockData: ContextData = {
      vix: 20,
      trend: 'BULLISH',
      bias: 0.5,
      regime: 'NORMAL',
      timestamp: new Date(),
    };

    mockFetch.mockResolvedValue(mockData);

    expect(cache.getCacheAge()).toBeNull();
    
    await cache.getContext();
    
    const age = cache.getCacheAge();
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThanOrEqual(0);
  });
});
