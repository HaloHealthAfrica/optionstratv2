/**
 * Market data fetcher with error handling and retry logic
 * Implements Requirements 8.3, 19.2
 */

import { ContextData } from '../core/types.ts';

export class MarketDataError extends Error {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'MarketDataError';
  }
}

export class MarketDataFetcher {
  private readonly maxRetries = 3;
  private readonly timeoutMs = 5000;
  private readonly baseDelayMs = 1000;

  constructor(
    private supabaseClient: any
  ) {}

  /**
   * Fetch fresh context data with timeout and retry logic
   * Implements Requirements 8.3, 19.2
   */
  async fetchContext(): Promise<ContextData> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const data = await this.fetchWithTimeout();
        return data;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s
          const delayMs = this.baseDelayMs * Math.pow(2, attempt);
          await this.sleep(delayMs);
        }
      }
    }

    throw new MarketDataError(
      `Failed to fetch context data after ${this.maxRetries} attempts`,
      lastError || undefined
    );
  }

  /**
   * Fetch context data with timeout
   */
  private async fetchWithTimeout(): Promise<ContextData> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // Fetch latest market context from database
      const { data, error } = await this.supabaseClient
        .from('market_context')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()
        .abortSignal(controller.signal);

      if (error) {
        throw new Error(`Database query failed: ${error.message}`);
      }

      if (!data) {
        throw new Error('No market context data available');
      }

      return {
        vix: data.vix,
        trend: data.trend,
        bias: data.bias,
        regime: data.regime,
        timestamp: new Date(data.timestamp),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
