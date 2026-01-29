/**
 * Confluence Calculator for signal agreement scoring
 * Implements Requirements 12.1, 12.2, 12.3
 */

import { Signal, SignalSource, Direction } from '../core/types.ts';

interface SourceReliability {
  [key: string]: number;
}

export class ConfluenceCalculator {
  private sourceReliability: SourceReliability;

  constructor(sourceReliability?: SourceReliability) {
    // Default source reliability weights
    this.sourceReliability = sourceReliability || {
      TRADINGVIEW: 1.0,
      GEX: 0.9,
      MTF: 0.85,
      MANUAL: 0.7,
    };
  }

  /**
   * Calculate confluence score for a signal
   * Formula: agreeing signals / total signals
   * Implements Requirements 12.1, 12.2, 12.3
   * 
   * @param targetSignal - The signal to calculate confluence for
   * @param allSignals - All available signals for comparison
   * @returns Confluence score between 0 and 1
   */
  calculateConfluence(targetSignal: Signal, allSignals: Signal[]): number {
    // Filter signals by same timeframe (Requirement 12.2)
    const sameTimeframeSignals = allSignals.filter(
      signal => signal.timeframe === targetSignal.timeframe && signal.symbol === targetSignal.symbol
    );

    if (sameTimeframeSignals.length === 0) {
      return 0;
    }

    // Calculate weighted agreement
    let totalWeight = 0;
    let agreeingWeight = 0;

    for (const signal of sameTimeframeSignals) {
      const weight = this.getSourceWeight(signal.source);
      totalWeight += weight;

      if (signal.direction === targetSignal.direction) {
        agreeingWeight += weight;
      }
    }

    if (totalWeight === 0) {
      return 0;
    }

    // Confluence = agreeing weight / total weight
    return agreeingWeight / totalWeight;
  }

  /**
   * Calculate unweighted confluence (simple ratio)
   * Used for testing Property 22
   */
  calculateSimpleConfluence(targetSignal: Signal, allSignals: Signal[]): number {
    // Filter signals by same timeframe and symbol
    const sameTimeframeSignals = allSignals.filter(
      signal => signal.timeframe === targetSignal.timeframe && signal.symbol === targetSignal.symbol
    );

    if (sameTimeframeSignals.length === 0) {
      return 0;
    }

    const agreeingSignals = sameTimeframeSignals.filter(
      signal => signal.direction === targetSignal.direction
    );

    return agreeingSignals.length / sameTimeframeSignals.length;
  }

  /**
   * Get source reliability weight
   * Implements Requirement 12.3
   */
  private getSourceWeight(source: SignalSource): number {
    return this.sourceReliability[source] || 0.5;
  }

  /**
   * Get contributing sources for a signal
   * Returns list of sources that agree with target direction
   */
  getContributingSources(targetSignal: Signal, allSignals: Signal[]): {
    agreeing: SignalSource[];
    disagreeing: SignalSource[];
    total: number;
  } {
    const sameTimeframeSignals = allSignals.filter(
      signal => signal.timeframe === targetSignal.timeframe && signal.symbol === targetSignal.symbol
    );

    const agreeing: SignalSource[] = [];
    const disagreeing: SignalSource[] = [];

    for (const signal of sameTimeframeSignals) {
      if (signal.direction === targetSignal.direction) {
        agreeing.push(signal.source);
      } else {
        disagreeing.push(signal.source);
      }
    }

    return {
      agreeing,
      disagreeing,
      total: sameTimeframeSignals.length,
    };
  }

  /**
   * Check if confluence meets minimum threshold
   */
  meetsThreshold(confluence: number, threshold: number = 0.5): boolean {
    return confluence >= threshold;
  }

  /**
   * Get confluence category for logging/monitoring
   */
  getConfluenceCategory(confluence: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (confluence >= 0.7) return 'HIGH';
    if (confluence >= 0.5) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Update source reliability weights (for tuning)
   */
  updateSourceReliability(source: SignalSource, weight: number): void {
    if (weight < 0 || weight > 1) {
      throw new Error('Source weight must be between 0 and 1');
    }
    this.sourceReliability[source] = weight;
  }

  /**
   * Get current source reliability weights
   */
  getSourceReliability(): SourceReliability {
    return { ...this.sourceReliability };
  }
}
