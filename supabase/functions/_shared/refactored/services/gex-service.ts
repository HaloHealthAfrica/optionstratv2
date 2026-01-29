/**
 * GEX Service with staleness handling and flip detection
 * Implements Requirements 11.1, 11.2, 11.4
 */

import { GEXSignal, Config } from '../core/types.ts';
import { DegradedModeTracker } from '../monitoring/degraded-mode-tracker.ts';

export class GEXService {
  private maxStaleMs: number;
  private staleWeightReduction: number;

  constructor(
    private supabaseClient: any,
    private config: Config,
    private degradedModeTracker?: DegradedModeTracker
  ) {
    this.maxStaleMs = config.gex.maxStaleMinutes * 60 * 1000;
    this.staleWeightReduction = config.gex.staleWeightReduction;
  }

  /**
   * Get latest GEX signal for symbol and timeframe
   * Implements Requirement 11.1
   */
  async getLatestSignal(symbol: string, timeframe: string): Promise<GEXSignal | null> {
    try {
      const { data, error } = await this.supabaseClient
        .from('refactored_gex_signals')
        .select('*')
        .eq('symbol', symbol)
        .eq('timeframe', timeframe)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - not an error, just no GEX signal available
          return null;
        }
        throw new Error(`Failed to fetch GEX signal: ${error.message}`);
      }

      if (!data) {
        if (this.degradedModeTracker) {
          this.degradedModeTracker.recordSuccess('GEX');
        }
        return null;
      }

      const timestamp = new Date(data.timestamp);
      const age = Date.now() - timestamp.getTime();

      if (this.degradedModeTracker) {
        this.degradedModeTracker.recordSuccess('GEX');
      }

      return {
        symbol: data.symbol,
        timeframe: data.timeframe,
        strength: data.strength,
        direction: data.direction,
        timestamp,
        age,
      };
    } catch (error) {
      if (this.degradedModeTracker) {
        this.degradedModeTracker.recordFailure('GEX', (error as Error).message);
      }
      throw new Error(`GEX service error: ${(error as Error).message}`);
    }
  }

  /**
   * Check if GEX signal is stale (> 4 hours old)
   * Implements Requirement 11.2
   */
  isStale(gexSignal: GEXSignal): boolean {
    return gexSignal.age > this.maxStaleMs;
  }

  /**
   * Calculate effective weight for GEX signal based on staleness
   * Implements Requirement 11.2
   */
  calculateEffectiveWeight(gexSignal: GEXSignal): number {
    if (this.isStale(gexSignal)) {
      // Reduce weight for stale signals
      return 1 - this.staleWeightReduction;
    }
    return 1.0;
  }

  /**
   * Detect GEX flip by comparing current vs previous signal
   * Implements Requirement 11.4
   */
  async detectFlip(symbol: string, timeframe: string): Promise<{
    hasFlipped: boolean;
    currentDirection?: string;
    previousDirection?: string;
  }> {
    try {
      // Get the two most recent GEX signals
      const { data, error } = await this.supabaseClient
        .from('refactored_gex_signals')
        .select('*')
        .eq('symbol', symbol)
        .eq('timeframe', timeframe)
        .order('timestamp', { ascending: false })
        .limit(2);

      if (error) {
        throw new Error(`Failed to fetch GEX signals for flip detection: ${error.message}`);
      }

      if (!data || data.length < 2) {
        if (this.degradedModeTracker) {
          this.degradedModeTracker.recordSuccess('GEX');
        }
        // Not enough data to detect flip
        return { hasFlipped: false };
      }

      const current = data[0];
      const previous = data[1];

      const hasFlipped = current.direction !== previous.direction;

      if (this.degradedModeTracker) {
        this.degradedModeTracker.recordSuccess('GEX');
      }

      return {
        hasFlipped,
        currentDirection: current.direction,
        previousDirection: previous.direction,
      };
    } catch (error) {
      if (this.degradedModeTracker) {
        this.degradedModeTracker.recordFailure('GEX', (error as Error).message);
      }
      throw new Error(`GEX flip detection error: ${(error as Error).message}`);
    }
  }

  /**
   * Get GEX signal with staleness metadata
   * Convenience method that combines fetching and staleness calculation
   */
  async getSignalWithMetadata(symbol: string, timeframe: string): Promise<{
    signal: GEXSignal | null;
    isStale: boolean;
    effectiveWeight: number;
  }> {
    const signal = await this.getLatestSignal(symbol, timeframe);

    if (!signal) {
      return {
        signal: null,
        isStale: false,
        effectiveWeight: 0,
      };
    }

    const isStale = this.isStale(signal);
    const effectiveWeight = this.calculateEffectiveWeight(signal);

    return {
      signal,
      isStale,
      effectiveWeight,
    };
  }

  /**
   * Get GEX signal age in hours (for logging/monitoring)
   */
  getSignalAgeHours(gexSignal: GEXSignal): number {
    return gexSignal.age / (60 * 60 * 1000);
  }
}
