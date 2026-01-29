/**
 * Audit Query Service
 * Query interface for retrieving audit logs and decisions
 * Implements Requirement 20.5
 */

import { DecisionLogEntry, AuditLogEntry } from './audit-logger.ts';

export interface QueryOptions {
  startDate?: Date;
  endDate?: Date;
  symbol?: string;
  signalId?: string;
  decisionType?: 'ENTRY' | 'EXIT';
  decision?: 'ENTER' | 'REJECT' | 'EXIT' | 'HOLD';
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export class AuditQueryService {
  constructor(
    private queryDatabase: (options: QueryOptions) => Promise<DecisionLogEntry[]>
  ) {}

  /**
   * Query decisions by date range
   * Requirement: 20.5
   */
  async queryByDateRange(
    startDate: Date,
    endDate: Date,
    limit: number = 100,
    offset: number = 0
  ): Promise<PaginatedResult<DecisionLogEntry>> {
    const options: QueryOptions = {
      startDate,
      endDate,
      limit: limit + 1, // Fetch one extra to check if there are more
      offset,
    };

    const results = await this.queryDatabase(options);
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return {
      data,
      total: data.length, // Note: This is the page size, not total count
      limit,
      offset,
      hasMore,
    };
  }

  /**
   * Query decisions by symbol
   * Requirement: 20.5
   */
  async queryBySymbol(
    symbol: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<PaginatedResult<DecisionLogEntry>> {
    const options: QueryOptions = {
      symbol,
      limit: limit + 1,
      offset,
    };

    const results = await this.queryDatabase(options);
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return {
      data,
      total: data.length,
      limit,
      offset,
      hasMore,
    };
  }

  /**
   * Query decisions by signal ID
   * Requirement: 20.5
   */
  async queryBySignalId(signalId: string): Promise<DecisionLogEntry[]> {
    const options: QueryOptions = {
      signalId,
    };

    return await this.queryDatabase(options);
  }

  /**
   * Query decisions with multiple filters
   * Requirement: 20.5
   */
  async query(
    options: QueryOptions
  ): Promise<PaginatedResult<DecisionLogEntry>> {
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const queryOptions: QueryOptions = {
      ...options,
      limit: limit + 1,
      offset,
    };

    const results = await this.queryDatabase(queryOptions);
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return {
      data,
      total: data.length,
      limit,
      offset,
      hasMore,
    };
  }

  /**
   * Get decision statistics for a date range
   */
  async getDecisionStats(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalDecisions: number;
    entryDecisions: number;
    exitDecisions: number;
    acceptedSignals: number;
    rejectedSignals: number;
    exitedPositions: number;
    heldPositions: number;
  }> {
    const decisions = await this.queryDatabase({
      startDate,
      endDate,
    });

    const stats = {
      totalDecisions: decisions.length,
      entryDecisions: 0,
      exitDecisions: 0,
      acceptedSignals: 0,
      rejectedSignals: 0,
      exitedPositions: 0,
      heldPositions: 0,
    };

    for (const decision of decisions) {
      if (decision.decisionType === 'ENTRY') {
        stats.entryDecisions++;
        if (decision.decision === 'ENTER') {
          stats.acceptedSignals++;
        } else if (decision.decision === 'REJECT') {
          stats.rejectedSignals++;
        }
      } else if (decision.decisionType === 'EXIT') {
        stats.exitDecisions++;
        if (decision.decision === 'EXIT') {
          stats.exitedPositions++;
        } else if (decision.decision === 'HOLD') {
          stats.heldPositions++;
        }
      }
    }

    return stats;
  }
}

/**
 * In-memory implementation for testing
 */
export class InMemoryAuditQueryService extends AuditQueryService {
  private logs: DecisionLogEntry[] = [];

  constructor() {
    super(async (options) => this.queryInMemory(options));
  }

  addLog(log: DecisionLogEntry): void {
    this.logs.push(log);
  }

  private async queryInMemory(options: QueryOptions): Promise<DecisionLogEntry[]> {
    let results = [...this.logs];

    // Filter by date range
    if (options.startDate) {
      results = results.filter(log => log.timestamp >= options.startDate!);
    }
    if (options.endDate) {
      results = results.filter(log => log.timestamp <= options.endDate!);
    }

    // Filter by symbol
    if (options.symbol) {
      results = results.filter(log => {
        const signal = log.inputData.signal;
        return signal && signal.symbol === options.symbol;
      });
    }

    // Filter by signal ID
    if (options.signalId) {
      results = results.filter(log => log.signalId === options.signalId);
    }

    // Filter by decision type
    if (options.decisionType) {
      results = results.filter(log => log.decisionType === options.decisionType);
    }

    // Filter by decision
    if (options.decision) {
      results = results.filter(log => log.decision === options.decision);
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    if (options.offset) {
      results = results.slice(options.offset);
    }
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  clear(): void {
    this.logs = [];
  }
}
