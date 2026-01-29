/**
 * Audit Logger
 * Comprehensive logging for signals, decisions, and trades
 * Implements Requirements 20.1, 20.2, 20.3
 */

import { Signal, EntryDecision, ExitDecision, Position, ContextData, GEXSignal } from '../core/types.ts';

export interface SignalLogEntry {
  type: 'signal_received';
  timestamp: Date;
  signalId: string;
  payload: Signal;
}

export interface DecisionLogEntry {
  type: 'decision_made';
  timestamp: Date;
  signalId: string;
  decisionType: 'ENTRY' | 'EXIT';
  decision: 'ENTER' | 'REJECT' | 'EXIT' | 'HOLD';
  inputData: {
    signal?: Signal;
    position?: Position;
    context?: ContextData;
    gex?: GEXSignal | null;
  };
  calculatedValues: Record<string, any>;
  finalDecision: EntryDecision | ExitDecision;
}

export interface TradeLogEntry {
  type: 'trade_executed';
  timestamp: Date;
  positionId: string;
  signalId: string;
  tradeType: 'OPEN' | 'CLOSE';
  symbol: string;
  direction: 'CALL' | 'PUT';
  quantity: number;
  price: number;
  pnl?: number;
}

export type AuditLogEntry = SignalLogEntry | DecisionLogEntry | TradeLogEntry;

export class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private persistLog: (entry: AuditLogEntry) => Promise<void>;

  constructor(persistLog?: (entry: AuditLogEntry) => Promise<void>) {
    // Default to in-memory storage if no persistence function provided
    this.persistLog = persistLog || (async () => {});
  }

  /**
   * Log signal received
   * Requirement: 20.1
   */
  async logSignalReceived(signal: Signal): Promise<void> {
    const entry: SignalLogEntry = {
      type: 'signal_received',
      timestamp: new Date(),
      signalId: signal.id,
      payload: signal,
    };

    this.logs.push(entry);
    await this.persistLog(entry);

    console.log('[AUDIT] Signal received', {
      signalId: signal.id,
      source: signal.source,
      symbol: signal.symbol,
      direction: signal.direction,
      timeframe: signal.timeframe,
      timestamp: signal.timestamp,
    });
  }

  /**
   * Log entry decision made
   * Requirement: 20.2
   */
  async logEntryDecision(
    decision: EntryDecision,
    context?: ContextData,
    gex?: GEXSignal | null
  ): Promise<void> {
    const entry: DecisionLogEntry = {
      type: 'decision_made',
      timestamp: new Date(),
      signalId: decision.signal.id,
      decisionType: 'ENTRY',
      decision: decision.decision,
      inputData: {
        signal: decision.signal,
        context: context ?? undefined,
        gex: gex ?? null,
      },
      calculatedValues: decision.calculations,
      finalDecision: decision,
    };

    this.logs.push(entry);
    await this.persistLog(entry);

    console.log('[AUDIT] Entry decision made', {
      signalId: decision.signal.id,
      decision: decision.decision,
      confidence: decision.confidence,
      positionSize: decision.positionSize,
      reasoning: decision.reasoning,
      calculations: decision.calculations,
    });
  }

  /**
   * Log exit decision made
   * Requirement: 20.2
   */
  async logExitDecision(decision: ExitDecision): Promise<void> {
    const entry: DecisionLogEntry = {
      type: 'decision_made',
      timestamp: new Date(),
      signalId: decision.position.signalId,
      decisionType: 'EXIT',
      decision: decision.decision,
      inputData: {
        position: decision.position,
      },
      calculatedValues: decision.calculations,
      finalDecision: decision,
    };

    this.logs.push(entry);
    await this.persistLog(entry);

    console.log('[AUDIT] Exit decision made', {
      positionId: decision.position.id,
      decision: decision.decision,
      exitReason: decision.exitReason,
      reasoning: decision.reasoning,
      calculations: decision.calculations,
    });
  }

  /**
   * Log trade executed (position opened)
   * Requirement: 20.3
   */
  async logTradeOpened(position: Position): Promise<void> {
    const entry: TradeLogEntry = {
      type: 'trade_executed',
      timestamp: new Date(),
      positionId: position.id,
      signalId: position.signalId,
      tradeType: 'OPEN',
      symbol: position.symbol,
      direction: position.direction,
      quantity: position.quantity,
      price: position.entryPrice,
    };

    this.logs.push(entry);
    await this.persistLog(entry);

    console.log('[AUDIT] Trade opened', {
      positionId: position.id,
      signalId: position.signalId,
      symbol: position.symbol,
      direction: position.direction,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      entryTime: position.entryTime,
    });
  }

  /**
   * Log trade executed (position closed)
   * Requirement: 20.3
   */
  async logTradeClosed(
    position: Position,
    exitPrice: number,
    realizedPnL: number
  ): Promise<void> {
    const entry: TradeLogEntry = {
      type: 'trade_executed',
      timestamp: new Date(),
      positionId: position.id,
      signalId: position.signalId,
      tradeType: 'CLOSE',
      symbol: position.symbol,
      direction: position.direction,
      quantity: position.quantity,
      price: exitPrice,
      pnl: realizedPnL,
    };

    this.logs.push(entry);
    await this.persistLog(entry);

    console.log('[AUDIT] Trade closed', {
      positionId: position.id,
      signalId: position.signalId,
      symbol: position.symbol,
      direction: position.direction,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      exitPrice,
      realizedPnL,
    });
  }

  /**
   * Get all logs (for testing/debugging)
   */
  getLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by type
   */
  getLogsByType<T extends AuditLogEntry['type']>(
    type: T
  ): Extract<AuditLogEntry, { type: T }>[] {
    return this.logs.filter(log => log.type === type) as Extract<AuditLogEntry, { type: T }>[];
  }

  /**
   * Get logs by signal ID
   */
  getLogsBySignalId(signalId: string): AuditLogEntry[] {
    return this.logs.filter(log => {
      if ('signalId' in log) {
        return log.signalId === signalId;
      }
      return false;
    });
  }

  /**
   * Clear logs (for testing)
   */
  clear(): void {
    this.logs = [];
  }
}
