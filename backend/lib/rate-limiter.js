// Rate Limiter Service
// Token bucket algorithm for API rate limiting

class RateLimiter {
  constructor(maxTokens, refillRate, refillInterval = 1000) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.refillInterval = refillInterval;
    this.queue = [];
    this.stats = {
      allowed: 0,
      throttled: 0,
      queued: 0
    };
    
    // Start token refill
    this.startRefill();
  }

  /**
   * Start token refill interval
   */
  startRefill() {
    this.refillTimer = setInterval(() => {
      this.tokens = Math.min(this.maxTokens, this.tokens + this.refillRate);
      this.processQueue();
    }, this.refillInterval);
  }

  /**
   * Stop token refill
   */
  stop() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }

  /**
   * Try to consume a token
   */
  tryConsume() {
    if (this.tokens > 0) {
      this.tokens--;
      this.stats.allowed++;
      return true;
    }
    
    this.stats.throttled++;
    return false;
  }

  /**
   * Wait for token availability
   */
  async waitForToken() {
    return new Promise((resolve) => {
      if (this.tryConsume()) {
        resolve();
        return;
      }
      
      // Add to queue
      this.queue.push(resolve);
      this.stats.queued++;
    });
  }

  /**
   * Process queued requests
   */
  processQueue() {
    while (this.queue.length > 0 && this.tokens > 0) {
      const resolve = this.queue.shift();
      this.tokens--;
      this.stats.allowed++;
      resolve();
    }
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    return {
      ...this.stats,
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      queueLength: this.queue.length
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      allowed: 0,
      throttled: 0,
      queued: 0
    };
  }
}

// Rate limiter manager for multiple providers
class RateLimiterManager {
  constructor() {
    this.limiters = new Map();
  }

  /**
   * Create or get rate limiter for provider
   */
  getLimiter(provider, maxTokens, refillRate, refillInterval = 1000) {
    if (!this.limiters.has(provider)) {
      this.limiters.set(provider, new RateLimiter(maxTokens, refillRate, refillInterval));
      console.log(`[Rate Limiter] Created limiter for ${provider}: ${maxTokens} tokens, refill ${refillRate}/${refillInterval}ms`);
    }
    
    return this.limiters.get(provider);
  }

  /**
   * Wait for token from provider
   */
  async waitForToken(provider) {
    const limiter = this.limiters.get(provider);
    if (!limiter) {
      throw new Error(`Rate limiter not found for provider: ${provider}`);
    }
    
    await limiter.waitForToken();
  }

  /**
   * Get statistics for all limiters
   */
  getAllStats() {
    const stats = {};
    for (const [provider, limiter] of this.limiters.entries()) {
      stats[provider] = limiter.getStats();
    }
    return stats;
  }

  /**
   * Stop all limiters
   */
  stopAll() {
    for (const limiter of this.limiters.values()) {
      limiter.stop();
    }
    this.limiters.clear();
  }
}

// Export singleton instance
export const rateLimiterManager = new RateLimiterManager();

export default rateLimiterManager;
