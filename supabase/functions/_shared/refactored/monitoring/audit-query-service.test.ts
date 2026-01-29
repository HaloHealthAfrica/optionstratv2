/**
 * Unit tests for Audit Query Service
 * Tests Requirement 20.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAuditQueryService } from './audit-query-service.ts';
import { DecisionLogEntry } from './audit-logger.ts';

describe('Audit Query Service Unit Tests', () => {
  let queryService: InMemoryAuditQueryService;

  beforeEach(() => {
    queryService = new InMemoryAuditQueryService();
  });

  const createMockDecision = (
    signalId: string,
    decisionType: 'ENTRY' | 'EXIT',
    decision: 'ENTER' | 'REJECT' | 'EXIT' | 'HOLD',
    symbol: string,
    timestamp: Date
  ): DecisionLogEntry => ({
    type: 'decision_made',
    timestamp,
    signalId,
    decisionType,
    decision,
    inputData: {
      signal: {
        id: signalId,
        source: 'TradingView',
        symbol,
        direction: 'CALL',
        timeframe: '5m',
        timestamp,
        metadata: {},
      },
    },
    calculatedValues: {},
    finalDecision: {} as any,
  });

  it('should query decisions by date range', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    queryService.addLog(createMockDecision('sig1', 'ENTRY', 'ENTER', 'SPY', yesterday));
    queryService.addLog(createMockDecision('sig2', 'ENTRY', 'ENTER', 'SPY', now));
    queryService.addLog(createMockDecision('sig3', 'ENTRY', 'ENTER', 'SPY', tomorrow));

    const result = await queryService.queryByDateRange(yesterday, now);

    expect(result.data).toHaveLength(2);
    expect(result.data[0].signalId).toBe('sig2'); // Most recent first
    expect(result.data[1].signalId).toBe('sig1');
  });

  it('should query decisions by symbol', async () => {
    const now = new Date();

    queryService.addLog(createMockDecision('sig1', 'ENTRY', 'ENTER', 'SPY', now));
    queryService.addLog(createMockDecision('sig2', 'ENTRY', 'ENTER', 'QQQ', now));
    queryService.addLog(createMockDecision('sig3', 'ENTRY', 'ENTER', 'SPY', now));

    const result = await queryService.queryBySymbol('SPY');

    expect(result.data).toHaveLength(2);
    expect(result.data.every(d => d.inputData.signal?.symbol === 'SPY')).toBe(true);
  });

  it('should query decisions by signal ID', async () => {
    const now = new Date();

    queryService.addLog(createMockDecision('sig1', 'ENTRY', 'ENTER', 'SPY', now));
    queryService.addLog(createMockDecision('sig2', 'ENTRY', 'ENTER', 'SPY', now));
    queryService.addLog(createMockDecision('sig1', 'EXIT', 'EXIT', 'SPY', now));

    const results = await queryService.queryBySignalId('sig1');

    expect(results).toHaveLength(2);
    expect(results.every(d => d.signalId === 'sig1')).toBe(true);
  });

  it('should support pagination', async () => {
    const now = new Date();

    for (let i = 0; i < 10; i++) {
      queryService.addLog(createMockDecision(`sig${i}`, 'ENTRY', 'ENTER', 'SPY', now));
    }

    const page1 = await queryService.query({ limit: 5, offset: 0 });
    const page2 = await queryService.query({ limit: 5, offset: 5 });

    expect(page1.data).toHaveLength(5);
    expect(page1.hasMore).toBe(true);
    expect(page2.data).toHaveLength(5);
    expect(page2.hasMore).toBe(false);
  });

  it('should filter by decision type', async () => {
    const now = new Date();

    queryService.addLog(createMockDecision('sig1', 'ENTRY', 'ENTER', 'SPY', now));
    queryService.addLog(createMockDecision('sig2', 'EXIT', 'EXIT', 'SPY', now));
    queryService.addLog(createMockDecision('sig3', 'ENTRY', 'REJECT', 'SPY', now));

    const result = await queryService.query({ decisionType: 'ENTRY' });

    expect(result.data).toHaveLength(2);
    expect(result.data.every(d => d.decisionType === 'ENTRY')).toBe(true);
  });

  it('should filter by decision', async () => {
    const now = new Date();

    queryService.addLog(createMockDecision('sig1', 'ENTRY', 'ENTER', 'SPY', now));
    queryService.addLog(createMockDecision('sig2', 'ENTRY', 'REJECT', 'SPY', now));
    queryService.addLog(createMockDecision('sig3', 'ENTRY', 'ENTER', 'SPY', now));

    const result = await queryService.query({ decision: 'ENTER' });

    expect(result.data).toHaveLength(2);
    expect(result.data.every(d => d.decision === 'ENTER')).toBe(true);
  });

  it('should combine multiple filters', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    queryService.addLog(createMockDecision('sig1', 'ENTRY', 'ENTER', 'SPY', now));
    queryService.addLog(createMockDecision('sig2', 'ENTRY', 'ENTER', 'QQQ', now));
    queryService.addLog(createMockDecision('sig3', 'ENTRY', 'REJECT', 'SPY', now));
    queryService.addLog(createMockDecision('sig4', 'ENTRY', 'ENTER', 'SPY', yesterday));

    const result = await queryService.query({
      startDate: now,
      symbol: 'SPY',
      decision: 'ENTER',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].signalId).toBe('sig1');
  });

  it('should calculate decision statistics', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    queryService.addLog(createMockDecision('sig1', 'ENTRY', 'ENTER', 'SPY', now));
    queryService.addLog(createMockDecision('sig2', 'ENTRY', 'REJECT', 'SPY', now));
    queryService.addLog(createMockDecision('sig3', 'EXIT', 'EXIT', 'SPY', now));
    queryService.addLog(createMockDecision('sig4', 'EXIT', 'HOLD', 'SPY', now));

    const stats = await queryService.getDecisionStats(yesterday, now);

    expect(stats.totalDecisions).toBe(4);
    expect(stats.entryDecisions).toBe(2);
    expect(stats.exitDecisions).toBe(2);
    expect(stats.acceptedSignals).toBe(1);
    expect(stats.rejectedSignals).toBe(1);
    expect(stats.exitedPositions).toBe(1);
    expect(stats.heldPositions).toBe(1);
  });

  it('should return empty results for no matches', async () => {
    const now = new Date();

    queryService.addLog(createMockDecision('sig1', 'ENTRY', 'ENTER', 'SPY', now));

    const result = await queryService.queryBySymbol('QQQ');

    expect(result.data).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('should sort results by timestamp descending', async () => {
    const now = new Date();
    const time1 = new Date(now.getTime() - 3000);
    const time2 = new Date(now.getTime() - 2000);
    const time3 = new Date(now.getTime() - 1000);

    queryService.addLog(createMockDecision('sig1', 'ENTRY', 'ENTER', 'SPY', time1));
    queryService.addLog(createMockDecision('sig2', 'ENTRY', 'ENTER', 'SPY', time3));
    queryService.addLog(createMockDecision('sig3', 'ENTRY', 'ENTER', 'SPY', time2));

    const result = await queryService.query({});

    expect(result.data).toHaveLength(3);
    expect(result.data[0].signalId).toBe('sig2'); // Most recent
    expect(result.data[1].signalId).toBe('sig3');
    expect(result.data[2].signalId).toBe('sig1'); // Oldest
  });
});
