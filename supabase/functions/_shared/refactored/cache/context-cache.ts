/**
 * Context Cache with TTL-based caching and request coalescing
 * Implements Requirements 5.1, 5.2, 5.3, 5.4
 */

import { ContextData, Config } from '../core/types.ts';

interface CachedContext {
  data: ContextData;
  timestamp: number;
}

export class ContextCache {
  private cache: Map<string, CachedContext> = new Map();
  private pendingFetches: Map<string, Promise<ContextData>> = new Map();
  private ttlMs: number;

  constructor(
    private config: Config,
    private fetchFreshContext: () => Promise<ContextData>
  ) {
    this.ttlMs = config.cache.contextTTLSeconds * 1000;
  }

  /**
   * Get context data with caching and request coalescing
   * Implements Requirements 5.2, 5.3, 5.4, 19.2
   */
  async getContext(): Promise<ContextData> {
    const cacheKey = 'context';
    const now = Date.now();

    // Check cache for fresh data (< TTL seconds old)
    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < this.ttlMs) {
      // Cache hit - return fresh data
      return cached.data;
    }

    // Check for pending fetch (request coalescing)
    const pendingFetch = this.pendingFetches.get(cacheKey);
    if (pendingFetch) {
      // Another request is already fetching - await it
      return await pendingFetch;
    }

    // No fresh cache and no pending fetch - initiate new fetch
    const fetchPromise = this.fetchAndCacheWithFallback(cacheKey);
    this.pendingFetches.set(cacheKey, fetchPromise);

    try {
      const data = await fetchPromise;
      return data;
    } finally {
      // Clean up pending fetch
      this.pendingFetches.delete(cacheKey);
    }
  }

  /**
   * Fetch fresh context with fallback to stale cache
   * Requirement: 19.2
   */
  private async fetchAndCacheWithFallback(cacheKey: string): Promise<ContextData> {
    try {
      // Try to fetch fresh data
      const data = await this.fetchFreshContext();
      
      // Update cache with fresh data
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });

      return data;
    } catch (error) {
      // Fetch failed - check if we have stale cache data
      const cached = this.cache.get(cacheKey);
      const fallbackMaxAge = 5 * 60 * 1000; // 5 minutes
      
      if (cached && (Date.now() - cached.timestamp) < fallbackMaxAge) {
        // Use stale cache as fallback (Requirement 19.2)
        console.warn('[ContextCache] Fetch failed, using stale cache data', {
          age: Date.now() - cached.timestamp,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return cached.data;
      }
      
      // No fallback available - rethrow error
      console.error('[ContextCache] Fetch failed and no fallback available', error);
      throw error;
    }
  }

  /**
   * Get cached data age in milliseconds (for testing/monitoring)
   */
  getCacheAge(): number | null {
    const cached = this.cache.get('context');
    if (!cached) return null;
    return Date.now() - cached.timestamp;
  }

  /**
   * Check if cache has fresh data
   */
  hasFreshCache(): boolean {
    const age = this.getCacheAge();
    return age !== null && age < this.ttlMs;
  }

  /**
   * Clear cache (for testing)
   */
  clear(): void {
    this.cache.clear();
    this.pendingFetches.clear();
  }
}
