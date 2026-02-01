// Cache Service
// In-memory caching with TTL support

class CacheService {
  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * Get value from cache
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return item.value;
  }

  /**
   * Set value in cache with TTL
   */
  set(key, value, ttlSeconds = 60) {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    
    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: Date.now()
    });
    
    this.stats.sets++;
  }

  /**
   * Delete value from cache
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    console.log('[Cache] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: `${hitRate}%`
    };
  }

  /**
   * Clean expired entries
   */
  cleanExpired() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[Cache] Cleaned ${cleaned} expired entries`);
    }
    
    return cleaned;
  }

  /**
   * Start automatic cleanup
   */
  startAutoCleanup(intervalMs = 60000) {
    this.cleanupInterval = setInterval(() => {
      this.cleanExpired();
    }, intervalMs);
    
    console.log(`[Cache] Auto cleanup started (every ${intervalMs}ms)`);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[Cache] Auto cleanup stopped');
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Start auto cleanup
cacheService.startAutoCleanup();

export default cacheService;
