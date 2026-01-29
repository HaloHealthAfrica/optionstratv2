/**
 * Metrics Service
 * Emits metrics for signal processing, decisions, and positions
 * Implements Requirements 17.1, 17.2, 17.3
 */

export interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface LatencyMetric {
  operation: string;
  durationMs: number;
  timestamp: Date;
}

export interface SignalMetrics {
  totalSignals: number;
  acceptedSignals: number;
  rejectedSignals: number;
  acceptanceRate: number;
  rejectionReasons: Map<string, number>;
}

export interface PositionMetrics {
  openPositions: number;
  totalExposure: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

export class MetricsService {
  private latencyMetrics: LatencyMetric[] = [];
  private signalCounts = {
    total: 0,
    accepted: 0,
    rejected: 0,
  };
  private rejectionReasons: Map<string, number> = new Map();
  private positionMetrics: PositionMetrics = {
    openPositions: 0,
    totalExposure: 0,
    unrealizedPnL: 0,
    realizedPnL: 0,
  };

  /**
   * Record signal processing latency
   * Requirement: 17.1
   */
  recordSignalProcessingLatency(durationMs: number): void {
    this.latencyMetrics.push({
      operation: 'signal_processing',
      durationMs,
      timestamp: new Date(),
    });
  }

  /**
   * Record decision latency
   * Requirement: 17.1
   */
  recordDecisionLatency(durationMs: number): void {
    this.latencyMetrics.push({
      operation: 'decision',
      durationMs,
      timestamp: new Date(),
    });
  }

  /**
   * Record execution latency
   * Requirement: 17.1
   */
  recordExecutionLatency(durationMs: number): void {
    this.latencyMetrics.push({
      operation: 'execution',
      durationMs,
      timestamp: new Date(),
    });
  }

  /**
   * Record signal acceptance
   * Requirement: 17.2
   */
  recordSignalAccepted(): void {
    this.signalCounts.total++;
    this.signalCounts.accepted++;
  }

  /**
   * Record signal rejection with reason
   * Requirement: 17.2
   */
  recordSignalRejected(reason: string): void {
    this.signalCounts.total++;
    this.signalCounts.rejected++;
    
    const currentCount = this.rejectionReasons.get(reason) || 0;
    this.rejectionReasons.set(reason, currentCount + 1);
  }

  /**
   * Update position metrics
   * Requirement: 17.3
   */
  updatePositionMetrics(metrics: PositionMetrics): void {
    this.positionMetrics = { ...metrics };
  }

  /**
   * Get signal metrics
   */
  getSignalMetrics(): SignalMetrics {
    const acceptanceRate = this.signalCounts.total > 0
      ? this.signalCounts.accepted / this.signalCounts.total
      : 0;

    return {
      totalSignals: this.signalCounts.total,
      acceptedSignals: this.signalCounts.accepted,
      rejectedSignals: this.signalCounts.rejected,
      acceptanceRate,
      rejectionReasons: new Map(this.rejectionReasons),
    };
  }

  /**
   * Get position metrics
   */
  getPositionMetrics(): PositionMetrics {
    return { ...this.positionMetrics };
  }

  /**
   * Get latency statistics
   */
  getLatencyStats(operation?: string): {
    count: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  } {
    let metrics = this.latencyMetrics;
    
    if (operation) {
      metrics = metrics.filter(m => m.operation === operation);
    }

    if (metrics.length === 0) {
      return {
        count: 0,
        avgMs: 0,
        minMs: 0,
        maxMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
      };
    }

    const durations = metrics.map(m => m.durationMs).sort((a, b) => a - b);
    const sum = durations.reduce((acc, val) => acc + val, 0);

    return {
      count: durations.length,
      avgMs: sum / durations.length,
      minMs: durations[0],
      maxMs: durations[durations.length - 1],
      p50Ms: this.percentile(durations, 0.5),
      p95Ms: this.percentile(durations, 0.95),
      p99Ms: this.percentile(durations, 0.99),
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * p) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Get all metrics as a snapshot
   */
  getMetricsSnapshot(): {
    signals: SignalMetrics;
    positions: PositionMetrics;
    latency: {
      signalProcessing: ReturnType<typeof this.getLatencyStats>;
      decision: ReturnType<typeof this.getLatencyStats>;
      execution: ReturnType<typeof this.getLatencyStats>;
    };
    timestamp: Date;
  } {
    return {
      signals: this.getSignalMetrics(),
      positions: this.getPositionMetrics(),
      latency: {
        signalProcessing: this.getLatencyStats('signal_processing'),
        decision: this.getLatencyStats('decision'),
        execution: this.getLatencyStats('execution'),
      },
      timestamp: new Date(),
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.latencyMetrics = [];
    this.signalCounts = {
      total: 0,
      accepted: 0,
      rejected: 0,
    };
    this.rejectionReasons.clear();
    this.positionMetrics = {
      openPositions: 0,
      totalExposure: 0,
      unrealizedPnL: 0,
      realizedPnL: 0,
    };
  }
}
