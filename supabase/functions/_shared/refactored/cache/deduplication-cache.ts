/**
 * Deduplication Cache for idempotent signal processing
 * Implements Requirements 18.1, 18.2, 18.3, 18.4
 */

import { Signal, Config } from '../core/types.ts';

interface CacheEntry {
  fingerprint: string;
  timestamp: number;
}

export class DeduplicationCache {
  private cache: Map<string, CacheEntry> = new Map();
  private duplicateWindowMs: number;
  private expirationMs: number;

  constructor(config: Config) {
    // 60-second window for duplicate detection
    this.duplicateWindowMs = config.cache.deduplicationTTLSeconds * 1000;
    // 5-minute expiration for cache entries
    this.expirationMs = 5 * 60 * 1000;
  }

  /**
   * Generate unique fingerprint for a signal
   * Based on source + symbol + timestamp + direction
   * Implements Requirement 18.1
   */
  generateFingerprint(signal: Signal): string {
    const components = [
      signal.source,
      signal.symbol,
      signal.timestamp.toISOString(),
      signal.direction,
    ];
    
    return this.hash(components.join('|'));
  }

  /**
   * Check if signal is a duplicate
   * Implements Requirement 18.2
   */
  isDuplicate(signal: Signal): boolean {
    const fingerprint = this.generateFingerprint(signal);
    const now = Date.now();

    // Clean up expired entries
    this.cleanupExpired(now);

    const existing = this.cache.get(fingerprint);
    
    if (!existing) {
      // Not a duplicate - add to cache
      this.cache.set(fingerprint, {
        fingerprint,
        timestamp: now,
      });
      return false;
    }

    // Check if within duplicate detection window
    const age = now - existing.timestamp;
    return age < this.duplicateWindowMs;
  }

  /**
   * Check if signal would be processed (not duplicate)
   * Used for testing cache expiration
   */
  wouldProcess(signal: Signal): boolean {
    return !this.isDuplicate(signal);
  }

  /**
   * Clean up expired cache entries
   * Implements Requirement 18.4
   */
  private cleanupExpired(now: number): void {
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > this.expirationMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Simple hash function for fingerprint generation
   */
  private hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get cache size (for monitoring)
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear cache (for testing)
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache entry age in milliseconds (for testing)
   */
  getEntryAge(signal: Signal): number | null {
    const fingerprint = this.generateFingerprint(signal);
    const entry = this.cache.get(fingerprint);
    if (!entry) return null;
    return Date.now() - entry.timestamp;
  }
}
